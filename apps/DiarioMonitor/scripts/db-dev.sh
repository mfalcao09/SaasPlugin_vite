#!/usr/bin/env bash
# ============================================================================
# Banco de DESENVOLVIMENTO — Postgres local persistente
#
#   ./scripts/db-dev.sh start | stop | status | reset | psql
#
# Diferente dos gates (test-*.sh), que sobem um Postgres EFÊMERO e o destroem
# ao sair: este sobrevive entre execuções, porque é o banco que a aplicação usa.
#
# Por que local e não Supabase cloud: o SQL é o mesmo (as migrations são as do
# Supabase, incluindo RLS); trocar de alvo é trocar DATABASE_URL. Enquanto a
# escolha de projeto/custo no Supabase não for feita, isto destrava a UI.
#
# IMPORTANTE — a aplicação NUNCA conecta como superusuário. Ela usa o role
# `authenticated` e define `request.jwt.claims` por requisição, igual ao
# Supabase. É isso que faz a RLS valer de verdade em vez de ser decoração:
# superusuário faz BYPASS de toda policy.
# ============================================================================
set -uo pipefail
export LC_ALL=C LANG=C   # sem isto o postmaster vira multithreaded no macOS

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="$HERE/.dev-db/data"
SOCKET="/tmp/pgdm-dev"          # limite de 103 bytes no socket Unix
PGPORT="${PGPORT:-55432}"       # 55433 é dos gates; não colidir
DB=diariomonitor

# Credenciais de desenvolvimento local, sem segredo: o servidor só escuta em
# socket Unix (listen_addresses=''), então nada disto é alcançável pela rede.
export PGHOST="$SOCKET" PGPORT PGUSER=postgres

[ -x "$PGBIN/initdb" ] || { echo "ERRO: Postgres não encontrado em $PGBIN"; exit 2; }

esta_no_ar() { "$PGBIN/pg_isready" -q 2>/dev/null; }

aplicar_schema() {
  # Shim do Supabase: auth.users + auth.uid() lendo o JWT do GUC de sessão.
  "$PGBIN/psql" -q -d "$DB" >/dev/null <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid;
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated login;
  end if;
end $$;
SQL

  for M in "$HERE"/supabase/migrations/*.sql; do
    "$PGBIN/psql" -v ON_ERROR_STOP=1 -q -d "$DB" -f "$M" >/dev/null 2>&1 \
      || { echo "ERRO ao aplicar $(basename "$M")"; return 1; }
  done

  # Grants do role de aplicação. A guarda append-only é reaplicada DEPOIS do
  # grant amplo — senão o grant reabriria update/delete no acervo.
  "$PGBIN/psql" -q -d "$DB" >/dev/null <<'SQL'
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on auth.users to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke update, delete on public.atos, public.edicoes, public.auditoria from authenticated;
SQL

  # Dois usuários, um por instituição sintética do seed — é o par que prova
  # isolamento multi-tenant na tela, não só no teste.
  "$PGBIN/psql" -q -d "$DB" >/dev/null <<'SQL'
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestor.a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'gestor.b@teste.local')
on conflict (id) do nothing;

insert into public.usuarios (auth_id, instituicao_id, nome, email, perfil) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Gestor A', 'gestor.a@teste.local', 'gestor'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
   'Gestor B', 'gestor.b@teste.local', 'gestor')
on conflict do nothing;
SQL
}

case "${1:-start}" in
  start)
    if esta_no_ar; then echo "já no ar em $SOCKET:$PGPORT (banco $DB)"; exit 0; fi
    if [ ! -d "$PGDATA" ]; then
      echo "criando cluster em .dev-db/ …"
      mkdir -p "$PGDATA" "$SOCKET"
      "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null 2>&1 \
        || { echo "ERRO: initdb falhou"; exit 2; }
      NOVO=1
    fi
    mkdir -p "$SOCKET"
    "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k $SOCKET -c listen_addresses=''" \
      -l "$HERE/.dev-db/log" start >/dev/null 2>&1
    for _ in 1 2 3 4 5 6 7 8 9 10; do esta_no_ar && break; sleep 0.4; done
    esta_no_ar || { echo "ERRO: não subiu"; tail -5 "$HERE/.dev-db/log"; exit 2; }

    if [ "${NOVO:-0}" = 1 ]; then
      "$PGBIN/createdb" "$DB" >/dev/null 2>&1
      aplicar_schema || exit 1
      echo "cluster criado e schema aplicado"
    fi
    echo "Postgres de dev no ar — socket $SOCKET porta $PGPORT banco $DB"
    ;;

  stop)
    "$PGBIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null 2>&1 && echo "parado" || echo "não estava no ar"
    ;;

  status)
    if esta_no_ar; then
      echo "NO AR — $SOCKET:$PGPORT/$DB"
      "$PGBIN/psql" -d "$DB" -At -c \
        "select 'edicoes='||(select count(*) from edicoes)||' atos='||(select count(*) from atos)"
    else
      echo "PARADO"
    fi
    ;;

  reset)
    # Destrói só o cluster de desenvolvimento desta pasta. `find -delete` em vez
    # de `rm -rf` (regra do CLAUDE.md) e caminho sempre dentro de .dev-db/.
    "$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1
    find "$HERE/.dev-db" -mindepth 1 -delete 2>/dev/null
    echo "cluster removido — rode 'start' para recriar do zero"
    ;;

  psql)  shift; exec "$PGBIN/psql" -d "$DB" "$@" ;;

  *) echo "uso: $0 {start|stop|status|reset|psql}"; exit 2 ;;
esac
