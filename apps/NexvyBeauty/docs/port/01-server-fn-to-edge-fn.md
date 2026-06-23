# Port — Template: server function (CBA) → edge function (NX)

> **Onda 0 / referência consumida por TODAS as ondas de port.**
> Toda lógica de servidor do CBA (`src/lib/**/*.functions.ts`, TanStack `createServerFn`)
> precisa ser **re-homeada** — `createServerFn` NÃO existe no NexvyBeauty. Há dois destinos.

## Regra de decisão (qual destino)

| Natureza da lógica no CBA | Destino no NX |
|---|---|
| Leitura/escrita simples, escopada ao tenant, **sem segredo** | **Client + Supabase + RLS** — chamar `supabase.from(...)` direto no React; a RLS por `organization_id` garante o isolamento. **Sem edge fn.** |
| Usa privilégio (`service_role`), cross-tenant, segredo/API key, orquestra (LLM/WhatsApp/Cakto), ou é webhook | **Edge function Deno** (`supabase/functions/<nome>/index.ts`) |

> ⚠️ Nunca importe a `service_role` key em código alcançável pelo bundle Vite (CLAUDE.md §11.1). Ela vive só dentro da edge fn: `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.

## Antes (CBA — TanStack server fn, in-process)
```ts
// src/lib/public-booking.functions.ts
export const getAvailableSlots = createServerFn({ method: 'GET' })
  .validator((d: { salaoId: string; servicoId: string; data: string }) => d)
  .handler(async ({ data }) => {
    const sb = getServerSupabase()                  // server client, acesso direto
    const { data: prof } = await sb.from('profissional').select('*')   // singular PT
    // ...calcula slots...
    return slots
  })
```

## Depois (NX — edge function Deno)
Copiar a casca de `supabase/functions/evolution-send/index.ts` (cors + auth + org) ou `lead-nba/index.ts`:
```ts
// supabase/functions/salao-availability/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({}))
    // auth: derivar org do Bearer — ver evolution-send linhas ~79-89 (getUser -> profiles.organization_id)
    const { data: prof } = await sb.from('profissionais').select('*')   // NX: plural (ver 02-naming-map)
    // ...lógica re-homeada...
    return json({ slots: [] })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500)
  }
})
```
- **Deploy:** `supabase functions deploy salao-availability --project-ref fzhlbwhdejumkyqosuvq` (ou MCP `deploy_edge_function`).
- **Chamada no client:** `supabase.functions.invoke('salao-availability', { body: {...} })`.

## Checklist por re-home
- [ ] Decidiu destino (client+RLS vs edge fn) pela regra acima.
- [ ] Traduziu nomes de tabela/coluna pelo `02-naming-map.md`.
- [ ] `verify_jwt`: público → `false`; autenticado → `true`.
- [ ] `service_role` só dentro da edge fn (nunca no bundle).
- [ ] Zero `@lovable.dev/*` no código portado.
- [ ] Pós-deploy: provar com `invoke` real (não só "deploy sem erro").
