#!/usr/bin/env bash
# ============================================================================
# cascade-core.sh — Replica o core sales-spark (provado no NexvyOficinas)
#                   para outro SaaS do monorepo. Fases A-C do cascateamento.
#
# Uso:
#   ./infra/cascade-core.sh <APP_DIR> <SUPABASE_REF> <CONTAINER> <DOMAIN>
# Ex:
#   ./infra/cascade-core.sh NexvyBeauty fzhlbwhdejumkyqosuvq nexvy-beauty beauty.nexvy.com.br
#
# Pré-requisitos:
#   - supabase CLI logado (token); baseline em tasks/plano-implementacao-sales-spark/baseline/
#   - NexvyOficinas é a FONTE do core (src + supabase/functions)
#   - O app alvo é GREENFIELD (o reset DROPA o schema public atual!)
#
# O que NÃO faz (personalização — manual/Fase D):
#   - DNS, Traefik, deploy VPS, secrets (IA/email), Auth Site URL, super admin, branding
# ============================================================================
set -euo pipefail

APP_DIR="${1:?APP_DIR obrigatorio (ex: NexvyBeauty)}"
SUPABASE_REF="${2:?SUPABASE_REF obrigatorio (ex: fzhlbwhdejumkyqosuvq)}"
CONTAINER="${3:?CONTAINER obrigatorio (ex: nexvy-beauty)}"
DOMAIN="${4:?DOMAIN obrigatorio (ex: beauty.nexvy.com.br)}"

ROOT="/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite"
SRC_APP="$ROOT/apps/NexvyOficinas"          # fonte do core
DST_APP="$ROOT/apps/$APP_DIR"               # alvo
BASE="$ROOT/tasks/plano-implementacao-sales-spark/baseline"
SCHEMA="$BASE/sales-spark-baseline-schema.sql"
CFG="$BASE/config"
TMP="/tmp/cascade-$APP_DIR"
mkdir -p "$TMP"

q() { supabase db query --linked --agent=yes "$1" 2>&1; }   # exec SQL remoto
log() { echo "[$APP_DIR] $*"; }

[ -d "$DST_APP" ] || { echo "ERRO: $DST_APP nao existe"; exit 1; }
[ -f "$SCHEMA" ]  || { echo "ERRO: baseline schema nao encontrado: $SCHEMA"; exit 1; }

cd "$DST_APP"
log "linkando project $SUPABASE_REF ..."
supabase link --project-ref "$SUPABASE_REF" >/dev/null 2>&1

# ---------- GUARD: confirmar greenfield (sem dados reais) ----------
ROWS=$(q "SELECT COALESCE(sum(n_live_tup),0) AS t FROM pg_stat_user_tables;" | grep -oE '\"t\": [0-9]+' | grep -oE '[0-9]+' || echo 0)
log "linhas vivas no banco alvo: ${ROWS:-?}"
if [ "${ROWS:-0}" -gt 500 ]; then
  echo "ABORT: banco tem ${ROWS} linhas — pode ter dados reais. Confirme greenfield antes (rode com FORCE=1)."
  [ "${FORCE:-0}" = "1" ] || exit 1
fi

# ===================== FASE A — BANCO =====================
log "FASE A.1 — extensions"
q "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\" WITH SCHEMA extensions;
   CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
   CREATE EXTENSION IF NOT EXISTS pgmq;
   CREATE EXTENSION IF NOT EXISTS pg_cron;" >/dev/null || true

log "FASE A.2 — reset schema public + vector/pg_trgm em public"
q "DROP SCHEMA IF EXISTS public CASCADE;
   DROP EXTENSION IF EXISTS vector CASCADE;
   DROP EXTENSION IF EXISTS pg_trgm CASCADE;
   CREATE SCHEMA public;
   GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
   GRANT ALL ON SCHEMA public TO postgres, service_role;
   CREATE EXTENSION vector WITH SCHEMA public;
   CREATE EXTENSION pg_trgm WITH SCHEMA public;" >/dev/null

log "FASE A.3 — aplicar baseline (limpo: sem \\restrict, sem CREATE SCHEMA public)"
grep -vE '^\\(restrict|unrestrict)|^CREATE SCHEMA public;$|^COMMENT ON SCHEMA public ' "$SCHEMA" > "$TMP/schema.sql"
supabase db query --linked -f "$TMP/schema.sql" --agent=yes >/dev/null
TBL=$(q "SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" | grep -oE '[0-9]+' | head -1)
log "tabelas aplicadas: $TBL (esperado ~161)"
[ "${TBL:-0}" -ge 150 ] || { echo "ABORT: schema incompleto ($TBL tabelas)"; exit 1; }

log "FASE A.3b — GRANTs (CRÍTICO: o reset do schema apaga privilégios; sem isso o app dá 'permission denied' apesar da RLS)"
q "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
   GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
   GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;" >/dev/null

