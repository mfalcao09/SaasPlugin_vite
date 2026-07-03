# CONTRATO COMPLETO — Dimensão PRODUTO no CRM original (Vendus) × port `platform_crm_*`

> **Recon read-only D3 (multiproduto)** — 2026-07-02
> Fonte: `apps/NexvyBeauty/.vendus-src-reference/` (types.ts 13.686 linhas, 259 menções a `product_id`)
> Port: `apps/NexvyBeauty/src/components/superadmin/crm/` (147 .tsx) + `supabase/migrations_platform_crm/` (12 .sql, 77 objetos `platform_crm_*`)
> Objetivo: restaurar multiproduto no CRM da plataforma (1 CRM do grupo vendendo ~10 SaaS).

---

## 0. Sumário executivo

- **49 tabelas** na fonte carregam dimensão produto (46 com `product_id` uuid, 2 com arrays `*_product_ids`, 1 com `produto_id` PT-BR). **44 têm FK → `products`**.
- **Não existe tabela `pipelines`**: `pipeline_stages.product_id` é **NOT NULL** — *o produto É o pipeline*. Kanban, stages, stage_values, deals, comissões, metas, cadências, formulários, quiz (capture_funnels), widgets, chatbots, agentes IA e pós-venda são todos por-produto.
- **O port stripou 100%**: nenhuma das 77 tabelas `platform_crm_*` tem coluna produto (verificado coluna a coluna). Strips documentados em comentários (`"Por Produto" DROPADO — plataforma sem catálogo`, `TODO(produto)`).
- **Negativos importantes** (não têm produto nem na fonte): `campaigns` (produto viaja dentro de `audience_filters` Json), `booking_event_types` (agendamento é por-usuário, não por-produto), `sectors`, `quick_replies`, `evolution_instances`, `custom_fields`.

---

## 1. Modelo de dados da fonte

### 1.1 Tabela `products` (types.ts:9569)

| Coluna | Tipo | Null | Nota |
|---|---|---|---|
| id | uuid | PK | |
| organization_id | uuid | NOT NULL | FK organizations |
| suite_id | uuid | null | FK `product_suites` (agrupador) |
| name | text | NOT NULL | |
| status | enum `product_status` | null | draft / review / published |
| category, description, short_description | text | null | |
| logo_url, banner_url, product_image_url | text | null | |
| pricing, external_links, settings | Json | null | |
| **Cérebro do agente IA:** pitch_15s, pitch_30s, pitch_2min, icp, objections, benefits, bonuses, differentials (text[]), guarantee, discount_policy, payment_conditions, plans, knowledge_base, custom_info | text | null | insumo direto de `product_agents`/prompts |
| created_by, created_at, updated_at | | | |

**`product_suites`** (types.ts:9464): id, organization_id, name, slug, color, icon_url, status — agrupa produtos (ex.: "Suíte Nexvy").

### 1.2 TODAS as tabelas com coluna produto (fonte)

Legenda: ⬤ = NOT NULL (obrigatória), ◯ = nullable. FK = FK → products(id) presente no types.ts.

