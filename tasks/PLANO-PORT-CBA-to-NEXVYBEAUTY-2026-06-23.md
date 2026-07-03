# Roadmap de Port — Cloud-Beauty-AI → NexvyBeauty

**A decisão:** o NexvyBeauty (NX) é a base inegociável — ele já tem salão, booking, ~119 edge functions em produção, multi-tenancy por `organization_id`, e os moats que não se reproduzem (Evolution/WhatsApp real, Cakto/cobrança real, `_shared/ai-router.ts` env-driven, soberania Docker/Traefik). Vamos portar 100% do **melhor** do cloud-beauty-ai (CBA, código nosso) para dentro do NX — UI superior, booking de salão, pacotes, web-push, profundidade de CRM e o copiloto que executa ações — **traduzindo** cada peça às 4 costuras de adaptação em vez de adotar a stack do CBA. **Princípio inegociável: nenhum port pode degradar um moat do NX.** Onde o CBA é melhor (composição de shell, padronização de tela, ações tipadas do copiloto), portamos; onde o NX já é superior (theming, RAG, A/B de prompt, IA que executa via Evolution), preservamos e o CBA é descartado.

> **Premissa declarada (Seção 8.1):** assumo que o port é **convergência sobre o NX existente**, não greenfield; que o projeto Supabase alvo é `fzhlbwhdejumkyqosuvq` (NexvyBeauty); e que "UI superior do CBA" = composição de shell + padronização tela-a-tela, **não** theming (o NX tem token set mais rico). Se algum desses três estiver errado, pare antes da Onda 0.

---

## As 4 costuras de adaptação

São as 4 incompatibilidades de stack que todo port atravessa. Fixá-las na Onda 0 destrava o resto.

| Costura | CBA | NX | O que o port exige | Decisão recomendada |
|---|---|---|---|---|
| **Styling** | Tailwind v4, `@theme inline` + oklch (CSS-first, sem config), shadcn `new-york` | Tailwind v3.4, `tailwind.config` + `hsl(var())`, shadcn `default`, dark real | Traduzir **token a token** os que faltam (oklch→HSL); re-gerar UI via CLI shadcn do NX | **Traduzir p/ v3.** NÃO subir o NX p/ v4 — reescreveria 200+ linhas de `@apply`/keyframes; ganho nulo, risco alto. NX tem MAIS tokens. |
| **Server-fn** | `createServerFn().handler()` in-process (TanStack Start) | `Deno.serve` edge fn + `SERVICE_ROLE_KEY` server-only | Cada `.handler` vira 1 edge fn Deno **ou** chamada client+RLS se for leitura simples | **Re-home p/ edge fn.** Template canônico baseado em `/tmp/cba-fresh/src/lib/public-booking.functions.ts`. `createServerFn` não existe no NX. |
| **Auth-gateway** | `@lovable.dev/cloud-auth-js` (OAuth) + SSR Cloudflare gate | Supabase auth (anon JWT + RLS) + edge fn com service_role | Toda lógica usa JWT Supabase do NX; privilégio server-side só dentro de edge fn | **Descartar Lovable.** Validar que nenhum `@lovable.dev/*` sobrevive. Gate SSR do CBA não tem equivalente (vira Traefik p/ LP + RLS/JWT p/ app). |
| **Routing + Data** | File-based TanStack Router; schema **singular PT** (`salao`/`servico`/`agendamento`/`salao_id`, 1 nível) | React Router 6 + `lazyWithRetry`; schema **plural EN/ERP** (`agendamentos`/`servico_catalogo`/`leads`/`organization_id`, multi-tenant) | Re-wire `createFileRoute`→`<Route>`; **naming map** obrigatório CBA↔NX em toda query | **React Router + naming map.** Sem o map, todo port quebra silenciosamente em runtime (coluna/RLS inexistente). React 18 mantido — downlevel mecânico das APIs do React 19. |

---

## Roadmap por ondas

### Onda 0 — Fundação de adaptação (destrava tudo)

**Objetivo:** fixar as 5 decisões de costura *antes* de portar qualquer feature, resolver o gotcha de fundação do `tailwind.config` duplicado, e produzir o template de re-home + naming map como docs de referência reutilizáveis.

