# Sprint 8 — "Produtividade do Agente: Templates, Notas, Transferência & Chatbot de Fluxo"

**Objetivo:** aumentar a produtividade dos agentes humanos (respostas rápidas, notas internas, transferência entre agentes) e adicionar automação avançada (chatbot de fluxo visual) — tornando o inbox competitivo com ferramentas enterprise como Zendesk e Freshchat.

**Projeto:** NexvyOficinas (`apps/NexvyOficinas/`)
**Supabase project_id:** `gpxmkximudukbljrvtxj`
**Branch:** main

---

## Features (F1–F6)

| # | Feature | Esforço | Impacto |
|---|---|---|---|
| F1 | Templates de Resposta Rápida | S | ⭐⭐⭐ Produtividade diária |
| F2 | Notas Internas entre Agentes | M | ⭐⭐⭐ Colaboração |
| F3 | Transferência de Conversa | M | ⭐⭐⭐ Operação multi-agente |
| F4 | Chatbot de Fluxo (árvore de decisão) | L | ⭐⭐⭐ Automação avançada |
| F5 | Notificações Internas (badges) | M | ⭐⭐ UX/Engajamento |
| F6 | Dashboard Individual do Agente | M | ⭐⭐ Motivação/Gamificação |

⚠️ **IMPORTANTE:** NÃO modificar `InboxMetrics.tsx` neste sprint — esse arquivo pode estar sendo editado pelo agente do Sprint 7 F6.

---

## F1 — Templates de Resposta Rápida

### Migration `sprint8_templates`
```sql
CREATE TABLE IF NOT EXISTS public.inbox_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  shortcut text,  -- ex: "/orcamento", "/obrigado"
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (empresa_id, shortcut)
);
ALTER TABLE public.inbox_message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresa members manage templates" ON public.inbox_message_templates
  FOR ALL USING (empresa_id IN (SELECT empresa_id FROM public.empresa_users WHERE user_id = auth.uid()));
```

### Novo componente `src/components/inbox/MessageTemplatesManager.tsx`
- Lista de templates com Edit/Delete inline
- Form: title + content + shortcut (opcional, deve começar com "/")
- Toggle ativo/inativo por template
- Busca/filtro por título

### Integração no `Composer.tsx`
- Botão `FileText` na barra do compositor abre popover de templates
- Ao digitar "/" no textarea: auto-suggest de templates pelo shortcut (fuzzy match)
- Clicar/selecionar template: substitui conteúdo do textarea

### Modificar `EvolutionSettings.tsx`
Nova aba `templates` → renderiza `<MessageTemplatesManager empresaId={empresaId} />`

---

## F2 — Notas Internas entre Agentes

### Migration `sprint8_internal_notes`
```sql
-- Reutiliza inbox_messages com content_type = 'internal_note'
-- Apenas adicionar índice para performance
CREATE INDEX IF NOT EXISTS idx_inbox_messages_content_type
  ON public.inbox_messages(conversation_id, content_type);
```

### Modificar `ChatArea.tsx`
- Botão `StickyNote` no header (toggle "modo nota interna")
- Quando ativo: fundo do compositor muda para âmbar (`bg-amber-900/30`, borda `border-amber-500/50`)
- Label visível "📝 Nota interna — não será enviada ao cliente"
- Ao enviar: INSERT em `inbox_messages` com `content_type = 'internal_note'`, `sender_type = 'agent'`
- NÃO chama Evolution API — apenas salva no banco

### Modificar `MessageBubble.tsx`
- Case `content_type === 'internal_note'`:
  - Render: fundo âmbar semi-transparente, ícone `StickyNote`, texto em itálico
  - Badge "Nota interna" no topo da bolha
  - Visível apenas na UI do agente (aparece para todos os agentes da empresa)

---

## F3 — Transferência de Conversa entre Agentes

### Migration `sprint8_transfer_log`
```sql
ALTER TABLE public.inbox_assign_log
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS transferred_from uuid REFERENCES auth.users(id);
```

