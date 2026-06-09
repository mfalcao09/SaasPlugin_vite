# Sprint 5 — "Gestão: Dashboard, Assign, Tags, Office Hours & Broadcast" (2026-06-09)

> **Objetivo:** Funcionalidades de gestão operacional — visibilidade de métricas, organização por atendente/tags, automação de horário e envio em massa.
> **Branch:** `main` (commits atômicos por feature)
> **Projeto Supabase:** `gpxmkximudukbljrvtxj`
> **Nota de paralelismo:** Sprint 4 roda em paralelo e modifica ChatArea.tsx, ConversationList.tsx, evolution-webhook, Composer.tsx. O agente Sprint 5 DEVE ler esses arquivos frescos imediatamente antes de editá-los (não usar conteúdo fornecido externamente). Verificar `git log --oneline -8` antes de modificar qualquer arquivo compartilhado.

---

## Schema atual (pós-Sprint 3, Sprint 4 em progresso)

`inbox_conversations` tem: `id, empresa_id, contact_phone, contact_name, status, assigned_user_id, contact_avatar_url, bot_paused, wa_jid, last_message_at, unread_count, closed_at`

`inbox_messages` tem: `id, conversation_id, sender_type, content, content_type, metadata, wa_message_id, is_deleted, delivery_status, reply_to_message_id, created_at` + Sprint 4 adicionando `storage_url, edited_at, original_content`

---

## Features

### F1 — InboxMetrics Dashboard — P1
**Objetivo:** gestores veem métricas de volume, SLA e performance da equipe.

**Arquivos afetados (SEGUROS — Sprint 4 não toca):**
- NOVO: `src/pages/app/InboxMetrics.tsx`
- MODIFICAR: `src/App.tsx` — adicionar rota `/inbox/metrics`
- MODIFICAR: `src/components/layout/AppLayout.tsx` — adicionar link no sidebar

**Componente principal `InboxMetrics.tsx`:**
- Layout: grid 2x3 de cards no topo + 2 charts embaixo
- Usar `useAuth()` para obter `empresaId`
- Cards (queries Supabase com `.eq('empresa_id', empresaId)`):
  - Total conversas abertas (status != 'closed')
  - Em atendimento humano (status = 'human_active')
  - Aguardando resposta (status = 'waiting_human')
  - Encerradas hoje: `.eq('status','closed').gte('closed_at', new Date(today 00:00 BRT).toISOString())`
  - Mensagens hoje: `inbox_messages` via JOIN ou RPC — count onde created_at >= today
  - Instâncias ativas: `evolution_instances WHERE status = 'connected'`
- Charts (recharts já no bundle — `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`):
  - BarChart: conversas abertas por status (3 barras: bot_active, waiting_human, human_active)
  - BarChart: conversas por atendente — JOIN `inbox_conversations` com `empresa_users` ou mostrar UUIDs truncados se sem tabela profiles
- Styling: mesma paleta dark (slate-900/800, orange-600 accent)
- Cards style: `bg-slate-800 rounded-xl p-4 border border-slate-700`

**Rota em App.tsx:** adicionar `<Route path="inbox/metrics" element={<InboxMetrics />} />` dentro do `<Route element={<AppLayout />}>`. Ler App.tsx atual para posicionamento correto.

**AppLayout.tsx:** ler o arquivo atual, adicionar link "Métricas Inbox" próximo ao link "inbox" existente no sidebar.

---

### F2 — Atribuição de conversa a atendente — P0
**Objetivo:** supervisor distribui conversas; atendente filtra "minhas conversas".

**Coluna já existe:** `inbox_conversations.assigned_user_id uuid` — só precisa de UI.

**MODIFICAR `ConversationList.tsx`** (LER ARQUIVO FRESCO antes de editar):
- Adicionar `assigned_user_id: string | null` à interface `Conversation`
- Adicionar `assigned_user_id` ao `.select(...)`
- Novo tab `{ key: 'mine', label: 'Minhas' }` no TABS array — filtra por `assigned_user_id === user?.id`
- Ícone User2 (12px, slate-400) na lista do item quando `assigned_user_id != null`
- Usar `const { user } = useAuth()` para comparar

