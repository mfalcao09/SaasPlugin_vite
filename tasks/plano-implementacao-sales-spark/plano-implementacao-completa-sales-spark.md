# Plano de Implementação Completa (100%) — sales-spark → SaaS Nexvy

> **Data:** 2026-06-09
> **Objetivo:** implementar 100% da ferramenta sales-spark (comprada) em todos os SaaS do ecossistema Nexvy.
> **Premissa-mãe (corrigida):** nada do sales-spark é "out of scope". Tudo entra. A métrica é "% implementado rumo a 100%" e "ordem de migração por dependência".
> **Repos:**
> - Origem: `/Users/marcelosilva/Projects/sales-spark-ai-47` — Supabase project `pfbjfhkhunzrgyzjgiuq`
> - Destino: `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/*` — 5 SaaS verticais

---

## Decisões tomadas (2026-06-09)

| # | Decisão | Escolha | Impacto |
|---|---|---|---|
| 1 | **Recuperação do baseline** | Via credencial (Lovable ou service-role/connstring do project `pfbjfhkhunzrgyzjgiuq`) — Marcelo providencia | Fase 0 aguarda o acesso; dump 100% fiel quando chegar. Baseline confirmado ausente em repo local, GitHub, conta Supabase CLI e `.env`. |
| 2 | **Rota de schema** | **Rota C — híbrida com adapter** | Adota schema canônico do sales-spark + views expondo `empresas` como `organizations`. Preserva mais do código de oficina atual. |
| 3 | **Estratégia multi-app** | Decidir na Fase 0 (após validar baseline em staging) | Mono (`packages/core-*`) vs cópia per-app fica para depois de ver o schema real funcionando. |

**Status atual:** ⏸️ Fase 0 bloqueada aguardando credencial do project `pfbjfhkhunzrgyzjgiuq`. Ver `00-fase0-recuperar-baseline.md` para o procedimento exato de dump.

---

## 0. Correção de rota

O relatório de auditoria anterior (v1/v2) classificou ~12 categorias do sales-spark como "out of scope / nunca virá / over-engineering". **Isso estava errado** — saiu de uma inferência minha não-solicitada de que módulos de CRM/venda/captura "não combinavam com a persona oficina". O sales-spark foi **comprado para ser implementado a 100%** em todos os SaaS. Este documento substitui aquela lógica: trata cada um dos 8 domínios como obrigatório, e mede o que falta + em que ordem construir.

---

## 1. Dimensão real do sales-spark

Inventário canônico (de `docs/DATABASE.md` + `docs/EDGE_FUNCTIONS.md`, validados contra `pg_catalog`):

| Camada | Quantidade |
|---|---|
| Tabelas (public) | **139** |
| Colunas | 2.031 |
| Funções PL/pgSQL | **54** |
| Triggers | 82 |
| RLS policies | **377** |
| Enums | 11 |
| Extensions | 9 |
| Views | 3 |
| **Edge functions** | **81** |
| Components React (UI) | **~490 atribuídos** (+51 shadcn ui/ transversais) |
| Hooks | **121** |
| Pages roteadas | 22 (+ ~40 "managers" como seções internas de `/admin`) |

**8 domínios funcionais:** Multi-tenant · CRM · Atendimento · Captura · IA/Brain · Integrações · Booking · Plataforma.

**Stack:** Vite + React + shadcn/ui + Supabase (mesma do NexvyOficinas — compatível). IA já é **multi-LLM** (lovable/openai/anthropic/gemini) via `org_ai_routing`.

---

## 2. Estado atual dos 5 SaaS

| App | Components | Edge fns | Tabelas | Estado |
|---|---|---|---|---|
| **NexvyOficinas** | 40 | 13 | 27 | **Piloto** — inbox maduro (supera sales-spark em CSAT/chatbot/keywords), CRM oficina próprio |
| BarbeiroPro | 1 | 0 | — | Casca (pages .jsx, sem backend) |
| NexvyBeauty | 1 | 0 | — | Casca |
| NexvyFoods | 1 | 0 | — | Casca |
| NexvyGYM | 1 | 0 | — | Casca |
| NexvyOficinasLP | 29 | 0 | — | Landing page (marketing) |

**Implicação:** só o NexvyOficinas tem sistema real. Os outros 4 SaaS recebem o núcleo **depois** que ele estiver provado no piloto. O plano abaixo é: **levar NexvyOficinas a 100% primeiro**, depois replicar.

---

## 3. Mapa master de gap por domínio

Cruzamento dos 2 mapeamentos (UI + schema). Complexidade = esforço relativo de migração.

