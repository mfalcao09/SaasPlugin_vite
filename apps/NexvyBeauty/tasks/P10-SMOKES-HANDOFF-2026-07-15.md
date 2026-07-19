# P10 — Roteiro executável dos 2 smokes do Handoff (Duda → pago → Lia, mesmo thread)

**Runbook pronto-para-disparar · 2026-07-15 · NexvyBeauty · Supabase `fzhlbwhdejumkyqosuvq`**

> **Estado deste doc:** roteiro + payloads exatos. **Nada foi executado, a flag NÃO foi ligada, nenhuma escrita em produção.** As únicas queries rodadas na preparação foram **read-only** (verificação de schema/estado — ver "Fact-Forcing Gate" abaixo). Executar os smokes é **ação do Marcelo**.

---

## Fact-Forcing Gate (4 fatos, re-executados na hora)

Antes de escrever este roteiro, os 4 fatos load-bearing foram re-verificados ao vivo no banco `fzhlbwhdejumkyqosuvq` (uma query consolidada, read-only):

| # | Fato | Verificado (valor real) |
|---|---|---|
| **1** | **A Lia é quem o handoff resolve.** O lookup é `platform_crm_product_agents` com `agent_type='support' AND is_active=true AND name ILIKE '%implanta%'`, o mais antigo (`onboarding-handoff.ts:44-52`). | `id=927fe936-0965-4693-90be-5944e745359b`, `agent_type=support`, `is_active=true`, `product_id=806b5975-e268-402e-a65c-9e9503271041` ✅ |
| **2** | **As colunas-alvo do handoff existem** em `platform_crm_conversations`: `provisioned_organization_id`, `current_agent_id`, `product_id`, `visitor_whatsapp`, `visitor_phone`. | 5/5 colunas presentes ✅ |
| **3** | **Credencial platform tem `webhook_secret`** e há um plano de teste `is_public=false` mapeado a offer slug (não vaza como link ofertável). | credencial `scope='platform'` com secret ✅; plano **"Teste E2E"** `id=2a96153e-…`, `offer_slug='34h7jqp'`, `product_cakto_id='71a6060b-8816-4f31-9bfc-8eac07d3f84c'`, `is_public=false`, R$10 ✅ |
| **4** | **Gate `org_created`:** o handoff só dispara quando a compra **cria** a org (`cakto-plan-provisioning.ts:554` — `if (planRes.org_created)`), e `org_created=true` só se não houver org para aquele `cakto_customer_email` (`:159-201`). Os e-mails sintéticos de teste **não podem ter org prévia**. | `0` orgs pré-existentes para `p10-smoke-a@nexvy-teste.invalid` e `p10-smoke-b@nexvy-teste.invalid` ✅ |

> **Por que o Fato 4 é o mais traiçoeiro:** se você semear uma org de teste "pra facilitar", o handoff **nunca dispara** (o gate `org_created` fica `false`). O smoke daria falso-negativo. Regra: **semeie a conversa, nunca a org** — a org nasce da própria compra.

---

## Como o código encadeia (fonte real, arquivo:linha)