**MODIFICAR `ChatArea.tsx`** (LER ARQUIVO FRESCO antes de editar):
- Adicionar `assigned_user_id: string | null` à interface `Conversation`
- Adicionar `assigned_user_id` ao `.select(...)` da conversa
- Hook local: buscar agentes da empresa
  ```ts
  const [agents, setAgents] = useState<{user_id: string; display: string}[]>([])
  useEffect(() => {
    supabase.from('empresa_users').select('user_id').eq('empresa_id', empresaId).then(({ data }) => {
      // Para display: usar primeiros 8 chars do UUID ou integrar com profiles se existir
      setAgents((data ?? []).map(u => ({ user_id: u.user_id, display: u.user_id.slice(0,8) })))
    })
  }, [empresaId])
  ```
- Select dropdown no header (após badge de status):
  ```tsx
  <select
    value={conversation.assigned_user_id ?? ''}
    onChange={e => supabase.from('inbox_conversations').update({ assigned_user_id: e.target.value || null }).eq('id', conversationId)}
    className="text-xs bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-slate-200"
  >
    <option value="">Não atribuído</option>
    {agents.map(a => <option key={a.user_id} value={a.user_id}>{a.display}</option>)}
  </select>
  ```
- Para obter `empresaId` no ChatArea: adicionar `const { empresaId } = useAuth()`

---

### F3 — Tags de conversa — P1
**Objetivo:** categorizar conversas com tags coloridas (ex: "urgente", "orçamento", "garantia").

**Migration:**
```sql
ALTER TABLE public.inbox_conversations
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
```

**Paleta de cores por tag (hash determinístico):**
```ts
const TAG_PALETTE = ['bg-red-500','bg-blue-500','bg-green-500','bg-yellow-500','bg-purple-500','bg-pink-500','bg-indigo-500','bg-orange-500']
function tagColor(tag: string): string {
  let h = 0
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) % TAG_PALETTE.length
  return TAG_PALETTE[Math.abs(h)]
}
```

**MODIFICAR `ConversationList.tsx`** (LER ARQUIVO FRESCO):
- Adicionar `tags: string[]` à interface `Conversation`
- Adicionar `tags` ao `.select(...)`
- Renderizar chips abaixo do preview em cada item:
  ```tsx
  {c.tags.length > 0 && (
    <div className="flex flex-wrap gap-1 mt-1">
      {c.tags.slice(0,3).map(tag => (
        <span key={tag} className={`${tagColor(tag)} text-white text-[9px] px-1.5 py-0.5 rounded-full`}>
          {tag}
        </span>
      ))}
    </div>
  )}
  ```

**MODIFICAR `ChatArea.tsx`** (LER ARQUIVO FRESCO):
- Adicionar `tags: string[]` à interface `Conversation` e ao `.select(...)`
- No More Menu (MoreVertical dropdown), adicionar entrada "Gerenciar tags":
  - Clique abre um inline popover simples (state `showTagsPopover`)
  - Popover: lista as tags atuais com botão × para remover + input + Enter para adicionar
  - `addTag(tag)`: `UPDATE SET tags = array_append(tags, tag) WHERE id = ?`
  - `removeTag(tag)`: `UPDATE SET tags = array_remove(tags, tag) WHERE id = ?`

---

### F4 — Office Hours (horário de atendimento) — P1
**Objetivo:** fora do horário comercial, enviar mensagem automática.

**Migrations:**
```sql
CREATE TABLE IF NOT EXISTS public.inbox_office_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  dia_semana int NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL DEFAULT '09:00',
  hora_fim time NOT NULL DEFAULT '18:00',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(empresa_id, dia_semana)
);

ALTER TABLE public.inbox_office_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresa members manage office_hours"
  ON public.inbox_office_hours FOR ALL USING (
    EXISTS (SELECT 1 FROM public.empresa_users eu WHERE eu.empresa_id = inbox_office_hours.empresa_id AND eu.user_id = auth.uid())
  );
```