| Item | Origem CBA | Alvo NX | Costura | Esforço | Risco |
|---|---|---|---|---|---|
| Resolver `tailwind.config` duplicado | — | `apps/NexvyBeauty/tailwind.config.js` + `.ts` | styling | P | médio |
| Traduzir tokens faltantes (oklch→HSL) | `src/styles.css` | `src/index.css` + tailwind config | styling | P | baixo |
| Template re-home server-fn→edge-fn (doc) | `src/lib/public-booking.functions.ts` | doc de referência | server-fn | P | baixo |
| Naming map de schema (doc) | schema CBA singular | schema NX plural | data | P | baixo |
| Diff design-system `new-york`↔`default` (doc) | `src/components/ui/` (46) | `src/components/ui/` (52) | styling | P | baixo |
| Congelar lista do-que-NÃO-portar | `integrations/lovable`, `wrangler.jsonc`, `ai-gateway.server.ts`, `client.server.ts` | — | auth-gateway | P | baixo |

**Preserva do NX:** `_shared/ai-router.ts` + `_shared/ai.ts`; `vite.config` explícito (react-swc, não o caixa-preta `@lovable.dev/vite-tanstack-config`); paleta rosa `--primary 330 81% 60%`; `ThemeProvider` dark real; `client.ts` anon-key (service-role nunca no bundle).

**Critério de DONE (binário):**
- [ ] Existe **um único** `tailwind.config` (o `.js` defasado removido/unificado com o `.ts` que tem `fontFamily Inter`/container/typography); `components.json` aponta pra ele.
- [ ] `npm run build` no NexvyBeauty passa.
- [ ] Tokens novos aparecem no bundle servido (`grep` de `bg-brand`/`bg-surface` no CSS gerado).
- [ ] Dark/light continua alternando.
- [ ] **Zero** `@lovable.dev/*` ou `@cloudflare/*` em `package.json` ou imports.

**Dependências:** nenhuma. É a raiz.

---

### Onda 1 — UI/UX & shell coeso *(prioridade do usuário)*

**Objetivo:** adotar o vocabulário visual do shell do CBA (sidebar agrupada por seção + rail colapsável de ícones + `PageHeader` padronizado) **estendendo** o `UnifiedShell` do NX, e unificar as **DUAS cascas desktop** do NX (`UnifiedShell` + o `Sidebar.tsx` flat do CRM) num único contrato visual. A vitória do CBA aqui é composição e padronização — **não** theming.

| Item | Origem CBA | Alvo NX | Costura | Esforço | Risco |
|---|---|---|---|---|---|
| Sidebar agrupada (`SidebarGroup`) + rail colapsável | `src/components/AppSidebar.tsx` | `src/components/layout/UnifiedShell.tsx` | routing/styling | M | médio |
| `PageHeader`/`FormDialog`/`NewButton` | `src/components/PageHeader.tsx` | `src/components/layout/PageHeader.tsx` (criar) | styling | P | baixo |
| Aplicar `PageHeader` nas telas salão | — | `src/pages/salao/*` | styling | P | baixo |
| Convergir casca do CRM (re-skin, manter tabs) | — | `src/components/layout/Sidebar.tsx` + `src/pages/Index.tsx` | routing | M | médio |
| Footer sidebar (email + Sair) | `AppSidebar.tsx` | `UnifiedShell.tsx` | styling | P | baixo |
| Polish de tela premium (KPIs grid, recharts tematizado) | `src/routes/app.dashboard.tsx` | `src/pages/salao/*` (referência) | styling | M | baixo |

**Preserva do NX (moat a manter):** dark-mode real (`ThemeToggle` + next-themes — CBA tem `.dark` mas **sem toggle**); `MobileLayout`/`MobileBottomNav`/`MobileMoreMenu`; onboarding completo (`SplashScreen`/`GuidedOnboarding`/`SalaoActivationChecklist`); `AppTopBar` = `OrganizationSelector` (impersonação) + `WhatsAppDisconnectedBanner`; token set rico (`--gradient-*`/`--shadow-*`/`--success`/`--warning`); `lazyWithRetry`/`ProtectedRoute`; `ModuleHub` config-driven (`MODULE_DEFINITIONS` + `usePlanModules`).

