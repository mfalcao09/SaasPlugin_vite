# Sprint 2 — Gestão de Fila de Atendimento

> **Data:** 2026-06-08
> **Branch:** `main`
> **Supabase project:** `gpxmkximudukbljrvtxj`
> **Stack:** Vite + React 18 + TypeScript + Tailwind + Supabase

---

## Premissas verificadas (Karpathy §8.1)

| Premissa | Valor real no DB |
|---|---|
| Campo de operador na conversa | `assigned_user_id` (não `assigned_operator_id`) |
| Tabela de respostas rápidas | `inbox_quick_replies` — já existe com `id, empresa_id, title, content, shortcut, is_active, created_by, created_at, updated_at` |
| `sender_type` em `inbox_messages` | CHECK: `contact \| agent \| bot` — notas internas usam `sender_type='agent'` + `metadata.is_internal=true` |
| Status de conversa | ENUM `inbox_conversation_status`: `bot_active \| waiting_human \| human_active \| closed` |
| Operadores | `empresa_users` + `auth.users` (tabela `profiles` não existe) |
| RPCs existentes | `reset_unread_count`, `increment_unread_count`, `get_user_empresa_id` — faltam `accept_conversation` e `close_conversation` |

---

## Feature 1 — Status Tabs no ConversationList

### Schema DB
Nenhuma mudança — `status` já existe com ENUM `inbox_conversation_status`.

### Componentes
- **Modificar:** `ConversationList.tsx`
  - Adicionar estado `activeTab: 'all' | 'waiting_human' | 'human_active' | 'closed'`
  - Tabs horizontais abaixo do header/search
  - Filtrar `conversations` por tab
  - Badge numérico por aba (count local dos dados carregados)

### Critério verificável
- Tab "Aguardando" exibe apenas conversas com `status='waiting_human'`
- Badge mostra o count correto de cada aba
- Tab "Todos" selecionada por padrão

---

## Feature 2 — AcceptTicketBar

### Schema DB (migration: `sprint2_accept_conversation_rpc`)
```sql
CREATE OR REPLACE FUNCTION accept_conversation(conv_id uuid, operator_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE inbox_conversations
  SET status = 'human_active', assigned_user_id = operator_id, updated_at = now()
  WHERE id = conv_id AND empresa_id = get_user_empresa_id();
END;
$$;
```

### Componentes
- **Novo:** `AcceptTicketBar.tsx`
  - Renderiza quando `conversation.status === 'waiting_human'`
  - Barra amber/laranja: ícone ⚡ + texto + botão "Aceitar"
  - Chama `supabase.rpc('accept_conversation', { conv_id, operator_id: user.id })`
  - Desaparece via realtime UPDATE do status

- **Modificar:** `ChatArea.tsx`
  - Importar e renderizar `<AcceptTicketBar />` acima da área de mensagens

### Critério verificável
- Botão "Aceitar" muda `status` para `human_active` no DB (verificar via SQL)
- Barra some sem reload (realtime subscription já existente atualiza `conversation`)

---

## Feature 3 — Close Conversation

### Schema DB (migration: `sprint2_close_conversation_rpc`)
```sql
CREATE OR REPLACE FUNCTION close_conversation(conv_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE inbox_conversations
  SET status = 'closed', closed_at = now(), updated_at = now()
  WHERE id = conv_id AND empresa_id = get_user_empresa_id();
END;
$$;
```

### Componentes
- **Modificar:** `ChatArea.tsx`
  - Botão "Encerrar" no header (ao lado do MoreVertical, visível apenas quando `status !== 'closed'`)
  - Modal de confirmação inline (sem biblioteca externa): estado `showCloseModal`
  - Confirmar → `supabase.rpc('close_conversation', { conv_id: conversationId })`
  - Após fechar: Composer já fica disabled por `status === 'closed'`

### Critério verificável
- `SELECT status, closed_at FROM inbox_conversations WHERE id = <id>` → `closed` com timestamp
- Composer fica disabled após encerrar

---

## Feature 4 — Internal Notes

### Schema DB
Nenhuma — usar `sender_type='agent'` + `metadata: { is_internal: true }`.
RLS de `inbox_messages` (SELECT) já exige que a conversa pertença à empresa.
Notas internas NÃO são enviadas para o WhatsApp — só INSERT direto no DB.

