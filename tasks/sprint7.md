# Sprint 7 — "Qualidade de Atendimento: CSAT, SLA & Automação"

**Objetivo:** adicionar métricas de qualidade (CSAT, SLA), automação de fila (auto-assign, follow-up) e chatbot de regras simples — tornando o inbox operacionalmente autônomo para o dono de oficina.

**Projeto:** NexvyOficinas (`apps/NexvyOficinas/`)
**Supabase project_id:** `gpxmkximudukbljrvtxj`
**Branch:** main

---

## Features (F1–F6)

| # | Feature | Esforço | Impacto |
|---|---|---|---|
| F1 | CSAT Survey automático | M | ⭐⭐⭐ Retenção |
| F2 | SLA Tracking + alertas visuais | M | ⭐⭐⭐ Operação |
| F3 | Auto-assign round-robin | M | ⭐⭐⭐ Multi-agente |
| F4 | Follow-up automático (conversas inativas) | M | ⭐⭐ Vendas |
| F5 | Keyword Auto-responder (chatbot por regras) | M | ⭐⭐ Automação |
| F6 | Exportação CSV do InboxMetrics | S | ⭐ Analytics |

---

## F1 — CSAT Survey Automático

**Objetivo:** ao encerrar uma conversa (status → 'closed'), enviar automaticamente pesquisa de satisfação via WhatsApp.

### Migration `sprint7_csat`
```sql
CREATE TABLE IF NOT EXISTS public.inbox_csat_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.inbox_conversations(id) ON DELETE CASCADE,
  contact_phone text NOT NULL,
  score smallint CHECK (score BETWEEN 1 AND 5),
  comment text,
  sent_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (conversation_id)
);
ALTER TABLE public.inbox_csat_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresa members read csat" ON public.inbox_csat_responses
  FOR SELECT USING (empresa_id IN (SELECT empresa_id FROM public.empresa_users WHERE user_id = auth.uid()));
```

### Migration `sprint7_empresa_csat_settings`
```sql
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS csat_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS csat_message text DEFAULT 'Como foi seu atendimento? Responda com um número de 1 a 5 (1=péssimo, 5=ótimo)';
```

### Edge function `send-csat` (verify_jwt: true)
- Body: `{ conversation_id: string }`
- Verifica `csat_enabled = true` na empresa
- Verifica UNIQUE — não reenvia se já existe
- Envia `csat_message` via Evolution API (mesmo padrão do `evolution-send`)
- INSERT em `inbox_csat_responses` com `sent_at = now()`

### Trigger no frontend
**Modificação `ChatArea.tsx`:** após UPDATE status='closed', chamar `supabase.functions.invoke('send-csat', { body: { conversation_id } })`

### Captura da resposta no webhook
**Modificação `evolution-webhook/index.ts`:**
- Ao receber MESSAGES_UPSERT: ANTES de `find_or_create_inbox_conversation`, verificar se o número tem `inbox_csat_responses` com `score IS NULL` AND `sent_at IS NOT NULL`
- Se o content é número 1-5: UPDATE score + responded_at, NÃO criar nova conversa
- Se não é número: fluxo normal

### UI InboxMetrics
- Seção "Satisfação": avg score, distribuição 1-5 (bar), taxa de resposta

---

## F2 — SLA Tracking + Alertas Visuais

### Migration `sprint7_sla`
```sql
ALTER TABLE public.inbox_conversations
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS sla_first_response_minutes integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS sla_resolution_minutes integer DEFAULT 480;
```

### Preenchimento do first_response_at
**Modificação `evolution-webhook/index.ts`:** ao INSERT de mensagem com `sender_type = 'agent'`, se `first_response_at IS NULL`: UPDATE `inbox_conversations SET first_response_at = now()`

