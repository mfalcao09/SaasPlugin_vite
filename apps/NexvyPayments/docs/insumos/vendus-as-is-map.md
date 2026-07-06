# Mapa AS-IS — CRM "Vendus" (repo `saas-gestao-cobrancas`)

> Consolidado a partir de 5 leitores paralelos (data-model, edge-functions, frontend, plataforma/segurança, caça-cobrança). Todas as referências file:line são relativas a `/Users/marcelosilva/Projects/GitHub/saas-gestao-cobrancas/`. Data: 2026-07-06.

---

## 1) Sumário executivo

1. O repo NÃO é um sistema de cobrança: é um **CRM de vendas/SDR multi-tenant com IA** (Lovable/Vite+React+shadcn+Supabase), ex-"Bizon Sales", white-label "Vendus".
2. Fonte da verdade real = **326 migrations datadas** em `supabase/migrations/` (193+ tabelas); o baseline `supabase/migrations_shared/` (139 tabelas) e `docs/DATABASE.md`/`docs/EDGE_FUNCTIONS.md` estão **desatualizados**.
3. Multi-tenancy sólido: `organization_id` universal + RLS via `get_user_organization`/`has_role`/`is_super_admin` (377 policies no baseline).
4. Todo vocabulário "billing/fatura/inadimplência" existente pertence a **2 mundos errados**: plataforma→tenant (assinatura SaaS via Stripe-campos/Cakto) e espelho passivo de vendas de infoproduto (Cakto/Hotmart/Doppus webhooks).
5. **Núcleo de cobrança tenant→cliente-final é 100% greenfield**: não existem pagador, fatura, boleto, PIX, NFS-e, régua por vencimento, conciliação, Asaas (só card `comingSoon`).
6. Ativos reaproveitáveis de alto valor: motor de cadências WhatsApp (`cadence-*`), post-sale-engine por evento, canal Evolution+Meta Cloud, agentes IA com tools, fila de e-mail pgmq, cron pg_cron+pg_net.
7. **Gap operacional grave**: `cadence-tick` (o motor da régua) não tem `cron.schedule` versionado no repo — agendamento vive fora do código.
8. **Riscos de segurança críticos**: `admin-provision-users` sem autorização (takeover cross-tenant), ~56 edge functions com IDOR via `organization_id` no body, segredos "encrypted" em plaintext, JWT anon hardcoded em migration.
9. **LGPD: zero infraestrutura** de consentimento/base legal/retenção/erasure — grave para produto que trata CPF/CNPJ + dívida de inadimplentes.
10. UI oferece shell maduro (sidebar por seção, padrões lista-KPI-tabela-bulk, detalhe-tabs, wizard) onde o módulo Cobranças encaixa com baixo custo de casca — mas todo o miolo é novo.

---

## 2) Arquitetura e multi-tenancy

