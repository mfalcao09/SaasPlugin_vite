#!/usr/bin/env bash
# Deploy Evolution API no VPS
# Uso: ssh vps-hostinger "bash /opt/stacks/saasplugin-vite/infra/stacks/evolution-api/deploy.sh"
set -euo pipefail

STACK_DIR="/opt/stacks/evolution-api"
TRAEFIK_DYNAMIC="/opt/stacks/traefik/dynamic"
REPO_DIR="/opt/stacks/saasplugin-vite"

echo "── Evolution API deploy ──────────────────────────────────"

mkdir -p "$STACK_DIR"
cp "$REPO_DIR/infra/stacks/evolution-api/docker-compose.yml" "$STACK_DIR/docker-compose.yml"

cp "$REPO_DIR/infra/traefik/evolution-api.yml" "$TRAEFIK_DYNAMIC/evolution-api.yml"
echo "  ✓ Traefik config copiado (hot-reload automático)"

if [ ! -f "$STACK_DIR/.env" ]; then
  echo "  ⚠  .env não encontrado em $STACK_DIR/.env"
  echo "  Copie .env.example → .env e preencha as credenciais antes de continuar."
  exit 1
fi
echo "  ✓ .env presente"

cd "$STACK_DIR"
docker compose pull --quiet
docker compose up -d --remove-orphans
echo "  ✓ Containers rodando"

sleep 5
if curl -sf "http://127.0.0.1:8080/" > /dev/null 2>&1; then
  echo "  ✓ API respondendo em 127.0.0.1:8080"
else
  echo "  ⚠  API ainda não responde — aguarde 10s e verifique: docker compose logs api"
fi

echo ""
echo "URLs:"
echo "  API:     https://evolution.nexvy.tech"
echo "  Manager: https://manager.evolution.nexvy.tech"
echo "─────────────────────────────────────────────────────────"