| # | Tabela | Coluna | Obrig. | FK | Papel |
|---|---|---|---|---|---|
| 1 | pipeline_stages | product_id | ⬤ | ✓ | **Funil por produto (núcleo)** |
| 2 | leads | product_id | ◯ | ✓ | Lead pertence a produto |
| 3 | deals | product_id | ⬤ | ✓ | Venda por produto |
| 4 | stage_values | product_id | ⬤ | ✓ | Valor médio por etapa/produto |
| 5 | commission_rules | product_id | ⬤ | ✓ | Regra de comissão por produto |
| 6 | commissions | product_id | ⬤ | ✓ | Comissão gerada por produto |
| 7 | sales_goals | product_id | ◯ | ✓ | Meta (null = todos os produtos) |
| 8 | sales_squads | product_id | ◯ | ✓ | Squad dedicado a produto |
| 9 | user_product_assignments | product_id | ⬤ | ✓ | **Vínculo humano↔produto** (+monthly_goal) |
| 10 | forms | product_id | ⬤ | ✓ | Form capta para 1 produto |
| 11 | capture_funnels | product_id | ⬤ | ✓ | Quiz/funil capta para 1 produto |
| 12 | webchat_widgets | product_id | ◯ | ✓ | Widget vinculado a produto |
| 13 | webchat_conversations | product_id | ◯ | ✓ | Conversa herda produto |
| 14 | webchat_agent_configs | product_id | ◯ | ✓ | Config do bot por produto |
| 15 | chat_flows | product_id | ◯ | ✓ | Flowbuilder por produto |
| 16 | facebook_lead_integrations | product_id | ⬤ | ✓ | Lead Ads → produto |
| 17 | cadence_templates | product_id | ⬤ | ✓ | Cadência pertence a produto |
| 18 | lead_queue | product_id | ◯ | ✓ | Fila de distribuição por produto |
| 19 | calendar_events | product_id | ◯ | ✓ | Evento de agenda por produto |
| 20 | tasks | product_id | ◯ | ✓ | Tarefa por produto |
| 21 | notifications | product_id | ◯ | ✓ | Notificação contextual |
| 22 | materials | product_id | ◯ | ✓ | Material de vendas por produto |
| 23 | objections | product_id | ◯ | ✓ | Objeções por produto |
| 24 | tag_automations | product_id | ◯ | ✓ | Automação de tag por produto |
| 25 | webhooks | product_id | ◯ | ✓ | Webhook escopado por produto |
| 26 | product_agents | product_id | ◯ | ✓ | **Agente IA por produto** (58+ colunas: activation_keywords, canais active_in_*, capacidades can_*) |
| 27 | agent_routing_rules | match_product_ids | ◯ (uuid[]) | — | Roteia inbound por produto(s) |
| 28 | agent_training_materials | product_id | ◯ | ✓ | Treino do agente por produto |
| 29 | agent_action_logs | product_id | ◯ | ✓ | Auditoria |
| 30 | agent_activation_logs | product_id | ◯ | ✓ | Auditoria |
| 31 | ai_knowledge_base | product_id | ⬤ | ✓ | RAG por produto |
| 32 | product_knowledge_sources | product_id | ⬤ | ✓ | Fontes de conhecimento |
| 33 | product_training_videos | product_id | ⬤ | ✓ | Vídeos de treino |
| 34 | ai_insights | product_id | ◯ | ✓ | Insights IA por produto |
| 35 | ai_outreach_queue | product_id | ◯ | ✓ | Outreach IA |
| 36 | orchestration_logs | **produto_id** (+produto_nome) | ◯ | ✓ | ⚠️ naming PT-BR (types.ts:7339, FK :7407) |
| 37 | auto_notification_settings | monitored_product_ids (uuid[]) + alert_critical_product_idle_hours | ◯ | — | Radar de produto parado |
| 38 | post_sale_event_actions | product_id | ⬤ | ✓ | Pós-venda por produto |
| 39 | post_sale_event_logs | product_id | ◯ | ✓ | |
| 40 | post_sale_scheduled_runs | product_id | ◯ | ✓ | |
| 41 | product_catalog_items | product_id | ◯ | ✓ | Catálogo (itens/preços) |
| 42 | catalog_sync_logs | product_id | ◯ | ✓ | |
| 43 | product_ctas | product_id | ◯ | ✓ | CTAs do webchat |
| 44 | product_onboarding_state | product_id | ◯ | ✓ | Wizard de setup do produto |
| 45 | product_offers | product_id (+cakto_product_id) | ◯ | ✓ | Oferta Cakto por produto |
| 46 | cakto_orders | product_id | ◯ | ✓ | Pedido → produto |
| 47 | hotmart_orders | product_id (+hotmart_product_id) | ◯ | ✓ | |
| 48 | hotmart_product_mapping | product_id (hotmart_product_id ⬤) | ◯ | ✓ | Mapeia produto externo→interno |
| 49 | platform_plans | cakto_product_id | ◯ | — | ID externo Cakto (não é FK products) |