**Critério de DONE (binário):**
- [ ] `ModuleHub`, `salao/*` e CRM `Index` renderizam com sidebar **visualmente idêntica** (agrupada + rail colapsável).
- [ ] `collapsible='icon'` funciona (exige `SidebarProvider` no topo — o `UnifiedShell` hoje usa `<aside>` manual sem Provider).
- [ ] Em <768px o rail colapsa pra Sheet (comportamento da primitiva shadcn) sem quebrar `MobileLayout`.
- [ ] Toggle dark/light passa nas 3 cascas, zero cor hard-coded.
- [ ] Tab-system in-memory do CRM (`activeTab`/`prefetchIndexTab`) **preservado** — re-skin por fora, não convertido em rotas.
- [ ] Deploy provado por curl/screenshot da `app.` servida (não só build verde — ver phantom-deploy).

**Dependências:** Onda 0 (tokens + config unificado).

---

### Onda 2 — Booking público de salão + Pacotes pré-pagos

**Objetivo:** portar o booking público de salão (slot por jornada do profissional) + página de pacotes como 1 edge fn pública (`salao-public-booking`) + 2 páginas React Router, escrevendo em `agendamentos` (já existe) e tabelas `pacote`/`pacote_cliente` novas. **Diferencial a somar (não está no CBA):** confirmar via `evolution-send` (WhatsApp real) e vender pacote via Cakto.

| Item | Origem CBA | Alvo NX | Costura | Esforço | Risco |
|---|---|---|---|---|---|
| 4 server-fns de booking → 1 edge fn | `src/lib/public-booking.functions.ts` | `supabase/functions/salao-public-booking/index.ts` | server-fn/auth | G | médio |
| Migration: `pacote`/`pacote_cliente` + jornada + `booking_slug` | — | `migrations_salao/20260623_pacotes_e_booking_publico.sql` | data | M | médio |
| Wizard 5 passos | `src/routes/agendar.$slug.tsx` | `src/pages/salao/AgendarPublico.tsx` | routing/styling | M | médio |
| Página pública de pacotes | `src/routes/pacotes.$slug.tsx` | `src/pages/salao/PacotesPublico.tsx` | routing/styling | M | baixo |
| CRUD interno de pacotes | `src/routes/app.pacotes.tsx` | `src/pages/salao/Pacotes.tsx` | data | M | baixo |
| Confirmação WhatsApp (moat a somar) | — | `invoke('evolution-send')` dentro da edge fn | — | P | baixo |
| Venda real via Cakto (moat a somar) | — | `_shared/cakto-client.ts` `buildCaktoCheckoutUrl` | — | M | médio |

**Preserva do NX:** `evolution-send` como **único** caminho de WhatsApp; RLS por `organization_id` (leitura pública **só** via edge fn service_role — não abrir `anon` nas tabelas); Cakto como cobrança real (pacote nasce `pendente`, só vira `ativo` via `cakto-webhook` — **não** regredir pro "pagamento combinado" do CBA); `agendamentos` + `Agenda.tsx` do operador intactos; padrão de edge fn pública de `funnel-submit`.

**Critério de DONE (binário):** agendamento E2E pelo link público **+** mensagem WhatsApp real recebida **+** compra de pacote retorna `pay.cakto.com.br` válido e `cakto-webhook` muda status — **os três provados em prod**.

**Dependências:** Onda 0; baseline ERP salão (`migrations_salao/20260618_erp_salao.sql` — confirmado); Evolution conectada na org (sem ela o agendamento funciona, só não dispara WhatsApp); `_shared/cakto-client.ts` (confirmado); `organizations.booking_slug` populado.

> **Gotchas críticos:** (1) NX **não tem slug em `organizations`** — criar `booking_slug UNIQUE` ou o link público não resolve a org. (2) `profissionais` **não tem** `hora_inicio`/`hora_fim`/`dias_atendimento` — sem elas o algoritmo de slots não tem jornada. (3) NÃO confundir com `booking-availability`/`calendar_events` (Calendly de reunião — domínio diferente). (4) `evolution-send` espera telefone **só dígitos** — normalizar máscara antes. (5) Manter as **duas** checagens de overlap (slots + insert) contra race-condition.

---

