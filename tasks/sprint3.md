# Sprint 3 — "Inbox 360: Leitura, Reply, Search & Notificações" (2026-06-08)

> **Objetivo:** tornar a conversa mais rica e o operador mais eficiente.
> **Branch:** `main` (commits atômicos por feature)
> **Projeto Supabase:** `gpxmkximudukbljrvtxj`

---

## Features

### F1 — Status de leitura (✓✓) — P0
**Objetivo:** operador sabe se o cliente recebeu/leu a mensagem.

**Schema migration:**
```sql
-- Em inbox_messages:
ALTER TABLE public.inbox_messages
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'sent'
  CHECK (delivery_status IN ('sent','delivered','read'));

CREATE INDEX idx_inbox_messages_delivery_status
  ON public.inbox_messages(delivery_status)
  WHERE delivery_status != 'read';
```

**Webhook (`evolution-webhook`):** tratar `MESSAGES_UPDATE` event:
- `update.status === 'DELIVERY_ACK'` → delivery_status = 'delivered'
- `update.status === 'READ'` → delivery_status = 'read'
- Usar `wa_message_id` para localizar a mensagem via UPDATE

**UI (MessageBubble):** ícones estilo WhatsApp só para outbound (`isOutbound && !is_deleted`):
- `sent` → ✓ (slate-400, Check icon lucide 10px)
- `delivered` → ✓✓ (slate-400, CheckCheck icon lucide 10px)
- `read` → ✓✓ (blue-400, CheckCheck icon lucide 10px)
- Posicionamento: inline ao lado do timestamp (flex row-reverse gap-1)

**Impacto no select (ChatArea.tsx):** adicionar `delivery_status` no select de mensagens.

---

### F2 — Reply / Citação de mensagem — P1
**Objetivo:** citar mensagem anterior ao responder, como no WhatsApp.

**Schema migration:**
```sql
ALTER TABLE public.inbox_messages
  ADD COLUMN reply_to_message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL;
```

**Estado no ChatArea:** `replyingTo: InboxMessage | null` — passado ao Composer como prop.

**Composer:**
- `ReplyPreviewBar.tsx` — exibida acima do textarea quando `replyingTo != null`:
  - Background: `bg-slate-800 border-l-2 border-orange-500 rounded-t px-3 py-1.5`
  - Conteúdo: ícone CornerDownLeft + preview de 60 chars + botão × (X icon) para cancelar
- Ao enviar: incluir `reply_to_message_id` no INSERT

**ChatArea select atualizado:**
```ts
.select('id,sender_type,content,content_type,metadata,created_at,is_deleted,delivery_status,reply_to_message_id')
```

**MessageBubble:** novo componente `ReplySnippet.tsx`:
- Render se `message.reply_to_message_id` — busca o texto da mensagem pai dos messages já carregados (passar `allMessages` como prop ou context)
- Visual: `border-l-2 border-orange-400 bg-black/20 rounded px-2 py-1 text-xs mb-1.5 opacity-80`
- Conteúdo: sender label + preview 60 chars do content da mensagem citada
- Hover na bubble: ícone CornerDownLeft que chama `onReply(message)`

---

### F3 — Quick Replies CRUD settings page — P0
**Objetivo:** operador gerencia seus templates sem precisar de SQL.

**Rota:** adicionar link "Respostas Rápidas" no header/settings do Inbox (botão Settings no ConversationList header ou no EvolutionSettings).

**Componente:** `components/inbox/QuickRepliesManager.tsx` (panel ou modal)
- Lista todas as `inbox_quick_replies` da empresa:
  ```ts
  supabase.from('inbox_quick_replies').select('id,shortcut,content').eq('empresa_id', empresaId)
  ```
- Colunas: `shortcut` (badge orange) | `content` (truncado a 80 chars) | botões Editar / Excluir
- Botão "+ Nova" → formulário inline:
  - Input shortcut: max 20 chars, placeholder "oi"
  - Textarea content: max 500 chars, placeholder "Olá! Em que posso ajudar?"
  - Validação: shortcut único (check client-side antes do save)
  - Save: INSERT ou UPDATE em `inbox_quick_replies`
- Delete: `DELETE FROM inbox_quick_replies WHERE id = ?` com confirmação inline
- Feedback: toast simples (div fade-in na parte inferior do painel)

---

### F4 — Notificações sonoras + push browser — P1
**Objetivo:** operador não perde nova mensagem mesmo com outra aba ativa.

**Hook:** `hooks/useInboxNotifications.ts`
- Escuta realtime INSERT em `inbox_messages` (tabela, filter `conversation_id`) com `sender_type in ('contact', 'bot')`
- Condição para notificar: `document.hidden || conversationId !== activeConversationId`
- Som: `new Audio('/sounds/notification.mp3').play().catch(() => {})` — fallback silencioso se bloqueado pelo browser
- Push: `Notification.requestPermission()` na primeira ativação → `new Notification('Nova mensagem', { body: preview.slice(0, 100), icon: '/wrench.svg' })`
- `enabled` persistido em `localStorage` key `inbox_notifications_v1`

