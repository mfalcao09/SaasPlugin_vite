# Sprint 4 — "Conectividade: Outbound, Mídia Permanente & Contexto Visual" (2026-06-09)

> **Objetivo:** Fechar os maiores gaps de UX restantes: iniciar conversa outbound, não perder mídia,
> mostrar avatar do contato e entregar as interações ricas (typing, reactions, edição).
> **Branch:** `main` (commits atômicos por feature)
> **Projeto Supabase:** `gpxmkximudukbljrvtxj`

---

## Estado do Schema (pós-Sprint 3)

**inbox_conversations colunas existentes relevantes:**
- `contact_avatar_url text` — JÁ EXISTE, só precisa ser preenchido pelo webhook
- `bot_paused boolean` — Sprint 3
- `assigned_user_id uuid` — já existia

**inbox_messages colunas existentes relevantes:**
- `delivery_status text` — Sprint 3
- `reply_to_message_id uuid` — Sprint 3
- `is_deleted boolean` — Sprint 1
- `wa_message_id text` — para localizar mensagem no Evolution

**Colunas a adicionar neste sprint:**
- `inbox_messages.edited_at timestamptz` (F5)
- `inbox_messages.original_content text` (F5)
- `inbox_messages.storage_url text` (F4)
- Nova tabela `message_reactions` (F6)

---

## Features

### F1 — Typing indicator — P1
**Objetivo:** mostrar "contato está digitando..." em tempo real.

**Implementação via Supabase Realtime Broadcast (zero persistência no DB):**

**Hook:** `apps/NexvyOficinas/src/hooks/useTypingIndicator.ts`
```ts
// Emite no canal da conversa quando o OPERADOR está digitando
// Escuta broadcasts do CONTATO (enviados pelo webhook)
// channel: `typing:${conversationId}`
// event: 'typing' | payload: { sender: 'contact' | 'agent'; isTyping: boolean }
```
- Debounce 2s: emit `isTyping: true` ao digitar → `isTyping: false` 2s após parar
- Limpar channel ao desmontar

**Webhook (`evolution-webhook`):** tratar evento `TYPING` do Evolution API:
```
Evento: type === 'TYPING' ou presence update
Payload: data.presence === 'composing' | 'paused'
Ação: supabase.channel(`typing:${conversationId}`).send({ type: 'broadcast', event: 'typing', payload: { sender: 'contact', isTyping: data.presence === 'composing' } })
```
**Nota:** Evolution API envia `CALL`, `CONNECTION_UPDATE` e presence updates. Verificar nome exato do evento no payload real. Se não houver evento de typing do Evolution, usar `MESSAGES_UPSERT` + debounce como fallback visual.

**Componente:** `apps/NexvyOficinas/src/components/inbox/TypingIndicator.tsx`
- 3 dots animados (`animate-bounce` com delays escalonados: 0ms, 150ms, 300ms)
- Visual: `bg-slate-800 rounded-2xl px-3 py-2 inline-flex gap-1`
- Aparece em `ChatArea` abaixo das mensagens quando `isContactTyping === true`
- Auto-desaparece após 5s sem update (timeout de segurança)

**ChatArea.tsx:** 
- Usar `useTypingIndicator` passando `conversationId`
- Emitir no textarea `onChange`
- Renderizar `<TypingIndicator visible={isContactTyping} />` acima do Composer

---

### F2 — Contact avatar (foto do perfil) — P2
**Objetivo:** mostrar foto do contato na lista e no header do chat.

**Coluna já existe:** `inbox_conversations.contact_avatar_url text` — só precisa ser preenchida.

**Webhook (`evolution-webhook`):** extrair avatar ao receber mensagem:
```ts
// No processamento de MESSAGES_UPSERT:
// Evolution payload contém: data.pushName (nome), data.message?.conversation
// Para a foto: chamar Evolution API GET /chat/fetchProfilePicture/{instance}?number={phone}
// Salvar na conversa: UPDATE inbox_conversations SET contact_avatar_url = url, contact_name = pushName
// WHERE id = conversationId AND (contact_avatar_url IS NULL OR contact_name IS NULL)
// Fazer somente quando não preenchido (evita chamada redundante a cada mensagem)
```

**Componente:** `apps/NexvyOficinas/src/components/inbox/ContactAvatar.tsx`
- Props: `{ avatarUrl?: string | null; name: string; size?: 'sm' | 'md' | 'lg' }`
- Se `avatarUrl`: renderizar `<img>` com `onError` fallback para iniciais
- Se sem url: círculo com iniciais do nome (`bg-slate-700 text-slate-300`)
- Tamanhos: `sm=24px`, `md=32px`, `lg=40px`