### Onda 3 — Plataforma-de-app: web-push + PWA + gate de borda

**Objetivo:** portar o pipeline de web-push real do CBA (VAPID, subscribe/unsubscribe, `sendPushToUser` com GC de subs mortas 404/410) re-homeando os server-fns p/ edge fns Deno; portar os handlers `push`/`notificationclick` do `sw.js` **sem matar o anti-stale-bundle do NX**; tratar o gate SSR Cloudflare como **não-portável**.

| Item | Origem CBA | Alvo NX | Costura | Esforço | Risco |
|---|---|---|---|---|---|
| `sendPushToUser` + GC 404/410 | `src/lib/push/push.server.ts` | `supabase/functions/_shared/web-push.ts` | server-fn | M | médio |
| 4 edge fns push (subscribe/unsubscribe/vapid-public/test) | `src/lib/push/push.functions.ts` | `supabase/functions/push-*/index.ts` | server-fn/auth | M | médio |
| Migration: `push_subscriptions` + VAPID + prefs por-tipo | — | `migrations/*_push_subscriptions.sql` + `ALTER platform_settings`/`user_notification_settings` | data | M | médio |
| Handlers `sw.js` (só push/click) | `public/sw.js` | `public/sw.js` | routing | P | **alto** |
| UI subscribe/teste | `src/components/PushSubscriptionCard.tsx` | `src/components/.../PushSubscriptionCard.tsx` | server-fn | P | baixo |
| Acoplar push nos inserts de `notifications` | `src/lib/crm/notificacoes.functions.ts` | `auto-notifications`/`post-sale-engine`/`webchat-api` | server-fn | M | médio |

**Preserva do NX:** **`sw.js` cache-less DE PROPÓSITO** (caching causou spinner infinito pós-deploy — NÃO trazer o app-shell network-first do CBA cru, só os 2 handlers); `notifications` + `useNotifications` (push é aditivo); `user_notification_settings` **já é per-user** com `push_enabled` (premissa do briefing "por-org" está parcialmente errada — só falta granularidade por-tipo + store de subscription); IA que executa (`lead-nba`→`evolution-send`); `main.tsx` SW registration guarded.

**Critério de DONE (binário):** clicar "Ativar" → permission granted → row em `push_subscriptions`; "Enviar teste" → notificação no device; evento real (ex: lead estagnado) → in-app **E** push chegam; `/sw.js` servido contém o novo `SW_VERSION` **E** `addEventListener('push')` **E** navigate de `/app` continua sem spinner pós-deploy. Provar **os 2 canais** (front via `deploy-vps.sh`, edge via `supabase functions deploy`).

**Dependências:** Onda 0; helper de edge fn autenticada por JWT do caller (`auth.getUser`); acesso de escrita a `fzhlbwhdejumkyqosuvq`; ícone — corrigir path CBA `/icon-192.png` → NX `/icons/icon-192x192.png`.

> **Gotchas:** usar `@block65/webcrypto-web-push` (Web Crypto puro, edge-compatível via esm.sh) — **NÃO** a lib `web-push` do Node. VAPID private key é segredo (Seção 11): só a public sai via `push-vapid-public`. iOS Safari só com PWA instalado + 16.4+. NÃO portar `requireSupabaseAuth` do TanStack — usar `auth.getUser(jwt)`.

---

### Onda 4 — Profundidade de CRM: scoring configurável + higiene + oportunidades

**Objetivo:** portar 3 capacidades — (1) regras de scoring **configuráveis** (peso+decay por evento) que alimentam o decay temporal; (2) suíte de **higiene** (dedup/merge/normalizar-telefone/enriquecer-IA) que o NX não tem; (3) entidade de **oportunidade** aberta com forecasting ponderado.

