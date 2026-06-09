# Sprint 10 — "Multi-Canal, Webchat & Estabilização"

**Objetivo:** abrir novos canais de atendimento (Instagram DM, webchat embeddable), adicionar wizard de onboarding para novos clientes, ativar disparo dos alertas WhatsApp configurados no S9, implementar error boundary global e finalizar todas as rotas/nav de S9+S10.

**Projeto:** NexvyOficinas (`apps/NexvyOficinas/`)
**Supabase project_id:** `gpxmkximudukbljrvtxj`
**Branch:** main

---

## ⚠️ PARTICIONAMENTO DE ARQUIVOS (paralelismo com S9)

**S10 é DONO de:**
- `src/App.tsx` — adicionar TODAS as novas rotas (de S9 E S10)
- `src/components/layout/AppLayout.tsx` — adicionar TODOS os novos links de nav (de S9 E S10)
- `supabase/functions/evolution-webhook/index.ts` — Instagram DM + disparos de alertas

**S10 NÃO TOCA:**
- `src/pages/app/InboxMetrics.tsx`
- `src/components/inbox/EvolutionSettings.tsx`

Esses arquivos são exclusivos do Sprint 9.

**Responsabilidade de integração:** S10 é o sprint "integrador" — ele adiciona os links/rotas das páginas que S9 criou internamente, garantindo que tudo fique navegável ao final.

---

## Features (F1–F6)

| # | Feature | Esforço | Impacto |
|---|---|---|---|
| F1 | App.tsx + AppLayout.tsx — integrar rotas/nav de S9 E S10 | S | ⭐⭐⭐ Navegação |
| F2 | Disparo de Alertas WhatsApp (config do S9) | M | ⭐⭐⭐ Operação |
| F3 | Instagram DM Channel | L | ⭐⭐⭐ Multi-canal |
| F4 | Webchat Widget Embeddable | L | ⭐⭐⭐ Multi-canal |
| F5 | Onboarding Wizard para novos tenants | M | ⭐⭐ Ativação |
| F6 | Error Boundary Global + Estabilização | S | ⭐⭐⭐ Resiliência |

---

## F1 — Rotas e Navegação (integrador)

### Modificar `src/App.tsx`
Adicionar rotas lazy-loaded para TODAS as páginas novas de S9 e S10:
```tsx
// S10 new pages
const OnboardingWizard = lazy(() => import('./pages/app/OnboardingWizard'))
const WebchatConfig = lazy(() => import('./pages/app/WebchatConfig'))

// Routes inside PrivateRoute wrapper (ler App.tsx completo antes de editar)
<Route path="/inbox/onboarding" element={<OnboardingWizard />} />
<Route path="/inbox/webchat" element={<WebchatConfig />} />
```

### Modificar `src/components/layout/AppLayout.tsx`
Adicionar links no menu lateral (ler AppLayout.tsx completo antes de editar):
```
🌐 Webchat           (novo S10 — /inbox/webchat)
🧭 Config. Inicial   (novo S10 — /inbox/onboarding, só para admin)
```

---

## F2 — Disparo de Alertas WhatsApp

### Modificar `supabase/functions/evolution-webhook/index.ts`

Usar as colunas de config gravadas pelo S9 (`alert_phone`, `alert_new_conversation`, `alert_low_csat`, `alert_queue_threshold`):

**Trigger 1 — Nova conversa:**
- Após `find_or_create_inbox_conversation` criar conversa NOVA (is_new = true)
- Se `empresa.alert_new_conversation = true` E `empresa.alert_phone IS NOT NULL`
- Enviar via Evolution API: `"📬 Nova conversa de {contact_name} ({phone})"`

**Trigger 2 — CSAT baixo:**
- Após capturar score CSAT (UPDATE `inbox_csat_responses SET score`)
- Se `score <= 2` E `empresa.alert_low_csat = true` E `empresa.alert_phone IS NOT NULL`
- Enviar: `"⚠️ CSAT baixo ({score}/5) de {contact_name}"`

**Trigger 3 — Fila acima do threshold:**
- Após criar/atualizar conversa com `status = 'waiting_human'`
- COUNT conversas `waiting_human` da empresa
- Se count >= `alert_queue_threshold` (threshold > 0) E `alert_phone IS NOT NULL`
- Enviar (só uma vez a cada 5 min — checar `last_queue_alert_at` na empresa):
  `"🔔 Fila: {count} conversas aguardando atendimento"`

