#!/usr/bin/env bash
# ============================================================================
# GATE — campos novos de `edicoes` vindos da fonte DO/MS
# Doc: docs/FONTES-endpoints-e-extracao.md §5
#
# Sobe um Postgres EFÊMERO, aplica as DUAS migrations em ordem e verifica:
#   G1  colunas novas existem com os tipos certos
#   G2  default de `suspenso` é false (not null)
#   G3  view `edicoes_vigentes` filtra suspensas (1 suspensa + 1 normal → só 1)
#   G4  FK `edicao_pai_id` aceita vínculo válido (suplemento → mãe)
#   G5  FK `edicao_pai_id` rejeita uuid inexistente (integridade de verdade)
#   G6  índice parcial idx_edicoes_vigentes_fonte_data existe e é parcial
#
#   ./scripts/test-schema-campos-fonte.sh
# Saída: 0 se todos os testes PASS, 1 se qualquer FAIL.
# ============================================================================
set -uo pipefail

# LC_ALL=C é obrigatório no macOS: sem ele o postmaster vira multithreaded
# durante o startup e o servidor não sobe.
export LC_ALL=C LANG=C

# O initdb do libpq NÃO serve (não traz o binário `postgres`); precisa do
# pacote postgresql completo.
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
# Socket precisa de caminho CURTO: o limite do Unix domain socket é 103 bytes.
RUNDIR="${RUNDIR:-/tmp/pgdm-campos-$$}"
PGDATA="$RUNDIR/data"
PGPORT="${PGPORT:-55435}"
DB=diariomonitor_campos_gate

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_1="$HERE/supabase/migrations/20260723000001_schema_inicial.sql"
MIGRATION_2="$HERE/supabase/migrations/20260723000002_edicoes_campos_fonte.sql"

[ -x "$PGBIN/initdb" ] || {
  echo "ERRO: servidor Postgres não encontrado em $PGBIN"
  echo "      (o initdb do libpq não serve — precisa do pacote postgresql)"
  exit 2
}
[ -f "$MIGRATION_2" ] || { echo "ERRO: migration não encontrada — $MIGRATION_2"; exit 2; }

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
# A migration 1 referencia auth.users(id) em `usuarios`, e a view nova usa
# security_invoker — precisa do mesmo shim que os outros gates usam.
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

"$PGBIN/psql" -v ON_ERROR_STOP=1 -q -d "$DB" -f "$MIGRATION_1" >/dev/null 2>&1 \
  || { echo "ERRO: migration 1 (schema inicial) falhou"; exit 1; }
"$PGBIN/psql" -v ON_ERROR_STOP=1 -q -d "$DB" -f "$MIGRATION_2" >/dev/null 2>&1 \
  || { echo "ERRO: migration 2 (campos de fonte) falhou"; exit 1; }

echo "=== GATE — campos novos de fonte em edicoes (DO/MS) ==="
FALHAS=0

# ---------------------------------------------------------------------------
# G1 — colunas existem com os tipos certos
# ---------------------------------------------------------------------------
R1=$("$PGBIN/psql" -t -A -F'|' -d "$DB" <<'SQL'
select case when
    (select data_type from information_schema.columns where table_name='edicoes' and column_name='id_fonte') = 'text'
    and (select data_type from information_schema.columns where table_name='edicoes' and column_name='suspenso') = 'boolean'
    and (select data_type from information_schema.columns where table_name='edicoes' and column_name='edicao_pai_id') = 'uuid'
    and (select data_type from information_schema.columns where table_name='edicoes' and column_name='numero_suplemento') = 'integer'
    and (select data_type from information_schema.columns where table_name='edicoes' and column_name='descricao') = 'text'
    and (select data_type from information_schema.columns where table_name='edicoes' and column_name='data_inclusao') = 'timestamp with time zone'
  then 'PASS' else 'FAIL' end,
  'G1: as 6 colunas novas existem com os tipos corretos';
SQL
)
echo "$R1" | awk -F'|' 'NF>=2 {printf "%-6s | %s\n", $1, $2}'
echo "$R1" | grep -q '^FAIL' && FALHAS=$((FALHAS + 1))

# ---------------------------------------------------------------------------
# G2 — default de suspenso é false, not null
# ---------------------------------------------------------------------------
R2=$("$PGBIN/psql" -t -A -F'|' -d "$DB" <<'SQL'
select case when column_default = 'false' and is_nullable = 'NO' then 'PASS' else 'FAIL' end,
       'G2: edicoes.suspenso default=false, not null (obtido: ' || coalesce(column_default,'NULL') || ')'
  from information_schema.columns
 where table_name = 'edicoes' and column_name = 'suspenso';
SQL
)
echo "$R2" | awk -F'|' 'NF>=2 {printf "%-6s | %s\n", $1, $2}'
echo "$R2" | grep -q '^FAIL' && FALHAS=$((FALHAS + 1))