### 1.3 Funções DB (RPCs) com parâmetro produto

`distribute_lead(p_product_id?)` · `calculate_commission(p_product_id)` · `get_products_stats()` (retorna por produto) · `inbox_list_conversations(p_product_ids uuid[])` / `inbox_count_conversations(p_product_ids)` · `apply_tag_automations(p_product_id?)` · `evaluate_routing_rules(p_product_id?)` · `create_product_tag_package(p_product_id)` · `delete_product_safe(p_product_id)` · `remove_lifecycle_tags_on_event(p_product_id?)` · `search_catalog_smart(p_product_id?)`.

**Resolução de produto efetivo no inbox** (migração `20260502001923_…sql:120`):
```sql
COALESCE(c.product_id, l.product_id, w.product_id) AS eff_product_id
-- prioridade: conversa > lead > widget
```

---

## 2. Pipeline por produto (o coração)

- **Sem tabela `pipelines`.** `pipeline_stages` (types.ts:7797): `product_id` NOT NULL, `name`, `color`, `order_index`, `is_won`, `is_lost`. 1 produto = 1 funil.
- `src/hooks/useKanbanData.ts:49` — `useKanbanData(productId, filters)`: stages `.eq('product_id', productId)` (l.57) **e** leads `.eq('product_id', productId)` (l.76). Kanban não abre sem produto (`enabled: !!productId`, l.63/124).
- `src/hooks/useProductPipelineStages.ts:12` — `useProductPipelineStages(productId?)` → `.eq('product_id', productId)`.
- `src/hooks/useLeads.ts:56` — `usePipelineStages(productId)` (mesma query).
- `src/hooks/usePipelineMutations.ts` — CRUD de stage sempre com product_id.
- `stage_values` — valor estimado por etapa **por produto** (`admin/StageValueManager.tsx`).
- **Kanban vive dentro do produto**: `admin/products/tabs/KanbanTab.tsx` (315 l.) — o funil é uma aba do hub do produto, não uma tela global.

**Port hoje**: `crm/data/usePlatformCrmStages.ts:23` — `from('platform_crm_pipeline_stages').order('order_index')` **sem filtro** → funil único global. `PlatformCrmSection.tsx` expõe só 2 abas (`contatos`, `funil`).

---

## 3. Componentes/páginas com dimensão produto (fonte)

### 3.1 Hub do produto — `admin/products/` (24 arquivos, ~5.100 linhas core)

- `ProductListPage.tsx` (401 l.) — grade de produtos + criação.
- `ProductDetailPage.tsx` (148 l.) — casca com abas (l.30-37): `settings`, `brain` (Cérebro), `objections`, `cadence`, `postsale`, `playbook`, `materials`, + `AgentsTab`, `DashboardTab`, `KanbanTab`, `ReportsTab`, `SquadTab`, `PricingPlansSection`, subdirs `catalog/` (5 arq.) e `chat/` (4 arq.).
- Tamanhos: AgentsTab 247 l. · BrainTab 249 · DashboardTab 256 · KanbanTab 315 · MaterialsTab 604 · PostSaleTab 685 · PlaybookTab 296 · SettingsTab 324 · SquadTab 297 · ReportsTab 236 · PricingPlansSection 233 · CadenceTab 31 (wrapper) · ObjectionsTab 32 (wrapper).
- `admin/ProductManager.tsx` (428 l.) — CRUD legado. `admin/AssignProductDialog.tsx` (242 l.) — atribui produtos a membro com meta mensal (`user_product_assignments`).
- `product/ProductSelector.tsx` (94 l.) — cards "Meus Produtos" (visão vendedor); `product/ProductDashboard.tsx`, `ProductOnboarding.tsx`, `ProductCaktoPerformance.tsx`; `mobile/MobileProductSelector.tsx`; `seller/inbox/InboxProductSelector.tsx` — **auto-lock com 1 produto** (l.26-31: 1 produto = label estática, sem dropdown).

