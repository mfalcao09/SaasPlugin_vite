# Sprint 9 — "Analytics Avançado & Configurações Finais"

**Objetivo:** transformar InboxMetrics em dashboard profissional com filtros de período, funil de conversão, tabela de performance por agente e exportação PDF — e adicionar configurações operacionais avançadas (alertas WhatsApp para o dono, API key para integrações externas).

**Projeto:** NexvyOficinas (`apps/NexvyOficinas/`)
**Supabase project_id:** `gpxmkximudukbljrvtxj`
**Branch:** main

---

## ⚠️ PARTICIONAMENTO DE ARQUIVOS (paralelismo com S10)

**S9 é DONO de:**
- `src/pages/app/InboxMetrics.tsx` — todas as modificações de analytics
- `src/components/inbox/EvolutionSettings.tsx` — novas abas

**S9 NÃO TOCA:**
- `src/App.tsx`
- `src/components/layout/AppLayout.tsx`
- `supabase/functions/evolution-webhook/index.ts`

Esses arquivos são exclusivos do Sprint 10.

---

## Features (F1–F6)

| # | Feature | Esforço | Impacto |
|---|---|---|---|
| F1 | Filtro de Período no InboxMetrics | S | ⭐⭐⭐ Usabilidade |
| F2 | Funil de Conversação (chart) | M | ⭐⭐⭐ Insights |
| F3 | Tabela de Performance por Agente | M | ⭐⭐⭐ Gestão |
| F4 | Exportação PDF do Dashboard | S | ⭐⭐ Relatório |
| F5 | Alertas WhatsApp para o Dono | M | ⭐⭐⭐ Operação |
| F6 | Geração de API Key (integrações) | M | ⭐⭐ Ecossistema |

---

## F1 — Filtro de Período no InboxMetrics

### Modificar `InboxMetrics.tsx`
- Adicionar estado `period: '7d' | '30d' | '90d' | 'month'` com default `'30d'`
- Seletor de período no header (tabs ou select): "7 dias / 30 dias / 90 dias / Este mês"
- Função helper:
  ```ts
  function getPeriodStart(period: '7d' | '30d' | '90d' | 'month'): string {
    const now = new Date()
    if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  }
  ```
- Aplicar `.gte('created_at', periodStart)` nas queries de conversas encerradas e CSAT
- Adicionar `period` no array de dependências do useEffect principal

---

## F2 — Funil de Conversação

### Modificar `InboxMetrics.tsx`
- Buscar contagens para cada estágio no período selecionado:
  - Total recebidas: `COUNT(*) WHERE created_at >= periodStart`
  - Chegaram ao humano: `COUNT(*) WHERE status IN ('human_active','waiting_human') OR closed_at IS NOT NULL`
  - Encerradas: `COUNT(*) WHERE status = 'closed' AND created_at >= periodStart`
- Calcular taxas de conversão entre estágios
- Renderizar com recharts `BarChart` horizontal (já instalado):
  ```
  📥 Recebidas (100%)  →  👤 Humano (45%)  →  ✅ Encerradas (38%)
  ```
- Cada barra: cor diferente, tooltip com count absoluto + %

---

## F3 — Tabela de Performance por Agente

### Modificar `InboxMetrics.tsx`
- Buscar dados no período selecionado:
  ```ts
  // Conversas por agente
  supabase.from('inbox_conversations')
    .select('assigned_user_id, closed_at, first_response_at, created_at')
    .eq('empresa_id', empresaId)
    .not('assigned_user_id', 'is', null)
    .gte('created_at', periodStart)

  // CSAT por conversa (JOIN no frontend)
  supabase.from('inbox_csat_responses')
    .select('score, conversation_id')
    .eq('empresa_id', empresaId)
    .not('score', 'is', null)
  ```
- Agregar no frontend por `assigned_user_id`: total conversas, encerradas, avg CSAT, TMA médio
- Buscar nomes/emails via `empresa_users` JOIN
- Renderizar tabela ordenável por CSAT desc com badges 🥇🥈🥉 para top 3

---

## F4 — Exportação PDF do Dashboard

### Modificar `InboxMetrics.tsx`
- Botão "Exportar PDF" (ícone `Printer`) ao lado do botão "Exportar CSV"
- Implementação via `window.print()` — zero dependências externas:
  ```ts
  function handleExportPdf() {
    window.print()
  }
  ```