### Novo componente `src/components/inbox/SlaIndicator.tsx`
- Props: `{ createdAt: string; firstResponseAt: string | null; slaMinutes: number }`
- 🟢 < 50% do tempo | 🟡 50-90% | 🔴 > 90% ou estourado
- Exibir apenas se `firstResponseAt IS NULL`

**Modificação `ConversationList.tsx`:** adicionar `<SlaIndicator>` na linha de cada conversa

**Painel SLA no InboxMetrics:** TMA, TMR, % dentro do SLA

---

## F3 — Auto-assign Round-Robin

### Migration `sprint7_auto_assign`
```sql
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS auto_assign_enabled boolean DEFAULT false;

ALTER TABLE public.empresa_users
  ADD COLUMN IF NOT EXISTS inbox_available boolean DEFAULT true;

CREATE TABLE IF NOT EXISTS public.inbox_assign_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.inbox_conversations(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id),
  assigned_at timestamptz DEFAULT now()
);
ALTER TABLE public.inbox_assign_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresa members read assign log" ON public.inbox_assign_log
  FOR SELECT USING (empresa_id IN (SELECT empresa_id FROM public.empresa_users WHERE user_id = auth.uid()));
```

### Edge function `inbox-auto-assign` (verify_jwt: false + CRON_SECRET)
- Busca conversas: `status = 'waiting_human'`, `assigned_user_id IS NULL`, empresa com `auto_assign_enabled = true`
- Agentes disponíveis: `empresa_users WHERE inbox_available = true`
- Round-robin: atribui ao agente com menos conversas ativas (`human_active` + `waiting_human`)
- UPDATE `inbox_conversations SET assigned_user_id` + INSERT em `inbox_assign_log`

### UI `EvolutionSettings.tsx`
- Nova aba `auto_assign`:
  - Toggle "Auto-assign ativo" → UPDATE `empresas.auto_assign_enabled`
  - Lista de agentes com toggle "Disponível" → UPDATE `empresa_users.inbox_available`

---

## F4 — Follow-up Automático

### Migration `sprint7_followup`
```sql
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS followup_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_delay_days integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS followup_message text DEFAULT 'Olá! Passando para verificar se ainda posso te ajudar. 😊';

ALTER TABLE public.inbox_conversations
  ADD COLUMN IF NOT EXISTS last_followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_count integer DEFAULT 0;
```

### Edge function `inbox-followup` (verify_jwt: false + CRON_SECRET)
- SELECT conversas WHERE `status IN ('waiting_human','human_active')` AND `last_message_at < now() - INTERVAL '${followup_delay_days} days'` AND `followup_count < 3`
- Para cada: envia `followup_message` via Evolution API
- UPDATE `last_followup_at = now(), followup_count = followup_count + 1`

### UI `EvolutionSettings.tsx` (aba `auto_assign` ou nova aba `automations`)
- Toggle "Follow-up automático"
- Input numérico "Após quantos dias" (1-7)
- Textarea para mensagem personalizada

---

## F5 — Keyword Auto-responder

### Migration `sprint7_keywords`
```sql
CREATE TABLE IF NOT EXISTS public.inbox_keyword_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  response text NOT NULL,
  is_active boolean DEFAULT true,
  match_type text DEFAULT 'contains' CHECK (match_type IN ('contains', 'exact', 'starts_with')),
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (empresa_id, keyword)
);
ALTER TABLE public.inbox_keyword_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresa members manage keyword rules" ON public.inbox_keyword_rules
  FOR ALL USING (empresa_id IN (SELECT empresa_id FROM public.empresa_users WHERE user_id = auth.uid()));
```

### Lógica no webhook
**Modificação `evolution-webhook/index.ts`:**
- Ao receber mensagem de contato: buscar `inbox_keyword_rules WHERE empresa_id = X AND is_active = true ORDER BY priority DESC`
- Primeira match (contains/exact/starts_with): enviar `response` como `sender_type = 'bot'`
- Executar ANTES de verificar `bot_paused` (keywords têm prioridade máxima)

