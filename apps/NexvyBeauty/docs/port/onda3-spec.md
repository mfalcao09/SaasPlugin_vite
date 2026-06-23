# Onda 3 — Web-Push + PWA: SPEC de Implementação (port CBA → NexvyBeauty)

> **Status:** pronto para execução · **Data:** 2026-06-23 · **App alvo:** `apps/NexvyBeauty` · **Projeto Supabase:** `fzhlbwhdejumkyqosuvq`
> **Base:** 2 mapeamentos verificados contra schema vivo + código real (não contra disco).

[Provável] Antes de começar: este SPEC assume que a **Onda 2 (booking público em `salao-public-booking`) já está em produção** — o wiring do Passo 6 depende do ponto exato após o insert do agendamento (~linha 105, junto ao bloco MoAT WhatsApp). Se a Onda 2 não estiver mergeada, faça os Passos 1–5 mesmo assim e deixe o Passo 6 como follow-up imediato.

---

## 1. Título + Objetivo

**Objetivo:** quando um cliente agenda pelo link público do salão (Onda 2), o **dono/admin do salão recebe um push no celular** mesmo com o app fechado — "Novo agendamento: Corte em 24/06 às 14h". O push é **aditivo** ao que já existe (in-app `notifications` + WhatsApp MoAT), nunca substitui nem bloqueia o agendamento.

**Escopo desta onda:**
- Tabela `push_subscriptions` (NX, multi-tenant por `organization_id`).
- Par VAPID gerado 1x, guardado como **Supabase secrets** (nunca no bundle Vite).
- Helper compartilhado `_shared/web-push.ts` (Deno, Web Crypto) com GC de subscriptions mortas (404/410).
- 1 edge fn de envio `salao-push-send` + edge fns de ciclo de vida (`push-vapid-public`, `push-subscribe`, `push-unsubscribe`).
- Handlers `push` / `notificationclick` adicionados ao `public/sw.js` **cache-less** já existente.
- UI "Ativar notificações" em Configurações.
- Wiring fire-and-forget em `salao-public-booking`.

**ADIADO nesta onda (e por quê):**
- **SSR / auth-gate de borda (Cloudflare) do CBA.** O NX é SPA Vite + React Router servido via Traefik — não há camada SSR. O `requireSupabaseAuth` do CBA (middleware TanStack) vira **validação de JWT inline dentro de cada edge fn** (padrão já usado em `evolution-send`/`inbox-copilot`). Trazer SSR só para push é baixo valor imediato e alto custo arquitetural. Tratar como deferral explícito, fora de escopo.
- Não portar o `sw.js` do CBA por cima do atual (ver Decisão D5 — causa do spinner infinito).

---

## 2. Decisões travadas

| # | Decisão | Justificativa |
|---|---------|---------------|
| **D1** | **VAPID vive em Supabase secrets** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) — **não** em `platform_settings`. | `platform_settings` é singleton lido pelo SPA para branding (id/logo/evolution_*). A **private key é segredo de servidor** (CLAUDE.md §11.1: chave privada nunca trafega pelo frontend). A public key sai ao client só via edge fn `push-vapid-public`. |
| **D2** | **Nova tabela `push_subscriptions`** com `organization_id` (não `salao_id`) + RLS por user/org espelhando `user_notification_settings`. | Naming-map regra #2 (tenant = `organization_id`). `push_subscriptions` **não existe** no schema vivo — criar via migration. |
| **D3** | **Lib de web-push:** `@block65/webcrypto-web-push` via `esm.sh` (Web Crypto puro, roda em Deno edge). | A lib npm `web-push` do Node depende de `crypto`/`https` nativos do Node e **não roda em Deno**. A `@block65` é a mesma do CBA, já provada edge-compatible. |
| **D4** | **`notifications.type` reusa o ENUM existente** `notification_type = {cadence,urgency,opportunity,audit,system}`. Push de agendamento usa **`'opportunity'`**. | `type` é ENUM Postgres. INSERT com label fora dele = erro `22P02` em runtime. Não criar label novo sem `ALTER TYPE` (que não roda dentro de transação no mesmo statement). |
| **D5** | **`sw.js`: adicionar SÓ os 2 handlers** `push`/`notificationclick` ao SW cache-less atual. **JAMAIS** copiar o app-shell network-first do CBA. | O `sw.js` do NX é cache-less **de propósito** (comentário literal: o fetch network-first "previously caused infinite spinners after deploys"). O fetch handler continua vazio. |
| **D6** | **`user_notification_settings` JÁ é per-user** (tem `push_enabled` + `notify_appointments`). Reusar — a premissa do briefing "prefs por-org" estava errada. | Schema vivo confirma `user_id + organization_id + push_enabled + 6 booleans por-tipo`, incluindo `notify_appointments`. Gate de envio = `push_enabled=true AND notify_appointments=true`. |
| **D7** | **Dono/admin recebe o push, não o cliente.** Resolver donos via `profiles WHERE organization_id=org.id` + papel admin/manager (via `has_role`/`user_roles`), **não** via `organizations.owner_id` (esparso, só 1 de 3 orgs preenchido). | `owner_id` não é confiável. Pode haver N admins → loop, push para todos com `push_enabled`. |