- **Stack**: Vite+React+shadcn (54 componentes em `src/components/ui/`), TanStack Query, Supabase (Postgres+RLS+Edge Functions Deno+pg_cron/pg_net/pgmq), origem Lovable.
- **Deploy real**: 326 migrations incrementais `supabase/migrations/` (`20260109`→`20260705`). Baseline `supabase/migrations_shared/00000000000001..07` é snapshot do `pg_catalog` (`docs/DATABASE.md:3`) e diverge do estado real (**risco D-1 na Seção 7**). `_migrations_archive/` vazio. `supabase/config.toml` **vazio (0 linhas)** — nenhum `verify_jwt`/import_map declarado.
- **Coluna tenant**: `organization_id uuid` (173/326 migrations). `tenant_id` NÃO existe; `org_id` só em comentários de storage-path (`migrations/20260705195502...:1`, `migrations/20260519172210...:203`). Vive canonicamente em `profiles.organization_id`. Exceção: `pipeline_stages` escopa por `product_id`.
- **Papéis**: enum `app_role = admin, manager, seller, super_admin` (`migrations_shared/00000000000001_extensions_and_types.sql:18-23`), em tabela separada `user_roles` (default `seller`, `00000000000002_tables.sql:2206`). Permissões finas em `user_permissions` (~16 flags) via `initialize_user_permissions` (`00000000000004_functions.sql:1148-1191`).
- **Funções-gate** (SECURITY DEFINER, `SET search_path=public`): `get_user_organization` (`functions.sql:733-744`), `has_role` (`:768-782`), `is_super_admin` (`:1192-1204`), `user_belongs_to_organization`, `get_organization_effective_limits` (`:600-657`).
- **Padrão RLS canônico** (`migrations_shared/00000000000006_rls_policies.sql`, 377 policies, RLS ON em 139/139 tabelas do baseline): `organization_id = get_user_organization(auth.uid())` + `has_role(admin|manager)` para gestão + `is_super_admin` como override cross-org. Uso: `auth.uid()` ×389, `has_role` ×141, `get_user_organization` ×138, `is_super_admin` ×118.
- ⚠️ **VERIFICAR**: cobertura RLS das ~54+ tabelas criadas APÓS o baseline (cadences, voice_*, whatsapp_meta_*, mia_* etc.) não foi auditada tabela-a-tabela — leitor 4 só confirmou 139/139 do baseline.
- **Multi-org**: `user_organizations` N:N (`migrations/20260629165515_3573b3e2...`), `OrgSwitcher` na sidebar (`AdminSidebar.tsx:244`).
- **Bootstrap**: `/setup` → `setup-super-admin/index.ts:44-49` (409 se já existe super_admin) + `claim_first_super_admin()` (`functions.sql:173-197`) + `promote_self_to_super_admin()` (`migrations/20260605184357_*.sql:18-48`) — TOCTOU teórico, janela só pré-1º-super-admin.

---

## 3) Modelo de dados por domínio (tabelas canônicas)

### Plataforma / tenant
`organizations` (plan_id, max_users/products/connections, features jsonb, cakto_subscription_id, status), `profiles` (organization_id nullable), `user_roles`, `user_organizations`, `user_permissions`, `sectors`+`sector_members`, `squads`/`sales_squads`, `user_org_switch_log`. Origem: `migrations_shared/00000000000002_tables.sql`.

### CRM / leads
`leads` (organization_id NOT NULL, product_id, current_stage_id, utm_*×5, cadence_day, metadata jsonb), `deals` (deal_value, status won), `pipeline_stages` (escopo product_id), `lead_tags/_assignments/_notes/_queue/_transfer_history/_journey_events/_semantic_memory` (pgvector), `commissions`, `commission_rules`, `tasks`, `interactions`, `objections`, `custom_fields`, `stage_values`, `sales_leads`.

### Conversas / omnichannel
`webchat_conversations` (hub: web+WhatsApp, canal, lead_id, unread, utm), `webchat_messages`, `evolution_instances`, `whatsapp_meta_connections/templates/webhook_logs`, `instagram_*`, `conversation_notes/transfers/processing_locks`, `processed_messages`, `quick_replies`, `scheduled_messages`, `support_tickets/*`.

### Cadências / campanhas (SÓ em `migrations/`, não no baseline)
`cadences` (`migrations/20260529113339_5935306e...` — entry_filters/exclusion_filters/stop_rules/stop_actions jsonb, execution_window, channel='whatsapp'), `cadence_steps` (delay_unit/delay_from, conditions), `cadence_enrollments`, `cadence_step_runs`, `campaigns`, `campaign_targets/contexts/preparation_jobs`, `voice_campaigns/*`, `ai_outreach_queue`.
- ⚠️ **VERIFICAR**: leitor 1 nomeia `cadences_api_keys`; leitor 2 referencia `cadence_api_keys.key_hash` (`cadence-api/index.ts:44`). Confirmar nome exato da tabela.

### Booking
`booking_event_types/requests/reminders/scheduled_jobs/status_history/logs/notification_settings`, `business_hours/holidays`, `availability_overrides`, `user_availability`, `google_calendar_connections`, `calendar_events`.