```
cakto-webhook/index.ts
  :51  payload = await req.json()
  :53  order   = payload.data?.order ?? payload.data ?? payload.order ?? payload
  :57  row     = mapCaktoOrderForUpsert(order,…)   → customer.{name,email,phone}, product.id, status, paymentMethod (cakto-client.ts:312-342)
  :59  row.cakto_offer_slug = extractOfferSlug(order,…) → último segmento do checkoutUrl (cakto-plan-provisioning.ts:68-85)
  :206 if (scope==='platform')
  :209   provisionFromOrder(admin, row)

cakto-plan-provisioning.ts
  :537 provisionPlatformPlan → status paid/approved (:142) · resolve plano por offer slug/product (:102-124) ·
       cria/acha org por cakto_customer_email (:159-201) · orgCreated=true SÓ se criou (:194-195)
  :543 ensureAdminUser (cria auth user + profile + role + e-mail de acesso)  ← independente do handoff
  :554 if (planRes.org_created) {
  :557   seedSalonDataForNewOrg  (catálogo + automações OFF + Radar)
  :560   sendWelcomeWhatsApp     (boas-vindas WhatsApp ao comprador, non-fatal)
  :571   try { handoffConversationToOnboarding(admin,{organizationId, customerPhone, customerEmail}) }  ← O HANDOFF
       }

_shared/onboarding-handoff.ts
  :37  GATE: ONBOARDING_HANDOFF_ENABLED !== 'true' → { ok:false, skipped:'flag_off' }   (NO-OP)
  :44  acha o agente CS (Lia) — support + %implanta% + ativo, o mais antigo
  :66  variants = phoneVariantsBR(customerPhone)               (só-dígitos)
  :71  withPlus = variants.map(v => `+${v}`)                   ← FIX P0 (bug do +E.164)
  :77       .eq('product_id', csAgent.product_id)              ← FIX opcional (só conversa do produto da Lia)
  :78       .or(`visitor_whatsapp.in.(${list}),visitor_phone.in.(${list})`)   list = variants ∪ withPlus
  :87  fallback por e-mail (leads + visitor_email) se telefone não casar
  :110 se não achou conversa → { skipped:'conversation_not_found' }  (NO-OP limpo, provisioning intacto)
  :117 UPDATE conversa SET current_agent_id = Lia, provisioned_organization_id = <org nova>
```

**O bug P0 (por que o `withPlus` importa):** os webhooks inbound gravam `visitor_whatsapp`/`visitor_phone` como **`+E.164`** (com `+`; `platform-meta-whatsapp-webhook:185-186`). `phoneVariantsBR` gera variantes **só-dígitos**, e o match `.in.()` é **exato**. Sem o `withPlus`, `+5511987650001` do banco nunca casa com `5511987650001` das variantes → **match erra 100%** e só o fallback de e-mail salvaria. O arquivo `onboarding-handoff.ts` **já traz o fix** (linhas 71-72) e o filtro por produto (linha 77).

---

## PRÉ-CONDIÇÃO (obrigatória antes de qualquer smoke)