### 3.2 Seletor "Todos os produtos" — confirmado tela a tela (grep literal)

| Tela | Arquivo | Tem? |
|---|---|---|
| Quiz | `admin/capture/quiz/QuizManager.tsx:60` (productFilter) | ✓ |
| Forms | `admin/forms/FormsManager.tsx` | ✓ |
| ChatBot | `admin/capture/chatbot/ChatBotManager.tsx` | ✓ |
| Widget | `admin/capture/widget/WidgetManager.tsx:50,232` (filtro + select obrigatório na criação, l.67/252 bloqueia sem produto) | ✓ |
| WhatsApp captação | `admin/capture/whatsapp/WhatsAppManager.tsx` | ✓ |
| Leads | `admin/leads/LeadsFilters.tsx` | ✓ |
| Agentes | `admin/agents/AdminExecutivePanel.tsx` | ✓ |
| Equipe | `admin/TeamManager.tsx:33,64-66` (filtro por produtos do membro) | ✓ |
| Financeiro | `admin/FinancialDashboard.tsx` | ✓ |
| Metas | `admin/GoalsManager.tsx:119-121` (null = "Todos os produtos") | ✓ |
| Relatórios webchat | `admin/webchat/reports/ReportsFilters.tsx` | ✓ |
| Doppus (integração) | `admin/integrations/DoppusConfigManager.tsx` | ✓ |
| Inbox vendedor | `seller/inbox/InboxProductSelector.tsx` | ✓ |
| **Agenda** | `admin/CalendarManager.tsx:100` (`productId: selectedProductId`) + `calendar/EventModal.tsx` | ✓ |
| **Agendamento (booking_event_types)** | — | ✗ **NÃO tem** (booking é por-usuário) |

### 3.3 Outras superfícies

- **Leads "Por Produto"**: `admin/leads/LeadsTabs.tsx:5,23` — tab id `by-product`, label "Por Produto", ícone Package; modo admin inclui (`LeadsManager.tsx:72`).
- **Campanhas**: `admin/campaigns/CampaignWizard.tsx:129,204-213,416` — seleciona produto → carrega `pipeline_stages` daquele produto → segmentação por etapas viaja em `audience_filters` Json (campaigns NÃO tem coluna própria).
- **Cadências**: `cadence_templates.product_id` NOT NULL; `useCadences.ts`/`useCadenceMutations.ts` filtram.
- **Comissões**: `useCommissions.ts:69,74,152,160` — join `products:product_id (name)`, filtro por produto; RPC `calculate_commission(p_product_id)`.
- **Metas**: `useSalesGoals.ts:31` — `useSalesGoals(userId?, productId?)`.
- **Agente↔produto**: (a) IA: `product_agents.product_id` + `useProductAgents.ts:16,202-206`; (b) humano: `user_product_assignments` (AssignProductDialog, `useProducts.ts:44` `useAssignedProducts`, `useTeam.ts`, `seller/FinancialPanel.tsx`).
- **Deals**: `useDeals.ts:37,41` — join products + filtro por produto.

## 4. Hooks da fonte que recebem/filtram productId (49)

