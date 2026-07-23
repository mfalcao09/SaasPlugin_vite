#!/usr/bin/env bash
# ============================================================================
# GATE do card C1.3 — fila de revisão (PRD §6.2)
#
# Sobe um Postgres EFÊMERO, aplica a migration, roda tests/fila-revisao.test.sql
# e derruba tudo. Não depende de Docker nem toca em nenhum banco existente.
# Mesmo padrão de scripts/test-rls.sh (gate gêmeo, card C0.3).
#
#   ./scripts/test-fila-revisao.sh
#
# Saída: 0 se todos os testes PASS, 1 se qualquer FAIL. O loop lê o exit code.
# ============================================================================
set -uo pipefail

# LC_ALL=C é obrigatório no macOS: sem ele o postmaster vira multithreaded
# durante o startup e o servidor não sobe.
export LC_ALL=C LANG=C

# O initdb do libpq NÃO serve (não traz o binário `postgres`); precisa do
# pacote postgresql completo.
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
# Socket precisa de caminho CURTO: o limite do Unix domain socket é 103 bytes.
RUNDIR="${RUNDIR:-/tmp/pgdm-fila-$$}"
PGDATA="$RUNDIR/data"
PGPORT="${PGPORT:-55434}"
DB=diariomonitor_gate_fila

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$HERE/supabase/migrations/20260723000001_schema_inicial.sql"
TESTE="$HERE/tests/fila-revisao.test.sql"

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

for M in "$HERE"/supabase/migrations/*.sql; do
  "$PGBIN/psql" -v ON_ERROR_STOP=1 -q -d "$DB" -f "$M" >/dev/null 2>&1 \
    || { echo "ERRO: migration $(basename "$M")"; exit 1; }
done

# Grants do role de aplicação; a guarda permanente é reaplicada DEPOIS deles,
# senão o grant amplo reabriria update/delete no acervo append-only.
"$PGBIN/psql" -q -d "$DB" >/dev/null <<'SQL'
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on auth.users to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke update, delete on public.atos, public.edicoes, public.auditoria from authenticated;
SQL

SAIDA="$("$PGBIN/psql" -d "$DB" -f "$TESTE" 2>&1)"
echo "$SAIDA" | grep -E "PASS|FAIL" | sed 's/^ *//'

FALHAS=$(echo "$SAIDA" | grep -c "FAIL")
TOTAL=$(echo "$SAIDA" | grep -cE "PASS|FAIL")

echo "----------------------------------------"
if [ "$FALHAS" -gt 0 ]; then
  echo "GATE C1.3: REPROVA — $FALHAS falha(s) de $TOTAL"
  echo "$SAIDA" | grep -iE "erro|error" | grep -viE "PASS|FAIL" || true
  exit 1
fi
if [ "$TOTAL" -eq 0 ]; then
  echo "GATE C1.3: REPROVA — nenhum resultado PASS/FAIL encontrado (o teste travou antes de imprimir)"
  echo "$SAIDA"
  exit 1
fi
echo "GATE C1.3: PASSA — $TOTAL/$TOTAL"
exit 0