---

## 3. Passo 1 — Migration

**Arquivo:** `supabase/migrations/<timestamp>_push_subscriptions.sql`

```sql
-- ============================================================
-- Onda 3 — Web Push: tabela de subscriptions + RLS
-- ============================================================

create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  ativo           boolean not null default true,
  ultimo_erro     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint push_subscriptions_user_endpoint_uniq unique (user_id, endpoint)
);

-- Índices para o caminho de envio (subs ativas por org/user)
create index if not exists push_subscriptions_org_idx
  on public.push_subscriptions (organization_id) where ativo;
create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id) where ativo;

-- updated_at automático
create or replace function public.tg_push_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_push_subscriptions_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.tg_push_subscriptions_updated_at();

-- ============================================================
-- RLS — espelha pattern de user_notification_settings
-- (cliente só enxerga/edita as PRÓPRIAS subs; envio usa service_role e bypassa RLS)
-- ============================================================
alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select
  on public.push_subscriptions for select
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()));

create policy push_subscriptions_insert
  on public.push_subscriptions for insert
  with check (user_id = auth.uid());

create policy push_subscriptions_update
  on public.push_subscriptions for update
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()))
  with check (user_id = auth.uid() or public.is_super_admin(auth.uid()));

create policy push_subscriptions_delete
  on public.push_subscriptions for delete
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()));
```

**Notas:**
- **Não** adicionar colunas VAPID em `platform_settings` (ver D1). VAPID vai em secrets (Passo 2).
- `notify_appointments` JÁ existe em `user_notification_settings` — **não** criar coluna nova. (Opcional futuro: `notify_new_booking` se quiser separar booking-público de appointment genérico; não nesta onda.)
- Helpers RLS canônicos usados: `is_super_admin(uid)`. Não inventar — já existem no projeto (`get_user_organization`, `user_belongs_to_organization`, `is_super_admin`, `has_role`).

**Verificação do passo:**
```sql
-- após apply: deve retornar a tabela com 4 policies e o unique
select policyname from pg_policies where tablename = 'push_subscriptions';   -- 4 linhas
select conname from pg_constraint where conrelid = 'public.push_subscriptions'::regclass
  and contype = 'u';                                                          -- push_subscriptions_user_endpoint_uniq
```

---

## 4. Passo 2 — Geração da VAPID

**Gerar o par (1x, local):**
```bash
# requer Node + npx; gera par no formato base64url correto p/ web-push
npx web-push generate-vapid-keys
# saída:
#   Public Key:  BNc...  (87 chars base64url)
#   Private Key: k3F...  (43 chars base64url)
```

> Alternativa sem instalar `web-push`: `npx @block65/webcrypto-web-push` não expõe CLI — usar o `web-push` só para gerar (a geração é offline, não vai pra runtime). O **runtime** usa `@block65` (D3).

**Setar como secrets (NUNCA commitar, NUNCA `NEXT_PUBLIC_*` / `VITE_*`):**
```bash
supabase secrets set \
  VAPID_PUBLIC_KEY='BNc...' \
  VAPID_PRIVATE_KEY='k3F...' \
  VAPID_SUBJECT='mailto:suporte@nexvybeauty.com.br' \
  --project-ref fzhlbwhdejumkyqosuvq
```

**Expor SÓ a pública ao client** — via edge fn `push-vapid-public` (Passo 3). O frontend nunca lê a private; nunca há VAPID no bundle Vite.

**Verificação do passo:**
```bash
supabase secrets list --project-ref fzhlbwhdejumkyqosuvq | grep VAPID
# deve listar VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (valores ocultos)
```
[Certo] CLAUDE.md §5/§11.1: inspecionar só por presença, nunca imprimir o valor cru da private key.

---

