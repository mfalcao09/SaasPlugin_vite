# Diagnóstico — outbound do celular não entrou no CRM (Joice)

## Sintoma
Resposta humana à Joice (celular conectado à Camila) não apareceu em `platform_crm_messages`. Inbounds dela (`Pode deixar` / `Obrigada`) sim.

## Causa raiz (provada)
Instância Z-API `camila-zapi-test` sem `notifySentByMe` efetivo.
- Docs Z-API: `update-every-webhooks` + `notifySentByMe: true` = webhooks de msgs **enviadas por mim**.
- Sem isso, só chega inbound → CRM “mudo” no fromMe.
- Handler CRM **já** gravava `external_device` quando fromMe chega (código ok).
- Último `external_device` no produto: 2026-08-18 (pré-cutover Camila Z-API).

## Correção aplicada (2026-09-15)
1. `PUT /update-every-webhooks` com `notifySentByMe=true` → 200 `{"value":true}`
2. Probe sintético fromMe → `{"stored":"external_outbound"}` + linha CRM `source=external_device` (**PROBE_PASS**)
3. Código: create/subscribe/connect passam a gravar `metadata.notify_sent_by_me`; QR não marca `webhook_subscribed` falso; reconnect reafirma notifySentByMe
4. Deploy: `platform-whatsapp-qr-proxy`

## Check binário
- PUT webhooks 200 + notify flag no metadata
- Probe fromMe → CRM `external_device`