### Novo componente `src/components/inbox/TransferDialog.tsx`
- Props: `{ conversationId: string; empresaId: string; currentAssignedId?: string; onClose: () => void }`
- Lista agentes disponíveis: `empresa_users WHERE inbox_available = true AND user_id != currentAssignedId`
- Exibe: nome do agente + quantidade de conversas ativas (badge)
- Campo "Motivo da transferência" (opcional)
- Botão "Transferir" → UPDATE `inbox_conversations SET assigned_user_id` + INSERT `inbox_assign_log` com transferred_from + reason

### Modificar `ChatArea.tsx`
- Botão `ArrowRightLeft` no header → abre `<TransferDialog />`
- Exibir apenas quando a conversa tiver `assigned_user_id` preenchido e status não for 'closed'

---

## F4 — Chatbot de Fluxo (árvore de decisão)

### Migration `sprint8_chatbot_flows`
```sql
CREATE TABLE IF NOT EXISTS public.inbox_chatbot_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean DEFAULT false,
  trigger_keywords text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.inbox_chatbot_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresa members manage flows" ON public.inbox_chatbot_flows
  FOR ALL USING (empresa_id IN (SELECT empresa_id FROM public.empresa_users WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.inbox_chatbot_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.inbox_chatbot_flows(id) ON DELETE CASCADE,
  node_type text NOT NULL CHECK (node_type IN ('message', 'question', 'end')),
  message text NOT NULL,
  options jsonb DEFAULT '[]',
  is_root boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inbox_chatbot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  contact_phone text NOT NULL,
  flow_id uuid NOT NULL REFERENCES public.inbox_chatbot_flows(id) ON DELETE CASCADE,
  current_node_id uuid REFERENCES public.inbox_chatbot_nodes(id),
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  UNIQUE (empresa_id, contact_phone, flow_id)
);
```

### Lógica no webhook (`evolution-webhook/index.ts`)
Ao receber mensagem: verificar se o contato tem sessão ativa em `inbox_chatbot_sessions` (ended_at IS NULL):
- Se sim: interpretar como resposta ao nó atual → encontrar opção matching → avançar para next_node_id → enviar próxima mensagem
- Se não: verificar se mensagem ativa algum `trigger_keyword` de flow ativo → iniciar sessão + enviar nó raiz (is_root = true)
- Nó `end`: UPDATE ended_at = now(), status do contato volta ao fluxo normal

Executar ANTES de keyword rules. Se sessão de chatbot ativa, não criar conversa normal.

### Novo componente `src/components/inbox/ChatbotFlowEditor.tsx`
- Lista de fluxos com toggle ativo/inativo
- Por fluxo: lista de nós com tipo + mensagem + opções
- Form criar/editar nó: tipo (message/question/end) + mensagem + opções (se question)
- Botão "Definir como nó raiz"

### Modificar `EvolutionSettings.tsx`
Nova aba `chatbot` → renderiza `<ChatbotFlowEditor empresaId={empresaId} />`

---

## F5 — Notificações Internas (badges)

### Migration `sprint8_notifications`
```sql
CREATE TABLE IF NOT EXISTS public.inbox_agent_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('new_conversation', 'transfer', 'mention', 'csat_received')),
  content text NOT NULL,
  conversation_id uuid REFERENCES public.inbox_conversations(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.inbox_agent_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own notifications" ON public.inbox_agent_notifications
  FOR ALL USING (user_id = auth.uid());
```

### Novo componente `src/components/inbox/NotificationBell.tsx`
- Ícone `Bell` com badge numérico (count de `read_at IS NULL`)
- Dropdown ao clicar: lista de notificações recentes (últimas 20)
- Clicar: navega para conversa + UPDATE `read_at = now()`
- Botão "Marcar todas como lidas"
- Realtime via `supabase.channel('notifications-{userId}').on('postgres_changes', ...)`

### Modificar `AppLayout.tsx`
Adicionar `<NotificationBell />` no header ao lado do avatar do usuário.

### Disparar notificações
- `TransferDialog.tsx` → após transferência: INSERT notification tipo 'transfer' para agente receptor
- `evolution-webhook/index.ts` → nova conversa auto-atribuída: INSERT notification tipo 'new_conversation'