**Nota:** verificar se tabela `empresas` tem coluna `inbox_out_of_hours_message`. Se não existir a tabela, adaptar para salvar a mensagem em `evolution_instances` ou como hardcoded default. Verificar com:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'empresas';
```
Se a tabela `empresas` existir, adicionar: `ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS inbox_out_of_hours_message text DEFAULT 'Olá! Nosso atendimento funciona em horário comercial. Em breve retornaremos!'`

**NOVO** `src/components/inbox/OfficeHoursSettings.tsx`:
- Props: `{ empresaId: string }`
- Tabela com 7 linhas (Domingo→Sábado, labels em PT-BR)
- Cada linha: toggle on/off (checkbox) + time inputs `hora_inicio` + `hora_fim`
- Campo textarea para mensagem fora do horário
- Botão "Salvar configuração"
- Submit: UPSERT em `inbox_office_hours` para cada dia
- Integrar em `EvolutionSettings.tsx` (ler o arquivo atual): adicionar seção "Horário de Atendimento" ao final do componente

**MODIFICAR `evolution-webhook/index.ts`** (LER ARQUIVO FRESCO + verificar commits Sprint 4):
- Adicionar função `isWithinOfficeHours`:
  ```ts
  async function isWithinOfficeHours(empresaId: string, sb: ReturnType<typeof createClient>): Promise<{ open: boolean; message: string }> {
    const now = new Date()
    // BRT = UTC-3
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
    const dayOfWeek = brt.getUTCDay()
    const currentTime = `${String(brt.getUTCHours()).padStart(2,'0')}:${String(brt.getUTCMinutes()).padStart(2,'0')}`
    
    const { data: hours } = await sb.from('inbox_office_hours')
      .select('hora_inicio, hora_fim, ativo')
      .eq('empresa_id', empresaId)
      .eq('dia_semana', dayOfWeek)
      .eq('ativo', true)
      .single()
    
    if (!hours) return { open: true, message: '' } // sem config = sempre aberto
    
    const isOpen = currentTime >= hours.hora_inicio && currentTime <= hours.hora_fim
    let outMsg = 'Nosso atendimento funciona em horário comercial. Retornaremos em breve!'
    // Tentar buscar mensagem customizada
    try {
      const { data: empresa } = await sb.from('empresas').select('inbox_out_of_hours_message').eq('id', empresaId).single()
      if (empresa?.inbox_out_of_hours_message) outMsg = empresa.inbox_out_of_hours_message
    } catch { /* ignore */ }
    
    return { open: isOpen, message: outMsg }
  }
  ```
- No handler MESSAGES_UPSERT, para mensagens inbound (`!fromMe`) ANTES de mudar status:
  ```ts
  const { open, message: outMsg } = await isWithinOfficeHours(instance.empresa_id as string, supabase)
  if (!open) {
    // Fora do horário: salvar mensagem + enviar auto-resposta + NÃO mudar status para waiting_human
    // ... (inserir mensagem normalmente)
    // Enviar auto-resposta:
    if (outMsg) {
      await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
        body: JSON.stringify({ number: contactPhone, text: outMsg })
      })
    }
    continue // não processar mais nada (não mudar status)
  }
  ```

---

### F5 — Histórico do contato — P2
**Objetivo:** ver conversas anteriores do mesmo número sem sair do chat.

**NOVO** `src/components/inbox/ContactHistoryDrawer.tsx`:
- Props: `{ phone: string; currentConversationId: string; onClose: () => void; onSelect: (convId: string) => void }`
- Drawer lateral direito fixo: `fixed inset-y-0 right-0 w-72 bg-slate-900 border-l border-slate-700 z-30`
- Slide-in: `transform transition-transform translate-x-0`
- Header: "Histórico +{phone}" + botão X
- Query:
  ```ts
  supabase.from('inbox_conversations')
    .select('id,status,created_at,closed_at,last_message_content,last_message_at')
    .eq('contact_phone', phone)
    .neq('id', currentConversationId)
    .order('created_at', { ascending: false })
    .limit(20)
  ```
- Item: data + badge status (cores do STATUS_LABELS) + preview (truncado 60 chars)
- Click: chamar `onSelect(id)`
- Empty state: "Nenhuma conversa anterior"

**MODIFICAR `ChatArea.tsx`** (LER ARQUIVO FRESCO):
- Import `ContactHistoryDrawer` e `History` de lucide-react
- State: `const [showHistory, setShowHistory] = useState(false)`
- Botão History no header (após Search button):
  ```tsx
  <button onClick={() => setShowHistory(prev => !prev)} className={`p-1 rounded transition-colors shrink-0 ${showHistory ? 'text-orange-400' : 'text-slate-400 hover:text-white'}`} title="Histórico do contato">
    <History className="h-4 w-4" />
  </button>
  ```
- Renderizar (antes do `</div>` final de ChatArea):
  ```tsx
  {showHistory && (
    <ContactHistoryDrawer
      phone={conversation.contact_phone}
      currentConversationId={conversationId}
      onClose={() => setShowHistory(false)}
      onSelect={(id) => { setShowHistory(false); /* onSelect prop or navigate */ }}
    />
  )}
  ```
- **Nota:** `ChatArea` não tem prop para trocar de conversa. O `onSelect` deve chamar alguma forma de navegar — verificar como o pai (Inbox.tsx) faz a seleção e adicionar prop `onSelectConversation?: (id: string) => void` ao ChatArea, passando-o do pai.

---

### F6 — Broadcast: envio em massa — P1
**Objetivo:** operador envia mesma mensagem para vários contatos de uma vez (máx 50).

**NOVA** Edge Function `supabase/functions/send-broadcast/index.ts`:
```ts
// Deno Edge Function
// Input JSON: { phones: string[]; message: string; empresa_id: string; instance_id?: string }
// 1. Validar: phones.length <= 50
// 2. Buscar instância ativa: SELECT id, instance_id FROM evolution_instances WHERE empresa_id = ? AND status = 'connected' LIMIT 1
// 3. Para cada phone (normalizado: remover não-dígitos, adicionar 55 se necessário):
//    a. POST /message/sendText/{instanceName} { number: phone, text: message }
//    b. Aguardar 1500ms (await new Promise(r => setTimeout(r, 1500)))
//    c. Registrar success/failure
// 4. Retornar { sent: N, failed: M, errors: [...] }
// CORS: headers Access-Control-Allow-Origin: *
// verify_jwt: false (ou verificar bearer token se disponível)
```

**NOVO** `src/components/inbox/BroadcastDialog.tsx`:
- Props: `{ onClose: () => void; empresaId: string }`
- Modal com backdrop
- Campos:
  - `textarea` para lista de phones: "Cole os números aqui, um por linha"
  - `textarea` para mensagem: "Mensagem a enviar"
- Preview: "Enviará para X contatos" (re-calcula conforme digita)
- Validação: 1-50 phones, mensagem não vazia
- Submit → `supabase.functions.invoke('send-broadcast', { body: { phones, message, empresa_id: empresaId } })`
- Loading: spinner + "Enviando... pode levar alguns minutos"
- Resultado: "✓ X enviadas / ✗ Y falhas"
- Parser de phones:
  ```ts
  function parsePhones(raw: string): string[] {
    return raw.split(/[\n,;\s]+/)
      .map(p => p.replace(/\D/g, ''))
      .filter(p => p.length >= 10 && p.length <= 15)
      .slice(0, 50)
  }
  ```

**MODIFICAR `ConversationList.tsx`** (LER ARQUIVO FRESCO):
- Import `Megaphone` de lucide-react
- State: `const [showBroadcast, setShowBroadcast] = useState(false)`
- Adicionar botão Megaphone no header (discreto, ao lado do badge de unread):
  ```tsx
  <button onClick={() => setShowBroadcast(true)} className="p-1 text-slate-400 hover:text-orange-400 transition-colors" title="Enviar para múltiplos contatos">
    <Megaphone className="h-4 w-4" />
  </button>
  ```
- Renderizar `{showBroadcast && <BroadcastDialog onClose={() => setShowBroadcast(false)} empresaId={empresaId!} />}`

---

## Critério de Done (Sprint 5 completo quando):

- [ ] F1: /inbox/metrics acessível com cards e BarCharts funcionais
- [ ] F2: assign dropdown no ChatArea + tab "Minhas" na ConversationList
- [ ] F3: migration tags[] + chips coloridos na ConversationList + popover tags no ChatArea
- [ ] F4: migration office_hours + OfficeHoursSettings UI + webhook verifica horário
- [ ] F5: ContactHistoryDrawer abre com histórico do número + clique troca de conversa
- [ ] F6: BroadcastDialog + send-broadcast edge function deployed
- [ ] TypeScript check zerado: `cd apps/NexvyOficinas && npx tsc -p tsconfig.app.json --noEmit`
- [ ] Build: `npm run build` sem erros
- [ ] 6 commits atômicos (F1 → F6)

---

## Arquivos a criar/modificar

| Arquivo | Ação | Conflito Sprint 4? |
|---|---|---|
| `src/pages/app/InboxMetrics.tsx` | NOVO | ✅ Seguro |
| `src/App.tsx` | MODIFICAR | ✅ Seguro |
| `src/components/layout/AppLayout.tsx` | MODIFICAR | ✅ Seguro |
| `src/components/inbox/ContactHistoryDrawer.tsx` | NOVO | ✅ Seguro |
| `src/components/inbox/OfficeHoursSettings.tsx` | NOVO | ✅ Seguro |
| `src/components/inbox/BroadcastDialog.tsx` | NOVO | ✅ Seguro |
| `src/components/inbox/ChatArea.tsx` | MODIFICAR | ⚠️ Sprint 4 modifica — LER FRESCO |
| `src/components/inbox/ConversationList.tsx` | MODIFICAR | ⚠️ Sprint 4 modifica — LER FRESCO |
| `supabase/functions/evolution-webhook/index.ts` | MODIFICAR | ⚠️ Sprint 4 modifica — LER FRESCO |
| `supabase/functions/send-broadcast/index.ts` | NOVO | ✅ Seguro |

---

## Ordem de execução recomendada

1. Aplicar migrations (F3 tags[], F4 office_hours, opcionalmente F4 empresas column)
2. **F1 Dashboard** — 100% novos arquivos (App.tsx + AppLayout.tsx safe)
3. **F5 ContactHistoryDrawer** — componente novo + pequena adição ao ChatArea
4. **F6 Broadcast** — componente novo + edge function + pequena adição ao ConversationList
5. **F2 Assign** — leia ChatArea + ConversationList frescos
6. **F3 Tags** — leia ChatArea + ConversationList frescos (já abertos na etapa anterior)
7. **F4 Office Hours** — leia evolution-webhook fresco, construa sobre Sprint 4

## Instruções críticas

⚠️ **REGRA ABSOLUTA:** Para TODOS os arquivos existentes, usar a ferramenta Read para ler o conteúdo atual do disco IMEDIATAMENTE antes de cada Edit. NUNCA assumir o conteúdo com base em versões anteriores.

⚠️ Antes de modificar arquivos compartilhados com Sprint 4, executar:
```bash
git -C /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite log --oneline -10
```
Verificar se commits `feat(inbox): F*` do Sprint 4 aparecem. Se sim, ler arquivos no estado pós-Sprint-4.

---

## Migrations necessárias

1. `sprint5_tags` — `ALTER TABLE public.inbox_conversations ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'`
2. `sprint5_office_hours` — CREATE TABLE inbox_office_hours + RLS
3. `sprint5_out_of_hours_msg` — ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inbox_out_of_hours_message text DEFAULT '...' (verificar se tabela existe antes)