| Item | Origem CBA | Alvo NX | Costura | Esforço | Risco |
|---|---|---|---|---|---|
| `crm_score_regra` + recompute configurável | `src/lib/crm/scoring.functions.ts` | `migrations_salao/20260623_crm_score_regra.sql` + estender `recompute_lead_scores` | data | M | médio |
| Suíte de higiene (detect/merge/normalize/enrich) | `src/lib/crm/higiene.functions.ts` | `supabase/functions/crm-higiene` | server-fn/data | G | médio |
| `crm_oportunidade` + KPIs ponderados | `src/lib/crm/oportunidades.functions.ts` | `migrations_salao/20260623_crm_oportunidade.sql` + `supabase/functions/crm-oportunidade` | data/server-fn | M | médio |
| `email_norm` em leads (dedup por email) | — | `migrations_salao/20260623_leads_email_norm.sql` | data | P | baixo |
| 3 telas (tabs lazy) | `app.crm.scoring/higiene/oportunidades.tsx` | `src/components/seller/*` + `src/pages/Index.tsx` | routing/styling | M | baixo |

**Preserva do NX:** `recompute_lead_scores(p_org)` como **função SQL pura** chamada por `pg_cron` sem JWT (estender lendo `crm_score_regra`, **não** virar edge fn — quebraria o cron); RLS `organization_id in (select … from profiles where id=auth.uid())`; `_shared/phone.ts` `normalizePhoneBR` (E.164, **não** o `replace(\D)` ingênuo do CBA); `_shared/ai-router.ts` `resolveAIConfig` (enrich usa router multi-provedor, **não** `LOVABLE_API_KEY`); `lead-nba` como template de IA (tool-call estruturado, não `JSON.parse` frágil); `opportunity-scan` (Radar IA) é **diferente** de `crm_oportunidade` — não fundir (nomear "Negócios"/"Deals" na UI p/ evitar colisão).

**Critério de DONE (binário):** criar regra → `recompute` → score de um lead muda (provado antes/depois); `detect` retorna grupos → `merge` move FKs (`webchat_conversations`/`tasks`/`crm_oportunidade`/`lead_nba_sugestao`); criar oportunidade → KPI ponderado (Σ valor×prob/100) bate na conta manual. Migrations aplicadas em `fzhlbwhdejumkyqosuvq`, 2 edge fns deployadas.

**Dependências:** `recompute_lead_scores` + cron `lead-score-decay` (live 2026-06-23); `_shared/ai-router.ts` + `AI_API_KEY` (live 2026-06-22); `_shared/phone.ts`; schema `leads`/`pipeline_stages`/`webchat_*` em prod.

> **Gotcha de fundo:** todo nome de tabela diverge (`crm_lead`/`crm_conversa`/`salao_id` → `leads`/`webchat_conversations`/`organization_id`). Copiar SQL/queries do CBA cru **quebra**. NÃO portar o `recomputeScoreBatch` (gambiarra confessa do CBA) — o `recompute_lead_scores` já é batch por org.

---

### Onda 5 — IA conhecimento: KB + copiloto MIA com ações tipadas

**Objetivo:** o NX já cobre/supera ~85% disto (KB ingestável, objeções com geração+refino IA, RAG `lead_semantic_memory`, `product_agents`, A/B `ai_prompt_*`, `sales-copilot` que injeta KB+objeções). O port real é fino: 3 flags/contadores + a **única peça estrutural ausente** — o ciclo copiloto human-in-the-loop com **ações tipadas executáveis** (sugere→aprova→executa no banco), que no CBA é `mia.functions.ts` e no NX hoje só devolve texto.

| Item | Origem CBA | Alvo NX | Costura | Esforço | Risco |
|---|---|---|---|---|---|
| Flag `visivel_para_ia` na KB | `src/lib/crm/kb.functions.ts` | `ALTER ai_knowledge_base` + filtro em `sales-copilot/index.ts` | data | P | baixo |
| Contador `usos` em objeções | `src/lib/crm/playbook.functions.ts` | `ALTER objections` + `ObjectionsView.tsx` | data | P | baixo |
| ★ Ciclo de ações tipadas (prepare/execute/reject/list) | `src/lib/crm/mia.functions.ts` | `copilot-prepare-action` + `copilot-execute-action` edge fns | server-fn/auth | M | médio |
| Tabela `copilot_actions` | `crm_mia_acao` | `migrations/*_copilot_actions.sql` | data | P | baixo |
| Painel "Ações sugeridas" | `app.crm.*.tsx` | `src/components/seller/SellerInbox.tsx` | routing/styling | M | médio |