## 5. Passo 3 — Edge fn `salao-push-send` (+ helper + ciclo de vida)

Re-home do `push.server.ts` (CBA) para Deno. Quatro artefatos.

### 5.1 Helper compartilhado — `supabase/functions/_shared/web-push.ts`

**Contrato:** `sendPushToUser(supabase, userId, payload) → { ok, failed }`
**Payload:** `{ title: string; body?: string; url?: string; tag?: string }`

```ts
import { buildPushPayload } from "https://esm.sh/@block65/webcrypto-web-push";

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

function getVapid() {
  const publicKey  = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject    = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@nexvybeauty.com.br";
  if (!publicKey || !privateKey) throw new Error("VAPID ausente");
  return { publicKey, privateKey, subject };
}

// supabase = client SERVICE_ROLE (bypassa RLS — lê subs de qualquer user)
export async function sendPushToUser(
  supabase: any,
  userId: string,
  payload: PushPayload,
): Promise<{ ok: number; failed: number }> {
  const vapid = getVapid();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("ativo", true);
  if (error || !subs?.length) return { ok: 0, failed: 0 };

  let ok = 0, failed = 0;
  for (const sub of subs) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    try {
      // ttl maior que o CBA (60s): novo agendamento deve sobreviver app offline
      const req = await buildPushPayload(
        { data: payload, options: { ttl: 3600 } },
        subscription,
        vapid,
      );
      const res = await fetch(sub.endpoint, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
      if (res.ok || res.status === 201 || res.status === 202) {
        ok++;
      } else if (res.status === 404 || res.status === 410) {
        // GC de sub morta — desativa, não deleta (auditável)
        failed++;
        await supabase.from("push_subscriptions")
          .update({ ativo: false, ultimo_erro: `gone (${res.status})` })
          .eq("id", sub.id);
      } else {
        failed++;
        await supabase.from("push_subscriptions")
          .update({ ultimo_erro: `http ${res.status}` })
          .eq("id", sub.id);
      }
    } catch (e) {
      failed++;
      await supabase.from("push_subscriptions")
        .update({ ultimo_erro: String(e).slice(0, 500) })
        .eq("id", sub.id);
    }
  }
  return { ok, failed };
}
```

> [Provável] Confirmar a assinatura real de `buildPushPayload(message, subscription, vapid)` no primeiro deploy de teste — a API do `@block65` pode variar por versão. Pinar a versão no import (`@block65/webcrypto-web-push@<v>`) após validar.

### 5.2 Edge fn `salao-push-send` — `supabase/functions/salao-push-send/index.ts`