# ---------------------------------------------------------------------------
# G3 — view edicoes_vigentes filtra suspensas
# Arranjo: 1 fonte (DOMS, semeada pela migration 1), 1 edição normal + 1
# suspensa na mesma data.
# ---------------------------------------------------------------------------
"$PGBIN/psql" -v ON_ERROR_STOP=1 -q -d "$DB" >/dev/null <<'SQL'
insert into public.edicoes (fonte_id, numero, data_publicacao, url_original, suspenso, id_fonte)
  select id, '90001', date '2026-07-22', 'https://teste/90001', false, '90001'
    from public.fontes_diarios where sigla = 'DOMS';
insert into public.edicoes (fonte_id, numero, data_publicacao, url_original, suspenso, id_fonte)
  select id, '90002', date '2026-07-22', 'https://teste/90002', true, '90002'
    from public.fontes_diarios where sigla = 'DOMS';
SQL

R3=$("$PGBIN/psql" -t -A -F'|' -d "$DB" <<'SQL'
select case when
    (select count(*) from public.edicoes where id_fonte in ('90001','90002')) = 2
    and (select count(*) from public.edicoes_vigentes where id_fonte in ('90001','90002')) = 1
    and (select count(*) from public.edicoes_vigentes where id_fonte = '90002') = 0
  then 'PASS' else 'FAIL' end,
  'G3: edicoes_vigentes mostra so a nao-suspensa (2 inseridas, 1 na view)';
SQL
)
echo "$R3" | awk -F'|' 'NF>=2 {printf "%-6s | %s\n", $1, $2}'
echo "$R3" | grep -q '^FAIL' && FALHAS=$((FALHAS + 1))

# ---------------------------------------------------------------------------
# G4 — FK edicao_pai_id aceita vínculo válido suplemento -> mãe
# ---------------------------------------------------------------------------
# numero leva sufixo -SUPn (convenção já usada por scripts/ingest-doms.mjs):
# a unique (fonte_id, data_publicacao, numero) da migration 1 não permite
# mãe e suplemento com o mesmo numero puro na mesma data.
"$PGBIN/psql" -v ON_ERROR_STOP=1 -q -d "$DB" >/dev/null <<'SQL'
do $$
declare v_mae uuid;
begin
  select id into v_mae from public.edicoes where id_fonte = '90001';
  insert into public.edicoes (fonte_id, numero, data_publicacao, url_original, id_fonte, edicao_pai_id, numero_suplemento)
    select fonte_id, '90001-SUP1', date '2026-07-22', 'https://teste/90001-sup1', '90003', v_mae, 1
      from public.edicoes where id_fonte = '90001';
end $$;
SQL

R4=$("$PGBIN/psql" -t -A -F'|' -d "$DB" <<'SQL'
select case when e.edicao_pai_id = m.id then 'PASS' else 'FAIL' end,
       'G4: FK edicao_pai_id vincula suplemento a edicao-mae'
  from public.edicoes e join public.edicoes m on m.id_fonte = '90001'
 where e.id_fonte = '90003';
SQL
)
echo "$R4" | awk -F'|' 'NF>=2 {printf "%-6s | %s\n", $1, $2}'
echo "$R4" | grep -q '^FAIL' && FALHAS=$((FALHAS + 1))

# ---------------------------------------------------------------------------
# G5 — FK edicao_pai_id rejeita uuid inexistente (prova a integridade de
# verdade, não só que a coluna existe)
# ---------------------------------------------------------------------------
if "$PGBIN/psql" -v ON_ERROR_STOP=1 -d "$DB" >/dev/null 2>&1 <<'SQL'
insert into public.edicoes (fonte_id, numero, data_publicacao, url_original, id_fonte, edicao_pai_id)
  select fonte_id, '90099', date '2026-07-22', 'https://teste/90099', '90099',
         '00000000-0000-0000-0000-000000000000'::uuid
    from public.edicoes where id_fonte = '90001';
SQL
then
  echo "FAIL   | G5: FK edicao_pai_id aceitou uuid inexistente (deveria rejeitar)"
  FALHAS=$((FALHAS + 1))
else
  echo "PASS   | G5: FK edicao_pai_id rejeita uuid inexistente"
fi

# ---------------------------------------------------------------------------
# G6 — índice parcial existe (where suspenso = false)
# ---------------------------------------------------------------------------
R6=$("$PGBIN/psql" -t -A -F'|' -d "$DB" <<'SQL'
select case when count(*) = 1 then 'PASS' else 'FAIL' end,
       'G6: indice parcial idx_edicoes_vigentes_fonte_data existe (where suspenso=false)'
  from pg_indexes
 where tablename = 'edicoes'
   and indexname = 'idx_edicoes_vigentes_fonte_data'
   and indexdef ilike '%where%suspenso%';
SQL
)
echo "$R6" | awk -F'|' 'NF>=2 {printf "%-6s | %s\n", $1, $2}'
echo "$R6" | grep -q '^FAIL' && FALHAS=$((FALHAS + 1))

TOTAL=6
echo "----------------------------------------"
if [ "$FALHAS" -gt 0 ]; then
  echo "GATE campos-fonte: REPROVA — $FALHAS falha(s) de $TOTAL"
  exit 1
fi
echo "GATE campos-fonte: PASSA — $TOTAL/$TOTAL"
exit 0