---

## F6 — Dashboard Individual do Agente

### Nova página `src/pages/app/MyStats.tsx`
Rota: `/inbox/my-stats`

Métricas do agente logado (filtro de período: últimos 7/30/90 dias):
- Total de conversas atendidas
- CSAT médio (JOIN com `inbox_csat_responses WHERE conversation.assigned_user_id = auth.uid()`)
- TMA (avg de `closed_at - first_response_at`)
- Conversas por dia (bar chart — recharts já instalado)
- Ranking entre agentes da empresa: tabela com todos agentes, ordenado por CSAT desc
- Badge de nível: 🌱 Iniciante (<10) | 🥉 Bronze (10-50) | 🥈 Prata (51-200) | 🥇 Ouro (201+)

### Adicionar rota em `App.tsx`
```tsx
<Route path="/inbox/my-stats" element={<MyStats />} />
```

### Adicionar link no `AppLayout.tsx`
Menu lateral: item "Meu Desempenho" com ícone `Trophy`, abaixo de "Métricas"

---

## Migrations (aplicar via Supabase MCP em gpxmkximudukbljrvtxj)

1. `sprint8_templates`
2. `sprint8_internal_notes`
3. `sprint8_transfer_log`
4. `sprint8_chatbot_flows`
5. `sprint8_notifications`

(F6 não precisa de migration — usa tabelas existentes)

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| `src/components/inbox/MessageTemplatesManager.tsx` | NOVO |
| `src/components/inbox/TransferDialog.tsx` | NOVO |
| `src/components/inbox/ChatbotFlowEditor.tsx` | NOVO |
| `src/components/inbox/NotificationBell.tsx` | NOVO |
| `src/pages/app/MyStats.tsx` | NOVO |
| `src/components/inbox/composer/Composer.tsx` | MODIFICAR |
| `src/components/inbox/ChatArea.tsx` | MODIFICAR |
| `src/components/inbox/messages/MessageBubble.tsx` | MODIFICAR |
| `src/components/inbox/EvolutionSettings.tsx` | MODIFICAR |
| `src/components/layout/AppLayout.tsx` | MODIFICAR |
| `src/App.tsx` | MODIFICAR |
| `supabase/functions/evolution-webhook/index.ts` | MODIFICAR |

⚠️ NÃO modificar `src/pages/app/InboxMetrics.tsx` neste sprint.

---

## Critério de Done

- [ ] F1: templates CRUD funcional + "/" no Composer filtra por shortcut
- [ ] F2: modo nota interna no ChatArea + render âmbar em MessageBubble
- [ ] F3: TransferDialog lista agentes + transfere + loga reason
- [ ] F4: ChatbotFlowEditor cria fluxos + webhook processa sessão + avança nós
- [ ] F5: NotificationBell com badge realtime + dropdown navegável
- [ ] F6: `/inbox/my-stats` com métricas + ranking + badge de nível
- [ ] 5 migrations aplicadas
- [ ] TypeScript zero erros: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
- [ ] 6 commits atômicos (F1 → F6)

---

## Instruções críticas

⚠️ **REGRA ABSOLUTA:** Read em TODOS os arquivos existentes imediatamente antes de cada Edit.

⚠️ `evolution-webhook/index.ts` tem ~800+ linhas após Sprint 7 — ler COMPLETO.

⚠️ `EvolutionSettings.tsx` tem muitas abas (bot, horários, broadcast, auto_assign, keywords) — ler COMPLETO antes de adicionar novas abas.

⚠️ Verificar git log antes de começar:
```bash
git -C /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite log --oneline -6
```

⚠️ **NÃO tocar em `InboxMetrics.tsx`** — arquivo reservado para o agente do Sprint 7 F6.

⚠️ Chatbot F4: verificar sessão ANTES de keyword rules e ANTES de `find_or_create_inbox_conversation`.

⚠️ Composer.tsx: ler COMPLETO — já tem botões ✨ (copilot) e 🕐 (agendamento) do Sprint 6. Integrar FileText sem quebrar os existentes.