**Preserva do NX:** RAG `lead_semantic_memory` (jamais trocar pela busca `ilike` do CBA); `ai_prompt_experiments`/`ai_prompt_variants` + LLM-as-Judge; `process-knowledge-source` (ingestão website/YouTube); `product_agents` (capabilities tipadas — **não** regredir pro `crm_agente` raso); executor "responder" **reusa `evolution-send`** (não cria canal); `agent_action_logs` como auditoria; escopo `product_id`/`organization_id`.

**Critério de DONE (binário):** salvar artigo com `visivel_para_ia=off` → some do contexto IA, fica na lista; abrir conversa → gerar ação → aprovar `adicionar_tag` aplica tag real / `responder` dispara WhatsApp via `evolution-send`; recusar muda status. **Idempotência:** ação só executa se `status='aprovada'` (clique duplo não dispara 2x WhatsApp).

**Dependências:** `webchat_conversations`/`webchat_messages` estáveis; Evolution operacional; `product_agents.active_in_copilot` + capabilities populados; `lead_stage_history`/`leads.status` (p/ ações mover_etapa/ganho-perdido).

> **Gotcha:** `inbox-copilot` atual é hardcoded "oficina mecânica" (lê `inbox_messages`) — **não** é o copilot do salão (esse é `sales-copilot`). Não confundir ao re-homear. `prepare-action` deve respeitar `ai_prompt_variants` ativos (não introduzir prompt fixo que ignore o A/B).

---

### Onda 6 — Paridade automação/omni/analytics

**Objetivo:** portar 6 itens menores onde o CBA tem forma melhor — workflow builder UI, webhooks de **saída** assinados (HMAC), multi-funil, SLA por etapa, daily-report histórico org-level, ERP (Profissionais KPIs + Financeiro mensal/delete). Metade já tem base no NX (`lead_stage_history` p/ SLA, `capture_funnels` p/ multi-funil, `tag_automations` p/ parte do builder) — **preencher lacunas, não recriar**.

| Item | Origem CBA | Alvo NX | Costura | Esforço | Risco |
|---|---|---|---|---|---|
| ERP Profissionais (edit/delete + KPIs mensais) | `src/routes/app.profissionais.tsx` | `src/pages/salao/Profissionais.tsx` | data | P | baixo |
| ERP Financeiro (delete + filtro mensal) | `src/routes/app.financeiro.tsx` | `src/pages/salao/Financeiro.tsx` | data | P | baixo |
| Daily-report histórico (org-level, persistido) | `src/lib/crm/daily-report.functions.ts` | `daily-report-ai` (estender) + `crm_daily_report` | data/server-fn | M | médio |
| SLA por etapa | (evento `sla_estourado`) | `ALTER pipeline_stages` + agregar `lead_stage_history` | data | M | médio |
| Webhooks de saída HMAC | `src/lib/crm/webhooks.functions.ts` | `outbound_webhooks` + `outbound-webhook-dispatch` | data/server-fn | M | médio |
| Workflow builder (trigger→action) | `src/lib/crm/workflows.functions.ts` | `crm_workflow` + `workflow-dispatcher` + `WorkflowBuilderPanel.tsx` | data/server-fn/routing | G | médio |
| Multi-funil (provável só UI) | `src/lib/crm/builder.functions.ts` | `capture_funnels` + `funnel-api` | data | P | baixo |

**Preserva do NX:** `campaign-dispatcher`/`cadence-tick` (automação E2E real que envia via `evolution-send` — workflow **orquestra**, não reimplementa envio); `webhooks` **INBOUND** + `webhook-receiver` (saída é tabela **nova** `outbound_webhooks`, não colidir); `capture_funnels` (estender, não recriar com `crm_funnel` PT); `lead_stage_history` já populado (SLA só **agrega**); `tag_automations` (workflow é o caso genérico — reusar padrão de UI); ENUM financeiro `entrada/saida` (não copiar `receita/despesa` do CBA); action `atribuir_owner` usa `distribute-lead` (round-robin real) em vez do stub do CBA.

**Critério de DONE (binário):** workflow `lead.criado→criar_tarefa` → criar lead via `capture-lead` → tarefa criada + `crm_workflow_run` logado; outbound webhook → webhook.site → HMAC válido; daily snapshot gerado e legível no histórico; editar/excluir profissional + lançamento; SLA badge num lead parado.