### IA / voz
`product_agents`, `agent_*` (specialists, action_logs, tool_executions, safety_limits, routing_rules, handoff_history, post_sale_scenarios, training_materials), `ai_prompt_experiments/variants`, `ai_usage_logs`, `ai_knowledge_base`, `org_ai_routing`, `org_ai_credentials`, `platform_ai_keys`, `voice_agents/actions/clones/contexts`, `call_logs/events`, `mia_*`.

### Dinheiro (ver Seção 5 para semântica)
`subscriptions`, `billing_history`, `platform_plans`, `cakto_orders`, `hotmart_orders/credentials/product_mapping`, `product_offers`, `payment_links`, `cakto_recovery_config/dispatches`, `cakto_credentials`.
- ⚠️ **VERIFICAR** colunas de `payment_links`: leitor 3 lista `{amount, url, lead_id, status, paid_at}` (types.ts:8928); leitor 5 lista `{title, amount, currency, url, status, opened_at, paid_at}`. Provável superconjunto do leitor 5; confirmar no schema.

---

## 4) Motores existentes reaproveitáveis para COBRANÇA (com file:line)

### 4.1 Canal WhatsApp — dual provider
- Roteamento de saída por conversa: `supabase/functions/_shared/whatsapp-router.ts:90-92` (`meta_connection_id` → Meta Cloud; senão `evolution_instance_id` → Evolution; senão none).
- **Evolution (Baileys, não-oficial)**: `evolution-send/index.ts:1` (626 l.; retry 9º dígito BR `:83`, detecção número inexistente `:60`); `evolution-webhook/index.ts:1` (3669 l.; dedup `processed_messages` `:36`, lock por conversa RPC `try_acquire_conversation_lock` `:52`, dedup de resposta por hash `:72`); `evolution-proxy/index.ts:1` (QR/instâncias; config GLOBAL da plataforma em `platform_settings.evolution_go_url/evolution_go_global_api_key`, `evolution-proxy/index.ts:19-27` — não por-org).
- **Meta Cloud oficial**: `meta-whatsapp-send/index.ts:1` (janela 24h → exige template HSM `:2-4` + opt-in guard `_shared/optin-guard.ts` — relevante p/ cobrança compliant); `meta-whatsapp-connect/index.ts:1` (cripto via `_shared/meta-crypto.ts`); `meta-whatsapp-webhook`, `meta-whatsapp-templates-sync`, `meta-template-status-watchdog`.

### 4.2 Motor de cadência (esqueleto da régua de cobrança)
- `cadence-tick/index.ts:1` — tick "a cada 5min" (comentário), MAX_PER_TICK=50, janela dia/hora (`withinWindow :16`), condições (`not_purchased :57`, `without_tags`, guard bot-loop `:47`), gera msg via `manual-outreach`, agenda próximo step (`computeScheduledAt :35`).
- `cadence-enroll/index.ts:1` — resolve audiência por `entry_filters` (`_shared/campaign-audience.ts`), cria enrollment + 1º step_run.
- `cadence-on-response/index.ts:1` — chamado pelo `evolution-webhook`; `stop_on_response` + stop_actions (tags/stage/nota `:14-38`).
- `cadence-stop/index.ts:1`; API REST pública `cadence-api/index.ts:1` (Bearer `cdn_<key>`, SHA-256 → `key_hash` `:44`).
- **Limite estrutural**: dispara por filtros de CRM, NÃO por `due_date`/status de fatura. Adaptar = novo tipo de trigger, não reescrita do motor.

### 4.3 Automação por evento de pagamento
- `_shared/post-sale-engine.ts:1` — executa `post_sale_event_actions` (stage/email/agente IA/notify) para Cakto/Hotmart/Doppus/Kiwify; worker atrasado `process-post-sale-scheduled`. Eventos: `compra_aprovada/pix_gerado/boleto_gerado/reembolso/chargeback/assinatura_cancelada/checkout_abandonado`.
- `cakto-recovery-trigger/index.ts:1` (552 l.) — recuperação de checkout: cooldown, 1ª msg gerada por IA, envia WhatsApp, cria `webchat_conversations` p/ IA continuar. **Molde direto de "régua de inadimplência conversacional"**.

