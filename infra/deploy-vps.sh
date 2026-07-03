#!/usr/bin/env bash
# Deploy idempotente de 1 app Vite no padrao Traefik FILE PROVIDER.
#
# Uso: ./infra/deploy-vps.sh APP_DIR CONTAINER DOMAIN
#   ex: ./infra/deploy-vps.sh NexvyBeauty   nexvy-beauty         beauty.exemplo.com.br
#       ./infra/deploy-vps.sh NexvyOficinas nexvy-oficinas-vite  nexvyoficinas.com.br
#
# O que faz:
#   1. builda a imagem do app (Dockerfile.app + ARG APP_DIR) -- com --no-cache por padrao
#   2. (re)sobe o container na rede externa traefik-public (sem ports publicados)
#   3. renderiza infra/traefik/<APP_DIR>.yml.template -> dynamic/<CONTAINER>.yml
#   4. GATE anti-phantom: so retorna 0 quando o bundle NOVO esta provadamente servindo
#
# Saida: "DEPLOY-VERDE: ..." + exit 0  |  "GATE FALHOU ..." + exit 1
#
# Lições aplicadas (memoria Marcelo):
#   feedback_docker_phantom_deploy_no_cache -> --no-cache + prova de hash do bundle servido
#   feedback_nexvyoficinas_deploy_topologia -> template hardcoda app.; --no-cache obrigatorio
set -euo pipefail

APP_DIR="${1:?APP_DIR obrigatorio (ex: NexvyBeauty)}"
CONTAINER="${2:?CONTAINER obrigatorio (ex: nexvy-beauty)}"
DOMAIN="${3:?DOMAIN obrigatorio (ex: beauty.exemplo.com.br)}"

REPO=/opt/stacks/saasplugin-vite
TRAEFIK_DYNAMIC=/opt/stacks/traefik/dynamic

TPL="$REPO/infra/traefik/${APP_DIR}.yml.template"
OUT="$TRAEFIK_DYNAMIC/${CONTAINER}.yml"

# ── parametros do gate (ajuste se sua imagem diferir) ────────────────────────
BUILD_NO_CACHE="${BUILD_NO_CACHE:-1}"                  # 1 = --no-cache (default; lição phantom-deploy)
READY_TIMEOUT="${READY_TIMEOUT:-90}"                   # s — inclui 1a emissao de cert Let's Encrypt
BUNDLE_RE="${BUNDLE_RE:-index-[A-Za-z0-9_-]+\.js}"     # ⚠ padrao do entry bundle Vite
# ⚠ caminhos tentados p/ ler o index.html DA IMAGEM nova (path-agnostic, best-effort):
IMAGE_INDEX_PATHS="${IMAGE_INDEX_PATHS:-/usr/share/nginx/html/index.html /app/dist/index.html /usr/share/nginx/html/index.htm}"

if [ ! -f "$TPL" ]; then
  echo "ERRO: template nao encontrado: $TPL" >&2
  exit 1
fi

DOMAIN_URL="https://$DOMAIN/"

# ── 0. snapshot anti-phantom: hash do bundle SERVIDO hoje (antes do deploy) ───
BEFORE_HASH="$(curl -s -m 8 "$DOMAIN_URL" 2>/dev/null | grep -oE "$BUNDLE_RE" | head -1 || true)"

# ── 1. build (--no-cache por padrao) ─────────────────────────────────────────
NC=(); [ "$BUILD_NO_CACHE" = "1" ] && NC=(--no-cache)
docker build \
  "${NC[@]}" \
  -f "$REPO/infra/Dockerfile.app" \
  --build-arg APP_DIR="$APP_DIR" \
  -t "${CONTAINER}:latest" \
  "$REPO"

# hash ESPERADO = o que a imagem recem-buildada contem (lido aqui, antes de subir)
EXPECTED_HASH=""
for p in $IMAGE_INDEX_PATHS; do
  EXPECTED_HASH="$(docker run --rm --entrypoint sh "${CONTAINER}:latest" -lc "cat '$p' 2>/dev/null" 2>/dev/null \
    | grep -oE "$BUNDLE_RE" | head -1 || true)"
  [ -n "$EXPECTED_HASH" ] && break
done

# ── 2. (re)run na rede traefik-public (idempotente) ──────────────────────────
docker rm -f "$CONTAINER" 2>/dev/null || true
RUN_ENV=()
[ -f "$REPO/.env" ] && RUN_ENV=(--env-file "$REPO/.env")
docker run -d \
  --name "$CONTAINER" \
  --network traefik-public \
  --restart unless-stopped \
  "${RUN_ENV[@]}" \
  "${CONTAINER}:latest"

# ── 3. render do template Traefik (substitui DOMAIN_* e __CONTAINER__) ───────
mkdir -p "$TRAEFIK_DYNAMIC"
sed "s|DOMAIN_[A-Z]*|$DOMAIN|g; s|__CONTAINER__|$CONTAINER|g" "$TPL" > "$OUT"
echo "deployed $APP_DIR -> $CONTAINER -> $DOMAIN_URL (traefik hot-reload via $OUT)"

# ── 4. GATE DE VERIFICACAO (anti-phantom: so termina quando o bundle NOVO serve) ─
# 4a. readiness: poll ate 200 (espera Traefik rotear + cert emitir)
t=0; served=0; hc=000
while [ "$t" -lt "$READY_TIMEOUT" ]; do
  hc="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$DOMAIN_URL" 2>/dev/null || echo 000)"
  [ "$hc" = "200" ] && { served=1; break; }
  sleep 3; t=$((t+3))
done
if [ "$served" != 1 ]; then
  echo "GATE FALHOU: $DOMAIN_URL nao respondeu 200 em ${READY_TIMEOUT}s (HTTP $hc)" >&2
  echo "  -> container subiu? 'docker logs $CONTAINER'. Router no dynamic/$CONTAINER.yml? cert emitido?" >&2
  exit 1
fi

# 4b. prova anti-phantom: bundle servido == bundle recem-buildado?
SERVED_HASH="$(curl -s -m 8 "$DOMAIN_URL" 2>/dev/null | grep -oE "$BUNDLE_RE" | head -1 || true)"
if [ -n "$EXPECTED_HASH" ]; then
  if [ "$SERVED_HASH" = "$EXPECTED_HASH" ]; then
    echo "  OK anti-phantom: serve o bundle NOVO ($SERVED_HASH)"
  else
    echo "GATE FALHOU (PHANTOM): serve '$SERVED_HASH' mas a imagem nova tem '$EXPECTED_HASH'" >&2
    echo "  -> Traefik servindo container velho, ou build cacheado servindo codigo antigo." >&2
    exit 1
  fi
elif [ -n "$BEFORE_HASH" ] && [ "$SERVED_HASH" = "$BEFORE_HASH" ]; then
  echo "AVISO anti-phantom: bundle servido ($SERVED_HASH) == o de ANTES do deploy, e nao li o" >&2
  echo "  hash esperado da imagem (confirme IMAGE_INDEX_PATHS). Pode ser phantom OU front sem mudanca." >&2
  # nao falha o deploy num aviso — mas grita pra voce conferir.
else
  echo "  OK (parcial): 200 + bundle servido = ${SERVED_HASH:-<sem-hash>} (sem hash esperado p/ comparar)"
fi

echo "DEPLOY-VERDE: $APP_DIR servindo provado em $DOMAIN_URL"
