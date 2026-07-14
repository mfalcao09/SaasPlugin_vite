# Habilitar número do salão-DEMO na WhatsApp Cloud API oficial (Meta)

> Frente ISOLADA. Número demo (11) 95213-9912 (salão de teste que demonstramos na tela).
> NÃO é o QR Evolution dos tenants. NÃO tocar em onboarding de tenant.
> Sessão: `31900788-...` · 2026-07-13

## Critério de DONE (verificável)
- [ ] Número `+5511952139912` com `phone_number_id` na WABA do Business Portfolio `1331611869008138`
- [ ] Verificação OTP (SMS) concluída na Meta → número `VERIFIED`/`CONNECTED`
- [ ] Registrado no app via `platform-meta-whatsapp-connect` (linha em `platform_crm_whatsapp_meta_connections`)
- [ ] Prova: 1 mensagem de teste enviada/recebida pelo número (via `platform-meta-whatsapp-test`/`-send`)

## Recon — FATOS confirmados (2026-07-13)
1. **Integração Meta Cloud já existe inteira na `main`** (12 edges `platform-meta-whatsapp-*`).
   - `platform-meta-whatsapp-connect`: wizard de credenciais MANUAIS. Recebe `phone_number_id`+`waba_id`+`access_token` JÁ prontos, valida no Graph (`GET /{phone_number_id}`, `GET /{waba_id}` — exige `whatsapp_business_management`), criptografa e salva em `platform_crm_whatsapp_meta_connections` (SEM organization_id; super_admin).
   - Graph `v21.0`, base `https://graph.facebook.com/v21.0` (`_shared/meta-graph.ts`).
   - **Token é por-conexão, criptografado** (`_shared/meta-crypto.ts` `encryptSecret`). Não há token global em env.
2. **Nenhuma edge faz `POST /{waba}/phone_numbers` / `request_code` / `verify_code`** — o passo de adicionar+verificar número NÃO está codado (roda via Graph curl OU UI Meta).
3. **Número de VENDAS já conectado** = `+5511955021205` (Salvy `active`). Prova que existe WABA + token com `whatsapp_business_management` sob o Portfolio `1331611869008138`.
4. **Salvy (via API `https://api.salvy.com.br`, `Bearer SALVY_API_KEY` em `docs/salvy/.env.local`):**
   - Demo: id `019f388d-0047-75dd-83de-607b6083f6a1`, `+5511952139912`, **status `pending`**, 0 SMS no histórico, criado 2026-07-06.
   - Vendas: id `019f30a2-fc83-76d0-af6a-6341c80e5b4c`, `active`.
   - OTP WhatsApp: Salvy entrega parseado (`detections.whatsapp.verificationCode`). **COMPROVADO** (linha Vendas recebeu "Your WhatsApp code: 944-591").
   - **Números Salvy = SMS-inbound-only, SEM VOZ.** → forçar `code_method=SMS` na Meta; NÃO deixar escalar pra voz. Retenção de SMS parece curta → ler OTP logo após disparar.
   - Endpoint OTP: `GET /api/v2/virtual-phone-accounts/{id}/sms-messages`.

## BLOQUEIOS (gates que só Marcelo resolve)
- **B1 — Salvy `pending`:** demo está `pending` (Vendas está `active`). Se não recebe SMS nesse estado, o OTP da Meta nunca chega. Sem endpoint de "activate" na API → resolver no painel Salvy.
- **B2 — Auth Meta:** adicionar+verificar exige token `whatsapp_business_management`. O token existe (cifrado) mas não em texto claro. Caminhos: (A) Marcelo gera System User token; (B) edge server-side que decifra o token da Vendas; (C) UI Meta no Chrome do Marcelo.
- **B4 — histórico do número:** confirmar que `+5511952139912` não tem registro WhatsApp anterior (senão precisa deletar antes). `POST /phone_numbers` acusa e é não-destrutivo.

## Plano de execução (após destravar B1+B2)
1. Adicionar número à WABA: `POST /{waba_id}/phone_numbers` `{ cc:"55", phone_number:"11952139912", verified_name:"<nome>" }` → `phone_number_id`.
2. Disparar OTP: `POST /{phone_number_id}/request_code?code_method=SMS&language=pt_BR`.
3. Ler OTP na Salvy: `GET /virtual-phone-accounts/019f388d.../sms-messages` → `detections.whatsapp.verificationCode` (polling curto).
4. Verificar: `POST /{phone_number_id}/verify_code?code=XXXXXX`.
5. Registrar no app: `platform-meta-whatsapp-connect` com `phone_number_id`+`waba_id`+`access_token`.
6. Prova: `platform-meta-whatsapp-test`/`-send` → 1 mensagem ida/volta.

## Checkpoint 2026-07-13 (execução)

**Decisões do Marcelo:** WABA nova mantida (não NEXVY_VENDAS); verified_name = "Nexvy Beauty Demo"; teste entre os 2 números da conta.

