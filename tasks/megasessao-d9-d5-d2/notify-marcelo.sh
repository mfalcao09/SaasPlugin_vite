#!/usr/bin/env bash
# notify-marcelo.sh — sino Telegram da megasessão (via bot OpenClaw @nexvy_orquestra_bot).
# PROVADO 2026-07-03 ("ok":true, mensagem entregue no celular do Marcelo).
#
# Uso:  bash tasks/megasessao-d9-d5-d2/notify-marcelo.sh "texto da mensagem"
# Segurança: o TELEGRAM_BOT_TOKEN vive SÓ no KVM4 (/opt/stacks/cerebro-infra/.env).
#            O curl roda LÁ via ssh — o token nunca toca o transcript/local.
# Canal é ONE-WAY (sino): a resposta do Marcelo vem NA SESSÃO, não pelo Telegram.
set -euo pipefail
MSG="${1:?uso: notify-marcelo.sh \"mensagem\"}"
CHAT_ID=1118516471  # user_id allowlistado do Marcelo (@unitfalc)

ssh vps-kvm4 "TOKEN=\$(grep '^TELEGRAM_BOT_TOKEN=' /opt/stacks/cerebro-infra/.env | cut -d= -f2); \
curl -s -m 15 \"https://api.telegram.org/bot\${TOKEN}/sendMessage\" \
  -d chat_id=${CHAT_ID} --data-urlencode text=\"🤖 [megasessão D9+D5+D2] ${MSG}\" | grep -o '\"ok\":[a-z]*'"