### 4.4 Agentes IA
- `webchat-bot/index.ts:1` — 6512 l., roteador omnichannel; system prompt de `agent_config` (`:172-181`), `buildAgentSystemPrompt :1785`, contexto do cliente `:1822`, handoff `:1873`, dados de pagamento pendente `:1904`.
- `_shared/ai-router.ts:1` — `resolveAIConfig(org, capability)`: BYO OpenAI (`:184`) → plano (`:100`) → pool RPC `pick_platform_ai_key` (`:118`) → fallback `LOVABLE_API_KEY`. Default `google/gemini-3-flash-preview` (`:9`) via Lovable AI Gateway (`:5`). Tokens cobrados via RPC `check_and_consume_ai_tokens` + `recordAIUsage :232`.
- Tools do agente (só 5): `_shared/tools/impl/` — `agendar_followup`, `aplicar_etiqueta`, `consultar_historico_cliente`, `criar_deal`, `gerar_link_pagamento` (este NÃO gera boleto: anexa dados do lead a `product_offers.checkout_url` Cakto; comentário "no futuro pode rotear para Asaas/Stripe" `gerar_link_pagamento.ts:1`). Registry: `_shared/tools/registry.ts`. **Uma tool `emitir_cobranca`/`consultar_fatura` seria adição natural.**

### 4.5 E-mail e mensagens agendadas
- Fila pgmq: `process-email-queue/index.ts:1` (`@lovable.dev/email-js`, MAX_RETRIES=5, DLQ; filas em `migrations/20260428143324_email_infra.sql:17`). `send-transactional-email`, `send-mass-email`, supressão/unsubscribe.
- `process-scheduled-messages/index.ts:1` — cron 1min, batch 50, resolve variáveis `{{}}`.

### 4.6 Cron (pg_cron + pg_net; JWT anon no header)
Só **6 jobs versionados** (migrations `20260705191824`, `20260617123000`, `20260529022314`, `20260624112357`): `voice-campaign-tick` (1min), `process-scheduled-messages` (1min), `ai-followup-cron` (1min), `campaign-dispatcher` (1min), `campaign-recurring-snapshot` (15min), `check-expired-subscriptions` (03:00, RPC).
- 🚩 **SEM cron versionado**: `cadence-tick`, `booking-dispatcher`, `process-post-sale-scheduled`, `opportunity-scan-cron`, `meta-template-status-watchdog`, `alert-inactive-human-attendants`; `process-email-queue` (5s) só como comentário (`20260428143324_email_infra.sql:286`). Agendamento feito à mão no dashboard ou quebrado.

### 4.7 Outros aproveitáveis
Voz xAI (`voice-campaign-tick`, `xai-voice-call-start/index.ts:1` — endpoint "provisório" `:4`; BYO `org_ai_credentials provider=xai`); push web (`push-*`); Sankhya ERP (`sankhya-auth/-sync-clients/-sync-products/-create-order`) — único conector ERP existente.

---

## 5) Billing hoje: plataforma vs tenant

**Total de edge functions**: 156 segundo leitor 2; leitor 4 cita "142/155 usam service_role" — ⚠️ **VERIFICAR** contagem exata (`docs/EDGE_FUNCTIONS.md:1` diz 81, certamente desatualizado).