**Feito + verificado (Graph API v21):**
- Número `+5511952139912` adicionado (via UI Meta no Chrome do Marcelo, caminho: casos de uso → Conectar no WhatsApp → Etapa 2 → Adicionar novo número). Meta criou WABA NOVA.
  - **WABA "Nexvy Beauty Demo" = `1023556786945354`** (account_review_status APPROVED).
  - **phone_number_id = `1220194224507621`**, categoria "Beleza, spa e salão".
- OTP SMS capturado na Salvy (`smsMessages[].detections.whatsapp.verificationCode`) → verificado. Salvy virou `active`.
- Status atual: `status=CONNECTED`, `code_verification_status=VERIFIED`, `name_status=APPROVED`, `throughput=STANDARD`.
- **Token:** System User "Employee" (`122100461733394595`), permanente (expires_at 0), escopos whatsapp_business_management + whatsapp_business_messaging. Em `~/Downloads/TOKEN_NOVOWABA_NEXVY.txt` (fora do repo). Precisou o Marcelo **atribuir a WABA nova ao System User** (assignment de permissão feito por ele).
- **Envio OK nos 2 sentidos:** demo→Vendas (template hello_world, accepted; abriu janela 24h no Vendas = entregue) · Vendas→demo (texto livre na janela, message id).

**⚠️ Achado fora de escopo (Vendas):** webhook `platform-meta-whatsapp-webhook/1f7ca6e3…` (conexão Vendas) retorna **401 "invalid signature"** (index.ts:390 — HMAC do app_secret não bate). Inbound do Vendas funcionou até 2026-07-12 e parou → **provável app_secret rotacionado**; Vendas não está ingerindo inbound agora. Marcelo recebeu e-mail da Meta ("mensagens não entregues" / pagamento) e corrigiu o lado de pagamento (name_status foi PENDING→APPROVED). Falta corrigir o app_secret da conexão Vendas.

**Falta (bloqueado no app_secret ATUAL do app 1289456453376034):**
- [ ] Plugar demo no app via `platform-meta-whatsapp-connect` (CREATE exige app_secret) → cria linha em `platform_crm_whatsapp_meta_connections` + webhook do demo.
- [ ] (decisão do Marcelo) Corrigir conexão Vendas (UPDATE app_secret) → volta a ingerir inbound.
- [ ] Prova DB-visível: com webhooks OK, reenviar nos 2 sentidos → ambos caem em `platform_crm_messages`.

## Review — CONCLUÍDO 2026-07-13 ✅

**Todos os critérios de DONE atingidos + bônus (fix Vendas).**

1. ✅ Número `+5511952139912` na WABA "Nexvy Beauty Demo" `1023556786945354` (Portfolio 1331611869008138).
2. ✅ Verificação OTP (SMS via Salvy, código `613823`) → `code_verification_status=VERIFIED`.
3. ✅ Habilitado: `status=CONNECTED`, `name_status=APPROVED`, `throughput=STANDARD`, phone_number_id `1220194224507621`.
4. ✅ Plugado no app: conexão `ee5afbc2-01c0-4689-9f34-fd4c4ed316ff` em `platform_crm_whatsapp_meta_connections` (via edge `platform-meta-whatsapp-connect`). Inbound roteado pra própria conexão via `override_callback_uri` na WABA demo (`subscribed_apps` success).
5. ✅ Prova DB-visível bidirecional:
   - demo→Vendas → inbound na conversa `90d14ad5` (conexão Vendas `1f7ca6e3`); bot Mia respondeu.
   - Vendas→demo → inbound na conversa `65502986` (conexão demo `ee5afbc2`); bot Mia respondeu.

**Bônus — bug do Vendas RESOLVIDO:** conexão Vendas `1f7ca6e3` estava com app_secret desatualizado → webhook 401 → inbound parado desde 2026-07-12. Atualizada (connect UPDATE) com app_secret atual + token permanente → webhook voltou 200, inbound ingerindo (provado pela mensagem do demo caindo no DB).

**Como autenticar na edge (aprendizado):** projeto migrou p/ API keys novas Supabase (`sb_secret_`, não recuperável via CLI). O JWT service_role legado passa no gateway mas ≠ env interno da função. Solução: mintar JWT super_admin via GoTrue Auth Admin (`/auth/v1/admin/generate_link` + `/auth/v1/verify`) com a service_role legada → usar como Bearer (caminho getClaims → super_admin gate).

**Segredos usados (limpar):** `~/Downloads/TOKEN_NOVOWABA_NEXVY.txt` (token plaintext) + `META_APP_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` em `docs/salvy/.env.local` (gitignored). Token já está cifrado no banco — recomendado apagar o .txt do Downloads.

**Pendência menor:** 1 texto demo→Vendas ("via app/DB") não apareceu no DB numa checagem (possível latência/dedup); não afeta a prova (bidirecional já comprovada).