**Dependências:** `pipeline_stages`/`lead_stage_history`, `capture_funnels`/`funnel-api`, `leads`/`lead_tag_assignments`/`tasks`/`notifications`/`distribute-lead`, `evolution-send`/`campaign-dispatcher`, `auto-notifications`. **Pré-flight obrigatório:** `list_tables` em `fzhlbwhdejumkyqosuvq` para confirmar schema EN real (não confiar no disco — `migrations_salao/` é não-padrão e tabelas CRM vivem no remoto).

---

## O que NÃO portar (anti-escopo)

| Item descartado | Por quê | Substituto no NX |
|---|---|---|
| `integrations/lovable` + `@lovable.dev/cloud-auth-js` | Auth OAuth Lovable | Supabase auth (anon JWT + RLS) |
| `src/lib/ai-gateway.server.ts` (`LOVABLE_API_KEY` hardcoded) | Cola de IA proprietária | `_shared/ai.ts` + `ai-router.ts` (env-driven) |
| `wrangler.jsonc` + `@cloudflare/vite-plugin` + `src/server.ts` (SSR) | Stack Cloudflare Workers | Docker/Traefik + edge fns Deno |
| `@lovable.dev/vite-tanstack-config` (vite caixa-preta) | Injeta tanstackStart+tailwindcss+cloudflare | `vite.config` explícito (react-swc) do NX |
| `client.server.ts` (service-role no bundle) | Vazaria key (viola Seção 11.1) | service_role **dentro** da edge fn (`Deno.env`) |
| `styles.css` inteiro (oklch v4) | NX tem token set mais rico em HSL | `index.css` v3 — só traduzir tokens faltantes |
| App-shell network-first do `sw.js` | Causou spinner infinito pós-deploy no NX | `sw.js` cache-less + só handlers push/click |
| `crm_campanha_envio` (fila de campanha morta, sem consumer) | Já morta no próprio CBA | `campaign-dispatcher`/`cadence-tick` do NX |
| `agentes.functions.ts` / `crm_agente` | Muito mais raso | `product_agents` (capabilities tipadas) |
| `recomputeScoreBatch` (gambiarra confessa) | Pode nem rodar | `recompute_lead_scores(p_org)` (batch SQL) |
| `comprarPacote` "pagamento combinado" | Regride o moat de cobrança | Cakto checkout real (`cakto-webhook`) |
| Migrar React 18→19 / Tailwind v3→v4 | Escopo-creep, ganho nulo, quebra 119 telas | Downlevel mecânico + tradução de token |

---

## Sequenciamento recomendado + estimativa agregada

**Ordem:** `0 → 1 → 2 → 3 → 4 → 5 → 6`.

1. **Onda 0 (P)** primeiro e sozinha — sem o `tailwind.config` unificado e os tokens traduzidos, **qualquer** estilo portado pode não aparecer; sem o template de re-home e o naming map, todo port de feature trava ou quebra em runtime. É a raiz de dependência de todas as outras.
2. **Onda 1 (M)** logo após — é a **prioridade declarada do usuário** ("UI superior, não quero mais equiparar"), entrega valor visível cedo, e o `UnifiedShell`/`PageHeader` refatorados viram a casca onde as telas das Ondas 2/4/5/6 vão morar (evita retrabalho de re-skin depois).
3. **Onda 2 (G)** — primeira feature de receita (captação + venda de pacote), maior esforço, depende do shell pronto.
4. **Onda 3 (M)** — independente das features de CRM; pode rodar em paralelo conceitual com a 4, mas o gotcha do `sw.js` justifica isolá-la.
5. **Onda 4 (G)** — profundidade de CRM, depende de `leads`/`pipeline_stages` estáveis.
6. **Onda 5 (M)** — depende de 4 (pipeline/stage history p/ ações) e de inbox estável.
7. **Onda 6 (G)** — paridade fina, maior superfície de schema-mismatch; deixar por último porque depende de quase tudo (`lead_stage_history`, `capture_funnels`, `distribute-lead`).

