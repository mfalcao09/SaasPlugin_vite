# Sprint 6 — "IA & CRM Oficina"

**Objetivo:** transformar o inbox num ponto de atendimento integrado ao CRM da oficina — o operador vê veículos/OS do contato sem sair da conversa — e adicionar IA para acelerar respostas.

**Projeto:** NexvyOficinas (`apps/NexvyOficinas/`)
**Supabase project_id:** `gpxmkximudukbljrvtxj`
**Branch:** main

---

## Features (F1–F6)

| # | Feature | Esforço | Impacto |
|---|---|---|---|
| F1 | CRM Context Panel | M | ⭐⭐⭐ Diferencial máximo |
| F2 | Vincular Conversa → Cliente/OS | M | ⭐⭐⭐ CRM integrado |
| F3 | Transcrição de Áudio (Whisper) | M | ⭐⭐ IA útil |
| F4 | AI Copilot (sugestão de resposta) | M | ⭐⭐⭐ Produtividade |
| F5 | Mensagem Agendada | M | ⭐⭐ Follow-up |
| F6 | LocationBubble + ContactBubble | S | ⭐ Completude mídia |

---

## F1 — CRM Context Panel

**Arquivo novo:** `src/components/inbox/CrmContextPanel.tsx`

Botão na header do ChatArea (ícone `UserCog`) abre/fecha painel lateral de 280px com dados do cliente vinculado à conversa:

- **Busca automática:** ao abrir, busca em `clientes` WHERE `telefone` LIKE `%${contact_phone_normalizado}%` AND `empresa_id` = empresaId
- **Seção Cliente:** nome, email, telefone, status
- **Seção Veículos:** lista de veículos do cliente (marca + modelo + placa). Busca em `veiculos` WHERE `cliente_id = cliente.id`
- **Seção OS Recentes:** últimas 5 OS do cliente. Busca em `ordens_servico` WHERE `cliente_id = cliente.id` ORDER BY `created_at DESC` LIMIT 5. Mostra: data, status, valor_total
- **LTV:** soma de `valor_total` das OS com status 'concluida'
- **CTA "Ver cliente completo":** link para `/clientes`

Normalização do telefone: remover `+55`, espaços, hífens antes de comparar.

**Modificação:** `ChatArea.tsx` — adicionar botão `UserCog` no header, estado `showCrmPanel`, renderizar `<CrmContextPanel />` como coluna direita.

---

## F2 — Vincular Conversa → Cliente/OS

**Migration necessária (`sprint6_crm_links`):**
```sql
ALTER TABLE public.inbox_conversations
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.veiculos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS os_id uuid REFERENCES public.ordens_servico(id) ON DELETE SET NULL;
```

**Arquivo novo:** `src/components/inbox/LinkClienteDialog.tsx`

Dialog de vínculo manual:
- Campo de busca → filtra clientes por nome/telefone
- Ao selecionar cliente: carrega seus veículos (select)
- Ao selecionar veículo: carrega suas OS abertas (select)
- Botão "Vincular" → UPDATE inbox_conversations SET cliente_id, veiculo_id, os_id

**Modificação:** `ChatArea.tsx` — botão `Link2` no header abre `LinkClienteDialog`. Se `conversation.cliente_id` já preenchido, exibe o nome do cliente vinculado.

**No CrmContextPanel:** se `conversation.cliente_id` preenchido, usar diretamente (sem lookup por telefone).

---

## F3 — Transcrição de Áudio (Whisper)

**Arquivo novo:** `supabase/functions/transcribe-audio/index.ts`

Edge Function:
- Body: `{ storage_url: string, message_id: string }`
- Faz fetch do áudio do storage_url
- Envia para OpenAI `/v1/audio/transcriptions` (model: `whisper-1`, language: `pt`)
  ```ts
  const formData = new FormData()
  const audioBlob = new Blob([buffer], { type: 'audio/ogg' })
  formData.append('file', audioBlob, 'audio.ogg')
  formData.append('model', 'whisper-1')
  formData.append('language', 'pt')
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
    body: formData,
  })
  ```
- UPDATE `inbox_messages` SET `transcript = <texto>` WHERE `id = message_id`
- Retorna `{ transcript: string }`

**Env vars necessárias:** `OPENAI_API_KEY` (no Supabase project)

**Migration necessária (`sprint6_transcript`):**
```sql
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS transcript text;
```

**Modificação:** `AudioBubble.tsx`
- Adicionar botão `[T]` (ícone `FileText`) abaixo do player, visível apenas quando `storage_url` presente
- Ao clicar: chama `supabase.functions.invoke('transcribe-audio', { body: { storage_url, message_id } })`
- Estado: `transcribing` (spinner), `done` (exibe texto em p.text-xs.text-slate-400)
- Se `message.transcript` já existir: exibir automaticamente

---

## F4 — AI Copilot (sugestão de resposta)

**Arquivo novo:** `supabase/functions/inbox-copilot/index.ts`

Edge Function:
- Body: `{ conversation_id: string, empresa_id: string }`
- Busca últimas 15 msgs da conversa em `inbox_messages`
- Monta prompt: `"Você é assistente de atendimento de uma oficina mecânica. Histórico:\n<mensagens>\n\nSugira UMA resposta curta e profissional em português:"`
- Chama API Claude via fetch (NUNCA via SDK — ambiente é Deno):
  ```ts
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  ```
- Retorna `{ suggestion: string }`

**Env vars necessárias:** `ANTHROPIC_API_KEY`