**Usar em:**
- `ConversationList.tsx` — substituir ícone genérico pelo `<ContactAvatar size="md" />`
- `ChatArea.tsx` header — `<ContactAvatar size="lg" />` ao lado do nome do contato

---

### F3 — Outbound: iniciar nova conversa — M
**Objetivo:** operador abre conversa com qualquer número sem esperar o contato entrar em contato.

**Nova Edge Function:** `apps/NexvyOficinas/supabase/functions/start-conversation/index.ts`
```ts
// Input: { phone: string; message: string; instance_id?: string; empresa_id: string }
// 1. Se instance_id não informado: buscar instância default da empresa
//    (SELECT id FROM evolution_instances WHERE empresa_id = ? AND is_default = true LIMIT 1)
// 2. Normalizar phone: remover não-dígitos, adicionar 55 se não tiver DDI
// 3. POST para Evolution API: /message/sendText/{instanceName}
//    body: { number: phone, text: message }
// 4. Retornar { success: true } — webhook criará a conversa ao receber o echo
// 5. Opcional: criar a conversa preventivamente via find_or_create_inbox_conversation RPC
```

**Componente:** `apps/NexvyOficinas/src/components/inbox/NewConversationDialog.tsx`
- Trigger: botão `+ Nova` (PlusCircle icon) no header do `ConversationList`
- Dialog com campos:
  - Telefone: input com máscara básica `(XX) XXXXX-XXXX` — sem lib, regex simples
  - Nome do contato (opcional, pré-preenche `contact_name`)
  - Primeira mensagem: textarea
  - Instância: select das instâncias da empresa (se houver mais de uma)
- Validação: telefone mínimo 10 dígitos
- Submit: `supabase.functions.invoke('start-conversation', { body: { phone, message, empresa_id } })`
- Toast de confirmação: "Mensagem enviada para +55 (XX) XXXXX-XXXX"
- Fechar dialog após sucesso; a conversa aparece na lista via realtime

---

### F4 — Download automático de mídia → Supabase Storage — P0
**Objetivo:** mídia recebida é persistida permanentemente; URLs do WhatsApp expiram em ~hours.

**Migration:**
```sql
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS storage_url text;
```

**Lógica no `evolution-webhook`:** após inserir mensagem com mídia (`content_type != 'text'`):
```ts
// Se content_type in ('image', 'audio', 'video', 'document', 'sticker'):
// 1. Chamar Evolution API: POST /chat/getBase64FromMediaMessage/{instanceName}
//    body: { message: { key: messageKey } } — onde messageKey vem do payload
// 2. Receber base64 da mídia
// 3. Decodificar base64 e fazer upload para Supabase Storage bucket 'inbox-media':
//    path: `{empresa_id}/{conversation_id}/{message_id}.{ext}`
//    usando service_role key (edge function tem acesso direto)
// 4. UPDATE inbox_messages SET storage_url = publicUrl WHERE id = messageId
// Implementar como async fire-and-forget para não bloquear resposta do webhook:
//   EdgeRuntime.waitUntil(downloadAndStore(...))
```

**Extensão MIME → extensão de arquivo:**
```ts
const mimeToExt: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/webm': 'webm',
  'video/mp4': 'mp4', 'application/pdf': 'pdf',
}
```

**MessageBubble.tsx:** atualizar para usar `storage_url` como fallback preferencial:
```ts
// Ao renderizar mídia, usar: message.storage_url || message.metadata?.url
// (storage_url é a coluna direta na mensagem)
```

**Bucket:** verificar se `inbox-media` existe; se não, criar via Supabase MCP.

---

### F5 — Editar mensagem enviada — P1
**Objetivo:** corrigir typos/erros em mensagens enviadas, como no WhatsApp.

**Migration:**
```sql
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_content text;
```

**UI:** menu de ações na bubble (aparece no hover, só para outbound + não deleted):
- Componente: `apps/NexvyOficinas/src/components/inbox/MessageActionsMenu.tsx`
- Ícones: Pencil (editar) | Trash2 (já existe via is_deleted) 
- Posicionamento: absoluto no canto superior da bubble, `opacity-0 group-hover:opacity-100 transition-opacity`
- Ao clicar Pencil: o `content` da bubble vira `<textarea>` inline, pre-filled com texto atual
- Enter salva, ESC cancela

