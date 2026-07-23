#!/usr/bin/env bash
# ============================================================================
# GATE do card C0.4 — ingestão determinística do DO/MS (PRD v2.1 §9)
#
# Critério binário: 5 datas úteis → registros em `edicoes` com arquivo_path
# preenchido, hash_sha256 não-nulo e status='baixada'.
#
# Roda contra as fixtures JÁ versionadas — não rebaixa nada do portal
# (trava nº 1). Só o ingest-doms.mjs sai à rede, uma vez por edição.
#
#   ./scripts/test-ingest-doms.sh
# Saída: 0 se passa, 1 se reprova.
# ============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
RUNDIR="${RUNDIR:-/tmp/pgdm-ing-$$}"
PGDATA="$RUNDIR/data"
PGPORT="${PGPORT:-55434}"
DB=diariomonitor_ing

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$HERE/supabase/migrations/20260723000001_schema_inicial.sql"
FIXTURES="$HERE/fixtures/edicoes"
SQL_EDICOES="$RUNDIR/edicoes.sql"

[ -x "$PGBIN/initdb" ] || { echo "ERRO: Postgres não encontrado em $PGBIN"; exit 2; }
[ -d "$FIXTURES" ] || { echo "ERRO: fixtures ausentes — rode antes: node scripts/ingest-doms.mjs"; exit 2; }

encerrar() {
  "$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  find "$RUNDIR" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$RUNDIR" 2>/dev/null || true
}
trap encerrar EXIT

mkdir -p "$RUNDIR"

# Regenera o SQL a partir das fixtures em disco (o runner pula o download
# quando o arquivo já existe).
( cd "$HERE" && node scripts/ingest-doms.mjs --datas 5 > "$SQL_EDICOES" 2>/dev/null ) \
  || { echo "ERRO: ingest-doms.mjs falhou"; exit 1; }

"$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null 2>&1 || { echo "ERRO: initdb"; exit 2; }
"$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k $RUNDIR -c listen_addresses=''" -l "$RUNDIR/log" start >/dev/null 2>&1
sleep 2
export PGHOST="$RUNDIR" PGPORT PGUSER=postgres
"$PGBIN/pg_isready" -q || { echo "ERRO: servidor não subiu"; tail -5 "$RUNDIR/log"; exit 2; }
"$PGBIN/createdb" "$DB" >/dev/null 2>&1

"$PGBIN/psql" -q -d "$DB" >/dev/null <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
SQL

"$PGBIN/psql" -v ON_ERROR_STOP=1 -q -d "$DB" -f "$MIGRATION"   >/dev/null 2>&1 || { echo "ERRO: migration";      exit 1; }
"$PGBIN/psql" -v ON_ERROR_STOP=1 -q -d "$DB" -f "$SQL_EDICOES" >/dev/null 2>&1 || { echo "ERRO: insert edicoes"; exit 1; }

echo "=== GATE C0.4 — ingestão DO/MS ==="
SAIDA=$("$PGBIN/psql" -t -A -F'|' -d "$DB" <<'SQL'
select case when count(distinct data_publicacao) >= 5 then 'PASS' else 'FAIL' end,
       'G1: >= 5 datas uteis distintas (obtido: ' || count(distinct data_publicacao) || ')'
  from public.edicoes;
select case when count(*) = 0 then 'PASS' else 'FAIL' end,
       'G2: nenhuma edicao sem arquivo_path (violacoes: ' || count(*) || ')'
  from public.edicoes where arquivo_path is null;
select case when count(*) = 0 then 'PASS' else 'FAIL' end,
       'G3: nenhuma edicao sem hash_sha256 (violacoes: ' || count(*) || ')'
  from public.edicoes where hash_sha256 is null;
select case when count(*) = 0 then 'PASS' else 'FAIL' end,
       'G4: todas com status=baixada (fora do padrao: ' || count(*) || ')'
  from public.edicoes where status <> 'baixada';
select case when count(*) = count(distinct hash_sha256) then 'PASS' else 'FAIL' end,
       'G5: hashes unicos, sem duplicata silenciosa (' || count(*) || ' arquivos)'
  from public.edicoes;
select case when count(*) >= 1 then 'PASS' else 'FAIL' end,
       'G6: suplementos preservados (encontrados: ' || count(*) || ')'
  from public.edicoes where numero like '%SUP%';
SQL
)
echo "$SAIDA" | awk -F'|' 'NF>=2 {printf "%-6s | %s\n", $1, $2}'

# G7 — fixidez: o hash gravado confere com o arquivo em disco (âncora do RDC-Arq)
FALHAS_HASH=0
while IFS='|' read -r caminho hash_db; do
  [ -z "$caminho" ] && continue
  hash_disco=$(shasum -a 256 "$HERE/$caminho" 2>/dev/null | cut -d' ' -f1)
  if [ "$hash_disco" != "$hash_db" ]; then
    echo "  divergencia: $caminho"
    FALHAS_HASH=$((FALHAS_HASH + 1))
  fi
done < <("$PGBIN/psql" -t -A -F'|' -d "$DB" -c "select arquivo_path, hash_sha256 from public.edicoes")

if [ "$FALHAS_HASH" -eq 0 ]; then
  echo "PASS   | G7: fixidez — hash do banco confere com o arquivo em disco"
else
  echo "FAIL   | G7: fixidez — $FALHAS_HASH divergencia(s)"
fi

FALHAS=$(( $(echo "$SAIDA" | grep -c "^FAIL") + FALHAS_HASH ))
TOTAL=$(( $(echo "$SAIDA" | grep -cE "^(PASS|FAIL)") + 1 ))

echo "----------------------------------------"
if [ "$FALHAS" -gt 0 ]; then
  echo "GATE C0.4: REPROVA — $FALHAS falha(s)"
  exit 1
fi
echo "GATE C0.4: PASSA — $TOTAL/$TOTAL"
exit 0