**Contrato (body):** `{ user_id?: string; organization_id?: string; title: string; body?: string; url?: string; tag?: string }`
- Se `user_id` → manda para aquele user.
- Se `organization_id` (sem `user_id`) → resolve donos/admins da org e faz fan-out.
- Chamada **interna** (server-to-server, de outra edge fn) usa `SERVICE_ROLE_KEY` no header; chamada de cliente usa JWT (mas o caso de uso é interno).

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPushToUser } from "../_shared/web-push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { user_id, organization_id, title, body, url, tag } = await req.json();
    if (!title) throw new Error("title obrigatório");

    const payload = { title, body, url, tag };
    let totalOk = 0, totalFailed = 0;

    if (user_id) {
      const r = await sendPushToUser(sb, user_id, payload);
      totalOk += r.ok; totalFailed += r.failed;
    } else if (organization_id) {
      // D7: donos/admins via profiles + papel; gate push_enabled + notify_appointments
      const { data: owners } = await sb
        .from("profiles")
        .select("id")
        .eq("organization_id", organization_id);
      // filtrar por papel admin/manager e prefs
      for (const o of owners ?? []) {
        const { data: prefs } = await sb
          .from("user_notification_settings")
          .select("push_enabled, notify_appointments")
          .eq("user_id", o.id)
          .eq("organization_id", organization_id)
          .maybeSingle();
        if (prefs?.push_enabled && prefs?.notify_appointments !== false) {
          const r = await sendPushToUser(sb, o.id, payload);
          totalOk += r.ok; totalFailed += r.failed;
        }
      }
    } else {
      throw new Error("informe user_id ou organization_id");
    }
    return new Response(JSON.stringify({ ok: totalOk, failed: totalFailed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

> O filtro de **papel** admin/manager (D7) deve usar o mecanismo real do NX (`user_roles` + `has_role`, ou coluna `role` em `profiles` — **confirmar antes de fechar** qual existe). O exemplo acima filtra só por org+prefs; adicionar o gate de papel quando confirmado.

### 5.3 Edge fn `push-vapid-public` — `supabase/functions/push-vapid-public/index.ts`
`verify_jwt=false`, GET. Devolve **só** a pública.
```ts
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({ publicKey: Deno.env.get("VAPID_PUBLIC_KEY") }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
```

### 5.4 Edge fn `push-subscribe` + `push-unsubscribe` — `supabase/functions/push-subscribe/index.ts`
JWT validado **dentro** da fn (gotcha de auth: user_id NUNCA vem do body).
```ts
// pseudo:
// 1. OPTIONS -> cors
// 2. sb = createClient(URL, SERVICE_ROLE)
// 3. token = req.headers.Authorization.replace('Bearer ','')
// 4. { data:{user} } = await sb.auth.getUser(token)   // <- user_id confiável
//    if (!user) -> 401
// 5. org = (await sb.from('profiles').select('organization_id').eq('id', user.id).single()).organization_id
// 6. { endpoint, p256dh, auth, user_agent } = body  (validação inline: regex/url, length caps)
//    endpoint <=2000, p256dh 10-500, auth 5-500, user_agent <=500
// 7. upsert push_subscriptions
//      ON CONFLICT (user_id, endpoint)
//      DO UPDATE SET p256dh, auth, user_agent, ativo=true, ultimo_erro=null, updated_at=now()
//    com user_id=user.id, organization_id=org
// 8. -> 200 { ok:true }
//
// push-unsubscribe: mesmo auth; UPDATE ativo=false WHERE user_id=user.id AND endpoint=body.endpoint
```
Validação **inline** estilo `salao-public-booking` (NX não usa Zod). CORS espelha `evolution-send` L3-7.

**Deploy + verificação do passo:**
```bash
supabase functions deploy salao-push-send push-vapid-public push-subscribe push-unsubscribe \
  --project-ref fzhlbwhdejumkyqosuvq
# verificar a public:
curl https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/push-vapid-public
# -> {"publicKey":"BNc..."}
```

---

## 6. Passo 4 — Service Worker

**Arquivo:** `public/sw.js` — **ADICIONAR** os 2 handlers ao SW cache-less existente. NÃO tocar em `install`/`activate`/`fetch` vazio/`message`. **Bumpar `SW_VERSION`** (força update do SW nos clients).

```js
// ... topo existente (comentário anti-stale + SW_VERSION) — BUMPAR a versão:
const SW_VERSION = 'nx-sw-v<N+1>';   // incrementar

// ... install / skipWaiting (existente, intacto)
// ... activate / caches.delete (existente, intacto)
// ... self.addEventListener('fetch', () => {});  // EXISTENTE — continua VAZIO
// ... message / SKIP_WAITING (existente, intacto)

// >>> ADICIONAR — handlers de Web Push (Onda 3) <<<
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { /* fallback default */ }
  const title = data.title || 'NexvyBeauty';
  event.waitUntil(
    self.registration.showNotification(title, {
      body:  data.body || '',
      icon:  '/icons/icon-192x192.png',   // path REAL do NX (não /icon-192.png do CBA)
      badge: '/icons/icon-192x192.png',
      data:  { url: data.url || '/app/dashboard' },
      tag:   data.tag,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/app/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(target) && 'focus' in w) return w.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
```

**Registro em `main.tsx`:** **NÃO mexer.** A lógica existente já registra `/sw.js` só em PROD/domínio custom e desregistra em dev/preview/iframe. O SW novo é compatível.
- [Certo] **Consequência esperada:** em dev/preview o SW é desregistrado → **push não funciona ali**. Testar push **só em PROD/domínio real**.

**Verificação do passo (pós-deploy front):** ver Checklist DONE — o `/sw.js` servido deve conter `addEventListener('push'` e o novo `SW_VERSION`.

---

## 7. Passo 5 — Subscription UI

**Arquivo:** `src/components/notifications/PushSubscriptionCard.tsx` (re-home do CBA para React puro, sem TanStack `useServerFn`).
**Onde montar:** tela **Configurações / Notificações** do app admin (`/app/configuracoes` ou equivalente) — perto do toggle de `user_notification_settings`.

**Lógica de browser = idêntica ao CBA** (copiar verbatim `urlBase64ToUint8Array`, `requestPermission`, `pushManager.subscribe`). Trocar: `useServerFn` → `fetch` às edge fns com JWT de `supabase.auth.getSession()`; toast `sonner` → toast do NX; ícone `/icon-192.png` → `/icons/icon-192x192.png`; url default → rota NX.

```tsx
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function ativarNotificacoes() {
  // 0. feature-detect
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast.error('Seu navegador não suporta notificações push.'); return;
  }
  // iOS: só funciona com PWA instalado + iOS >= 16.4
  // (detectar standalone; se iOS browser, instruir "Adicionar à Tela de Início")

  // 1. permissão
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast.error('Permissão negada.'); return; }

  // 2. SW pronto (registro já feito pelo main.tsx em prod)
  const reg = await navigator.serviceWorker.ready;

  // 3. public key via edge fn
  const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
  const { publicKey } = await fetch(`${FN}/push-vapid-public`).then(r => r.json());

  // 4. subscribe (applicationServerKey precisa ser Uint8Array)
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,                              // obrigatório no Chrome
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  // 5. extrai chaves + grava via edge fn (JWT)
  const json = sub.toJSON();
  const { data: { session } } = await supabase.auth.getSession();
  await fetch(`${FN}/push-subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
    }),
  });
  toast.success('Notificações ativadas!');
}

