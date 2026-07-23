#!/usr/bin/env bash
# ============================================================================
# GATE do card C1.4a — camada de dados de Publicações (PRD v2.1 §7.2.3)
#
# Mesmo padrão do scripts/test-rls.sh: sobe um Postgres EFÊMERO, aplica a
# migration, roda tests/publicacoes.test.sql e derruba tudo. Em seguida roda
# `tsc --noEmit` pra provar que src/types/publicacoes.ts e
# src/hooks/usePublicacoes.ts compilam contra src/services/publicacoes.mjs.
#
#   ./scripts/test-hooks-publicacoes.sh
#
# Saída: 0 se SQL + tsc passam, 1 se qualquer um falhar.
# ============================================================================
set -uo pipefail

# LC_ALL=C é obrigatório no macOS: sem ele o postmaster vira multithreaded
# durante o startup e o servidor não sobe.
export LC_ALL=C LANG=C

# O initdb do libpq NÃO serve (não traz o binário `postgres`); precisa do
# pacote postgresql completo.
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
# Socket precisa de caminho CURTO: o limite do Unix domain socket é 103 bytes.
RUNDIR="${RUNDIR:-/tmp/pgdm-pub-gate-$$}"
PGDATA="$RUNDIR/data"
PGPORT="${PGPORT:-55434}"
DB=diariomonitor_pub_gate

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$HERE/supabase/migrations/20260723000001_schema_inicial.sql"
TESTE="$HERE/tests/publicacoes.test.sql"

[ -x "$PGBIN/initdb" ] || {
  echo "ERRO: servidor Postgres não encontrado em $PGBIN"
  echo "      (o initdb do libpq não serve — precisa do pacote postgresql)"
  exit 2
}

encerrar() {
  "$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  find "$RUNDIR" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$RUNDIR" 2>/dev/null || true
}
trap encerrar EXIT

mkdir -p "$RUNDIR"
"$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null 2>&1 \
  || { echo "ERRO: initdb falhou"; exit 2; }
"$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k $RUNDIR -c listen_addresses=''" \
  -l "$RUNDIR/log" start >/dev/null 2>&1
sleep 2

export PGHOST="$RUNDIR" PGPORT PGUSER=postgres
"$PGBIN/pg_isready" -q || { echo "ERRO: servidor não subiu"; tail -5 "$RUNDIR/log"; exit 2; }
"$PGBIN/createdb" "$DB" >/dev/null 2>&1

# Shim do Supabase: auth.users + auth.uid() lendo o JWT do GUC de sessão.
"$PGBIN/psql" -q -d "$DB" >/dev/null <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid;
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
SQL

"$PGBIN/psql" -v ON_ERROR_STOP=1 -q -d "$DB" -f "$MIGRATION" >/dev/null 2>&1 \
  || { echo "ERRO: migration falhou"; exit 1; }

# Grants do role de aplicação; a guarda permanente é reaplicada DEPOIS deles,
# senão o grant amplo reabriria update/delete no acervo append-only.
"$PGBIN/psql" -q -d "$DB" >/dev/null <<'SQL'
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on auth.users to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke update, delete on public.atos, public.edicoes, public.auditoria from authenticated;
SQL

SAIDA_SQL="$("$PGBIN/psql" -d "$DB" -f "$TESTE" 2>&1)"
echo "$SAIDA_SQL" | grep -E "PASS|FAIL" | sed 's/^ *//'

FALHAS_SQL=$(echo "$SAIDA_SQL" | grep -c "FAIL")
TOTAL_SQL=$(echo "$SAIDA_SQL" | grep -cE "PASS|FAIL")

echo "----------------------------------------"
echo "SQL: $((TOTAL_SQL - FALHAS_SQL))/$TOTAL_SQL"

# ---------------------------------------------------------------------------
# Tipos: prova que src/types/publicacoes.ts e src/hooks/usePublicacoes.ts
# compilam contra src/services/publicacoes.mjs (JS puro, sem execução real).
#
# `tsc --noEmit` sozinho, neste projeto, é um NO-OP silencioso: o
# tsconfig.json raiz declara `"files": []` e só referencia sub-projetos
# (tsconfig.app.json/tsconfig.node.json) — sem `-b` (build mode), o tsc usa
# apenas os "files"/"include" do config raiz (vazio) e não checa nada,
# saindo com status 0 mesmo com erro de tipo no meio do código. Confirmado
# na prática: `tsc --noEmit --listFiles` não lista nenhum arquivo de
# src/. `tsc -b` é o modo correto — é o mesmo que `npm run typecheck` já
# usa (package.json) — e segue as referências de projeto de verdade.
cd "$HERE" || exit 2
find node_modules/.tmp -mindepth 1 -delete 2>/dev/null  # cache incremental stale mascara erro de tipo
SAIDA_TSC="$(npx tsc -b 2>&1)"
STATUS_TSC=$?
[ -n "$SAIDA_TSC" ] && echo "$SAIDA_TSC"

STATUS_TSC_TEXTO="OK"
[ "$STATUS_TSC" -ne 0 ] && STATUS_TSC_TEXTO="FALHOU"
echo "tsc -b: $STATUS_TSC_TEXTO"

echo "----------------------------------------"
if [ "$FALHAS_SQL" -gt 0 ] || [ "$STATUS_TSC" -ne 0 ]; then
  echo "GATE C1.4a: REPROVA — SQL: $FALHAS_SQL falha(s) de $TOTAL_SQL · tsc: $STATUS_TSC_TEXTO"
  exit 1
fi
echo "GATE C1.4a: PASSA — SQL $TOTAL_SQL/$TOTAL_SQL · tsc OK"
exit 0
