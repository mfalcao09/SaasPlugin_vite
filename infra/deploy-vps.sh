#!/usr/bin/env bash
# Deploy idempotente de 1 app Vite no padrao Traefik FILE PROVIDER.
#
# Uso: ./infra/deploy-vps.sh APP_DIR CONTAINER DOMAIN
#   ex: ./infra/deploy-vps.sh NexvyBeauty  nexvy-beauty        beauty.exemplo.com.br
#       ./infra/deploy-vps.sh NexvyOficinas nexvy-oficinas-vite nexvyoficinas.com.br
#
# O que faz:
#   1. builda a imagem do app (Dockerfile.app + ARG APP_DIR)
#   2. (re)sobe o container na rede externa traefik-public (sem ports publicados)
#   3. renderiza infra/traefik/<APP_DIR>.yml.template -> dynamic/<CONTAINER>.yml
#      (Traefik watch:true faz hot-reload do router/service/middleware)
set -euo pipefail

APP_DIR="${1:?APP_DIR obrigatorio (ex: NexvyBeauty)}"
CONTAINER="${2:?CONTAINER obrigatorio (ex: nexvy-beauty)}"
DOMAIN="${3:?DOMAIN obrigatorio (ex: beauty.exemplo.com.br)}"

REPO=/opt/stacks/saasplugin-vite
TRAEFIK_DYNAMIC=/opt/stacks/traefik/dynamic

TPL="$REPO/infra/traefik/${APP_DIR}.yml.template"
OUT="$TRAEFIK_DYNAMIC/${CONTAINER}.yml"

if [ ! -f "$TPL" ]; then
  echo "ERRO: template nao encontrado: $TPL" >&2
  exit 1
fi

# 1. build
docker build \
  -f "$REPO/infra/Dockerfile.app" \
  --build-arg APP_DIR="$APP_DIR" \
  -t "${CONTAINER}:latest" \
  "$REPO"

# 2. (re)run na rede traefik-public (idempotente: remove o antigo se existir)
docker rm -f "$CONTAINER" 2>/dev/null || true
RUN_ENV=()
[ -f "$REPO/.env" ] && RUN_ENV=(--env-file "$REPO/.env")
docker run -d \
  --name "$CONTAINER" \
  --network traefik-public \
  --restart unless-stopped \
  "${RUN_ENV[@]}" \
  "${CONTAINER}:latest"

# 3. render do template Traefik (substitui DOMAIN_* e __CONTAINER__)
mkdir -p "$TRAEFIK_DYNAMIC"
sed "s|DOMAIN_[A-Z]*|$DOMAIN|g; s|__CONTAINER__|$CONTAINER|g" "$TPL" > "$OUT"

echo "deployed $APP_DIR -> $CONTAINER -> https://$DOMAIN (traefik hot-reload via $OUT)"