- Adicionar Tailwind `print:hidden` nos botões de ação e nav
- Adicionar cabeçalho print-only com nome da empresa + data de geração via `print:block`
- Background branco em `@media print` para economizar tinta

---

## F5 — Alertas WhatsApp para o Dono

### Migration `sprint9_alerts`
```sql
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS alert_phone text,
  ADD COLUMN IF NOT EXISTS alert_new_conversation boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_low_csat boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_queue_threshold integer DEFAULT 0;
```

### Modificar `EvolutionSettings.tsx` — nova aba `alertas`
- Input "Número para alertas" (formato: 5511999999999)
- Toggle "Nova conversa aberta" → UPDATE `alert_new_conversation`
- Toggle "CSAT baixo (score ≤ 2)" → UPDATE `alert_low_csat`
- Input numérico "Fila > N conversas aguardando" → UPDATE `alert_queue_threshold`
- Botão "Salvar configurações de alerta"

⚠️ **O DISPARO dos alertas** (chamada Evolution API) é responsabilidade do Sprint 10 — aqui só salvamos a configuração.

---

## F6 — Geração de API Key para Integrações

### Migration `sprint9_api_key`
```sql
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS api_key text UNIQUE DEFAULT gen_random_uuid()::text;

-- Gerar chave para empresas existentes que ficaram com NULL
UPDATE public.empresas SET api_key = gen_random_uuid()::text WHERE api_key IS NULL;
```

### Modificar `EvolutionSettings.tsx` — nova aba `api`
- Exibe API key mascarada: `••••••••••••••••abcd1234`
- Botão "Mostrar" (toggle visibilidade)
- Botão "Regenerar chave" → UPDATE `api_key = gen_random_uuid()::text` (com modal de confirmação)
- Copy to clipboard button (`navigator.clipboard.writeText`)
- Seção "Como usar":
  ```
  curl -H "x-api-key: SUA_CHAVE" \
    https://gpxmkximudukbljrvtxj.supabase.co/functions/v1/evolution-webhook
  ```
- Aviso: "Nunca compartilhe sua chave. Use apenas em integrações server-to-server."

---

## Migrations (aplicar via Supabase MCP em `gpxmkximudukbljrvtxj`)

1. `sprint9_alerts`
2. `sprint9_api_key`

---

## Arquivos a modificar

| Arquivo | Ação |
|---|---|
| `src/pages/app/InboxMetrics.tsx` | MODIFICAR (F1–F4) |
| `src/components/inbox/EvolutionSettings.tsx` | MODIFICAR (F5–F6) |

**Nenhum novo arquivo de rota ou componente standalone** — tudo extensão de páginas existentes.

---

## Critério de Done

- [ ] F1: seletor de período funcional, dados recarregam ao mudar
- [ ] F2: funil de conversação renderiza com % corretos
- [ ] F3: tabela de agentes ordenável com CSAT e TMA
- [ ] F4: `window.print()` gera PDF limpo sem nav/botões
- [ ] F5: EvolutionSettings aba "alertas" salva config no banco
- [ ] F6: EvolutionSettings aba "api" com chave visível/ocultável/regenerável/copiável
- [ ] 2 migrations aplicadas
- [ ] TypeScript zero erros: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
- [ ] 6 commits atômicos (F1 → F6)

---

## Instruções críticas

⚠️ **REGRA ABSOLUTA:** Read em TODOS os arquivos existentes imediatamente antes de cada Edit.

⚠️ `InboxMetrics.tsx` tem ~400+ linhas após S7 — ler COMPLETO antes de modificar.

⚠️ `EvolutionSettings.tsx` tem muitas abas (bot, horários, broadcast, auto_assign, keywords, templates, chatbot) após S7+S8 — ler COMPLETO, NÃO duplicar abas existentes.

⚠️ Verificar git log antes de começar:
```bash
git -C /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite log --oneline -8
```

⚠️ NÃO tocar em `App.tsx`, `AppLayout.tsx`, `evolution-webhook/index.ts` — exclusivos do Sprint 10.

⚠️ Nas edge functions Deno: NUNCA SDK. Sempre fetch direto.