**Esforço agregado:** 1×P (Onda 0) + 3×M (1, 3, 5) + 3×G (2, 4, 6). Em peso relativo: ~**1 onda pequena de fundação + 3 médias + 3 grandes**. As 3 grandes (booking+pacotes, profundidade CRM, paridade automação) concentram ~60% do trabalho; a fundação é barata mas **bloqueante**.

---

## Riscos transversais & mitigação

| Risco | Onde mais dói | Mitigação |
|---|---|---|
| **Tailwind v4→v3** (classes/tokens incompatíveis por engine) | 1, 2, todas as UIs | Traduzir token a token; ao copiar JSX validar que a classe existe na v3 (`bg-surface`→`bg-muted`); **nunca** subir o NX p/ v4. Re-gerar UI via CLI shadcn do NX. |
| **React 19→18** (`use()`, `useActionState`, ref-as-prop) | 1, 5 (forms) | Downlevel mecânico; atenção a `react-hook-form`/`@hookform/resolvers` (CBA v5, NX v3 — breaking) e `date-fns` (CBA v4, NX v3.6 — assinaturas mudaram). |
| **Re-home server-fn** (`createServerFn` não existe; service-role) | 2, 3, 4, 5, 6 | Template canônico da Onda 0; leitura simples→client+RLS, privilégio→edge fn `SERVICE_ROLE_KEY`. Nunca importar service-role em código alcançável pelo bundle Vite (Seção 11.1). |
| **Regressão de moat** (jogar fora Evolution/Cakto/RAG/A-B/dark/ai-router ao "portar 1:1") | 2 (Cakto), 3 (sw.js/notif), 4 (ai-router/phone), 5 (RAG/agents) | Coluna "Preserva do NX" é **gate de revisão** em cada onda. Pergunta-filtro: "isto degrada um moat?". Se sim, o port para. |
| **Drift de migrations / schema-mismatch** (PT singular vs EN plural; tabelas CRM só no remoto, `migrations_salao/` não-padrão) | 4, 6 | Naming map (Onda 0) obrigatório em toda query. Pré-flight `mcp list_tables` em `fzhlbwhdejumkyqosuvq` **antes** de codar — não confiar no disco. Regenerar `types.ts` pós-migration. |
| **Phantom deploy** (build verde ≠ código novo servido) | 1, 2, 3 | `docker build --no-cache` + provar string/look no bundle **servido** (curl/screenshot), não no health. 2 canais distintos: front (`deploy-vps.sh`) + edge (`supabase functions deploy`). |

---

## Primeiro passo concreto (esta semana)

**Toque a Onda 0, item 0 — resolver o `tailwind.config` duplicado — antes de qualquer outra coisa.** Hoje coexistem, ambos tracked:
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/tailwind.config.js` (o que o **build usa** — precedência de extensão `.js` antes de `.ts` no Tailwind v3, defasado)
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/tailwind.config.ts` (o que `components.json` **aponta** — tem `fontFamily Inter`/container/typography, mas é ignorado pelo build)

Enquanto isso não for unificado, **qualquer token traduzido do CBA pode não aparecer** (entra no `.ts` morto) e o diagnóstico vai ser confuso. Sequência mínima desta semana:

1. Unificar num único config (consolidar o conteúdo do `.ts` no `.js` ou vice-versa, e alinhar `components.json`) → verifica: `npm run build` passa + só **um** config tracked.
2. Traduzir de `/tmp/cba-fresh/src/styles.css` **só** os tokens que faltam (`--surface`, `--brand`/`--brand-foreground`/`--brand-master`, `.master-theme`, `--chart-2..5`), oklch→HSL, em `:root` e `.dark` do `src/index.css`, mantendo `--primary 330 81% 60%` → verifica: `grep` da classe nova no CSS servido.
3. Escrever os 2 docs de referência (template re-home server-fn→edge-fn usando `public-booking.functions.ts` como exemplo; naming map CBA↔NX) — eles são consumidos por **todas** as ondas seguintes.

Concluído isso, a Onda 1 (prioridade do usuário) destrava sem fricção de fundação.

Arquivos-âncora desta semana: `apps/NexvyBeauty/tailwind.config.js`, `apps/NexvyBeauty/tailwind.config.ts`, `apps/NexvyBeauty/components.json`, `apps/NexvyBeauty/src/index.css`, `/tmp/cba-fresh/src/styles.css`.