### Novo componente `src/components/inbox/KeywordRulesManager.tsx`
- Lista de regras com Edit/Delete inline
- Form: keyword + response + match_type + toggle ativo
- Botão "Adicionar regra"

**Modificação `EvolutionSettings.tsx`:** nova aba `keywords` renderiza `<KeywordRulesManager />`

---

## F6 — Exportação CSV do InboxMetrics

**Modificação `InboxMetrics.tsx`:**
- Botão "Exportar CSV" (ícone `Download`)
- Busca conversas do período: `id, contact_phone, contact_name, status, created_at, first_response_at, closed_at, assigned_user_id, tags` + JOIN `inbox_csat_responses` para score
- Função utilitária:
  ```ts
  function toCsv(rows: Record<string, unknown>[], cols: string[]): string {
    const header = cols.join(',')
    const body = rows.map(r =>
      cols.map(c => JSON.stringify(r[c] ?? '')).join(',')
    ).join('\n')
    return `${header}\n${body}`
  }
  ```
- Download: `URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))` + `<a download="metricas-inbox.csv">`

---

## Migrations (aplicar via Supabase MCP em gpxmkximudukbljrvtxj)

1. `sprint7_csat`
2. `sprint7_empresa_csat_settings`
3. `sprint7_sla`
4. `sprint7_auto_assign`
5. `sprint7_followup`
6. `sprint7_keywords`

---

## Edge Functions a deployar

1. `send-csat` (verify_jwt: true)
2. `inbox-auto-assign` (verify_jwt: false)
3. `inbox-followup` (verify_jwt: false)

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| `src/components/inbox/SlaIndicator.tsx` | NOVO |
| `src/components/inbox/KeywordRulesManager.tsx` | NOVO |
| `supabase/functions/send-csat/index.ts` | NOVO |
| `supabase/functions/inbox-auto-assign/index.ts` | NOVO |
| `supabase/functions/inbox-followup/index.ts` | NOVO |
| `src/components/inbox/ChatArea.tsx` | MODIFICAR |
| `src/components/inbox/ConversationList.tsx` | MODIFICAR |
| `src/components/inbox/EvolutionSettings.tsx` | MODIFICAR |
| `src/pages/app/InboxMetrics.tsx` | MODIFICAR |
| `supabase/functions/evolution-webhook/index.ts` | MODIFICAR |

---

## Critério de Done

- [ ] F1: fechar conversa dispara CSAT; score capturado no webhook
- [ ] F2: SlaIndicator com cores + TMA/TMR no InboxMetrics
- [ ] F3: toggle auto-assign funcional; novas conversas atribuídas round-robin
- [ ] F4: follow-up enviado após N dias sem resposta (até 3x)
- [ ] F5: keyword rules CRUD + respostas automáticas via webhook
- [ ] F6: botão CSV gera download com dados de conversas do período
- [ ] 6 migrations aplicadas
- [ ] 3 edge functions deployed
- [ ] TypeScript zero erros: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
- [ ] 6 commits atômicos (F1 → F6)

---

## Instruções críticas

⚠️ **REGRA ABSOLUTA:** Read em TODOS os arquivos existentes imediatamente antes de cada Edit.

⚠️ O `evolution-webhook/index.ts` tem ~600+ linhas após Sprint 6 — ler COMPLETO.

⚠️ Verificar git log antes de começar:
```bash
git -C /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite log --oneline -5
```
Último commit deve ser `8e89d19 feat(inbox): F6 Sprint6`.

⚠️ CSAT: a captura da resposta no webhook deve ocorrer ANTES de `find_or_create_inbox_conversation`. Se score válido (1-5), NÃO criar conversa nova.

⚠️ Keywords: buscar regras da empresa com `SELECT ... LIMIT 50` para evitar full scan.

⚠️ Nas edge functions Deno: NUNCA SDK. Sempre fetch direto.