**Asset:** criar `apps/NexvyOficinas/public/sounds/notification.mp3`
- Pode ser qualquer ficheiro MP3 simples. Se não conseguir criar binário real, usar URL pública de CDN como fallback no hook.

**Toggle:** botão Bell/BellOff no header direito do ChatArea:
- `bell-off` quando disabled, `bell` quando enabled
- Onclick toggle estado + localStorage

---

### F5 — Pesquisa de mensagens na conversa — P1
**Objetivo:** operador localiza mensagem específica sem scroll manual.

**UI no ChatArea header:** ícone Search (Search icon lucide) — click expande SearchBar inline.

**Componente:** `MessageSearchBar.tsx`
- Input full-width animado (`transition-all`, `w-0` → `w-full` em 200ms)
- Filtro client-side: `messages.filter(m => m.content?.toLowerCase().includes(query.toLowerCase()))`
- Highlight: split por match → `<mark className="bg-yellow-400/30 rounded">match</mark>`
- Setas Up/Down para navegar entre resultados (scroll via `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`)
- Contagem: "3/12" ao lado das setas
- ESC fecha e limpa o filtro
- Resultado 0: "Nenhuma mensagem encontrada"

---

### F6 — Bot pause / unpause — P1
**Objetivo:** operador assume o chat sem o bot continuar respondendo.

**Schema (verificar e adicionar se necessário):**
```sql
-- Verificar: SELECT column_name FROM information_schema.columns WHERE table_name='inbox_conversations' AND column_name='bot_paused';
-- Se não existir:
ALTER TABLE public.inbox_conversations
  ADD COLUMN bot_paused boolean NOT NULL DEFAULT false;
```

**UI:** `BotToggleButton.tsx` no ChatArea header
- `bot_paused = false` → `<Bot>` icon verde, tooltip "Bot ativo"
- `bot_paused = true` → `<BotOff>` icon amber, tooltip "Bot pausado"
- Click: `supabase.from('inbox_conversations').update({ bot_paused: !current }).eq('id', id)`
- Estado local otimista (evita delay visual)

**Webhook (`evolution-webhook`):**
- Antes de acionar qualquer ação de bot, verificar `bot_paused` na conversa:
  ```ts
  const { data: conv } = await supabase
    .from('inbox_conversations')
    .select('bot_paused, status')
    .eq('id', conversationId)
    .single()
  if (conv?.bot_paused) {
    // não muda status, não aciona bot — apenas persiste a mensagem
    return
  }
  ```

---

## Critério de Done (Sprint 3 completo quando):

- [x] F1: `delivery_status` no DB + webhook atualiza MESSAGES_UPDATE + ✓ ✓✓ ícones no bubble outbound
- [x] F2: `reply_to_message_id` no DB + ReplyPreviewBar acima do textarea + ReplySnippet citado dentro do bubble
- [x] F3: QuickRepliesManager funcional com CRUD completo (list/create/edit/delete)
- [x] F4: notificação sonora (Web Audio API) + push ao receber mensagem fora da aba + toggle Bell no header
- [x] F5: search bar com navegação ↑↓ entre resultados + contagem X/Y + ESC para fechar
- [x] F6: bot pause toggle no header (Bot/BotOff verde/amber) + webhook respeita flag `bot_paused`
- [x] TypeScript check zerado: `cd apps/NexvyOficinas && npx tsc -p tsconfig.app.json --noEmit` ✓
- [x] Build de produção: `npm run build` em `apps/NexvyOficinas` sem erros ✓ (3.94s)
- [x] 6 commits atômicos + webhook redeployado como v6

## Concluído em: 2026-06-08

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| `apps/NexvyOficinas/src/components/inbox/messages/ReplySnippet.tsx` | NOVO |
| `apps/NexvyOficinas/src/components/inbox/composer/ReplyPreviewBar.tsx` | NOVO |
| `apps/NexvyOficinas/src/components/inbox/MessageSearchBar.tsx` | NOVO |
| `apps/NexvyOficinas/src/components/inbox/BotToggleButton.tsx` | NOVO |
| `apps/NexvyOficinas/src/components/inbox/QuickRepliesManager.tsx` | NOVO |
| `apps/NexvyOficinas/src/hooks/useInboxNotifications.ts` | NOVO |
| `apps/NexvyOficinas/src/components/inbox/messages/MessageBubble.tsx` | MODIFICAR (+delivery_status icons, +reply rendering) |
| `apps/NexvyOficinas/src/components/inbox/ChatArea.tsx` | MODIFICAR (+search bar, +bot toggle, +reply state, +delivery_status select) |
| `apps/NexvyOficinas/src/components/inbox/composer/Composer.tsx` | MODIFICAR (+ReplyPreviewBar integration) |
| `apps/NexvyOficinas/supabase/functions/evolution-webhook/index.ts` | MODIFICAR (+MESSAGES_UPDATE handler, +bot_paused check) |

---

## Supabase migrations necessárias

1. `inbox_messages`: adicionar `delivery_status` (text NOT NULL DEFAULT 'sent') + CHECK
2. `inbox_messages`: adicionar `reply_to_message_id` (uuid FK nullable)
3. `inbox_conversations`: adicionar `bot_paused` (boolean NOT NULL DEFAULT false) — se não existir