### Componentes
- **Modificar:** `MessageBubble.tsx`
  - Detectar `message.metadata?.is_internal === true`
  - Visual: `bg-amber-900/40 border border-amber-700/50`, label "📝 Nota interna" no topo

- **Modificar:** `Composer.tsx`
  - Adicionar tabs "Mensagem" / "Nota Interna" (estado `composerMode`)
  - Modo nota: envia INSERT direto em `inbox_messages` (sem chamar `evolution-send`)
  - Placeholder diferente: "Escreva uma nota interna..."
  - Visual do textarea: borda amber quando em modo nota

### Critério verificável
- Nota inserida aparece no chat com visual amber
- `evolution-send` NÃO é chamado (inspecionar Network tab)
- Nota aparece apenas para operadores (RLS já garante)

---

## Feature 5 — Quick Replies

### Schema DB
Tabela `inbox_quick_replies` já existe. Inserir 2 registros de seed para teste:
```sql
INSERT INTO inbox_quick_replies (empresa_id, title, content, shortcut)
VALUES
  (get_user_empresa_id(), 'Saudação', 'Olá! Tudo bem? Como posso te ajudar hoje?', '/ola'),
  (get_user_empresa_id(), 'Aguarde', 'Perfeito! Pode aguardar um momento que já verifico para você.', '/aguarde');
```
(Seed manual via SQL, não via migration — IDs de empresa variam por tenant)

### Componentes
- **Novo:** `hooks/useQuickReplies.ts`
  - Busca `inbox_quick_replies` filtrado por `empresa_id` e `is_active=true`

- **Novo:** `QuickReplyPicker.tsx`
  - Popover que aparece quando texto do composer começa com "/"
  - Filtra por `shortcut` ou `title` conforme o usuário digita
  - Clicar → preenche textarea com `content`

- **Modificar:** `Composer.tsx`
  - Detectar "/" no onChange do textarea
  - Renderizar `<QuickReplyPicker />` acima do textarea quando ativo

### Critério verificável
- Digitar "/" abre o picker
- Selecionar resposta preenche o textarea
- Apertar Esc fecha o picker sem enviar

---

## Feature 6 — Transfer Dialog

### Schema DB (nenhuma nova tabela — usar `assigned_user_id` existente)

RPC já existe via UPDATE direto ou criar:
```sql
CREATE OR REPLACE FUNCTION transfer_conversation(conv_id uuid, new_operator_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE inbox_conversations
  SET assigned_user_id = new_operator_id, updated_at = now()
  WHERE id = conv_id AND empresa_id = get_user_empresa_id();
END;
$$;
```

### Componentes
- **Novo:** `TransferConversationDialog.tsx`
  - Modal Dialog (usando Radix Dialog existente no projeto ou implementação manual)
  - Busca operadores: `empresa_users` JOIN com `auth.users` via `user_id`
  - Lista com avatar inicial + nome/email + botão "Transferir"
  - Chama `supabase.rpc('transfer_conversation', { conv_id, new_operator_id })`
  - Toast de confirmação após transferência

- **Modificar:** `ChatArea.tsx`
  - Botão MoreVertical abre dropdown com "Transferir conversa"
  - Renderizar `<TransferConversationDialog />`

### Critério verificável
- `SELECT assigned_user_id FROM inbox_conversations WHERE id = <id>` muda após transferência
- Modal fecha após confirmação

---

## Critério final Sprint 2

```
# Zero erros TypeScript:
apps/NexvyOficinas/node_modules/.bin/tsc -p apps/NexvyOficinas/tsconfig.app.json --noEmit

# Build limpo:
cd apps/NexvyOficinas && npm run build

# 6 commits visíveis:
git log --oneline -10
```

| Feature | Commit | Critério binário |
|---|---|---|
| Status Tabs | `feat(inbox): tabs de status no ConversationList` | Filtro funciona, badges corretos |
| AcceptTicketBar | `feat(inbox): barra de aceitar atendimento` | RPC `accept_conversation` muda status |
| Close Conversation | `feat(inbox): encerrar conversa com confirmação` | RPC `close_conversation` + closed_at preenchido |
| Internal Notes | `feat(inbox): notas internas no composer` | Bubble amber, sem evolution-send |
| Quick Replies | `feat(inbox): respostas rápidas com "/" no composer` | Picker abre com "/", selecionar preenche textarea |
| Transfer Dialog | `feat(inbox): dialog de transferência de conversa` | `assigned_user_id` muda no DB |