async function desativarNotificacoes() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${FN}/push-unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();  // remove no browser também
  }
  toast.success('Notificações desativadas.');
}
```
- Manter as classes dark/mobile (MOAT) do NX.
- Botão único "Ativar notificações" → vira "Desativar" quando já inscrito (checar `reg.pushManager.getSubscription()` no mount).

---

## 8. Passo 6 — Wiring com a Onda 2

**Arquivo:** `supabase/functions/salao-public-booking/index.ts`
**Ponto exato:** **DEPOIS** do insert do agendamento dar certo (após o `if (aErr)` de erro, ~linha 105) e **em paralelo ao bloco MoAT WhatsApp** (linhas 107-118). **Fire-and-forget** — try/catch, NUNCA derruba o agendamento.

```ts
import { sendPushToUser } from "../_shared/web-push.ts"; // ou chamar a edge fn salao-push-send

// ... após o insert do agendamento (linha ~105), antes/junto do bloco WhatsApp:

let push_enviado = false;
try {
  // org já está em escopo (org.id) e serv/data/hora vêm do agendamento criado
  const sbService = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  // fan-out p/ donos/admins via salao-push-send (mais limpo: 1 ponto de gating de papel/prefs)
  const r = await sendPushToOrg(sbService, org.id, {
    title: "Novo agendamento",
    body:  `${serv.nome} em ${formatBR(data)} às ${hora}`,
    url:   `/app/agenda?d=${data}`,
    tag:   "novo_agendamento",
  });
  push_enviado = (r.ok ?? 0) > 0;
} catch (_) { /* fire-and-forget: não bloqueia o agendamento */ }

// ... no JSON de retorno (linha ~120), ao lado de whatsapp_enviado:
return new Response(JSON.stringify({
  ok: true,
  agendamento_id: ...,
  whatsapp_enviado,
  push_enviado,           // <- ADICIONAR
}), { headers: ... });
```

> `sendPushToOrg` = a lógica de fan-out do Passo 5.2 (resolver donos via `profiles`+papel, gate `push_enabled`+`notify_appointments`, loop `sendPushToUser`). Extrair para o `_shared/web-push.ts` OU chamar a edge fn `salao-push-send` com `{ organization_id: org.id, ... }` (HTTP interno com `SERVICE_ROLE_KEY`). Preferir **import direto do helper** (menos latência, menos um hop).

**Verificação do passo:**
1. Criar agendamento pelo link público real.
2. Dono (com push ativado e app fechado) recebe a notificação no device.
3. Resposta da fn traz `"push_enviado": true`.
4. `select ok` na row do agendamento confirma que o push **não** travou o insert mesmo se o envio falhar.

---

## 9. Checklist binário de DONE

Cada item é passa/falha. Nada "pronto" sem prova externa (CLAUDE.md §4/§10).

- [ ] **Migration aplicada:** `select policyname from pg_policies where tablename='push_subscriptions'` → **4 linhas**; unique `push_subscriptions_user_endpoint_uniq` existe.
- [ ] **Secrets setados:** `supabase secrets list` mostra `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- [ ] **Public key exposta:** `curl .../functions/v1/push-vapid-public` → `{"publicKey":"BNc..."}` (e **nunca** a private em lugar nenhum).
- [ ] **4 edge fns deployadas:** `supabase functions list` mostra `salao-push-send`, `push-vapid-public`, `push-subscribe`, `push-unsubscribe`.
- [ ] **Front servido com SW novo (canal 1, deploy-vps.sh --no-cache obrigatório):** `curl https://app.nexvybeauty.com.br/sw.js` contém `addEventListener('push'` E o `SW_VERSION` bumpado. (Phantom deploy é risco conhecido no NX — provar com curl no bundle servido, não com build verde.)
- [ ] **Subscribe E2E (canal 2):** clicar "Ativar notificações" em PROD/domínio real → permissão granted → `select count(*) from push_subscriptions where user_id=<eu> and ativo` → **≥1 row** com `endpoint/p256dh/auth` preenchidos.
- [ ] **Push chega no device:** chamar `salao-push-send` com `{user_id:<eu>, title:'teste'}` → notificação aparece no celular (app fechado).
- [ ] **Wiring Onda 2:** agendamento público real → dono recebe push "Novo agendamento: ..." → resposta da fn tem `"push_enviado": true`.
- [ ] **Fire-and-forget provado:** forçar falha no envio (ex.: sub inválida) → agendamento **ainda** é criado (row existe) e a fn retorna 200.
- [ ] **GC funciona:** endpoint expirado (404/410) → `select ativo, ultimo_erro from push_subscriptions where id=<x>` → `ativo=false, ultimo_erro='gone (410)'`.
- [ ] **`notificationclick` navega:** clicar na notificação abre `/app/agenda?d=...` (foca janela existente OU abre nova).