| # | Domínio | Tabelas SS | % schema coberto no Nexvy | Components SS | Hooks | Complex. | Estado no Nexvy hoje |
|---|---|---:|---:|---:|---:|:---:|---|
| 1 | **Multi-tenant** | 8 | 25% | ~25 | 14 | L | `empresas`≈orgs, `empresa_users`≈profiles. Falta RBAC granular, squads, setores. |
| 2 | **CRM** | 17 | 18% | ~75 | 25 | **XL** | `leads`/`orcamentos`/`ordens_servico` parciais. Falta pipeline kanban, deals, comissões, tarefas, objeções, radar. |
| 3 | **Atendimento** | 17 | **53%** | ~55 | 12 | XL | **Mais maduro.** Inbox completo. Falta webchat widget embeddable formal, agent configs IA, ticketing. |
| 4 | **Captura** | 13 | **0%** | ~90 | 5 | L | Inexistente. Builders de funil/form/quiz/widget do zero. |
| 5 | **IA/Brain** | 22 | 5% | ~32 | 13 | **XL** | Só chatbot rule-based. Falta agentes IA, orquestrador, RAG, prompts A/B, knowledge sources. |
| 6 | **Integrações** | 22 | 9% | ~60 | 18 | L | Falta Cakto, Hotmart, Sankhya, Facebook Leads, webhooks, tag automations, post-sale, campanhas, cadências. |
| 7 | **Booking** | 14 | 7% | ~26 | 9 | M | Só `office_hours`. Falta motor de agendamento + Google Calendar. |
| 8 | **Plataforma** | 25 | 12% | ~75 | 22 | L | Falta superadmin, planos/billing, help center, email infra, branding white-label, PWA shell. |
| | **TOTAL** | **~139** | **≈15%** | **~490** | **121** | | |

**Cobertura de nome exato:** apenas 2 tabelas (`evolution_instances`, `message_reactions`). Todo o resto é equivalência conceitual ou gap. **~118 tabelas faltam.**

---

## 4. ⚠️ Bloqueio P0 — recuperar o baseline de schema

**Problema:** o checkout local do sales-spark (`supabase/migrations/`) tem 210 migrations **incrementais (deltas)**, mas **não tem o baseline consolidado** descrito no `DATABASE.md` (os 7 arquivos `00000000000001..07`). As tabelas-base (`organizations`, `profiles`, `leads`, `deals`, `pipeline_stages`, `funnels`, etc.) **não têm `CREATE TABLE` em nenhum arquivo do repo** — só aparecem como `REFERENCES` (FK). Sem o baseline, ~80 tabelas e 7 dos 11 enums **não têm DDL disponível**.

**Solução (executável):** o sales-spark tem banco real ativo no Supabase project **`pfbjfhkhunzrgyzjgiuq`**. O schema completo é recuperável:
```bash
# 1. Linkar ao project do sales-spark (precisa de acesso/credenciais)
cd /Users/marcelosilva/Projects/sales-spark-ai-47
supabase link --project-ref pfbjfhkhunzrgyzjgiuq

# 2. Dump do schema completo (139 tabelas + funções + RLS + triggers + enums)
supabase db dump --linked -f /tmp/sales-spark-baseline-schema.sql          # schema
supabase db dump --linked --data-only -f /tmp/sales-spark-seeds.sql         # seeds (plans, help articles, templates)
```
Isso gera o baseline canônico de uma vez — exatamente o que o `DATABASE.md` chama de "7 arquivos baseline". **É o pré-requisito de tudo.**

**Ação imediata:** confirmar que temos acesso ao project `pfbjfhkhunzrgyzjgiuq` (login Supabase do Marcelo). Se sim, destravo a Fase 0 hoje.

---

## 5. Decisão de arquitetura — schema canônico vs vertical

O NexvyOficinas usa schema **vertical de oficina** (`empresas`/`empresa_users`/`clientes`/`veiculos`/`ordens_servico`/`orcamentos`). O sales-spark usa schema **genérico CRM** (`organizations`/`profiles`/`leads`/`deals`/`pipeline_stages`). Os 81 edge functions + 54 funções + 377 RLS policies **assumem o schema genérico**, ancorado em `has_role(uuid, app_role)` + `organization_id`.

Três rotas:

| Rota | Descrição | Prós | Contras |
|---|---|---|---|
| **A — Adotar canônico** ⭐ | Aplicar o schema sales-spark completo (139 tabelas, organizations/profiles) como base. Domínio oficina (clientes/veiculos/ordens) vira **extensão vertical** (FK para organizations). Reconciliar o inbox já feito. | 81 edges + 54 funções + RLS funcionam **sem reescrita**. Migração 100% vira "aplicar baseline + portar UI". Multi-app trivial (cada SaaS = baseline + vertical). | Reconciliar o que NexvyOficinas já fez (mapear empresas→organizations, inbox→webchat). Perda parcial de trabalho do inbox. |
| B — Manter oficina + portar | Manter empresas/clientes/etc. Portar cada uma das 139 tabelas trocando `organization_id`→`empresa_id` e reescrevendo 377 policies + 54 funções. | Preserva 100% do trabalho atual do NexvyOficinas. | Reescrever toda a RLS + funções security-definer manualmente. **Altíssimo risco e esforço.** Cada edge function precisa de adaptação. Inviável para 100%. |
| C — Híbrida (núcleo + adapter) | Adotar canônico (Rota A) como **núcleo compartilhado**, mas criar uma camada de views/adapters que expõe `empresas` como view de `organizations`, preservando o código de oficina existente. | Equilíbrio: núcleo intacto + código atual funciona via adapter. | Complexidade de manutenção dos adapters; views podem limitar RLS. |

**Recomendação: Rota A.** É a única que torna "migração 100%" realmente viável no prazo — porque herda os 81 edges, 54 funções e 377 policies prontos em vez de reescrevê-los. O domínio oficina (que é pequeno: ~6 tabelas) é re-pendurado como módulo vertical sobre `organizations`. O inbox maduro do NexvyOficinas é reconciliado contra `webchat_*` (trabalho real, mas pontual). **Decisão a validar com Marcelo antes da Fase 1.**

---

## 6. Estratégia multi-app (5 SaaS)

Cada SaaS tem seu próprio Supabase project. Para implementar 100% em todos sem duplicar 490 componentes 5×:

**Recomendado — núcleo compartilhado + verticais:**
```
SaasPlugin_vite/
├── packages/
│   ├── core-schema/        ← baseline sales-spark (139 tabelas) aplicável a qualquer project
│   ├── core-ui/            ← os ~490 components + 121 hooks compartilhados (CRM, IA, captura...)
│   └── core-edges/         ← as 81 edge functions
├── apps/
│   ├── NexvyOficinas/      ← consome core-* + vertical oficina (clientes/veiculos/ordens)
│   ├── NexvyBeauty/        ← consome core-* + vertical beauty (clientes/agendamentos/serviços)
│   ├── BarbeiroPro/        ← consome core-* + vertical barbearia
│   ├── NexvyFoods/         ← consome core-* + vertical food
│   └── NexvyGYM/           ← consome core-* + vertical academia
```
- **Schema:** `core-schema` (baseline) aplicado em cada project Supabase via `supabase db push`. Cada vertical adiciona suas 4-6 tabelas de domínio.
- **UI:** componentes de domínio (CRM, IA, captura, booking, plataforma) vivem em `core-ui` e são importados por todos. Só o tema (cores/ícones/labels) e o vertical mudam por app.
- **Edges:** `core-edges` deployadas em cada project (mesmo código, env vars diferentes).

Isso transforma "implementar 100% em 5 SaaS" em "implementar 100% no núcleo 1× + 5 camadas verticais finas".

---

## 7. Roadmap sequenciado por dependência

Ordenado para que cada fase destrave a próxima. Unidade = **sprint** (≈6 features, padrão S7-S10 já usado). Foco: **NexvyOficinas a 100%**, depois replicação.

### FASE 0 — Fundação (1 sprint) 🔒 bloqueante
- F1: Recuperar baseline do sales-spark (`pfbjfhkhunzrgyzjgiuq` → dump schema + seeds)
- F2: Decisão de schema (Rota A/B/C) — validar com Marcelo
- F3: Setup `packages/core-schema`, `core-ui`, `core-edges` no monorepo
- F4: Aplicar baseline num project de staging + validar 139 tabelas/377 policies
- F5: Adapter empresas↔organizations (se Rota C) ou plano de migração de dados (se Rota A)
- F6: CI: pipeline de deploy de edges + push de schema multi-project

### FASE 1 — Multi-tenant & RBAC (2 sprints)
Base de toda a RLS. Sem isso, nada do resto tem segurança correta.
- Sprint 1.1: `organizations`, `profiles`, `user_roles` (enum app_role), `user_permissions`, função `has_role` + `is_super_admin` + `get_user_organization`. Guards de rota (ProtectedRoute/SuperAdminRoute).
- Sprint 1.2: `sectors`/`sector_members`, `squads`/`squad_members`, distribuição por squad, disponibilidade/status de usuário, campos customizados. UI: TeamManager, SquadManager, SectorsManager.