`useProducts` (useProducts/useProduct/useAssignedProducts/CRUD) · `useProductPipelineStages` · `useProductsStats` (RPC `get_products_stats`, l.18) · `useProductAgents` · `useProductCTAs` · `useProductOnboarding` · `useKanbanData` · `useLeads`/`useLeadsManager` · `useDeals` · `useCommissions` · `useSalesGoals` · `useCadence`/`useCadences`/`useCadenceMutations` · `useCalendarEvents` · `useCatalogItems` · `useChatFlows` · `useForms` · `useFunnels` · `useWebChat` · `useWebhooks` · `useMaterials` · `useObjections`/`useObjectionAI` · `useStageValues` · `usePipelineMutations` · `useTagPackage` · `useTaskAutomation` · `useTasks` · `useTeam` · `useSquads` · `useLeadQueue` · `useLeadTags` · `useLeadTracking` · `useAIInsights` · `useAIKnowledge` · `useKnowledgeSources` · `useGenerateAgentAI` · `useAgentSupervisor` · `useAdminDashboard` · `useAdminNotifications` · `useAutoNotificationSettings` · `useAttendanceReports` · `useDashboardData` · `useDoppusWebhookLogs` · `useFacebookLeads` · `useHotmart` · `useOpportunityScan` · `usePostSaleEventActions` · `useSellerActivities`.

## 5. Edge functions da fonte com product_id (40)

Captação/lead: `form-submit` (l.531,638,715 — stage do produto + stamp no lead + distribute) · `funnel-submit` (l.182,192) · `webchat-api` (l.224-228,411-440 — widget.product_id → conversa → lead) · `webchat-bot` · `webchat-inbox` · `funnel-chatbot-start` · `funnel-api` · `facebook-leads-webhook` · `distribute-lead` (l.19,33 — payload → RPC) · `webhook-receiver`.
IA: `admin-agent-handle-inbound` · `agent-handoff-greeter` · `agent-supervisor` · `generate-agent-ai` · `generate-insights` · `generate-objections` · `handle-objection` · `followup-ai-draft` · `form-generate-ai` · `funnel-generate-ai` · `quiz-generate-ai` · `sales-copilot` · `mia-execute-action`/`mia-realtime-session`/`mia-tools` · `process-training-material` · `opportunity-scan-run`.
Catálogo/pagamentos/outros: `catalog-import-csv` · `catalog-search` · `catalog-sync-website` · `send-catalog-item` · `cakto-webhook` · `cakto-recovery-trigger` · `hotmart-webhook` · `hotmart-sync-orders` · `doppus-webhook` · `sankhya-create-order` · `apply-onboarding` · `auto-notifications` · `evolution-webhook`.
**`booking-submit`/`booking-availability` NÃO usam product_id** (agendamento por-usuário).

## 6. Captação: como a chave de produto viaja do público até o lead

O público **nunca envia product_id**. O embed carrega o **ID/slug do artefato** (form, funnel/quiz, widget); o produto é resolvido **server-side** a partir do vínculo do artefato:
1. `forms.product_id`/`capture_funnels.product_id` (NOT NULL) → edge `form-submit`/`funnel-submit` busca 1ª etapa do funil do produto (`pipeline_stages .eq(product_id)`), grava `leads.product_id`, chama `distribute_lead(p_product_id)`.
2. Widget/chatbot: `webchat_widgets.product_id` (nullable) → conversa herda → na conversão o lead recebe `product_id` do widget (`webchat-api:411-440`).
3. Inbox resolve exibição via `COALESCE(conversa, lead, widget)`.
4. WhatsApp inbound sem artefato: `agent_routing_rules.match_product_ids` + `evaluate_routing_rules(p_product_id?)` roteiam para o agente do produto certo.

## 7. O que o PORT stripou (confronto ponto a ponto)