### Eixo (i) — PLATAFORMA cobra o TENANT (assinatura do SaaS)
- `subscriptions` + `billing_history` (`migrations/20260123164012_*.sql:27,47` — amount/status/`invoice_url`/`due_date`/`stripe_invoice_id`) + `platform_plans` (25 feature flags, quotas, `cakto_product_id`, `checkout_url_cakto`, `trial_days`, `grace_period_days`).
- Provisionamento por venda: `cakto-webhook/index.ts:22` `?scope=platform` → `:164` `provisionFromOrder` (`_shared/cakto-plan-provisioning.ts:1` — resolve plano `:58`, cria org `:107`, ativa `:133`, grava billing_history `:155`). Cron `check-expired-subscriptions` 03:00.
- Régua de dunning da plataforma: **SÓ CONFIG, sem executor** — `platform_email_settings.reminder_days_before/alert_days_after/suspend_days_after` + templates `payment_reminder/payment_due/account_suspended` (`migrations/20260430175058_*.sql:52,65,90`) + UI `EmailSettings.tsx:239-309`. Grep em `supabase/functions` por `billing_history/reminder_days_before/suspend_days_after` → **zero consumidores**. Suspensão é manual (RPC `suspend_organization`, `migrations/20260624112357_*.sql:19`). Gate de UI: `src/components/billing/OrgSuspendedGate.tsx:1-70`.
- **Stripe NÃO está integrado** — só colunas `stripe_*` e 1 comentário. Não há SDK/webhook Stripe.

### Eixo (ii) — dinheiro do TENANT = espelho passivo de infoproduto
- `cakto-webhook:91` `?scope=organization` → mapeia evento p/ tag (`mapCaktoToTagEvent :185`), resolve/cria lead (`:218`), `apply_tag_automations` (`:99`), post-sale actions. Idem `hotmart-webhook/index.ts:69,150,19` e `doppus-webhook/index.ts:325,367,378-381` (`pix_code/pix_qrcode_url/boleto_url` são **echo do payload do gateway**, não emissão).
- `payment_links` + `PaymentLinkDialog.tsx:61`: vendedor cola URL de checkout externo + valor. Sem due_date, sem parcela, sem baixa automática.
- "vencimento" fora de billing_history = data-limite de TAREFA CRM (`ScheduleFollowupDialog.tsx:61,83`, `ActivityCenter.tsx:1472`, `webchat-bot/index.ts:2561`). `installments` = metadado lido do gateway.

**Conclusão**: `billing_history` serve de **molde de schema** para a futura tabela de faturas do tenant (amount+due_date+status+payment_date), e a régua-config da plataforma serve de **blueprint conceitual** — mas nenhuma linha de lógica existente cobra o cliente-final do tenant.

---

## 6) UI: onde o módulo Cobranças se encaixa

- **Rotas** (`src/App.tsx`): `/` app do vendedor (`Index`, App.tsx:158-165), `/admin` shell do tenant (App.tsx:174-181), `/super-admin` plataforma (App.tsx:207-214). Navegação do admin = sidebar com itens fixos + grupos accordion (`src/config/adminMenu.ts:59-157`, `AdminSidebar.tsx:168-215`); seção ativa por estado `?tab=` com `switch(sectionId)` em `Admin.tsx:263-340`.
- **Encaixe do módulo (custo de casca baixo)**: item novo em `menuGroups` (adminMenu.ts) + `case` em `renderSection` (Admin.tsx:278) + factory em `sectionFactories` (Admin.tsx:136-179). Suporta `comingSoon` (AdminSidebar.tsx:107-111) e bloqueio por plano.
- **Moldes de tela prontos**:
  1. Lista de faturas → `LeadsManager.tsx` (KPICards + Tabs status + filtros + Table + BulkActionsBar + paginação + import CSV).
  2. Painel de cobranças → `FinancialDashboard.tsx` (4 cards KPI monetário `:137-197` + tabs + tabela com bulk via checkbox `:235-291`; hoje = comissões `:103-104`).
  3. Detalhe fatura/unidade → `ProductDetailPage.tsx:29-145` / `LeadDetailModal.tsx:206-215` (header + tabs scrolláveis).
  4. Editor de régua (D+3, D+7...) → `CadenceWizard` + `PostSaleScenariosEditor` (variáveis).
  5. Painel de gateway (Asaas) → `CaktoAdminPanel.tsx:46-77` (Dashboard·Pedidos·Mapear·Recuperação IA·Config).
  6. Prontos: `PaymentMethodBadge`, `CaktoSummaryCards`, charts, `Intl.NumberFormat pt-BR/BRL` (`PaymentLinkDialog.tsx:23`).