**Lógica de edição:**
```ts
// 1. Se edited_at == null: original_content = content (guardar original)
// 2. UPDATE inbox_messages SET content = newText, edited_at = now() WHERE id = messageId
// 3. Via Evolution API (se suportado):
//    PUT /message/editMessage/{instanceName} body: { messageId: wa_message_id, text: newText }
//    Se retornar erro: apenas atualizar localmente (graceful degradation)
```

**MessageBubble.tsx:** mostrar indicador "(editado)" em texto menor quando `edited_at != null`:
```tsx
{message.edited_at && (
  <span className="text-xs opacity-50 ml-1">(editado)</span>
)}
```

**ChatArea.tsx:** adicionar `edited_at` no select de mensagens.

---

### F6 — Emoji reactions — P1
**Objetivo:** operador reage a mensagens (👍, ❤️, 😂, 🎉, etc.) como no WhatsApp.

**Migration:**
```sql
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_type text NOT NULL DEFAULT 'agent' CHECK (sender_type IN ('agent', 'contact')),
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, sender_type)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresa members manage reactions"
  ON public.message_reactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.inbox_messages m
      JOIN public.inbox_conversations c ON c.id = m.conversation_id
      JOIN public.empresa_users eu ON eu.empresa_id = c.empresa_id
      WHERE m.id = message_reactions.message_id
        AND eu.user_id = auth.uid()
    )
  );
```

**Hook:** `apps/NexvyOficinas/src/hooks/useMessageReactions.ts`
- Carrega reações por `message_id` (query + realtime INSERT/DELETE)
- `addReaction(messageId, emoji)`: INSERT em `message_reactions`
- `removeReaction(messageId)`: DELETE WHERE message_id = ? AND user_id = auth.uid()

**Componente:** `apps/NexvyOficinas/src/components/inbox/MessageReactions.tsx`
- Aparece abaixo da bubble quando há reações
- Picker: emoji fixos (👍 ❤️ 😂 🎉 😮 😢) num popover pequeno no hover
- Clique em emoji existente: toggle (remove se já reagiu, adiciona se não)
- Contagem ao lado de cada emoji

**evolution-webhook:** tratar evento `MESSAGES_REACTION` do Evolution (se disponível):
```ts
// type === 'MESSAGES_REACTION'
// data.reaction.text = emoji string, data.key.id = messageId do WhatsApp
// INSERT INTO message_reactions (message_id, sender_type, emoji) 
//   SELECT id, 'contact', emoji FROM inbox_messages WHERE wa_message_id = waId
```

---

## Critério de Done (Sprint 4 completo quando):

- [ ] F1: TypingIndicator aparece quando contato digita + operador emite broadcast
- [ ] F2: ContactAvatar.tsx renderiza foto ou iniciais em ConversationList + ChatArea header
- [ ] F3: NewConversationDialog envia mensagem outbound via start-conversation edge function
- [ ] F4: migration storage_url + webhook baixa mídia base64 → Storage → atualiza storage_url
- [ ] F5: migration edited_at/original_content + inline edit + "(editado)" no bubble
- [ ] F6: tabela message_reactions + picker de emoji + contagem nas bubbles
- [ ] TypeScript check zerado: `cd apps/NexvyOficinas && npx tsc -p tsconfig.app.json --noEmit`
- [ ] Build: `npm run build` sem erros
- [ ] 6 commits atômicos (F1 → F6)
- [ ] Edge functions modificadas/novas redeployadas via Supabase MCP

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| `src/hooks/useTypingIndicator.ts` | NOVO |
| `src/components/inbox/TypingIndicator.tsx` | NOVO |
| `src/components/inbox/ContactAvatar.tsx` | NOVO |
| `src/components/inbox/NewConversationDialog.tsx` | NOVO |
| `src/hooks/useMessageReactions.ts` | NOVO |
| `src/components/inbox/MessageReactions.tsx` | NOVO |
| `src/components/inbox/MessageActionsMenu.tsx` | NOVO |
| `src/components/inbox/ChatArea.tsx` | MODIFICAR (typing, avatar, edited_at select, actions menu) |
| `src/components/inbox/ConversationList.tsx` | MODIFICAR (avatar, botão + Nova) |
| `src/components/inbox/messages/MessageBubble.tsx` | MODIFICAR (edited indicator, actions menu, reactions, storage_url) |
| `supabase/functions/evolution-webhook/index.ts` | MODIFICAR (avatar fetch, media download, typing broadcast, reaction handler) |
| `supabase/functions/start-conversation/index.ts` | NOVO |

---

## Migrations necessárias

1. `inbox_messages`: ADD COLUMN `storage_url text`
2. `inbox_messages`: ADD COLUMN `edited_at timestamptz`, `original_content text`
3. CREATE TABLE `message_reactions` com RLS