log "FASE A.4 — seeds (por tabela; help_articles opcional)"
for t in platform_plans help_categories platform_releases form_templates; do
  grep "INSERT INTO public.$t " "$CFG/seeds.sql" > "$TMP/seed_$t.sql" 2>/dev/null || true
  [ -s "$TMP/seed_$t.sql" ] && supabase db query --linked -f "$TMP/seed_$t.sql" --agent=yes >/dev/null 2>&1 || true
done

log "FASE A.5 — storage + realtime"
supabase db query --linked -f "$CFG/storage-setup.sql" --agent=yes >/dev/null 2>&1 || true
q "ALTER PUBLICATION supabase_realtime ADD TABLE public.webchat_conversations, public.webchat_messages, public.notifications, public.admin_notifications, public.lead_queue, public.agent_tool_executions;" >/dev/null 2>&1 || true

log "FASE A.6 — cron jobs (10)"
ANON=$(grep VITE_SUPABASE_ANON_KEY "$DST_APP/.env.production" 2>/dev/null | cut -d= -f2- | tr -d '" ')
if [ -n "$ANON" ]; then
q "DO \$\$
DECLARE v_url text := 'https://$SUPABASE_REF.supabase.co/functions/v1'; v_key text := '$ANON';
 v_jobs text[][] := ARRAY[['campaign-dispatcher','* * * * *'],['campaign-recurring-snapshot','*/15 * * * *'],['ai-followup-cron','*/5 * * * *'],['cadence-tick','*/5 * * * *'],['booking-dispatcher','*/5 * * * *'],['process-scheduled-messages','* * * * *'],['process-post-sale-scheduled','*/5 * * * *'],['opportunity-scan-cron','0 8 * * *'],['daily-report-ai','0 9 * * *'],['google-calendar-sync','*/15 * * * *']];
 r text[];
BEGIN
 FOREACH r SLICE 1 IN ARRAY v_jobs LOOP
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname=r[1];
  PERFORM cron.schedule(r[1], r[2], format(\$f\$ select net.http_post(url:=%L, headers:=%L::jsonb, body:='{}'::jsonb) \$f\$, v_url||'/'||r[1], json_build_object('Content-Type','application/json','Authorization','Bearer '||v_key)::text));
 END LOOP;
END \$\$;" >/dev/null 2>&1 || log "WARN: cron falhou (revisar manual)"
else
  log "WARN: ANON key ausente em .env.production — pulei cron (rodar manual)"
fi

# ===================== FASE B — EDGES =====================
log "FASE B — copiar + deploy 115 edges"
cp -r "$SRC_APP/supabase/functions/"* "$DST_APP/supabase/functions/"
printf 'project_id = "%s"\n' "$SUPABASE_REF" > "$DST_APP/supabase/config.toml"
supabase functions deploy --project-ref "$SUPABASE_REF" 2>&1 | tail -2

# ===================== FASE C — FRONTEND =====================
log "FASE C — copiar src + .env + build"
rm -rf "$DST_APP/src" && cp -r "$SRC_APP/src" "$DST_APP/src"
for f in index.html components.json tailwind.config.ts postcss.config.js vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json eslint.config.js; do
  cp "$SRC_APP/$f" "$DST_APP/$f" 2>/dev/null || true
done
cp "$SRC_APP/package.json" "$DST_APP/package.json"
# .env do alvo (mantém o .env.production do alvo; cria .env local pro build)
URL=$(grep VITE_SUPABASE_URL "$DST_APP/.env.production" | cut -d= -f2- | tr -d '" ')
cat > "$DST_APP/.env" <<EOF
VITE_SUPABASE_URL=$URL
VITE_SUPABASE_ANON_KEY=$ANON
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON
VITE_SITE_URL=https://$DOMAIN
EOF
( cd "$DST_APP" && npm install --no-audit --no-fund --loglevel=error && npm run build ) && log "BUILD VERDE ✅"

# ===================== RESUMO =====================
cat <<EOF

================ CORE REPLICADO: $APP_DIR ================
  Banco:    $TBL tabelas no project $SUPABASE_REF
  Edges:    deployadas (ver acima)
  Frontend: build verde
  FALTA (Fase D — manual/personalização):
    1. DNS: $DOMAIN -> 145.223.29.96
    2. Traefik: render infra/traefik/$APP_DIR.yml.template com $DOMAIN
    3. Deploy VPS: bash infra/deploy-vps.sh $APP_DIR $CONTAINER $DOMAIN
    4. Secrets: supabase secrets set (AI_API_KEY, RESEND_API_KEY, SUPER_ADMIN_EMAIL...) --project-ref $SUPABASE_REF
    5. Auth: Site URL=https://$DOMAIN + redirects
    6. Branding: UPDATE platform_settings (platform_name, cores, logo)
    7. Super admin: signup com SUPER_ADMIN_EMAIL
=========================================================
EOF