- **White-label**: por-PLATAFORMA, não por-tenant — `PlatformSettings.tsx:146-693` (marca/cores/tipografia/login/SEO), aplicado em runtime por `usePlatformBranding.ts:127-278` (CSS vars, favicon, PWA manifest; cache anti-flash `:78,288`); fonte `platform_settings` + view `platform_branding_public`. Default: "Vendus", `#84CC16` (`PlatformSettings.tsx:42,82-84`). Revenda white-label por cliente exigiria evolução.
- Gateways de cobrança recorrente **listados mas desligados**: `asaas/mercadopago/pagarme/pix-direto/stripe` todos `comingSoon: true` (`integrationsCatalog.ts:192,201,210,219,228`; Asaas `:204-211`).

---

## 7) Segurança/LGPD: como está, riscos

### Positivos
- §11.1 respeitado no essencial: `.env` só com `VITE_SUPABASE_URL/PUBLISHABLE_KEY/PROJECT_ID` (`sb_publishable_`, key opaca nova); front → serviços via edge function proxy (`src/integrations/supabase/client.ts:5-6`); service_role só em `Deno.env` server-side; `meta_wa_master_key` com REVOKE/GRANT correto (`migrations/20260604030213_*.sql:28-29`); `cadence-api` com key SHA-256 + `revoked_at`; webhooks inbound validam por assinatura/token.

### Riscos (ranqueados)
- 🔴 **D-2 CRÍTICO — `admin-provision-users` sem NENHUMA autorização**: `supabase/functions/admin-provision-users/index.ts` recebe `{organization_id, password, emails[]}` do body (`:12`), usa SERVICE_ROLE (`:19`), reseta senha de user existente (`updateUserById :56`) + upsert de role (`:78`). Qualquer autenticado de qualquer tenant pode tomar contas. Sem caller no front → **remover imediatamente**.
- 🔴 **D-3 ALTO/SISTÊMICO — IDOR em ~56 funções service_role** que aceitam `organization_id` no body sem checar vínculo do caller (ex.: `distribute-lead/index.ts:19`, `catalog-search/index.ts:66`). RLS bypassada pelo service_role; checagem teria que ser no código e não é. (Contraste correto: `super-admin-manage-user/index.ts:38-56`.)
- 🟠 **D-1 — baseline `migrations_shared/` reintroduz escalonamento de papel**: fix em `migrations/20260603134029_*.sql:44-61` (policy org-scoped + `role <> 'super_admin'`), mas `migrations_shared/00000000000006_rls_policies.sql:1074-1075` ainda tem a policy antiga (admin insere qualquer role). Remix/reset pelo baseline = admin de tenant vira super_admin. Regenerar ou tirar do caminho de deploy.
- 🟠 **D-4 — segredos em plaintext com nome "encrypted"**: `platform_ai_keys.api_key_encrypted` grava valor cru (`save-platform-ai-key/index.ts:146`, relido em `:110-114`); idem `org_ai_credentials`, `platform_email_settings.api_key_encrypted`, `cakto_credentials.client_secret`, `platform_settings.evolution_go_global_api_key` (`00000000000002_tables.sql:1558-1559`). Sem KMS/envelope.
- 🟠 **D-5 — `platform_settings` protegida só por GRANT por coluna** (`migrations/20260429171311_*.sql:54-72`; comentário admite fragilidade `:60`). Leitura pública deveria ir só pela view `platform_branding_public` (`migrations/20260619120454_*.sql:9-13`, essa parte correta).
- 🟡 **D-6** — `create-team-member/index.ts:88`: manager pode criar admin (escalonamento lateral intra-tenant, teto=admin).
- 🟡 **D-7** — hardening §11.2 ausente: sem CSP, sem X-Frame-Options, sem `build.sourcemap:false`, sem honeytoken; CORS `*` em todas as edge functions.
- 🟡 **D-8** — `.env` versionado (só publishable key; aceitável, mas foge à convenção).
- 🚩 **JWT anon hardcoded** em migration versionada (`migrations/20260705191824...sql:4`, ref projeto `syvhrtaksjcvhrzhbltt`) usado no header dos crons — viola CLAUDE.md §7/§11.