Implementação via fetch direto à Evolution API (mesmo padrão das mensagens de CSAT — nunca SDK).

---

## F3 — Instagram DM Channel

### Migration `sprint10_channel`
```sql
ALTER TABLE public.inbox_conversations
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp'
  CHECK (channel IN ('whatsapp', 'instagram', 'webchat'));

ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';

CREATE INDEX IF NOT EXISTS idx_inbox_conversations_channel
  ON public.inbox_conversations(empresa_id, channel);
```

### Modificar `supabase/functions/evolution-webhook/index.ts`
A Evolution API envia Instagram DMs com `data.key.remoteJid` terminando em `@instagram`.

Adicionar parsing do canal:
```ts
const channel = data.key?.remoteJid?.includes('@instagram') ? 'instagram' : 'whatsapp'
```

Passar `channel` para `find_or_create_inbox_conversation` e para INSERT de mensagens.

---

## F4 — Webchat Widget Embeddable

### Nova edge function `supabase/functions/webchat-handler/index.ts`
`verify_jwt: false` — recebe mensagens do widget externo.

```ts
// Headers esperados: x-api-key: string
// Body: { contact_name: string; message: string; session_id: string; contact_email?: string }

// 1. Validar api_key: SELECT id, evolution_instance FROM empresas WHERE api_key = $apiKey
// 2. find_or_create_inbox_conversation (channel = 'webchat', contact_phone = 'webchat_' + session_id)
// 3. INSERT inbox_messages (content, sender_type = 'contact', channel = 'webchat')
// 4. Return { conversation_id, session_id }
```

### Nova edge function `supabase/functions/webchat-widget/index.ts`
`verify_jwt: false` — serve o snippet JS embeddable.

```ts
// GET /webchat-widget?key=EMPRESA_API_KEY
// Validar que a empresa existe (SELECT id FROM empresas WHERE api_key = $key)
// Buscar config: webchat_greeting, webchat_primary_color, webchat_agent_name
// Retornar: Content-Type: application/javascript
// Body: script inline minificado que injeta botão flutuante + iframe no DOM do cliente
```

O script injetado deve criar um iframe apontando para a URL pública do inbox widget. Uso no site do cliente:
```html
<script src="https://gpxmkximudukbljrvtxj.supabase.co/functions/v1/webchat-widget?key=API_KEY"></script>
```

### Novo arquivo `src/pages/app/WebchatConfig.tsx`
Página `/inbox/webchat` (rota adicionada em F1):
- Seção "Snippet de Incorporação": textarea read-only com `<script src="...?key={api_key}">` da empresa
- Botão "Copiar snippet" (`navigator.clipboard.writeText`)
- Seção "Personalização": cor primária (color input), mensagem de boas-vindas (textarea), nome do atendente — SAVE via UPDATE `empresas SET webchat_*`
- Preview visual simulado do widget (mockup HTML/CSS inline, sem iframe real)

### Migration `sprint10_webchat_config`
```sql
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS webchat_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS webchat_greeting text DEFAULT 'Olá! Como posso ajudar?',
  ADD COLUMN IF NOT EXISTS webchat_primary_color text DEFAULT '#ea580c',
  ADD COLUMN IF NOT EXISTS webchat_agent_name text DEFAULT 'Suporte',
  ADD COLUMN IF NOT EXISTS last_queue_alert_at timestamptz;
```

---

## F5 — Onboarding Wizard para Novos Tenants

### Migration `sprint10_onboarding`
```sql
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
```

### Novo arquivo `src/pages/app/OnboardingWizard.tsx`
Rota `/inbox/onboarding` (rota adicionada em F1):

5 passos com barra de progresso:
1. **Conectar WhatsApp** — checar se `evolution_instance IS NOT NULL` → ✅ ou link para EvolutionSettings
2. **Configurar bot** — checar `bot_enabled` → ✅ ou link config
3. **Adicionar atendentes** — listar `empresa_users`, contagem, botão "Convidar" (abre modal com email)
4. **Definir horários** — checar `office_hours_enabled` → ✅ ou link config
5. **Enviar teste** — input de número, botão "Enviar mensagem de teste" → chama `supabase.functions.invoke('evolution-send', { body: { ... } })`