| # | Fonte | Port hoje | Evidência |
|---|---|---|---|
| 1 | `products` + `product_suites` | **Não existe** `platform_crm_products` (77 objetos, zero produto) | types.ts do port |
| 2 | `pipeline_stages.product_id` NOT NULL | `platform_crm_pipeline_stages` **sem coluna** → funil único | `crm/data/usePlatformCrmStages.ts:23` sem `.eq` |
| 3 | Kanban por produto (`useKanbanData(productId)`) | `PlatformCrmKanban.tsx` sem seletor de produto | crm/kanban/ |
| 4 | Leads tab `by-product` | **Dropado** — `"Por Produto" DROPADO — plataforma sem catálogo` | `PlatformCrmLeadsTabs.tsx:9` |
| 5 | `LeadsFilters` com produto | `Zero organization_id / product_id` | `PlatformCrmLeadsFilters.tsx:35` |
| 6 | Comissões por produto (rules+calc) | `TODO(produto)` explícito 2× — agrupamento por produto não existe | `PlatformCrmCommissionsManager.tsx:83,349` |
| 7 | Metas por produto (`sales_goals.product_id`) | `platform_crm_sales_goals` sem coluna | types port |
| 8 | Captação (forms/funnels/widgets/chat_flows `.product_id`) | `platform_crm_forms/capture_funnels/webchat_widgets/chat_flows` sem coluna; criação sem select de produto | types port + crm/capture/ |
| 9 | `deals.product_id` NOT NULL | `platform_crm_deals` sem coluna | types port |
| 10 | `cadence_templates.product_id` NOT NULL | `platform_crm_cadences` sem coluna | types port |
| 11 | `stage_values.product_id` NOT NULL | `platform_crm_stage_values` sem coluna | types port |
| 12 | `user_product_assignments` (humano↔produto+meta) | **Tabela inteira dropada** | types port |
| 13 | `product_agents` (58+ cols, multi-agente por produto/canal) | `platform_crm_agent_configs` = 8 colunas, 1 bot global (name, persona_prompt, typing_delay_ms, handoff_enabled) | awk types port |
| 14 | Hub produto 24 arq. (14 abas) + ProductSelector + hooks | **Nada portado** — crm/ 147 arq., zero `Product*` | crm/ |
| 15 | Edges com produto (40) | `platform-*` edges: product_id só em **comentários** documentando o strip | `platform-distribute-lead:11-12`, `platform-webhook-receiver:6,21-22,41`, `platform-booking-submit:5`, `platform-mia/index.ts:526` |
| 16 | `inbox_list_conversations(p_product_ids)` + eff_product COALESCE | motor de inbox do port sem parâmetro produto | migrations_platform_crm |
| 17 | Radar produto parado (`monitored_product_ids`) | `platform_crm_auto_notification_settings` sem arrays de produto | types port |

⚠️ **Colisão de nome:** o port TEM tabela `products` (types.ts:14075) — é o **catálogo ERP do salão** (tenant Beauty), NÃO o produto CRM. O prefixo `platform_crm_products` evita a colisão; nunca reutilizar `products` para o CRM da plataforma.

## 8. Plano de migração sugerido (schema `platform_crm_*`)

**M1 — Catálogo (1 migration `20260703_platform_crm_products.sql`):**
```sql
CREATE TABLE platform_crm_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, slug text UNIQUE,
  status text NOT NULL DEFAULT 'published',  -- draft|review|published
  category text, description text, short_description text,
  logo_url text, banner_url text,
  pricing jsonb, settings jsonb, external_links jsonb,
  -- cérebro IA (pode adiar p/ fase agentes se M1 precisar ser enxuto):
  pitch_15s text, pitch_30s text, pitch_2min text, icp text,
  objections text, benefits text, differentials text[],
  guarantee text, discount_policy text, payment_conditions text,
  plans text, knowledge_base text, custom_info text,
  created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
-- product_suites: ADIAR (só vale com 10+ produtos agrupáveis)
```
Seed: `INSERT INTO platform_crm_products (name, slug) VALUES ('NexvyBeauty','nexvybeauty');`

**M2 — Colunas `product_id uuid NULL REFERENCES platform_crm_products(id)` + índice, em 3 ondas:**
- **Onda A (núcleo do funil):** `platform_crm_pipeline_stages`, `platform_crm_leads`, `platform_crm_deals`, `platform_crm_stage_values`, `platform_crm_lead_queue`.
- **Onda B (captação):** `platform_crm_forms`, `platform_crm_capture_funnels`, `platform_crm_webchat_widgets`, `platform_crm_chat_flows`, `platform_crm_webchat_agent_configs`, `platform_crm_conversations`.
- **Onda C (gestão):** `platform_crm_commission_rules`, `platform_crm_commissions`, `platform_crm_sales_goals`, `platform_crm_sales_squads`, `platform_crm_cadences`, `platform_crm_calendar_events`, `platform_crm_tasks`, `platform_crm_notifications`, `platform_crm_tag_automations`, `platform_crm_webhooks`, `platform_crm_auto_notification_settings` (array `monitored_product_ids`), + **nova** `platform_crm_user_product_assignments` (user_id, product_id, monthly_goal).

