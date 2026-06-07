# Auditoria: sales-spark-ai-47 → NexvyOficinas (módulo Inbox WhatsApp)

> **Data:** 2026-06-07
> **Autor:** Marcelo Silva (com auditoria automática via Claude Code Workflow paralelo — 6 agentes, 741k tokens, 11 min)
> **Repos analisados:**
> - Origem: [`mfalcao09/sales-spark-ai-47`](https://github.com/mfalcao09/sales-spark-ai-47) (CRM completo)
> - Destino: [`mfalcao09/SaasPlugin_vite`](https://github.com/mfalcao09/SaasPlugin_vite) — `apps/NexvyOficinas/` (piloto inbox)

---

## TL;DR

| Métrica | Valor |
|---|---|
| **Paridade atual com sales-spark (escopo inbox)** | **~18%** |
| Features implementadas no NexvyOficinas | 15 |
| **Faltam — críticas (P0/P1)** | **34** |
| Faltam — extended (P2/P3) | 26 |
| Out of scope (não trazer) | 12 |
| **Bugs de schema descobertos na auditoria** | **2 P0** |

**Veredito:** o que foi instalado é um **MVP funcional do inbox** (lista realtime + chat realtime + envio de texto + setup de instâncias). Pra virar "atendimento profissional" como o sales-spark, faltam **3 sprints de 2 semanas** focadas em mídia → fila → CRM integration. Tudo depois disso (copiloto IA, transcrição, campanhas, multi-agente, RAG) é opcional e pode ser priorizado conforme demanda real dos pilotos.

**Não trazer do sales-spark:** kanban de deals, comissões, capture/funis, Cakto/Hotmart/Sankhya, multi-canal (Instagram/SMS/email), webchat widget — fora do persona "dono de oficina".

---

## Sumário

1. [Bugs encontrados na auditoria](#bugs-encontrados-na-auditoria)
2. [O que JÁ está implementado (paridade ✓)](#o-que-já-está-implementado-paridade-)
3. [Faltam — críticas (P0/P1) — 34 itens](#faltam--críticas-p0p1--34-itens)
4. [Faltam — extended (P2/P3) — 26 itens](#faltam--extended-p2p3--26-itens)
5. [Out of scope (não migrar) — 12 itens](#out-of-scope-não-migrar--12-itens)
6. [Roadmap proposto — 3 sprints](#roadmap-proposto--3-sprints)
7. [Apêndice: inventário sales-spark](#apêndice-inventário-sales-spark)

---

## Bugs encontrados na auditoria

### 🐞 BUG-1 (P0) — EvolutionSettings.tsx lê colunas inexistentes
**Arquivo:** `apps/NexvyOficinas/src/components/inbox/EvolutionSettings.tsx`
**Problema:** o `select(...)` pede `instance_name, display_name, connected_phone` — colunas que **não existem** na tabela `public.evolution_instances`. Schema real tem: `name, instance_id, phone_number`.
**Impacto:** UI mostra `undefined` em produção. Display name e telefone conectado nunca aparecem.
**Fix:**
```diff
- .select('id,instance_name,display_name,status,qr_code,connected_phone')
+ .select('id,name,instance_id,phone_number,status,qr_code,is_default')
```
E ajustar todas as referências `inst.display_name → inst.name`, `inst.connected_phone → inst.phone_number`.
**Esforço:** S (15 min)

### 🐞 BUG-2 (P0) — ChatArea.tsx lê colunas inexistentes em inbox_messages
**Arquivo:** `apps/NexvyOficinas/src/components/inbox/ChatArea.tsx`
**Problema:** o `select(...)` pede `media_url, media_type, status` — esses **não são colunas** da tabela. As infos de mídia vivem em `metadata jsonb` e `inbox_messages` **não tem** coluna `status` (delivery status nunca foi modelado).
**Impacto:** preview de imagem inbound sempre retorna `undefined` → não renderiza. Status de envio inexistente.
**Fix:**
```diff
- .select('id,sender_type,content,media_url,media_type,created_at,status')
+ .select('id,sender_type,content,content_type,metadata,created_at')
```
E adaptar o render: `m.media_type` → `m.content_type`, `m.media_url` → `m.metadata?.url`.
**Esforço:** S (30 min)

---

## O que JÁ está implementado (paridade ✓)

| # | Feature | Evidência |
|---|---|---|
| 1 | Lista de conversas com realtime | `ConversationList.tsx` — query em `inbox_conversations` limitada a 100, ordem desc por `last_message_at`, subscription realtime filtro `empresa_id`, busca client-side por nome/telefone |
| 2 | Área de chat com mensagens realtime | `ChatArea.tsx` — carrega últimas 200 msgs asc, realtime INSERT em `inbox_messages`, auto-scroll |
| 3 | Envio de mensagem de texto | `ChatArea.tsx` invoca `supabase.functions.invoke('evolution-send', { type:'text' })` com Enter para enviar |
| 4 | Reset de unread count ao abrir | RPC `reset_unread_count(conv_id)` chamada `on open` |
| 5 | Badge de status (4 estados) | Labels: bot_active / waiting_human / human_active / closed |
| 6 | Disable de envio em conversa fechada | Input desabilitado quando `status==='closed'` |
| 7 | Preview básico de imagem inbound | (parcial — quebrado por BUG-2 acima) |
| 8 | Setup de instâncias Evolution | `EvolutionSettings.tsx` — list/create/qrcode/delete via `evolution-proxy` + polling de QR a cada 4s + auto-stop ao conectar |
| 9 | Edge Function `evolution-proxy` | verify_jwt=true, resolve empresa via `empresa_users`, 4 actions principais |
| 10 | Edge Function `evolution-send` | Resolve `instance_id` por empresa, envia texto + mídia + áudio via Evolution Go |
| 11 | Edge Function `evolution-webhook` | Recebe MESSAGES_UPSERT/CONNECTION_UPDATE/QRCode, dedup, RPC `find_or_create_inbox_conversation` (race-safe), `increment_unread_count` |
| 12 | Roteamento `/inbox` | `App.tsx` rota dentro de `<AppLayout/>` privado guardado por user + empresaId |
| 13 | Nav item "Inbox WhatsApp" | `AppLayout.tsx` no `salesNav` (ícone MessageSquare, orange:true) |
| 14 | Layout two-pane (lista + chat) | `Inbox.tsx` 320px lista + flex chat com empty state |
| 15 | Empty state com CTA | `ConversationList.tsx` mostra dica quando lista vazia |

---

## Faltam — críticas (P0/P1) — 34 itens

> **Critério P0:** sem isso, inbox não é viável como ferramenta de atendimento profissional.
> **Critério P1:** sem isso, operador sofre mas consegue trabalhar.

### Bloco A — Mídia (P0, sem isso não é WhatsApp)

| # | Feature | Esforço | Caminho de implementação |
|---|---|---|---|
| 1 | **Upload e envio de imagens** | M | `components/inbox/composer/MediaUploadButton.tsx` + `MediaPreview.tsx` + `hooks/useMediaUpload.ts`. Storage bucket `inbox-media`. Reaproveita `evolution-send { type:'image' }` |
| 2 | **Envio de áudio (gravação inline)** | M | `composer/AudioRecorder.tsx`. MediaRecorder API + fallback webm/opus + timer mm:ss + min 500ms. Reaproveita `AudioRecorder` do sales-spark |
| 3 | **Envio de documentos (PDF/DOCX)** | M | `composer/DocumentPicker.tsx` + `messages/DocumentBubble.tsx`. Drag&drop, valida pdf/docx/xlsx, `evolution-send { type:'document' }` |
| 4 | **Player de áudio inline (inbound)** | S | `messages/AudioBubble.tsx`. `<audio controls>` + waveform opcional. Detectar via `metadata.content_type === 'audio'` |
| 5 | **Render de sticker e vídeo** | S | `messages/StickerBubble.tsx` + `VideoBubble.tsx` |
| 6 | Render de localização e contato | S (P1) | `messages/LocationBubble.tsx` (thumb Maps + abrir) + `ContactBubble.tsx` (nome+tel + "Adicionar cliente") |
| 7 | **Download automático de mídia → Storage** | M | `process-media-message` edge function. Baixa via `/chat/getBase64FromMediaMessage`, salva em `inbox-media`. Adicionar `storage_url` em `inbox_messages` |

### Bloco B — Operação de fila (P0, sem isso só funciona 1 operador)

| # | Feature | Esforço | Caminho de implementação |
|---|---|---|---|
| 8 | **Filtros e tabs de fila** (Atendendo / Em fila / Resolvidos / Minhas) | L | Refator de `ConversationList.tsx` com tabs + `ConversationFilters.tsx`. Edge function `inbox-conversations-list` server-side com filtros |
| 9 | **Aceitar conversa da fila** | M | `AcceptTicketBar.tsx` + `AcceptTicketDialog.tsx` + `hooks/useAcceptConversation.ts`. Edge function `inbox-actions action=accept`. Update `accepted_at`/`accepted_by` |
| 10 | **Transferir conversa entre agentes/setores** | L | `TransferConversationDialog.tsx`. Tabelas novas: `inbox_sectors`, `conversation_transfers`. Coluna `sector_id` em `inbox_conversations` |
| 11 | **Encerrar / reabrir conversa** | S | `CloseConversationButton.tsx`. Edge function `inbox-actions action=close|reopen`. Colunas `closed_at`, `closed_by`, `close_reason` |
| 12 | **Pausar bot / Reativar bot** | S | `BotToggleButton.tsx`. Colunas `bot_paused_until`, `bot_disabled`. Webhook respeita flag |
| 13 | Atribuição manual a usuário | S (P1) | `AssignUserDialog.tsx`. `assigned_user_id` já existe — adicionar índice |
| 14 | **Notas internas** (msg só visível ao time) | S | `composer/InternalNoteToggle.tsx` + `messages/InternalNoteBubble.tsx`. `sender_type='internal_note'` + flag `is_internal`. **Nunca** trafega pra Evolution |

### Bloco C — UX essencial de mensageria (P0/P1)

| # | Feature | Esforço | Caminho de implementação |
|---|---|---|---|
| 15 | **Quick Replies** (templates) | M | Tabela `inbox_quick_replies` **já existe e está vazia**. Criar `composer/QuickRepliesPopover.tsx` + `pages/app/settings/QuickRepliesPage.tsx`. Trigger `/` no textarea |
| 16 | Indicador de digitando (typing) | M (P1) | `TypingIndicator.tsx` + `hooks/useConversationPresence.ts` via Supabase Realtime broadcast (não persistir), debounce 2s |
| 17 | **Status de mensagem (sent/delivered/read)** | M | Coluna `delivery_status` enum + `read_at` em `inbox_messages`. Estender `evolution-webhook` para tratar `MESSAGES_UPDATE`. Ícone tipo WhatsApp (✓, ✓✓, azul) |
| 18 | Reply / citação de mensagem | M (P1) | `ReplyPreview.tsx` + `composer/ReplyingTo.tsx`. Coluna `reply_to_message_id` FK. `evolution-send` aceita `quoted_message_id` |
| 19 | Reações de emoji | M (P1) | `MessageReactions.tsx` + `ReactionPicker.tsx`. Tabela nova `message_reactions`. `evolution-send type='reaction'` já existe |
| 20 | Editar e apagar mensagem enviada | M (P1) | `MessageActionsMenu.tsx` + `EditMessageDialog.tsx`. Colunas `edited_at`, `original_content`, `is_deleted` |
| 21 | Encaminhar mensagem | M (P2) | `ForwardMessageDialog.tsx`. Coluna `forwarded_from_message_id` |
| 22 | Favoritar / estrelar mensagem | S (P2) | `StarToggle.tsx` + `StarredMessagesPanel.tsx`. Coluna `is_starred` |
| 23 | Pesquisa dentro da conversa | M (P1) | `MessageSearch.tsx` no header da ChatArea. Busca ilike no content |
| 24 | **Paginação infinita scroll-up** | M | Hoje só 200 mensagens — antigas inacessíveis. `IntersectionObserver` no topo, +100 por batch, cursor em `created_at` |

### Bloco D — Integração CRM da oficina (P0)

| # | Feature | Esforço | Caminho de implementação |
|---|---|---|---|
| 25 | **Vinculação cliente/OS/lead** | L | `sidebar/ConversationSidebar.tsx` + `LinkClienteDialog.tsx` + `CreateOSButton.tsx`. Edge `inbox-actions action=link-cliente|create-os`. Colunas `cliente_id`, `ordem_servico_id`, `veiculo_id` em `inbox_conversations` |
| 26 | Tags / labels nas conversas | M (P1) | `ConversationTags.tsx` + `InboxTagsPage.tsx`. Tabelas `inbox_tags` + `conversation_tags` |
| 27 | Histórico de atendimentos do contato | M (P1) | `sidebar/ConversationHistoryList.tsx` + `hooks/useVisitorHistory.ts`. Query por `contact_phone` agrupado |
| 28 | **Compose nova conversa outbound** | M | `NewConversationDialog.tsx`. Edge `inbox-actions action=start-conversation`. Pesquisa cliente + escolhe instância + primeira mensagem |

### Bloco E — Plataforma / responsivo (P0/P1)

| # | Feature | Esforço | Caminho de implementação |
|---|---|---|---|
| 29 | Deep-link `/inbox/:conversationId` | S (P1) | `useParams` + sync com state. `useNavigate` na list |
| 30 | **Layout mobile (colapso de panes)** | M | `useIsMobile` + `MobileBackButton.tsx`. Em mobile: só lista OU só chat |
| 31 | Notificações sonoras + push | S (P1) | `SoundToggle.tsx` + `hooks/useNotificationSound.ts`. Realtime listener + Notification API. Toggle persistido em localStorage |
| 32 | Avatar do contato (foto) | S (P2) | Usar `contact_avatar_url`. `evolution-webhook` extrai `profilePicUrl` |
| 33 | **Reconectar / logout / restart instância** | S | Botões na `EvolutionSettings.tsx`. `evolution-proxy` já tem actions, só wirar |
| 34 | Toggle de instância padrão (`is_default`) | S (P1) | Star/check toggle. `evolution-proxy action=set_default` atomicidade |

---

## Faltam — extended (P2/P3) — 26 itens

> **Critério P2/P3:** valor agregado, mas inbox profissional roda sem. Priorizar conforme demanda dos pilotos.

### IA / Copiloto (5 itens)

| # | Feature | Esforço | Esboço |
|---|---|---|---|
| 1 | Resumo IA da conversa (score + métricas) | L | `analyze-conversation` edge function (já existe no sales-spark). Tabela `conversation_analyses`. Reaproveitar `AISummaryTab` |
| 2 | Sugestão de próxima resposta (AI suggest reply) | M | Botão no composer. Edge `suggest-reply` LLM com prompt da empresa + histórico |
| 3 | Transcrição automática de áudio | M | Edge `transcribe-audio` (Whisper/Gemini). Coluna `transcript` em `inbox_messages` |
| 4 | Análise de sentimento + priorização | L | Edge `sentiment-analyzer`. Colunas `sentiment`, `urgency_score`. Lista ordena por urgency |
| 5 | Memória semântica do cliente (RAG) | XL | Edge `memory-search`. Tabela `lead_semantic_memory` com `embedding vector(1536)`. Bot consulta no início |

### Automação (5 itens)

| # | Feature | Esforço | Esboço |
|---|---|---|---|
| 6 | Mensagens agendadas | L | `ScheduleMessageDialog.tsx`. Tabela `scheduled_messages`. Edge `send-scheduled-messages` (pg_cron 1/min) |
| 7 | Follow-up automático após X dias sem resposta | L | `FollowUpRulesPage.tsx`. Tabelas `followup_rules` + `followup_log`. Cron diário |
| 8 | Campanhas em massa (broadcast) | XL | `CampanhasPage.tsx` + `CampaignBuilder.tsx`. Tabelas `campaigns` + `campaign_recipients`. Respeita 80msg/min Evolution + templates aprovados |
| 9 | Templates WhatsApp Business (aprovados) | L | `MessageTemplatesPage.tsx` + `TemplatePicker.tsx`. Tabela `message_templates`. Conversa fora janela 24h exige template |
| 10 | Multi-agentes IA por especialidade (SDR/Closer/Suporte) | XL | `AgentsPage.tsx` + orquestrador de intent. Tabela `inbox_agents` + coluna `current_agent_id` |

### Bot / Configuração (4 itens)

| # | Feature | Esforço | Esboço |
|---|---|---|---|
| 11 | Bot configurável (system prompt, KB, FAQ) | XL | `BotConfigPage.tsx` + `SystemPromptEditor.tsx` + `KnowledgeBaseManager.tsx`. Tabela `inbox_bot_configs` |
| 12 | Handoff automático bot→humano | M | Trigger em `webchat-bot`. `handoff_triggers jsonb` em `inbox_bot_configs` |
| 13 | Horário comercial + msg fora expediente | M | `BusinessHoursPage.tsx`. Tabelas `inbox_business_hours` + `offline_message` |
| 14 | Reactions de bot/sistema (✓ recebido) | S | `evolution-send type=reaction` já existe — só wirar |

### Outros operacionais (12 itens)

| # | Feature | Esforço |
|---|---|---|
| 15 | Timeline / journey da conversa (transferências) | M |
| 16 | Painel de contexto do cliente (sidebar direita rica) | L |
| 17 | Catálogo de produtos/serviços enviável no chat | L |
| 18 | Link de agendamento gerado a partir do chat | S |
| 19 | Enquetes (polls WhatsApp interativos) | M |
| 20 | Dashboard de atendimento (KPIs) | L |
| 21 | Anti-spam e blocklist de contatos | S |
| 22 | Múltiplas instâncias WhatsApp por empresa (UI explícita) | M |
| 23 | Webhook configurator UI (subscribe + status check) | S |
| 24 | Audit log de ações do operador | M |
| 25 | Indicador de presença do operador (online/away) | S |
| 26 | Vinculação produto na conversa | S |

---

## Out of scope (não migrar) — 12 itens

| # | Feature do sales-spark | Por que NÃO trazer pra NexvyOficinas |
|---|---|---|
| 1 | Kanban de deals + pipeline de vendas B2B | Equivalente já existe: fluxo de ordens de serviço |
| 2 | Gestão de comissões e metas individuais | Oficina mede produtividade por OS, não por conversa fechada |
| 3 | Planos e billing de super-admin SaaS | Billing centralizado pelo super-app Nexvy, não no módulo |
| 4 | Capture/landing pages + funis de conversão | Leads de oficina vêm de Google Maps/indicação/WhatsApp direto |
| 5 | Booking calendar tipo Calendly (slots) | Agendamento via OS/agenda mecânica (já no app) |
| 6 | Integração Cakto / Hotmart | Infoproduto digital não é negócio de oficina |
| 7 | Integração Sankhya ERP | Sankhya é corporativo; oficina futura seria Bling/Tiny/Omie |
| 8 | Multi-canal Instagram DM / SMS / Email no inbox | Escopo NexvyOficinas é **WhatsApp-first** |
| 9 | Widget de webchat embedável em site | Oficina raramente tem site com chat |
| 10 | Webhooks BotConversa / IsiChat (legados) | Nasce direto na Evolution, dispensa compat |
| 11 | Análise de chamadas telefônicas / VOIP | Fora do escopo; entraria em módulo separado |
| 12 | CPQ (Configure Price Quote) avançado B2B | Orçamento de oficina é simples (peça+mão de obra) |

---

## Roadmap proposto — 3 sprints

### 🚀 Sprint 1 — "WhatsApp funcional de verdade" (2 semanas)

**Objetivo:** operador consegue trocar mídia e conversa flui sem bugs.

- 🐞 Fix BUG-1 (EvolutionSettings columns)
- 🐞 Fix BUG-2 (ChatArea columns)
- 📷 Upload e envio de **imagens**
- 🎙️ Envio de **áudio** (gravação inline)
- 📄 Envio de **documentos**
- 🔊 **Player de áudio inline** (inbound)
- 🎨 Render de sticker + vídeo
- 📱 **Layout mobile** (colapso panes)
- 🔗 Deep-link `/inbox/:id`
- 📊 Status badge correto + paginação infinita scroll-up
- 🔌 Botões reconectar/logout em EvolutionSettings + fix is_default

**Entregável:** atendimento WhatsApp completo de mídia, mobile-first.

---

### 🚀 Sprint 2 — "Operação de fila multi-agente" (2 semanas)

**Objetivo:** mais de um operador consegue trabalhar em paralelo sem caos.

- 📋 **Filtros e tabs de fila** (Em fila / Atendendo / Resolvidos / Minhas)
- ✅ Aceitar conversa da fila
- ↔️ Transferir conversa entre usuários/setores
- 🔒 Encerrar / reabrir conversa
- 🤖 Pausar bot / Reativar bot
- 👤 Atribuição manual a usuário
- 📝 **Notas internas** (msg só interna)
- ⚡ **Quick Replies** (templates + atalhos /)
- 📞 Compose nova conversa outbound
- 🔔 Notificações sonoras + push

**Entregável:** mesa de atendimento operacional pra 3-10 operadores.

---

### 🚀 Sprint 3 — "Inbox 360 + integração CRM oficina" (2 semanas)

**Objetivo:** conversa vira OS no mesmo app, com contexto rico.

- 🚗 **Vinculação cliente / OS / veículo** na conversa
- 🏷️ Tags / labels + filtro
- 📚 Histórico de atendimentos do contato
- 💬 Reply / citação de mensagem
- ✏️ Editar e apagar mensagem enviada
- 😀 Reações de emoji
- 🔍 Pesquisa dentro da conversa
- ✓✓ **Status de leitura** (sent/delivered/read) + ícones WhatsApp
- ⌨️ Indicador de digitando
- 👁️ Sidebar de contexto do cliente (veículos, últimas OS, LTV)
- 🖼️ Download automático de mídia → Storage permanente
- 📸 Avatar do contato (foto)

**Entregável:** inbox profissional integrado ao CRM da oficina.

---

### Roadmap extended (depois)

Sprints 4+ atacam IA (copiloto, transcrição, sentimento, RAG), automação (campanhas, follow-up, templates aprovados, multi-agente) e analytics. Priorizar caso a caso conforme demanda dos pilotos.

---

## Replicação para os outros 4 SaaS

Após Sprint 1 estabilizar em NexvyOficinas, replicar para:
- **NexvyFoods** — adaptações: cliente → mesa/comanda, OS → pedido, veículo → produto
- **NexvyBeauty** — adaptações: cliente → cliente fidelidade, OS → agendamento, veículo → serviço
- **NexvyGYM** — adaptações: cliente → aluno, OS → plano/aula, veículo → modalidade
- **BarbeiroPro** — adaptações: cliente → cliente, OS → agendamento, veículo → corte/serviço

Estimativa: 2-3 dias por app após o template em NexvyOficinas estar consolidado (componentes UI reaproveitáveis, schema-per-app igual, edge functions idênticas).

---

## Apêndice: inventário sales-spark

### Componentes seller/inbox (35 arquivos)
`AISummaryTab`, `AcceptTicketDialog`, `AudioRecorder`, `CatalogPickerDialog`, `ChannelBadge`, `ChatArea`, `ChatInput`, `ContactPickerDialog`, `ConversationAnalysisPanel`, `ConversationHistoryList`, `ConversationList`, `EditVisitorDialog`, `EmptyInboxState`, `ForwardMessageDialog`, `InboxMetricsHeader`, `InboxProductSelector`, `InternalNotes`, `JourneyTimeline`, `LeadContextPanel`, `MediaAttachment`, `MediaPreviewBar`, `MessageBubble`, `MessageBubbleWithButtons`, `MessageReactions`, `PaymentLinkDialog`, `PollComposerDialog`, `QuickActionBar`, `QuickRepliesPopover`, `ScheduleFollowupDialog`, `ScheduleMessageDialog`, `SendCadenceDialog`, `SendFlowDialog`, `StartConversationDialog`, `TransferConversationModal`, `TypingIndicator`. **Mais:** `inbox/AcceptTicketBar` + `inbox/InboxFiltersDrawer`.

### Edge Functions de inbox (21 mapeadas)
- **Core Evolution:** `evolution-proxy`, `evolution-send`, `evolution-webhook` ✓ (já no NexvyOficinas)
- **WebChat:** `webchat-api`, `webchat-bot` (motor IA multi-agente), `webchat-inbox` (CRUD interno)
- **Outbound:** `start-whatsapp-conversation`, `manual-outreach`, `process-scheduled-messages`
- **Mídia:** `process-media-message`, `transcribe-audio`
- **IA:** `agent-handoff-greeter`, `agent-supervisor`, `analyze-conversation`, `evaluate-conversation`, `sales-copilot`, `ai-followup-cron`
- **Memória:** `memory-embedder`, `memory-search`
- **Catálogo:** `send-catalog-item`
- **Legado:** `whatsapp-webhook` (410 Gone)

### Tabelas DB relevantes a inbox (13 + funções)
- **Core:** `evolution_instances`, `webchat_conversations`, `webchat_messages`, `webchat_widgets`, `webchat_agent_configs`
- **Operação:** `webchat_assignment_events`, `conversation_notes`, `conversation_transfers`, `message_reactions`, `scheduled_messages`, `quick_replies`, `chat_flows`
- **Suporte:** `support_tickets`, `support_messages`
- **Funções críticas:** `inbox_count_conversations(...)`, `inbox_list_conversations(...)`, trigger `enforce_single_attendant` (humano XOR IA), `fill_default_sector`, `validate_scheduled_message_status`

### Hooks de inbox (11)
`useAcceptConversation`, `useAttendancePanel`, `useConversationJourney`, `useConversationPresence`, `useEvolutionInstances`, `useMediaUpload`, `useMessageReactions`, `useWebChat`, `useAudioRecorder`, `useVisitorHistory`, `useChatFlows`

---

**Versionamento:** primeiro relatório (sem sufixo). Versões futuras: `_v2`, `_v3`, ... conforme regra Smart Versioning.