### FASE 2 — Atendimento → 100% (2 sprints)
Já está 53%. Completar o que falta + reconciliar com schema canônico.
- Sprint 2.1: reconciliar inbox atual (`inbox_*`) com `webchat_conversations/messages/sessions`. Migrar dados. Manter os extras do Nexvy (CSAT, keyword rules, chatbot flows, office hours).
- Sprint 2.2: `webchat_widgets` (widget embeddable formal), `webchat_agent_configs`, `support_tickets`/`support_messages` (ticketing), função `enforce_single_attendant` (humano XOR IA), `try_acquire_conversation_lock`. UI: AttendancePanel, AIResponseCorrector, SupportTickets.

### FASE 3 — CRM completo (4 sprints) — XL
O núcleo do produto.
- Sprint 3.1: `leads` 360 — `lead_tags`, `lead_tag_assignments`, `lead_notes`, `lead_journey_events`, `lead_queue`. UI: LeadsManager, LeadsTable, ficha de lead com abas (timeline/BANT/jornada/notas).
- Sprint 3.2: Pipeline — `deals`, `pipeline_stages`, `stage_values`. UI: KanbanBoard, KanbanColumn, StageManager.
- Sprint 3.3: `tasks`, `interactions`, `objections` + `objection_ai`, `commissions`, `commission_rules`, função `calculate_commission`, `distribute_lead`. UI: TaskCenter, ObjectionsView, CommissionManager, GoalsManager, Leaderboard.
- Sprint 3.4: Radar de oportunidades (`useOpportunityScan` + edge), `lead_transfer_history`, Central de Operação (OperationCenter cockpit), `lead_semantic_memory` (vector) + `search_lead_memory`.

### FASE 4 — IA / Brain (4 sprints) — XL
Diferencial do sales-spark. Depende de Fase 1 (orgs) + Fase 3 (leads/produtos).
- Sprint 4.1: `product_agents`, `agent_specialists`, `agent_activation_logs`, editor de agente (persona+prompt), `generate-agent-ai` edge. UI: AgentsManager, AgentEditor, AgentTestChat.
- Sprint 4.2: Orquestrador — `agent_routing_rules`, `organization_orchestrator_config`, `orchestration_logs`, matriz produto×agente. UI: AgentOrchestratorRoutingTab, AgentHierarchyView.
- Sprint 4.3: Brain/RAG — `knowledge_sources`, `training_materials`, `faqs`, `ai_knowledge_base`, embeddings (`memory-embedder`/`memory-search`), crawl (`firecrawl-*`), YouTube transcriber. UI: ProductBrainHub, FileUploader, WebsiteCrawler, FAQBuilder.
- Sprint 4.4: Qualidade/experimentos — `ai_prompt_experiments`, `ai_prompt_variants` (A/B, `pick_prompt_variant`), `ai_quality_evaluations`, `ai_response_feedback`, `org_ai_routing`/`org_ai_credentials` (multi-LLM, keys server-side per Seção 11). UI: AIRoutingPanel, AIQualityPanel, AgentSupervisorPanel.

### FASE 5 — Captura (3 sprints)
Do zero (0% hoje). Builders visuais.
- Sprint 5.1: `forms`, `form_submissions`, `form_templates`, FormBuilder (canvas/blocks/design/preview/publish), `form-generate-ai`. Páginas públicas PublicForm.
- Sprint 5.2: `funnels`, `funnel_blocks`, `funnel_executions`, `funnel_webhook_logs`, `funnel_analytics`, FlowCanvas/FlowBlockNode/FlowConnections, `funnel-generate-ai`.
- Sprint 5.3: `quiz_templates` + quiz builder (13 comp), `chat_flows` de captura, widgets embeddable, `campaigns`/`campaign_targets`. Páginas públicas PublicQuiz/PublicChat.

