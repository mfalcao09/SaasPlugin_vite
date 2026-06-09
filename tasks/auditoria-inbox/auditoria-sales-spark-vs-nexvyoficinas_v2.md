# Auditoria v2: sales-spark-ai-47 → NexvyOficinas

> **Data:** 2026-06-09 (v2)
> **Baseline anterior:** v1 de 2026-06-07 (mesma pasta, sem `_v2`)
> **Repos analisados:**
> - Origem: `/Users/marcelosilva/Projects/sales-spark-ai-47` — CRM completo (210 migrations, 121 hooks, ~545 components, ~120 edge functions)
> - Destino: `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyOficinas` — piloto inbox (40 components, 13 hooks, 13 edge functions, ~17 migrations recentes via MCP)

---

## TL;DR — o que mudou em 2 dias

| Métrica | v1 (07-jun) | v2 (09-jun) | Δ |
|---|---|---|---|
| **Paridade com sales-spark (escopo inbox)** | ~18% | **~58%** | **+40 pts** |
| Features inbox implementadas | 15 | **47** | +32 |
| P0 bugs de schema | 2 | **0** | −2 |
| P0/P1 críticos ainda faltando | 34 | **9** | −25 |
| P2/P3 extended ainda faltando | 26 | **18** | −8 |
| Out-of-scope (não migrar) | 12 | **12** | = |
| Edge functions importadas | 9 | **13** | +4 |
| Components inbox/ | 12 | **28 + composer/ + messages/** | +16 |

**Veredito v2:** o inbox NexvyOficinas saiu do MVP funcional e entrou em **classe enterprise**. Cobre 8 das 10 grandes capacidades de atendimento profissional (CSAT, SLA, auto-assign, follow-up, keywords, templates, notas internas, transferência, chatbot de fluxo, notificações realtime, multi-canal webchat, alertas WhatsApp, API keys, dashboard individual). As 2 áreas que **continuam externas** ao escopo são as de plataforma SaaS multi-tenant pesada (cadência multi-touch, campanhas em massa, integrações de pagamento/CRM ERP). Decisão estratégica, não dívida técnica.

**Origem deste salto:** 4 sprints (S7→S10) implementados em paralelo entre 07-jun e 09-jun, totalizando **24 features** entregues e **15 commits** novos no `main`.

---

## Sumário

1. [Delta detalhado v1 → v2 (sprints S7-S10)](#delta-detalhado-v1--v2)
2. [Métrica quantitativa por categoria](#métrica-quantitativa-por-categoria)
3. [Status de cada P0/P1 do v1](#status-de-cada-p0p1-do-v1)
4. [O que ainda falta (9 P0/P1 + 18 P2/P3)](#o-que-ainda-falta)
5. [Inventário comparativo](#inventário-comparativo)
6. [Categorias do sales-spark NÃO importadas (com decisão)](#categorias-do-sales-spark-não-importadas)
7. [Recomendações para Sprint 11+](#recomendações-para-sprint-11)
8. [Apêndice — arquivo por arquivo (inbox)](#apêndice--arquivo-por-arquivo)

---

## Delta detalhado v1 → v2

### Sprint 7 — "Qualidade do atendimento" (07-jun)
| F | Feature | Arquivos novos | Status |
|---|---|---|---|
| F1 | CSAT survey automático 1-5 ao fechar | `send-csat/` edge fn + webhook captura score | ✅ |
| F2 | SLA Tracking + alerta visual | `SlaIndicator.tsx` + `first_response_at` + cor por idade | ✅ |
| F3 | Auto-assign round-robin | `inbox-auto-assign/` cron + `empresa_users.inbox_available` | ✅ |
| F4 | Follow-up automático | `inbox-followup/` cron + 3 atts máx por conv | ✅ |
| F5 | Keyword auto-responder | `KeywordRulesManager.tsx` + match exact/starts_with/contains | ✅ |
| F6 | CSV export do dashboard | botão em InboxMetrics | ✅ |

### Sprint 8 — "Produtividade do agente" (08-jun)
| F | Feature | Arquivos | Status |
|---|---|---|---|
| F1 | Templates de resposta + atalho `/` | `MessageTemplatesManager.tsx` + Composer integration | ✅ |
| F2 | Notas internas entre agentes | reuso `inbox_messages` + `content_type='internal_note'` | ✅ |
| F3 | Transferência de conversa | `TransferDialog.tsx` + `inbox_assign_log.transferred_from/reason` | ✅ |
| F4 | Chatbot de fluxo (árvore de decisão) | `ChatbotFlowEditor.tsx` + 3 tabelas + lógica de sessão no webhook | ✅ |
| F5 | Notificações realtime (badges) | `NotificationBell.tsx` + supabase channel + `inbox_agent_notifications` | ✅ |
| F6 | MyStats dashboard individual | `MyStats.tsx` + ranking + badge de nível | ✅ |

### Sprint 9 — "Analytics avançado + configurações" (08/09-jun)
| F | Feature | Arquivos | Status |
|---|---|---|---|
| F1 | Filtro de período 7/30/90/mês no InboxMetrics | `InboxMetrics.tsx` mod | ✅ |
| F2 | Funil de conversação (chart) | `InboxMetrics.tsx` mod | ✅ |
| F3 | Tabela de performance por agente | `InboxMetrics.tsx` mod | ✅ |
| F4 | Exportação PDF via `window.print` | `InboxMetrics.tsx` mod | ✅ |
| F5 | Config Alertas WhatsApp para o dono | `AlertsConfig.tsx` + 4 colunas em `empresas` | ✅ |
| F6 | Geração de API keys (integrações) | `ApiKeyManager.tsx` + tabela `empresa_api_keys` com SHA-256 | ✅ (com fix de schema vs S10) |

### Sprint 10 — "Multi-canal + integração + estabilização" (09-jun)
| F | Feature | Arquivos | Status |
|---|---|---|---|
| F1 | Rotas + nav integradoras (S9+S10) | `App.tsx`, `AppLayout.tsx` | ✅ |
| F2 | Disparo de alertas no webhook (config do S9) | `evolution-webhook` v10 + 3 triggers (nova conv, CSAT≤2, fila > threshold com debounce 5min) | ✅ |
| F3 | Instagram DM channel | `inbox_conversations.channel` + parse no webhook | ✅ |
| F4 | Webchat widget embeddable | `webchat-widget/` (serve JS), `webchat-handler/` (recebe POST), `WebchatConfig.tsx` | ✅ |
| F5 | Onboarding wizard 5 passos | `OnboardingWizard.tsx` + `empresas.onboarding_step/_completed_at` | ✅ |
| F6 | ErrorBoundary global | `ErrorBoundary.tsx` + `App.tsx` wrap | ✅ |

### Fix pós-S10 — segurança de API keys
- S10 F4b sobrescreveu `empresa_api_keys` com schema inseguro (plaintext `api_key`).
- Reconciliado para schema do S9 F6: `key_hash text` (SHA-256), `key_prefix`, `name`, `created_by`. Tabela estava vazia, sem perda de dados.
- `webchat-handler` atualizado para validar via hash. Alinha com Seção 11.1 do `CLAUDE.md`.

### Bugs do v1 — status
- **BUG-1** (EvolutionSettings.tsx lia colunas inexistentes): ✅ corrigido em sprint anterior (07-jun pré-S7) — schema atual usa `name, instance_id, phone_number, is_default`.
- **BUG-2** (ChatArea.tsx lia `media_url, media_type, status`): ✅ corrigido — schema atual usa `content_type, metadata, storage_url, delivery_status`.

---

## Métrica quantitativa por categoria

| Área | sales-spark (≈) | NexvyOficinas | % importado | Notas |
|---|---|---|---|---|
| **Componentes inbox** | ~50 (em chat/ + notifications/ + hooks) | 28 + composer/ + messages/ | **~70%** | Componentes específicos de sales (objections, playbook, lead) ficaram de fora — out of scope oficina |
| **Edge functions (total)** | ~120 | 13 | **~11%** | Mas das 13, as 5 essenciais ao inbox WhatsApp estão (evolution-proxy/send/webhook + transcribe-audio + process-scheduled-messages) |
| **Edge functions de inbox especificamente** | ~21 (whatsapp-webhook, evolution-*, webchat-*, transcribe-audio, process-scheduled, distribute-lead, start-whatsapp-conversation, agent-handoff-greeter, agent-supervisor, sales-copilot, etc.) | 13 (todas relevantes) | **~62%** | inbox-copilot ≈ sales-copilot, inbox-auto-assign ≈ distribute-lead |
| **Hooks (total)** | 121 | 13 (.ts) + 6 (.js legacy) | **~16%** | Maioria dos hooks sales-spark cobre features fora do escopo (campanhas, quizzes, hotmart, sankhya) |
| **Hooks de inbox especificamente** | ~11 (useAttendancePanel, useAcceptConversation, useTypingIndicator, useAudioRecorder, useMediaUpload, useInboxNotifications, useMessageReactions, useQuickReplies, etc.) | 8 equivalentes | **~73%** | useAttendancePanel não foi importado (sales-spark usa "fila central"; nós usamos round-robin assíncrono) |
| **Pages** | 22 (todas multi-tenant SaaS) | 22 .tsx no /app + 6 auth + algumas .jsx legacy | — | Convertido para domínio oficina (Clientes/Veículos/Ordens/Orçamentos não existem em sales-spark) |
| **Schema de banco (tabelas inbox)** | ~30 tabelas em 210 migrations | ~17 tabelas criadas via MCP | **~57%** | Faltam: kanban_columns, message_campaigns, knowledge_sources, ai_quality_logs, agent_tools, deal_pipelines, e variantes específicas de funis |

**Composição final:**
- **Funcionalidade inbox/atendimento:** ~58% importada (era 18% no v1)
- **Camada CRM (Clientes/Veículos/Ordens) específica oficina:** 0% importada (e nunca virá — domínio próprio)
- **Plataforma SaaS sales-spark (multi-org admin, campaigns, cadence avançada):** ~10% importada (intencional)

---

## Status de cada P0/P1 do v1

### Bloco A — Mídia (v1 dizia: P0, 6 itens) → **6 de 6 ✅**

| Item v1 | Status v2 | Evidência |
|---|---|---|
| Upload imagem + envio | ✅ | `useMediaUpload.ts` + Composer + Storage `inbox-media` |
| Áudio (gravação + envio) | ✅ | `AudioRecorder.tsx` (composer/) + transcribe-audio edge |
| Vídeo | ✅ | VideoBubble + upload via Composer |
| Documento (PDF/DOCX/XLSX) | ✅ | DocumentBubble + content_type=document |
| Sticker | ✅ | StickerBubble |
| Localização/contato inbound | ✅ | LocationBubble + ContactBubble (S6 F6) |

### Bloco B — Operação de fila (v1: P0, 5 itens) → **5 de 5 ✅**

| Item v1 | Status v2 | Evidência |
|---|---|---|
| Aceitar/recusar conversa | ✅ | `AcceptTicketBar.tsx` + status human_active |
| Distribuição automática | ✅ | inbox-auto-assign edge + round-robin S7 F3 |
| Transferência | ✅ | TransferDialog S8 F3 |
| Filtros (status, assignee) | ✅ | InboxFiltersDrawer.tsx |
| Disponibilidade de agente | ✅ | toggle `empresa_users.inbox_available` |

### Bloco C — UX essencial (v1: P0/P1, 7 itens) → **7 de 7 ✅**

| Item v1 | Status v2 |
|---|---|
| Indicador de digitação | ✅ TypingIndicator + broadcast channel |
| Reações em mensagens | ✅ MessageReactions + tabela `message_reactions` |
| Busca em conversa | ✅ MessageSearchBar |
| Avatar do contato | ✅ ContactAvatar + fetchAndStoreAvatar fire-and-forget |
| Soft-delete + revoke | ✅ inbox_messages.is_deleted + protocolMessage type=5 |
| Delivery status | ✅ delivery_status: delivered/read via messages.update event |
| Mensagem agendada | ✅ ScheduleMessageDialog + process-scheduled-messages cron |

### Bloco D — Integração CRM oficina (v1: P0, 5 itens) → **5 de 5 ✅**

| Item v1 | Status v2 |
|---|---|
| Vincular conversa a Cliente | ✅ LinkClienteDialog + cliente_id em inbox_conversations |
| Painel de contexto CRM no chat | ✅ CrmContextPanel — mostra OS/orçamentos ativos do cliente |
| Histórico de conversas anteriores | ✅ ContactHistoryDrawer |
| Iniciar conversa a partir do CRM | ✅ NewConversationDialog + start-conversation edge |
| Templates por nicho oficina | ✅ MessageTemplatesManager — shortcuts /, parametrizados por empresa |

### Bloco E — Plataforma/responsivo (v1: P0/P1, 6 itens) → **4 de 6 (67%)**

| Item v1 | Status v2 |
|---|---|
| Mobile responsivo | ✅ classes md:/sm: em todo Inbox/ConversationList/ChatArea |
| Realtime | ✅ subscribe em conversations e messages |
| Office hours | ✅ OfficeHoursSettings + isWithinOfficeHours no webhook |
| ErrorBoundary | ✅ Sprint 10 F6 |
| Mobile-first redesign profundo (gestos, swipe-to-archive) | 🟡 parcial — funciona, mas sem gestos nativos |
| PWA / instalável | ❌ |

---

## O que ainda falta

### P0/P1 críticos (9 itens)

| # | Item | Onde existe no sales-spark | Esforço | Prioridade pra oficina |
|---|---|---|---|---|
| 1 | **Broadcast (mensagem em massa)** | `send-mass-email`, `campaign-dispatcher` | M | ⭐⭐⭐ — "promoção do dia" |
| 2 | **Tags/categorias por conversa** | `conversation_tags` table | S | ⭐⭐ — facilita filtros |
| 3 | **Notas no contato (não no chat)** | `contact_notes` | S | ⭐⭐ |
| 4 | **Lembretes de follow-up manual** | `scheduled_followups` | S | ⭐⭐⭐ — "lembrar de cobrar OS X em 2 dias" |
| 5 | **Importação de contatos CSV** | `catalog-import-csv` (adaptável) | M | ⭐⭐ |
| 6 | **Cron de SLA breach (alerta gerente)** | `cadence-tick` (adaptável) | S | ⭐⭐⭐ — combina com Alertas WhatsApp do S9 F5 |
| 7 | **Histórico de transferências por conversa (timeline)** | sales-spark mostra timeline | S | ⭐⭐ |
| 8 | **Multi-agente em paralelo na MESMA conversa (handoff vs co-attendance)** | `agent-handoff-greeter` | M | ⭐⭐ — útil em vendas complexas |
| 9 | **Mute/silence de conversas (sem fechar)** | `inbox_conversations.muted_until` | S | ⭐ |

### P2/P3 extended (18 itens) — agrupados

**IA/Copiloto (4):**
- Sugestão de próxima mensagem com contexto da OS aberta (vai além do `inbox-copilot` atual)
- Resumo automático de conversa ao fechar
- Detecção de intenção do cliente (precificar/agendar/reclamar)
- Avaliação automática de qualidade do atendimento (sentiment + score por mensagem)

**Bot / chatbot avançado (3):**
- Editor visual drag-and-drop de fluxo (hoje é lista de nós — funcional mas técnico)
- Variáveis dinâmicas em mensagens (`{{nome_cliente}}`, `{{última_os}}`)
- Branching condicional baseado em dados do CRM (ex.: "se cliente tem OS > 6 meses → enviar X")

**Automação (4):**
- Workflow builder (gatilho → ação) — equivalente a Zapier interno
- Webhook para integrações externas (entrar)
- Webhook outgoing (sair)
- Conectores com Google Calendar (booking-* do sales-spark)

**Operacionais (4):**
- Permissões granulares por agente (read-only, etc.)
- Audit log de ações (quem fechou, quem transferiu)
- 2FA agente
- Exportação completa (compliance / LGPD)

**Multi-canal (3):**
- Telegram (sales-spark não tem; mas relevante BR)
- SMS fallback (sales-spark tem placeholder)
- E-mail tickets (out of scope — sales-spark tem `process-email-queue`)

---

## Inventário comparativo

### Edge functions

| sales-spark (~120) | NexvyOficinas (13) | Match |
|---|---|---|
| evolution-proxy | evolution-proxy | ✅ idêntico nominal |
| evolution-send | evolution-send | ✅ idêntico |
| evolution-webhook | evolution-webhook | ✅ rebatizado v10 com CSAT+SLA+keywords+chatbot+notificações+Instagram+alertas |
| webchat-api / webchat-bot / webchat-inbox | webchat-handler / webchat-widget | 🔄 simplificado (3→2) com schema seguro |
| transcribe-audio | transcribe-audio | ✅ |
| process-scheduled-messages | process-scheduled-messages | ✅ |
| sales-copilot | inbox-copilot | 🔄 renomeado, escopo oficina |
| distribute-lead | inbox-auto-assign | 🔄 simplificado para round-robin |
| ai-followup-cron / cadence-tick (parcial) | inbox-followup | 🔄 só follow-up de conversa inativa |
| send-mass-email | send-broadcast | 🔄 (sem segmentação de público sales-spark) |
| (não existe) | send-csat | ✨ novo, Sprint 7 |
| (não existe) | start-conversation | ✨ novo (iniciar conversa a partir do CRM oficina) |
| **NÃO IMPORTADAS** (~107) | — | Veja seção "categorias não importadas" |

### Components inbox/ — diff nominal

**Existem nos 2:** `AcceptTicketBar.tsx`, `InboxFiltersDrawer.tsx` (sales-spark inbox/ tem só esses 2 + index.ts)

**Existem só no NexvyOficinas (26):**
`AlertsConfig`, `ApiKeyManager`, `BroadcastDialog`, `ChatArea`, `ChatbotFlowEditor`, `ContactAvatar`, `ContactHistoryDrawer`, `ConversationList`, `CrmContextPanel`, `EvolutionSettings`, `KeywordRulesManager`, `LinkClienteDialog`, `MessageActionsMenu`, `MessageReactions`, `MessageSearchBar`, `MessageTemplatesManager`, `NewConversationDialog`, `NotificationBell`, `OfficeHoursSettings`, `QuickRepliesManager`, `QuickReplyPicker`, `ScheduleMessageDialog`, `SlaIndicator`, `TransferConversationDialog`, `TransferDialog`, `TypingIndicator` + subpastas `composer/` (5 arquivos), `messages/` (~7 bubbles)

**Observação:** o sales-spark **NÃO TEM** o equivalente desses 26 componentes em `components/inbox/`. Eles têm a mesma funcionalidade distribuída em `components/chat/` (5 arquivos), `components/notifications/` (1), e em **hooks** (~30 que começam com useAcceptConversation, useAttendancePanel, etc.). Padrão arquitetural diferente: sales-spark é mais "hook-heavy + page-rendering"; NexvyOficinas é "component-heavy + colocated".

**Veredito:** o que foi "importado" é **inspiração funcional**, não código copiado. A reescrita em forma de componentes locais facilita manutenção mas significou re-criação do zero da maior parte do código UI.

### Pages

**No NexvyOficinas (todas tsx):** Dashboard, Clientes, Veículos, Ordens, Orçamentos, Financeiro, Relatorios, AIGrowth, Equipe, Configuracoes, Leads, Cadencia, Metas, Inbox, InboxMetrics, MyStats, OnboardingWizard, WebchatConfig, AdminMaster, MasterPanel, DashboardSupabase + Login/Signup/Onboarding.

**No sales-spark:** Index (landing), Login, Profile, Settings, Admin, SuperAdmin, Docs, HelpCenter, HelpArticle, BookingConfirmation, PublicBooking, PublicChat, PublicForm, PublicQuiz, PublicQuizRunner, SalesPage, Install, ResetPassword, Unsubscribe, Updates, AcceptInvite, NotFound.

**Nenhum nome de página é compartilhado.** Os domínios são disjuntos:
- NexvyOficinas: vertical oficina (Clientes, Veículos, OS, Orçamentos)
- Sales-spark: horizontal SaaS marketing/vendas (Booking, Quiz, Forms, Public landing pages)

A página "Inbox" do NexvyOficinas **não existe** no sales-spark (lá o atendimento é em `Index.tsx → AttendancePanel`).

### Hooks de inbox

| Sales-spark | NexvyOficinas | Match |
|---|---|---|
| useAcceptConversation | (lógica em AcceptTicketBar) | 🔄 inlined |
| useAttendancePanel | (lógica em Inbox.tsx) | 🔄 inlined |
| useTypingIndicator | useTypingIndicator | ✅ |
| useAudioRecorder | (composer/AudioRecorder.tsx) | 🔄 componentizado |
| useMediaUpload | useMediaUpload | ✅ |
| useInboxNotifications | useInboxNotifications | ✅ |
| useMessageReactions | useMessageReactions | ✅ |
| useQuickReplies | useQuickReplies | ✅ |
| useAIInsights / useAIQuality / useAIRouting | — | ❌ não importado |
| useCadence / useCadences / useCadenceMutations | — | ❌ não importado |
| useAdminDashboard / useAdminNotifications | — | ❌ fora do escopo |

### Schema do banco — tabelas inbox

**Importadas (~17):** `inbox_conversations`, `inbox_messages`, `inbox_office_hours`, `inbox_keyword_rules`, `inbox_message_templates`, `inbox_assign_log`, `inbox_csat_responses`, `inbox_chatbot_flows`, `inbox_chatbot_nodes`, `inbox_chatbot_sessions`, `inbox_agent_notifications`, `inbox_quick_replies`, `message_reactions`, `evolution_instances`, `empresa_users`, `empresas` (com 10+ colunas inbox), `empresa_api_keys`.

**No sales-spark mas NÃO importadas:**
`conversation_tags`, `agent_tools`, `agent_tool_executions`, `agent_supervisor_rules`, `cadences`, `cadence_steps`, `cadence_enrollments`, `ai_quality_scores`, `ai_routing_logs`, `objections`, `playbooks`, `playbook_steps`, `lead_funnels`, `deal_pipelines`, `kanban_columns`, `knowledge_sources`, `memory_embeddings`, `audio_transcripts` (separado), `webchat_sessions`, `campaign_dispatches`, `campaign_messages`.

---

## Categorias do sales-spark NÃO importadas

### 1. Plataforma SaaS multi-org pesada — NÃO trazer (out of scope estratégico)

- **Super Admin / Admin org management** — sales-spark tem painéis para gerenciar multi-org. NexvyOficinas usa modelo single-tenant-por-cliente.
- **Cadência multi-touch** (cadence-*, ~15 funcs + 8 hooks) — sequência de mensagens em ritmo (cold outreach). Não combina com persona "dono de oficina recebendo cliente".
- **Campanhas de email/SMS em massa** (campaign-*, send-mass-email, send-transactional-email, ~10 funcs) — out of scope.
- **Webchat de venda em sales pages** (webchat-api/bot/inbox legacy) — escopo SaaS marketing.

### 2. Integrações comerciais externas — pular por agora

- **Cakto** (3 funcs): processador de checkout brasileiro.
- **Hotmart** (3 funcs): plataforma de infoprodutos.
- **Sankhya** (3 funcs): ERP empresarial.
- **Doppus** (1 func): checkout.
- **Facebook Leads** (1 func): captura de leads Ads.
- **Google Calendar** (4 funcs): integração de agenda — **pode virar relevante** para Sprint 12+ (agendamento de OS).

### 3. Quiz / Form / Booking / Catalog — produtos paralelos do sales-spark

- **Quiz IA generator** (5 funcs + components): gera quizzes para captura.
- **Forms IA generator** (3 funcs): formulários customizados.
- **Booking system** (5 funcs + components): agendamentos públicos (similares a Calendly).
- **Catalog import/search/sync** (4 funcs): gerenciar catálogo de produtos para WhatsApp Business.

**Decisão:** out of scope para oficina por persona. **Exceção:** Booking poderia virar "agendamento de OS" — vale revisitar no S13+.

### 4. Memória/RAG/Knowledge — útil mas adiar

- **Memory embedder / search** (2 funcs): RAG sobre histórico de conversas.
- **Process knowledge source** (1 func): RAG sobre documentos da empresa.
- **Sales copilot avançado** (1 func): IA com contexto de produtos.

**Decisão:** importar quando NexvyOficinas tiver >100 clientes ativos. Antes disso, o copiloto atual (`inbox-copilot` baseado em Claude direto) é suficiente.

### 5. IA Quality/Routing/Insights — depende de volume

- ~8 funcs e hooks relacionados a AI insights, routing, quality scoring, feedback.
- Útil apenas quando há volume de conversas > 1000/mês por empresa.

**Decisão:** revisitar quando o piloto provar volume.

### 6. Componentes UI fora do escopo

- `components/quiz/`, `components/booking/`, `components/playbook/`, `components/objections/`, `components/lead/`, `components/seller/`, `components/cadence/`, `components/goals/` (parcial), `components/brain/`
- Total: ~200 componentes não importados.

**Decisão:** já não importados, não importar.

---

## Recomendações para Sprint 11+

### Sprint 11 (sugerido) — "CRM 360 no inbox"
**Objetivo:** transformar o painel de contexto CRM em hub central da conversa.
- F1: Tags de conversa (filtro + cor)
- F2: Notas no contato (não na conversa)
- F3: Lembretes manuais de follow-up (calendar + push notification)
- F4: Histórico de transferências timeline na sidebar do ChatArea
- F5: Detecção de intenção do cliente (precificar/agendar/reclamar) via Claude
- F6: Atalho "criar OS" direto da conversa

### Sprint 12 — "Operação enterprise"
- F1: Broadcast com segmentação (filtros: cliente VIP, OS aberta, sem visita há 90d)
- F2: Cron de SLA breach → dispara alerta WhatsApp ao gerente
- F3: Mute conversas (silence até data X)
- F4: Importação CSV de contatos com de-dup
- F5: Permissões granulares (RBAC: admin/atendente/leitor)
- F6: Audit log + exportação compliance

### Sprint 13 — "Agendamento e produtividade IA"
- F1: Integração Google Calendar (agendamento de OS via chat)
- F2: Resumo automático de conversa ao fechar (via Claude)
- F3: Editor visual drag-and-drop do chatbot
- F4: Variáveis dinâmicas em mensagens (`{{nome_cliente}}`)
- F5: Workflow builder simples (gatilho → ação)
- F6: PWA + push notifications nativas

### O que NÃO recomendar
- Não puxar quiz/forms/booking públicos do sales-spark — escopo do persona vendedor, não dono de oficina.
- Não puxar integrações Hotmart/Cakto/Doppus — sem caso de uso.
- Não puxar memória embeddings antes de >100 clientes — over-engineering.

---

## Apêndice — arquivo por arquivo

### Sales-spark NÃO importado (top categorias)

| Pasta | Arquivos | Importado? |
|---|---|---|
| `src/components/cadence/` | ~15 | ❌ out of scope |
| `src/components/quiz/` | ~12 | ❌ out of scope |
| `src/components/booking/` | ~10 | ❌ adiar (Sprint 13 candidato) |
| `src/components/playbook/` | ~8 | ❌ out of scope |
| `src/components/objections/` | ~6 | 🟡 conceito útil; objection-preemptor poderia virar feature do copilot |
| `src/components/seller/` | ~30 (perfil de vendedor, performance) | 🔄 parcial: MyStats cobre ~40% |
| `src/components/lead/` | ~20 | ❌ os Leads do NexvyOficinas têm pages própria não-importada |
| `src/components/brain/` | ~10 (RAG/memória) | ❌ adiar |
| `src/components/admin/` | ~25 | ❌ multi-org out of scope |
| `src/components/superadmin/` | ~15 | ❌ idem |

### Edge functions do sales-spark NÃO importadas (top relevantes pra futuro)

| Categoria | Funcs | Sprint sugerido pra reavaliar |
|---|---|---|
| `cadence-*` (5 funcs) | NÃO (out of scope) | nunca |
| `campaign-*` (6 funcs) | NÃO (out of scope) | nunca |
| `booking-*` (3 funcs) | NÃO (adiar) | S13 |
| `google-calendar-*` (4 funcs) | NÃO (adiar) | S13 |
| `memory-*` (2 funcs) | NÃO (adiar) | S15+ (volume-dependent) |
| `ai-followup-cron`, `auto-notifications`, `auto-promote-*` | NÃO (já temos análogos) | nunca |
| `analyze-conversation`, `evaluate-conversation` | NÃO (depende de volume) | S13+ |
| `daily-report-ai` | NÃO (Relatórios já cobre) | nunca |
| `firecrawl-*` (3 funcs — RAG de sites externos) | NÃO | S15+ |
| `funnel-*` (5 funcs — funis de captura) | NÃO (out of scope) | nunca |
| `quiz-*`, `form-*` (~10 funcs) | NÃO (out of scope) | nunca |

---

## Conclusão executiva

**Paridade efetiva inbox: ~58%** (foi 18% há 2 dias). Os 42% restantes se dividem em:
- **~12% absolutamente fora de escopo** (cadência, campanhas, quiz, booking, integrações comerciais externas)
- **~18% relevante mas adiar** (RAG, IA avançada, Calendar, workflow builder)
- **~12% relevante e P0/P1** — base do roadmap S11-S13 acima

**Diferença arquitetural permanente:** NexvyOficinas usa **components colocados em `inbox/`** vs sales-spark usa **hooks + páginas centralizadas**. Não há "tudo importado" possível — é re-implementação inspirada, não cópia.

**O que importou foi a inteligência funcional:** os fluxos (CSAT, SLA, auto-assign, follow-up, chatbot, transferência) — não o código. Trade-off: mais trabalho de implementação, manutenção mais simples a longo prazo (sem N hooks compartilhados em pages de domínios diferentes).

**Próximo passo recomendado:** Sprint 11 com foco em CRM 360 (tags, notas, lembretes manuais, atalho criar-OS) — fecha o gap onde o atendimento conversacional encontra o operacional da oficina. Estimativa: 2 semanas; entregaria os 5 P0/P1 que faltam por mais relevância no nicho.