### LGPD
- PII em volume: `leads` (name/email/phone/bant/utm), `customer_document` (CPF/CNPJ de orders, `tables.sql:493`), `cnpj` (`:1380`), `documents jsonb` (`:1719`), transcrições de voz, `lead_semantic_memory` (profiling comportamental via embeddings).
- **NÃO EXISTE**: consentimento/base legal (grep `consent|lgpd|opt_in` → só `email_unsubscribe_tokens`, `tables.sql:777`), política de retenção/expurgo, erasure/portabilidade por titular (só `delete-organization`, nível errado), trilha de auditoria de PII (`platform_audit_logs` alimentada por apenas 4 functions: delete-organization, create-organization-admin, super-admin-manage-user, apply-onboarding).
- **Veredito**: para produto que trata CPF/CNPJ + dados financeiros de inadimplentes (alto risco LGPD), a camada de conformidade é construção do zero: consents, retenção+expurgo automatizado, endpoints de erasure/portabilidade, audit log de CRUD de PII.

---

## 8) O QUE NÃO EXISTE (lista para gap analysis)

Verificado por grep exaustivo pelos 5 leitores (termo → 0 hits reais salvo indicado):

1. **Entidade Pagador/cliente-final do tenant** (sacado com CPF/CNPJ, cadastro recorrente) — mais próximo: `leads` (prospect) e `cakto_orders.customer_*` (echo).
2. **Fatura do tenant / invoice / contas a receber** — só `billing_history` (plataforma). `fatura` só em HTML de e-mail.
3. **Item de fatura** (linha, medição, unidade, consumo de água) — 0.
4. **Emissão de boleto** (linha digitável, nosso número, CNAB remessa/retorno, FEBRABAN) — `boleto` só como enum `boleto_gerado` e echo `boleto_url` de gateway.
5. **Emissão de PIX cobrança** (QR dinâmico, txid, cob/cobv, PSP) — só echo `pix_code/pix_qrcode_url` do Doppus.
6. **NFS-e / documento fiscal** (RPS, tomador/prestador, ISS, ABRASF, Focus/PlugNotas/eNotas) — 0 em DB, edge functions e UI; 2 hits "nota fiscal" são texto de prompt (`_shared/orchestrator.ts:51`, `_shared/agent-prompt-templates.ts:153`).
7. **Régua de cobrança por vencimento/dias-em-atraso de fatura própria** — cadências/post-sale disparam por filtro de CRM/evento de tag, nunca por `due_date`; régua da plataforma é config morta sem executor.
8. **Conciliação bancária / baixa / OFX / extrato / split-repasse** — 0 (`FinancialPanel/FinancialDashboard` = comissões de vendedor).
9. **Integração Asaas** (gateway do case #1) — só card `comingSoon` (`integrationsCatalog.ts:204-211`) + comentário TODO (`gerar_link_pagamento.ts:1`).
10. **Integração Stripe funcional** — só colunas `stripe_*` sem SDK/webhook.
11. **Recorrência de cobrança do cliente-final** (mensalidade/plano que o TENANT cobra) — `subscriptions` é do SaaS; `is_recurring` restante = campanha de marketing/calendário.
12. **Parcelamento gerenciado** — `installments` só metadado de gateway.
13. **Domínio do case água/condomínio** (unidade, hidrômetro, medição, individualização) — 0.
14. **LGPD**: consentimento, base legal, retenção/expurgo, erasure/portabilidade por titular, audit de PII — 0 (Seção 7).
15. **Cron versionado para cadence-tick e 6+ funções cron-dependentes** — agendamento fora do repo (Seção 4.6).
16. **Hardening §11.2** (CSP, sourcemaps off, honeytoken, X-Frame-Options) — 0.
17. **Branding por-tenant** (white-label de revenda) — hoje 1 identidade por deploy.
18. **`dunning/mensalidade/nfse/pagador/regua_cobranca`** como termos — 0 ocorrências.

---

## 9) Env vars / credenciais / serviços externos exigidos

### Env vars (edge functions, Deno)
| Var | Uso |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 142+/~155 funções (bypass RLS) |
| `LOVABLE_API_KEY` | fallback do ai-router → Lovable AI Gateway (`ai-router.ts:5`) |
| `OPENAI_API_KEY` | fallback embeddings/transcrição (`ai-router.ts:295,335`) |

### Env vars (frontend, `.env` versionado — só públicas)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`), `VITE_SUPABASE_PROJECT_ID` (`src/integrations/supabase/client.ts:5-6`).

### Credenciais no BANCO (plaintext salvo indicação — ver D-4)
| Onde | O quê |
|---|---|
| `platform_settings.evolution_go_url` + `evolution_go_global_api_key` | Evolution GLOBAL da plataforma (`tables.sql:1558-1559`) |
| `platform_settings.meta_wa_master_key` | chave-mestra cripto Meta WA (isolada por REVOKE/GRANT, `20260604030213_*.sql:28-29`) |
| `platform_ai_keys.api_key_encrypted` | pool IA da plataforma (plaintext, `save-platform-ai-key/index.ts:146`) |
| `org_ai_credentials.api_key_encrypted` | BYO IA por tenant (OpenAI, xAI voice) |
| `cakto_credentials.client_secret` | Cakto por scope platform/org (`20260424195247_*.sql:30-48`) |
| `hotmart_credentials` | OAuth Hotmart por org |
| `platform_email_settings.api_key_encrypted` | provedor e-mail |
| `whatsapp_meta_connections.page_access_token_encrypted` | Meta Cloud por org (cripto real via meta-crypto) |
| `webhooks.secret_key`, `facebook_lead_integrations.page_access_token` | diversos |
| `cadence_api_keys.key_hash` (⚠️ nome VERIFICAR) | API pública de cadências (SHA-256, correto) |

### Serviços externos ativos
Lovable AI Gateway (default LLM `google/gemini-3-flash-preview`) · OpenAI (BYO/embeddings/transcrição `gpt-4o-transcribe`) · Evolution Go/Baileys (WhatsApp não-oficial, servidor global) · Meta Graph API (WhatsApp Cloud + Instagram + FB Leads + Ads) · Cakto · Hotmart · Doppus · ElevenLabs (voice clones) · xAI Grok (voz, endpoint "provisório") · Google Calendar OAuth · Firecrawl · Sankhya ERP · Lovable email (`@lovable.dev/email-js`) · Web Push.

### Para o produto de cobrança, faltará provisionar (hoje inexistentes)
Gateway de cobrança (Asaas — case #1 já o usa), provedor NFS-e (Focus NFe/PlugNotas/eNotas ou similar), e secrets correspondentes com armazenamento cifrado de verdade (não repetir o padrão D-4).

---

## Apêndice — Contradições/divergências entre leitores (todas marcadas VERIFICAR)

| # | Divergência | Leitores | Ação |
|---|---|---|---|
| 1 | `cadences_api_keys` vs `cadence_api_keys` | L1 vs L2 | Confirmar nome da tabela na migration |
| 2 | 156 vs "155" edge functions | L2 vs L4 | Contar `ls supabase/functions` (doc oficial diz 81 — descartar) |
| 3 | Colunas de `payment_links` (com/sem `title/currency/opened_at`) | L3 vs L5 | Ler types.ts:8928 e migration |
| 4 | Cobertura RLS das tabelas pós-baseline (~54+) | L1 (193+ tabelas) vs L4 (RLS 139/139 do baseline) | Auditar RLS das tabelas novas antes de construir em cima |
| 5 | `transcribe-audio`: docs citam ElevenLabs Scribe, código usa OpenAI `gpt-4o-transcribe` (`ai-router.ts:335`) | doc vs código (L2) | Código vence; atualizar doc |