### FASE 6 — Integrações (3 sprints)
- Sprint 6.1: Pagamentos — `cakto_*` (orders/credentials/recovery), `hotmart_*` (orders/credentials/mapping), `product_offers`, webhooks `cakto-webhook`/`hotmart-webhook`/`doppus-webhook`, `apply_tag_automations`. UI: CaktoAdminPanel, HotmartConfigManager, PostSaleScenariosEditor.
- Sprint 6.2: `webhooks`, `webhook_logs`, `tag_automations`, `post_sale_event_actions`/`post_sale_event_logs`, `facebook_lead_integrations`, `sankhya_*` (ERP 2-way). UI: WebhooksManager, TagAutomationsPanel, integrations hub.
- Sprint 6.3: Campanhas (`campaign-*`) + cadências (`cadences`/`cadence_steps`/`cadence_enrollments`, `cadence-tick`, business-hours gate), email mass (`mass_email_campaigns`/`process-email-queue`). UI: CampaignsManager, CadencesManager, MassEmailManager.

### FASE 7 — Booking (2 sprints)
- Sprint 7.1: `booking_event_types`, `booking_requests`, `business_hours`/`business_holidays`/`availability_overrides`/`user_availability`, funções `is_within_business_hours`/`cancel_booking_by_token`/`reschedule_booking_by_token`. UI: EventTypesManager, AvailabilityManager. Páginas públicas PublicBooking/BookingConfirmation.
- Sprint 7.2: Google Calendar — `google_calendar_connections`, `calendar_events`, OAuth (`google-calendar-auth/callback/refresh/sync`), agendamento conversacional no chat. UI: CalendarManager (views dia/semana/mês), GoogleCalendarConnect.

### FASE 8 — Plataforma (3 sprints)
- Sprint 8.1: SuperAdmin — `platform_plans`, `subscriptions`, `billing_history`, `platform_settings`, `platform_audit_logs`, OrganizationsManager, UsersManager, PlansManager, SystemHealth, AuditLogs.
- Sprint 8.2: Help/Email/Branding — `help_categories`/`help_articles`, `email_templates`/email infra (queue/suppression/unsubscribe), branding white-label (logo/cores/gradiente). UI: HelpManager, EmailSettings, BrandingPreview.
- Sprint 8.3: Notificações + PWA — `notification_logs`, `admin_notifications`, `auto_notification_settings`, NotificationCenter, GlobalSearch, shell mobile/PWA (19 comp), GuidedOnboarding.

### FASE 9 — Replicação multi-app (2 sprints)
Núcleo provado → escalar aos outros 4 SaaS.
- Sprint 9.1: Aplicar baseline + core-ui + core-edges em NexvyBeauty, BarbeiroPro, NexvyFoods, NexvyGYM. Verticais: beauty (agendamentos/serviços/profissionais), barbearia (agenda/cortes), food (pedidos/cardápio/delivery), academia (planos/treinos/check-in).
- Sprint 9.2: Tema por app (cores/ícones/labels), deploy VPS dos 5 containers, smoke test multi-app.

---

## 8. Esforço total estimado

| Fase | Domínio | Sprints |
|---|---|---:|
| 0 | Fundação | 1 |
| 1 | Multi-tenant & RBAC | 2 |
| 2 | Atendimento → 100% | 2 |
| 3 | CRM | 4 |
| 4 | IA/Brain | 4 |
| 5 | Captura | 3 |
| 6 | Integrações | 3 |
| 7 | Booking | 2 |
| 8 | Plataforma | 3 |
| 9 | Replicação multi-app | 2 |
| | **TOTAL** | **~26 sprints** |

**Leitura honesta:** isto é a reconstrução de um produto SaaS enterprise inteiro (139 tabelas, 81 edges, 490 componentes) + replicação em 5 verticais. ~26 sprints. No ritmo agêntico-paralelo (múltiplos subagentes por sprint, como S7-S10 que rodaram 24 features em 2 dias), é altamente acelerável — mas é trabalho de **meses**, não de uma sessão. A Rota A (adotar schema canônico) é o que comprime mais: herdar 81 edges + 54 funções + 377 policies prontos elimina ~40% do esforço de backend.

---

## 9. Próximos passos imediatos

1. **Confirmar acesso ao project `pfbjfhkhunzrgyzjgiuq`** (sales-spark) → destrava o dump do baseline. Sem isso, ~80 tabelas não têm DDL.
2. **Decidir a Rota de schema** (recomendo A — adotar canônico). Muda todo o resto.
3. **Decidir mono vs multi-repo** para o núcleo compartilhado (recomendo packages/ no monorepo atual).
4. Com 1-3 resolvidos → executar **Fase 0** (1 sprint) e validar o baseline em staging.
5. Seguir Fases 1→9 em ordem.

**Decisão que preciso de você agora:** itens 1, 2 e 3 acima. Os três são bifurcações que mudam o plano inteiro — não dá pra começar a Fase 1 sem eles. Respondidos, começo a Fase 0 imediatamente.