Lógica de estado: cada passo avalia condição em tempo real via queries Supabase.
Ao todos os passos OK: UPDATE `onboarding_completed_at = now()`, mostrar tela de conclusão com badge 🎉.

---

## F6 — Error Boundary Global + Estabilização

### Novo arquivo `src/components/ErrorBoundary.tsx`
```tsx
import { Component, ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <p className="text-slate-400 mb-2 text-sm font-mono">{this.state.error?.message}</p>
            <button onClick={() => window.location.reload()}
              className="flex items-center gap-2 mx-auto px-4 py-2 bg-orange-600 text-white rounded-lg">
              <RefreshCw className="w-4 h-4" /> Recarregar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
```

### Modificar `src/App.tsx`
Envolver as rotas com `<ErrorBoundary>`:
```tsx
import { ErrorBoundary } from './components/ErrorBoundary'
// ...
<ErrorBoundary>
  <Suspense fallback={<LoadingSpinner />}>
    {/* rotas existentes + novas */}
  </Suspense>
</ErrorBoundary>
```

### Cleanup de subscriptions (estabilização)
Verificar em `ChatArea.tsx`, `ConversationList.tsx`, `NotificationBell.tsx`:
- Todos os `supabase.channel(...).subscribe(...)` têm `return () => channel.unsubscribe()` no cleanup do useEffect
- Todos os `setInterval`/`setTimeout` têm `clearInterval`/`clearTimeout` no cleanup

---

## Migrations (aplicar via Supabase MCP em `gpxmkximudukbljrvtxj`)

1. `sprint10_channel`
2. `sprint10_webchat_config`
3. `sprint10_onboarding`

---

## Edge Functions a deployar

1. `webchat-handler` (verify_jwt: false)
2. `webchat-widget` (verify_jwt: false)

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| `src/App.tsx` | MODIFICAR (F1 — novas rotas) |
| `src/components/layout/AppLayout.tsx` | MODIFICAR (F1 — novos links nav) |
| `supabase/functions/evolution-webhook/index.ts` | MODIFICAR (F2 alertas + F3 Instagram) |
| `src/pages/app/WebchatConfig.tsx` | NOVO (F4) |
| `supabase/functions/webchat-handler/index.ts` | NOVO (F4) |
| `supabase/functions/webchat-widget/index.ts` | NOVO (F4) |
| `src/pages/app/OnboardingWizard.tsx` | NOVO (F5) |
| `src/components/ErrorBoundary.tsx` | NOVO (F6) |

---

## Critério de Done

- [ ] F1: rotas `/inbox/webchat` e `/inbox/onboarding` navegáveis, links no menu lateral
- [ ] F2: alertas WhatsApp disparam nos 3 cenários (nova conv, CSAT baixo, fila)
- [ ] F3: evolution-webhook parseia `@instagram`, salva com `channel='instagram'`
- [ ] F4: snippet embeddable funcional, POST para webchat-handler cria conversa no inbox
- [ ] F5: wizard 5 passos com estados visuais corretos, completion salvo
- [ ] F6: ErrorBoundary captura erros React, mostra fallback sem crash silencioso
- [ ] 3 migrations aplicadas
- [ ] 2 edge functions deployed
- [ ] TypeScript zero erros: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
- [ ] 6 commits atômicos (F1 → F6)

---

## Instruções críticas

⚠️ **REGRA ABSOLUTA:** Read em TODOS os arquivos existentes imediatamente antes de cada Edit.

⚠️ `evolution-webhook/index.ts` tem 1000+ linhas após S7+S8 — ler COMPLETO antes de modificar.

⚠️ `App.tsx` e `AppLayout.tsx` têm rotas de sprints anteriores — ler COMPLETO, não substituir.

⚠️ Verificar git log antes de começar:
```bash
git -C /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite log --oneline -10
```

⚠️ NÃO tocar em `InboxMetrics.tsx` nem `EvolutionSettings.tsx` — exclusivos do Sprint 9.

⚠️ Nas edge functions Deno: NUNCA SDK. Sempre fetch direto.

⚠️ `webchat-widget` retorna `Content-Type: application/javascript` — NÃO `application/json`.

⚠️ F2 (alertas): ler colunas `alert_*` da empresa antes de disparar. NUNCA enviar alerta sem config.
