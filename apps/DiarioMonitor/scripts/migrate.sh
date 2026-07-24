#!/usr/bin/env sh
# Aplica supabase/migrations/*.sql em ordem, UMA vez cada (tabela de controle).
# Roda no boot do container; idempotente; falha = container não sobe (correto).
set -eu
: "${DATABASE_URL:?DATABASE_URL ausente}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  "create table if not exists public.schema_migrations (nome text primary key, em timestamptz not null default now());"
for f in supabase/migrations/*.sql; do
  n=$(basename "$f")
  ja=$(psql "$DATABASE_URL" -Atq -c "select 1 from public.schema_migrations where nome='$n'")
  [ "$ja" = "1" ] && continue
  echo "[migrate] aplicando $n"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
  psql "$DATABASE_URL" -Atq -c "insert into public.schema_migrations(nome) values ('$n')" >/dev/null
done
echo "[migrate] ok"