---

## 10. Adiado + Riscos

### Adiado (fora de escopo da Onda 3)
- **SSR / auth-gate de borda (Cloudflare) do CBA.** NX é SPA Vite + Traefik; `requireSupabaseAuth` vira validação JWT inline na edge fn. Deferral explícito — não tentar trazer middleware SSR só por causa de push.
- **`notify_new_booking` separado de `notify_appointments`.** Por ora reusa `notify_appointments`. Adicionar coluna só se o produto pedir granularidade.
- **App-shell network-first / cache de assets do CBA.** Permanentemente descartado (causa do spinner infinito), não é "adiado" — é decisão de não-portar.

### Riscos
| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| **iOS Safari:** web-push só com PWA **instalado** + iOS ≥ 16.4. No browser iOS normal não há push. | Alta (parte dos donos usa iPhone) | UI detecta iOS-não-standalone e instrui "Adicionar à Tela de Início". Android/desktop Chrome/Firefox funcionam direto. |
| **Assinatura de `buildPushPayload` (`@block65`) varia por versão.** | Média | Validar no 1º deploy de teste; **pinar versão** no import após confirmar. |
| **Phantom deploy** (build verde ≠ código novo servindo no NX). | Alta (histórico conhecido) | `deploy-vps.sh --no-cache` + provar string no `/sw.js` servido via curl. |
| **Papel admin/manager (D7):** confirmar a tabela/campo real (`user_roles`+`has_role` vs `profiles.role`) antes de fechar o fan-out. | Média | Bloquear o Passo 5.2/6 até confirmar com query no schema vivo. Sem isso, push pode ir pra quem não deveria (ou pra ninguém). |
| **`ttl` curto** expira notif se dono offline. | Baixa | Já elevado de 60s (CBA) → 3600s no helper. |
| **`userVisibleOnly:true`** obrigatório no Chrome — omitir quebra o subscribe. | Baixa | Mantido verbatim do CBA no Passo 5. |
| **service_role no bundle** = vazamento crítico (§11.1). | Crítica se ocorrer | Todo envio/storage é server-side nas edge fns. Frontend só fala JWT + public key. Conferir no Checklist que nada `SERVICE_ROLE`/`VITE_*` privado vaza no bundle. |

---

**Arquivos a criar/editar (todos sob `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/`):**
- `supabase/migrations/<ts>_push_subscriptions.sql` (novo)
- `supabase/functions/_shared/web-push.ts` (novo)
- `supabase/functions/salao-push-send/index.ts` (novo)
- `supabase/functions/push-vapid-public/index.ts` (novo)
- `supabase/functions/push-subscribe/index.ts` (novo)
- `supabase/functions/push-unsubscribe/index.ts` (novo)
- `public/sw.js` (editar — só adicionar 2 handlers + bump SW_VERSION)
- `src/components/notifications/PushSubscriptionCard.tsx` (novo)
- `supabase/functions/salao-public-booking/index.ts` (editar — wiring ~L105 + `push_enviado` no retorno ~L120)