**Modificação:** `src/components/inbox/composer/Composer.tsx`
- Botão ✨ (ícone `Sparkles`) na barra inferior
- Ao clicar: chama edge fn, spinner
- Retorno: preenche o textarea com a sugestão (editável antes de enviar)
- Exibir apenas quando `status !== 'closed'` e `status !== 'bot_active'`

---

## F5 — Mensagem Agendada

**Migration necessária (`sprint6_scheduled_messages`):**
```sql
CREATE TABLE IF NOT EXISTS public.inbox_scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.inbox_conversations(id) ON DELETE CASCADE,
  content text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at timestamptz,
  error_message text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.inbox_scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa members can manage scheduled messages"
  ON public.inbox_scheduled_messages FOR ALL
  USING (empresa_id IN (SELECT empresa_id FROM public.empresa_users WHERE user_id = auth.uid()));
```

**Arquivo novo:** `supabase/functions/process-scheduled-messages/index.ts`

Edge Function (cron/webhook):
- SELECT * FROM inbox_scheduled_messages WHERE status='pending' AND scheduled_at <= now()
- Para cada: chama evolution-send via fetch, UPDATE status='sent'/'failed'
- verify_jwt: false (chamado por cron)
- HMAC secret via `CRON_SECRET` env var para autenticação

**Arquivo novo:** `src/components/inbox/ScheduleMessageDialog.tsx`

Dialog com:
- Textarea com mensagem
- Input `type="datetime-local"` (mínimo: agora + 5 min)
- Botão "Agendar" → INSERT em `inbox_scheduled_messages`

**Modificação:** `Composer.tsx`
- Botão relógio (ícone `Clock`) abre `ScheduleMessageDialog`

---

## F6 — LocationBubble + ContactBubble

**Arquivo novo:** `src/components/inbox/messages/LocationBubble.tsx`
- Props: `{ lat: number; lng: number; name?: string; time: string; isOutbound: boolean }`
- Fallback sem API key: exibe pin emoji + coordenadas formatadas + link "Abrir no Maps"
- Link: `https://maps.google.com/?q=${lat},${lng}` (target="_blank", rel="noopener")
- Card 200×80px, bg-slate-700, rounded-xl

**Arquivo novo:** `src/components/inbox/messages/ContactBubble.tsx`
- Props: `{ name: string; phone: string; time: string; isOutbound: boolean; onLinkCliente?: (name: string, phone: string) => void }`
- Exibe: ícone `UserCircle` + nome + telefone formatado
- CTA "Vincular como cliente" → chama `onLinkCliente`

**Modificação:** `MessageBubble.tsx`
- Case `content_type === 'location'` → `<LocationBubble lat={metadata.latitude} lng={metadata.longitude} name={metadata.name} />`
- Case `content_type === 'contact'` → `<ContactBubble name={metadata.displayName} phone={metadata.phone} />`

---

## Migrations a aplicar no Supabase (project gpxmkximudukbljrvtxj)

1. `sprint6_crm_links`
2. `sprint6_transcript`
3. `sprint6_scheduled_messages`

---

## Edge Functions a criar/deploy

1. `transcribe-audio` — verify_jwt: true
2. `inbox-copilot` — verify_jwt: true
3. `process-scheduled-messages` — verify_jwt: false

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| `src/components/inbox/CrmContextPanel.tsx` | NOVO |
| `src/components/inbox/LinkClienteDialog.tsx` | NOVO |
| `src/components/inbox/ScheduleMessageDialog.tsx` | NOVO |
| `src/components/inbox/messages/LocationBubble.tsx` | NOVO |
| `src/components/inbox/messages/ContactBubble.tsx` | NOVO |
| `supabase/functions/transcribe-audio/index.ts` | NOVO |
| `supabase/functions/inbox-copilot/index.ts` | NOVO |
| `supabase/functions/process-scheduled-messages/index.ts` | NOVO |
| `src/components/inbox/ChatArea.tsx` | MODIFICAR |
| `src/components/inbox/composer/Composer.tsx` | MODIFICAR |
| `src/components/inbox/messages/MessageBubble.tsx` | MODIFICAR |
| `src/components/inbox/messages/AudioBubble.tsx` | MODIFICAR |

---

## Critério de Done

- [ ] F1: CrmContextPanel abre com veículos/OS do contato (lookup por telefone)
- [ ] F2: LinkClienteDialog vincula cliente/veículo/OS à conversa
- [ ] F3: Botão T no AudioBubble transcreve áudio → texto visível
- [ ] F4: Botão ✨ no Composer preenche textarea com sugestão Claude
- [ ] F5: Botão relógio agenda mensagem → INSERT em inbox_scheduled_messages
- [ ] F6: LocationBubble e ContactBubble renderizam mensagens inbound
- [ ] Migrations aplicadas: sprint6_crm_links, sprint6_transcript, sprint6_scheduled_messages
- [ ] Edge functions deployed: transcribe-audio, inbox-copilot, process-scheduled-messages
- [ ] TypeScript: `cd apps/NexvyOficinas && ./node_modules/.bin/tsc -p tsconfig.app.json --noEmit` → zero erros
- [ ] Build: `npm run build` sem erros
- [ ] 6 commits atômicos (F1 → F6)

---

## Instruções críticas

⚠️ **REGRA ABSOLUTA:** Para TODOS os arquivos existentes, usar Read IMEDIATAMENTE antes de cada Edit. NUNCA assumir conteúdo.

⚠️ Verificar git log antes de tocar arquivos:
```bash
git -C /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite log --oneline -5
```

⚠️ Nas edge functions Deno, NUNCA usar imports de node ou SDK Anthropic/OpenAI. Usar fetch direto.

⚠️ TypeScript strict: não usar `as any` sem comentário justificado.
