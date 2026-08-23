# Instagram Login — subscribe Meta (passo de console, sem exigir Live)

O código do webhook já existe: `instagram-login-webhook` (GET challenge + POST assinado).
**Este arquivo só documenta o passo no App Dashboard.** Não é gate de merge e **não exige o app em Live**.

App: **NEXVY - IGLOG** (Instagram Login). Host: `graph.instagram.com`. Não usar Page / `platform-instagram-webhook`.

## 1. Callback no App Dashboard

1. Meta App Dashboard → app IGLOG → **Instagram** → **Webhooks** (ou Instagram API setup with Instagram Login → Configure webhooks).
2. Callback URL — **só o domínio do produto** (não colar URL de edge/DB):

   `https://app.nexvybeauty.com.br/webhooks/instagram-login`

   O nginx do `deploy-beauty` (`infra/nginx.conf`, `location ^~ /webhooks/instagram-login`) faz proxy GET+POST para a edge `instagram-login-webhook`, com query `hub.*` e header `X-Hub-Signature-256` intactos. Sem esse proxy no VPS, o handshake da Meta não fecha.

3. Verify token = o mesmo valor do secret `INSTAGRAM_LOGIN_WEBHOOK_VERIFY_TOKEN` (não commitar).
4. Salvar. O GET `hub.mode=subscribe` deve devolver `hub.challenge` em texto puro.
5. Assinar o campo **`messages`** (Direct). Campos extras opcionais: `message_reactions`, `messaging_seen`.

Handshake (path de domínio; depois do `deploy-beauty` + edge no ar):

```bash
VERIFY_TOKEN='<mesmo valor de INSTAGRAM_LOGIN_WEBHOOK_VERIFY_TOKEN>'
curl -sS -D- -o- \
  "https://app.nexvybeauty.com.br/webhooks/instagram-login?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=ig-login-probe-1"
# Esperado: HTTP 200, body exatamente `ig-login-probe-1`, Content-Type text/plain
```

Se o proxy ainda não estiver no VPS: o curl acima falha (SPA/`index.html` ou 404). Aí o código está no repo, mas **não verificado em produção**.

## 2. Subscribe da conta conectada

Depois do Instagram Login do tenant (`instagram_login_connections.status='active'`), a conta precisa se inscrever:

```http
POST https://graph.instagram.com/v21.0/{instagram_user_id}/subscribed_apps
  ?subscribed_fields=messages,message_reactions,messaging_postbacks,messaging_referral,messaging_seen,messaging_optins
Authorization: Bearer {user_access_token}
```

Tester (`falconurbanismo`) basta. **Live / App Review não é exigido nesta fase.**

Docs: [Setup Webhooks Subscriptions](https://developers.facebook.com/docs/instagram-platform/webhooks/) — coluna *Business Login for Instagram* / `graph.instagram.com`.

## 3. O que o código já faz

- Resolve a conexão por `entry.id` = `instagram_login_connections.instagram_user_id` (ativa).
- Grava `webchat_conversations.channel='instagram'` com `metadata.instagram_login_connection_id`.
- Identidade = IGSID / `@username`. Sem `visitor_phone`.