Estes smokes **presumem que o porte-deploy do blueprint já foi feito**. Sem isso, o bundle do `cakto-webhook` em produção **não contém** `onboarding-handoff.ts` (TL;DR #1 do blueprint) e o smoke faz NO-OP silencioso (sem nem log de handoff).

- [ ] **P1.** PR do porte merged (hunks A-F + fix 2.3 do blueprint `P10-HANDOFF-DUDA-LIA-2026-07-15.md`).
- [ ] **P2.** 3 edges deployadas **nesta ordem** (brain ANTES do secret): `platform-sales-brain cakto-webhook cakto-reprocess-order`. Check: `get_edge_function` do `cakto-webhook` mostra `onboarding-handoff.ts` no bundle.
- [ ] **P3.** Flag ligada — **é o disparo** (ver comando abaixo). Enquanto OFF, o handoff responde `skipped:'flag_off'` e nada muda.

> Ordem canônica: **P1 → P2 (deploy) → P3 (secret ON) → Smoke A → Smoke B → Go-live**. O secret é o último interruptor.

### Comando da flag (AÇÃO DO MARCELO)

```bash
# LIGAR (dispara o handoff — é isto que "arma" os 2 smokes)
supabase secrets set ONBOARDING_HANDOFF_ENABLED=true  --project-ref fzhlbwhdejumkyqosuvq

# REVERTER (kill switch)
supabase secrets set ONBOARDING_HANDOFF_ENABLED=false --project-ref fzhlbwhdejumkyqosuvq
```

- O secret é **por projeto** — cobre `cakto-webhook`, `cakto-reprocess-order` e o `platform-sales-brain` de uma vez. Novas invocações leem o novo valor (near-instant; sem redeploy).
- ⚠️ **Nuance do kill switch (do blueprint):** desligar a flag **NÃO despina** Lias já fixadas. Ao reverter em produção, rode também:
  ```sql
  UPDATE platform_crm_conversations
     SET current_agent_id = NULL
   WHERE current_agent_id = '927fe936-0965-4693-90be-5944e745359b'
     AND provisioned_organization_id IS NOT NULL;
  ```

### Constantes usadas nos dois smokes

| Item | Valor |
|---|---|
| Produto Beauty (`product_id`) | `806b5975-e268-402e-a65c-9e9503271041` |
| Lia · Implantação (`agent_type=support`) | `927fe936-0965-4693-90be-5944e745359b` |
| Duda (SDR, pin inicial da conversa) | `577fc770-1688-464c-9ff9-46244c9b203b` |
| Plano de teste (não-vaza, `is_public=false`) | offer slug `34h7jqp` · `product_cakto_id 71a6060b-8816-4f31-9bfc-8eac07d3f84c` · R$10 |
| Endpoint do webhook | `https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-webhook?scope=platform&secret=$PLATFORM_WEBHOOK_SECRET` |

O `PLATFORM_WEBHOOK_SECRET` **não é impresso aqui** (segredo). Puxe read-only na hora:
```bash
# via MCP execute_sql (o valor aparece só no seu terminal):
#   select webhook_secret from cakto_credentials where scope='platform';
export PLATFORM_WEBHOOK_SECRET='<cole aqui na hora>'
```

> **Nota de gateway:** `cakto-webhook` roda público em prod (a Cakto não manda JWT; auth real = o `secret`). Se o gateway devolver `401` por JWT, acrescente ao `curl`: `-H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"` (a anon key é publishable; no-op quando a função é pública).

---

## SMOKE A — Handoff SDR (conversa da Duda existe → compra paga com o MESMO telefone → Lia assume o thread)

**Objetivo (critério verificável):** ao chegar a compra paga, a **mesma** conversa (mesmo `conversation_id`, sem criar nova) passa a ter `current_agent_id = Lia` e `provisioned_organization_id` preenchido. E o fix P0 casa o telefone em **todos os formatos** (com/sem `+55`, com/sem 9º dígito).

### A.0 — Prova do fix P0 no nível-query (determinística, ZERO efeito colateral, não precisa da flag)

Reproduz a lista `.in.()` que o handoff monta para a compra de fone `11987650001` (dígitos ∪ `withPlus`) e testa contra cada formato de armazenamento real. **Todos devem casar** (`casa=true`). Contra o código PRÉ-fix (só dígitos), os formatos com `+` dariam `false` — esse era o bug.

```sql
with list(v) as (            -- exatamente o que phoneVariantsBR('11987650001') ∪ withPlus produz
  values ('11987650001'),('5511987650001'),('551187650001'),('1187650001'),
         ('+11987650001'),('+5511987650001'),('+551187650001'),('+1187650001')
),
stored(fmt, val) as (        -- formatos possíveis do visitor_whatsapp no banco
  values ('E.164 +55 c/9 (formato REAL de prod — o que QUEBRAVA sem o fix)', '+5511987650001'),
         ('dígitos +55 c/9',  '5511987650001'),
         ('+ sem 55, c/9',    '+11987650001'),
         ('dígitos sem 55, c/9','11987650001'),
         ('legacy +55 sem 9', '+551187650001')
)
select s.fmt, s.val, (s.val in (select v from list)) as casa
from stored s order by s.fmt;
-- PASS = todas as linhas com casa=true (5/5).
```

### A.1 — Seed do estado inicial (conversa da Duda; NÃO cria org)

> Troque `+5511987650001` pelo E.164 do **seu celular de teste** se quiser ver a Lia responder de verdade no WhatsApp. O `visitor_whatsapp` é gravado no formato `+E.164` **de propósito** — é justamente o formato que o fix P0 precisa casar.

```sql
INSERT INTO platform_crm_conversations
  (id, channel, status, visitor_id, visitor_name, visitor_whatsapp, visitor_phone,
   product_id, current_agent_id, last_message_at, metadata)
VALUES
  ('a0000000-0000-4000-8000-0000000000a1'::uuid,   -- id fixo de teste (fácil de assert/cleanup)
   'whatsapp', 'bot_active',
   'p10-smoke-a-visitor', 'Smoke P10 A',
   '+5511987650001', '+5511987650001',             -- formato +E.164 = o caso P0
   '806b5975-e268-402e-a65c-9e9503271041'::uuid,   -- produto Beauty (a Lia é deste produto)
   '577fc770-1688-464c-9ff9-46244c9b203b'::uuid,   -- Duda pinada (SDR) — é dela que a Lia "toma o bastão"
   now(), '{"p10_smoke":"A"}'::jsonb);
```

### A.2 — Gatilho: webhook Cakto de compra paga (mesmo telefone, formato diferente do armazenado)

A compra manda o fone como `11987650001` (sem `+55`, sem formatação). O `withPlus` gera `+5511987650001`, que casa com o seed acima → é o E2E do fix P0.

```bash
curl -sS -X POST \
  "https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-webhook?scope=platform&secret=$PLATFORM_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "event": "purchase_approved",
        "data": { "order": {
          "id": "P10-SMOKE-A-1",
          "status": "paid",
          "paymentMethod": "pix",
          "amount": 10,
          "checkoutUrl": "https://pay.cakto.com.br/34h7jqp",
          "product":  { "id": "71a6060b-8816-4f31-9bfc-8eac07d3f84c", "name": "Teste E2E" },
          "customer": { "name": "Smoke P10 A",
                        "email": "p10-smoke-a@nexvy-teste.invalid",
                        "phone": "11987650001" }
        }}
      }'
# Esperado: HTTP 200  {"ok":true,"event":"purchase_approved"}
```

### A.3 — Asserções (pass/fail via SQL + log)

**Log a procurar** (via `get_logs`/dashboard do `cakto-webhook`):
`[cakto-provisioning] onboarding handoff: {"ok":true,"conversation_id":"a0000000-…-a1","cs_agent_id":"927fe936-…"}`
Se vier `{"ok":false,"skipped":"conversation_not_found"}` → **o match por telefone falhou** (o fix do `+` não pegou). Se vier `"skipped":"flag_off"` → a flag não está ON.

```sql
-- ASSERT A — a MESMA conversa passou pra Lia + ganhou o vínculo org (todas as colunas devem dar true)
SELECT
  c.id                                                                            AS conversation_id,
  c.id = 'a0000000-0000-4000-8000-0000000000a1'::uuid                             AS mesmo_thread,        -- true = não criou nova
  c.current_agent_id = '927fe936-0965-4693-90be-5944e745359b'::uuid               AS pinned_lia,          -- true
  c.current_agent_id <> '577fc770-1688-464c-9ff9-46244c9b203b'::uuid              AS saiu_da_duda,        -- true
  c.provisioned_organization_id IS NOT NULL                                       AS tem_vinculo_org,     -- true
  c.provisioned_organization_id = o.id                                            AS vinculo_bate_org_nova-- true
FROM platform_crm_conversations c
LEFT JOIN organizations o ON o.cakto_customer_email = 'p10-smoke-a@nexvy-teste.invalid'
WHERE c.id = 'a0000000-0000-4000-8000-0000000000a1'::uuid;

-- ASSERT A — thread ÚNICO: nenhuma conversa nova criada p/ o produto+fone (deve ser 1)
SELECT count(*) AS convs_do_fone_deve_ser_1
FROM platform_crm_conversations
WHERE product_id = '806b5975-e268-402e-a65c-9e9503271041'::uuid
  AND (visitor_whatsapp IN ('+5511987650001','5511987650001')
    OR visitor_phone    IN ('+5511987650001','5511987650001'));

-- ASSERT A — a compra provisionou a org (org_created disparou o handoff)
SELECT id, plan_id, plan_status, slug
FROM organizations
WHERE cakto_customer_email = 'p10-smoke-a@nexvy-teste.invalid';   -- 1 linha, plan_status='active'
```

**PASS de A** = ASSERT A com 5/5 colunas `true` · `convs_do_fone_deve_ser_1 = 1` · 1 org `active` · log `ok:true`. (Opcional E2E: mande uma msg do celular de teste no thread → a resposta chega como **Lia/CS** no mesmo thread, sem preço/link.)

### A.4 — Cleanup (ordem: filhos → org → user → pedido → conversa)

```sql
-- children da org de teste (do seedSalonDataForNewOrg)
DELETE FROM servico_catalogo            WHERE organization_id IN (SELECT id FROM organizations WHERE cakto_customer_email='p10-smoke-a@nexvy-teste.invalid');
DELETE FROM salon_automation_rules      WHERE organization_id IN (SELECT id FROM organizations WHERE cakto_customer_email='p10-smoke-a@nexvy-teste.invalid');
DELETE FROM opportunity_scan_schedules  WHERE organization_id IN (SELECT id FROM organizations WHERE cakto_customer_email='p10-smoke-a@nexvy-teste.invalid');
DELETE FROM billing_history             WHERE organization_id IN (SELECT id FROM organizations WHERE cakto_customer_email='p10-smoke-a@nexvy-teste.invalid');
-- usuário admin criado no provisioning
DELETE FROM user_roles WHERE user_id IN (SELECT id FROM auth.users WHERE email='p10-smoke-a@nexvy-teste.invalid');
DELETE FROM profiles   WHERE email = 'p10-smoke-a@nexvy-teste.invalid';
DELETE FROM organizations WHERE cakto_customer_email = 'p10-smoke-a@nexvy-teste.invalid';
DELETE FROM auth.users WHERE email = 'p10-smoke-a@nexvy-teste.invalid';
-- pedido + conversa semeada
DELETE FROM cakto_orders WHERE scope='platform' AND cakto_id='P10-SMOKE-A-1';
DELETE FROM platform_crm_conversations WHERE id='a0000000-0000-4000-8000-0000000000a1'::uuid;
```

---

## SMOKE B — Compra direta (sem SDR prévio → não quebra, org provisionada, boas-vindas)

**Objetivo (critério verificável):** compra paga **sem nenhuma conversa anterior** → provisiona a org normalmente e o handoff faz **NO-OP gracioso** (`skipped:'conversation_not_found'`), sem derrubar o pagamento. Nenhuma conversa é pinada.

### B.1 — Seed

**Nenhum.** A pré-condição é: e-mail `p10-smoke-b@nexvy-teste.invalid` sem org e sem conversa (Fato 4 confirmou `0`). Confirmação opcional:

```sql
SELECT
  (SELECT count(*) FROM organizations WHERE cakto_customer_email='p10-smoke-b@nexvy-teste.invalid') AS org_prev,      -- 0
  (SELECT count(*) FROM platform_crm_conversations WHERE visitor_whatsapp IN ('+5511987650002','5511987650002')) AS conv_prev; -- 0
```

### B.2 — Gatilho: webhook de compra paga sem conversa prévia

```bash
curl -sS -X POST \
  "https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-webhook?scope=platform&secret=$PLATFORM_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "event": "purchase_approved",
        "data": { "order": {
          "id": "P10-SMOKE-B-1",
          "status": "paid",
          "paymentMethod": "pix",
          "amount": 10,
          "checkoutUrl": "https://pay.cakto.com.br/34h7jqp",
          "product":  { "id": "71a6060b-8816-4f31-9bfc-8eac07d3f84c", "name": "Teste E2E" },
          "customer": { "name": "Smoke P10 B",
                        "email": "p10-smoke-b@nexvy-teste.invalid",
                        "phone": "11987650002" }
        }}
      }'
# Esperado: HTTP 200  {"ok":true,"event":"purchase_approved"}
```

### B.3 — Asserções (pass/fail via SQL + log)

**Logs a procurar** (`cakto-webhook`):
`[cakto-webhook] provisioning result {"ok":…,"organization_id":"…","org_created":true,…}`
`[cakto-provisioning] onboarding handoff: {"ok":false,"skipped":"conversation_not_found"}` ← **NO-OP gracioso esperado** (ou `"flag_off"` se a flag estiver OFF). Em nenhum caso o provisioning pode quebrar.

```sql
-- ASSERT B — org provisionada mesmo sem conversa (graceful)
SELECT id, plan_id, plan_status, slug, cakto_customer_email
FROM organizations
WHERE cakto_customer_email = 'p10-smoke-b@nexvy-teste.invalid';   -- 1 linha, plan_status='active'

-- ASSERT B — NENHUMA conversa pinada pra essa org (compra direta não pina ninguém)
SELECT count(*) AS convs_pinadas_deve_ser_0
FROM platform_crm_conversations
WHERE provisioned_organization_id IN
      (SELECT id FROM organizations WHERE cakto_customer_email='p10-smoke-b@nexvy-teste.invalid');   -- 0

-- ASSERT B — billing registrado (prova que o pagamento foi processado)
SELECT amount, status, description
FROM billing_history
WHERE organization_id IN
      (SELECT id FROM organizations WHERE cakto_customer_email='p10-smoke-b@nexvy-teste.invalid');   -- 1 linha, status='paid'
```

**Comportamento de boas-vindas esperado (compra direta):**
- **E-mail de acesso** disparado (`ensureAdminUser` → `send-transactional-email`, template `welcome-admin-access`, idempotente por `welcome-admin-<userId>`; `cakto-plan-provisioning.ts:339-356`).
- **WhatsApp de boas-vindas** tentado ao fone da compra (`sendWelcomeWhatsApp`, `:371-420`) — só envia se houver conexão Meta `status='active'`; senão loga `skipped:'no_active_connection'` (non-fatal). ⚠️ Use um fone que você controle ou um número não-alocado: se houver conexão ativa, uma mensagem real é enviada.

**PASS de B** = 1 org `active` · `convs_pinadas_deve_ser_0 = 0` · 1 billing `paid` · log `handoff ok:false / skipped` · webhook `200`. **Fail** = webhook `500`, ou org não criada, ou qualquer conversa pinada.

### B.4 — Cleanup

```sql
DELETE FROM servico_catalogo            WHERE organization_id IN (SELECT id FROM organizations WHERE cakto_customer_email='p10-smoke-b@nexvy-teste.invalid');
DELETE FROM salon_automation_rules      WHERE organization_id IN (SELECT id FROM organizations WHERE cakto_customer_email='p10-smoke-b@nexvy-teste.invalid');
DELETE FROM opportunity_scan_schedules  WHERE organization_id IN (SELECT id FROM organizations WHERE cakto_customer_email='p10-smoke-b@nexvy-teste.invalid');
DELETE FROM billing_history             WHERE organization_id IN (SELECT id FROM organizations WHERE cakto_customer_email='p10-smoke-b@nexvy-teste.invalid');
DELETE FROM user_roles WHERE user_id IN (SELECT id FROM auth.users WHERE email='p10-smoke-b@nexvy-teste.invalid');
DELETE FROM profiles   WHERE email = 'p10-smoke-b@nexvy-teste.invalid';
DELETE FROM organizations WHERE cakto_customer_email = 'p10-smoke-b@nexvy-teste.invalid';
DELETE FROM auth.users WHERE email = 'p10-smoke-b@nexvy-teste.invalid';
DELETE FROM cakto_orders WHERE scope='platform' AND cakto_id='P10-SMOKE-B-1';
```

---

## Efeitos colaterais reais dos smokes (transparência)

| Efeito | Onde | Mitigação |
|---|---|---|
| Cria **org + user admin + billing** de teste | ambos | Cleanup A.4/B.4 apaga tudo |
| **E-mail de acesso** enviado ao endereço `.invalid` | ambos | `.invalid` nunca entrega (RFC 2606); pode gerar bounce inócuo. Se preferir, use `voce+p10smokeA@suaempresa.com` |
| Possível **alerta Telegram** "provisionamento com ERRO" se o `createUser`/e-mail falhar no `.invalid` | ambos | Esperado e inócuo; ou use um e-mail real com plus-addressing para evitar o alerta |
| **WhatsApp de boas-vindas** enviado ao fone da compra (se houver conexão Meta ativa) | ambos | Use fone próprio ou número não-alocado (`11 98765-000x`) |
| **Radar/automações** semeados na org de teste (automações nascem OFF) | ambos | Cleanup remove `servico_catalogo`/`salon_automation_rules`/`opportunity_scan_schedules` |

> Todos os efeitos são de **teste** e reversíveis pelos blocos de cleanup. Rode o cleanup logo após colher as asserções.

---

*Fontes (código real, arquivo:linha citadas acima): `_shared/onboarding-handoff.ts`, `_shared/cakto-plan-provisioning.ts`, `cakto-webhook/index.ts`, `_shared/cakto-client.ts`, `_shared/phone.ts`, `supabase/config.toml`. Estado do banco: verificação read-only via MCP `execute_sql` em `fzhlbwhdejumkyqosuvq` (Fact-Forcing Gate). Blueprint-mãe: `P10-HANDOFF-DUDA-LIA-2026-07-15.md`.*