**Regra de compat (dado existente do Beauty):** toda coluna nasce **NULLABLE** → backfill `UPDATE ... SET product_id = (SELECT id FROM platform_crm_products WHERE slug='nexvybeauty') WHERE product_id IS NULL` → só então endurecer `NOT NULL` onde a fonte exige (`pipeline_stages`, `forms`, `capture_funnels`, `deals`, `commission_rules`, `commissions`, `stage_values`, `cadences`). O front convive com NULL no meio-tempo (padrão da fonte: null = "todos"/legado).

**M3 — RPCs/edges:** `platform_crm_distribute_lead(+p_product_id?)`, `platform_crm_calculate_commission(+p_product_id)`, motor de inbox com `p_product_ids uuid[]` + `COALESCE(conversa, lead, widget)`, novo `get_products_stats`. Edges `platform-*` de captação passam a resolver produto do artefato pai e a stampar no lead (padrão `form-submit:531-715` da fonte).

## 9. Restauração front por seção (esforço P/M/G)

| Seção | O que restaurar | Esforço |
|---|---|---|
| **Catálogo de produtos (hub)** | ProductListPage + ProductDetailPage + abas Settings/Dashboard (MVP; Brain/Playbook/PostSale/Catalog = fase 2) | **G** (24 arq. na fonte; MVP ~6) |
| **Kanban por produto** | Seletor no topo + `usePlatformCrmStages(productId)` + leads filtrados + StageManager por produto | **G** |
| **Captação** | Select de produto na criação de Form/Quiz/Widget/ChatBot + filtro "Todos os produtos" nas 5 listas + stamp no submit (edge) | **G** |
| **Agentes IA por produto** | Hoje 1 bot global de 8 colunas; multi-agente por produto = re-port de `product_agents` + `agent_routing_rules` (subsistema inteiro, não só coluna) | **G** |
| **Comissões** | Regra por produto + agrupamento (TODO já marcado no código) + calculate_commission | **M** |
| **Leads** | Tab "Por Produto" + filtro + coluna na tabela + campo no Create/Import | **M** |
| **Equipe** | `user_product_assignments` + AssignProductDialog + filtro por produto | **M** |
| **Inbox** | InboxProductSelector (auto-lock c/ 1 produto) + `p_product_ids` no motor SQL | **M** |
| **Campanhas** | Passo "produto" no wizard (carrega stages do produto p/ audiência) | **M** |
| **Financeiro/Dashboard** | Breakdown por produto (get_products_stats) | **M** |
| **Metas** | product_id no form (null = todos) + card por produto | **P/M** |
| **Cadências** | product_id no template + filtro | **P/M** |
| **Agenda** | Filtro por produto (padrão `CalendarManager.tsx:100`) + campo no EventModal | **P** |
| **Deals** | Filtro + join nome do produto | **P** |

**Padrão de UX herdado da fonte que protege o Beauty:** `seller/inbox/InboxProductSelector.tsx:26-31` — com **1 produto cadastrado o seletor vira label estática** (auto-lock, sem dropdown). Restaurar multiproduto com o Beauty seedado como produto único mantém a UI atual praticamente idêntica até o 2º produto entrar.

---

*Recon por Claude (Opus 4.8) — leitura pura, zero edição de código. Referências `arquivo:linha` relativas a `.vendus-src-reference/` (fonte) e `apps/NexvyBeauty/` (port).*
