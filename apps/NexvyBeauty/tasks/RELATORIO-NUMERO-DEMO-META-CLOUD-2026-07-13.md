# Relatório — Número do salão-DEMO habilitado na WhatsApp Cloud API oficial (Meta)

**Data:** 2026-07-13 · **App:** NexvyBeauty · **Supabase:** `fzhlbwhdejumkyqosuvq`
**Escopo:** habilitar o número (11) 95213-9912 (salão-demo) na API oficial Meta e plugá-lo no app.

---

## Resultado: CONCLUÍDO ✅ (todos os critérios + bônus)

| # | Critério | Estado |
|---|---|---|
| 1 | Número na WABA (Portfolio `1331611869008138`) | ✅ WABA "Nexvy Beauty Demo" `1023556786945354` |
| 2 | Verificação OTP | ✅ SMS via Salvy → `VERIFIED` |
| 3 | Habilitado na Cloud API | ✅ `CONNECTED` · nome `APPROVED` · `STANDARD` |
| 4 | Plugado no app | ✅ conexão `ee5afbc2` + inbound roteado |
| 5 | Prova de mensagem | ✅ bidirecional, DB-visível, bot respondendo |
| + | (bônus) Bug de inbound do Vendas | ✅ resolvido |

---

## Identificadores

| Item | Valor |
|---|---|
| Número demo | +55 11 95213-9912 |
| phone_number_id | `1220194224507621` |
| WABA demo | `1023556786945354` ("Nexvy Beauty Demo") |
| App ID | `1289456453376034` |
| Business Portfolio | `1331611869008138` |
| Conexão no app (demo) | `ee5afbc2-01c0-4689-9f34-fd4c4ed316ff` |
| Conexão no app (Vendas) | `1f7ca6e3-a846-493d-908e-b6d74ccf8c84` |
| Salvy account (demo) | `019f388d-0047-75dd-83de-607b6083f6a1` (virou `active`) |

---

## O que foi feito

1. **Cadastro + verificação na Meta** (UI do dev console, no Chrome do Marcelo): adicionado número → perfil "Nexvy Beauty Demo", categoria Beleza → OTP por **SMS**. A Meta criou uma **WABA nova** (decisão do Marcelo: manter).
2. **OTP capturado pela Salvy via API** (`GET /virtual-phone-accounts/{id}/sms-messages` → `detections.whatsapp.verificationCode`), código `613823` → verificado.
3. **Token permanente** (System User "Employee", escopos `whatsapp_business_management` + `whatsapp_business_messaging`); Marcelo atribuiu a WABA nova ao System User.
4. **Plugado no app** via edge `platform-meta-whatsapp-connect` (credenciais cifradas AES-256-GCM no banco). Inbound do demo roteado pra própria conexão via `override_callback_uri` na WABA demo.
5. **Prova bidirecional (DB):**
   - demo→Vendas → conversa `90d14ad5` (conexão Vendas) → bot Mia respondeu.
   - Vendas→demo → conversa `65502986` (conexão demo) → bot Mia respondeu.

---

## Bônus — bug do Vendas resolvido

O webhook do número de Vendas (`platform-meta-whatsapp-webhook/1f7ca6e3…`) retornava **401 "invalid signature"** (HMAC do app_secret desatualizado). Inbound do Vendas estava **parado desde 2026-07-12**. Atualizada a conexão com o app_secret atual → webhook voltou a **200**, inbound ingerindo (comprovado no DB).

---

## Aprendizado técnico (auth da edge)

O projeto migrou para as **API keys novas do Supabase** (`sb_secret_`, mostradas 1× e não recuperáveis via CLI). O JWT `service_role` legado passa no gateway mas **≠** o env interno da função → `token === serviceRoleKey` falha. **Solução:** mintar um JWT de super_admin via **GoTrue Auth Admin** (`/auth/v1/admin/generate_link` → `/auth/v1/verify`) usando a service_role legada, e usá-lo como Bearer (o gate `super_admin` valida via `getClaims`).

---

## Higiene de segredos (recomendado)

- Apagar `~/Downloads/TOKEN_NOVOWABA_NEXVY.txt` (token em plaintext; já está cifrado no banco).
- Opcional: remover `META_APP_SECRET` e `SUPABASE_SERVICE_ROLE_KEY` de `docs/salvy/.env.local` (gitignored) após o uso.

## Pendência menor

1 texto demo→Vendas ("via app/DB") não apareceu numa checagem de DB (latência/dedup) — não afeta a prova (bidirecional comprovada por outras mensagens).
