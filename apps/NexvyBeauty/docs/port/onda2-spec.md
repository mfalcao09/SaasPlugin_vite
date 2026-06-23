# SPEC DE IMPLEMENTAÇÃO — Onda 2: Booking Público de Salão + Pacotes Pré-pagos (CBA → NexvyBeauty)

Este documento é o plano executável para portar do CBA para o NexvyBeauty (project Supabase `fzhlbwhdejumkyqosuvq`) duas capacidades públicas: (1) o **agendamento público de salão** (cliente sem login escolhe serviço → profissional → data → horário → confirma, com geração de slots fiel ao algoritmo do CBA e gravação na tabela ERP `agendamentos` que já existe) e (2) os **pacotes pré-pagos** (catálogo `pacotes` + compra concreta `pacote_clientes`). O port adiciona dois MOATs que o CBA não tem: **confirmação real por WhatsApp** via `evolution-send` e **cobrança real** via Cakto (`_shared/cakto-client.ts` + `cakto-webhook`). Atenção crítica desde já: o NX **já tem** `booking-availability`/`booking-submit`/`booking-dispatcher` e uma rota `/agendar/:userSlug`, mas isso é um sistema Cal.com por-USUÁRIO (`booking_event_types`/`calendar_events`/`profiles.booking_slug`, escopo `user_id`) — **disjunto** do booking de salão. Nada disso é reusado ou sobrescrito; o booking de salão é novo, por-ORG, com prefixo `salao-*`.

---

## Decisões travadas

| # | Decisão | Valor travado | Justificativa |
|---|---------|---------------|---------------|
| D1 | **Rota pública de booking** | `/s/:slug` (booking) + `/s/:slug/pacotes` (venda de pacote) | `/agendar/:userSlug` JÁ EXISTE (Cal.com por-usuário). Usar `/agendar/:slug` quebraria o roteamento existente. `/s/:slug` é curto, novo e não colide. |
| D2 | **Chave de lookup público do salão** | NOVA coluna `organizations.slug text UNIQUE` (backfill a partir de `name`) | `organizations` não tem `slug`; `profiles.booking_slug` é por-usuário (Cal.com) — não reusar. |
| D3 | **Jornada do profissional** | ADD COLUMN inline em `profissionais`: `hora_inicio time`, `hora_fim time`, `dias_atendimento jsonb` (espelha verbatim o input do algoritmo CBA) | Sem essas 3 colunas a geração de slots não tem input e retorna sempre vazio. É o coração do algoritmo. Colunas inline = mais simples que tabela de jornada. |
| D4 | **Edge functions** | 4 novas com prefixo `salao-*`, todas `verify_jwt=false`, todas usando `service_role` interno: `salao-public-bootstrap`, `salao-availability`, `salao-public-booking`, `salao-buy-pacote` | Público sem auth + orquestra WhatsApp/Cakto com service_role → edge fn Deno. Prefixo `salao-` evita colisão com as fns Cal.com. Fronteira de tenant = `slug` resolvido DENTRO da fn (RLS não se aplica a service_role). |
| D5 | **Pacote usa Cakto?** | **Sim, opcional por feature-flag.** Caminho A (espelho CBA): grava `pacote_clientes status='ativo'` direto (sem cobrança). Caminho B (MOAT): grava `status='pendente_pagamento'` + retorna `checkout_url` Cakto; `cakto-webhook` ativa para `'ativo'` ao confirmar pagamento. | CBA não tem pagamento ("combinado com o salão"). O valor NX é fechar esse gap. Decisão de ativar na hora vs. pós-webhook fica em flag por org para não bloquear o port fiel. |
| D6 | **Status do agendamento** | Gravar `status='agendado'` (EXATO). Filtro de ocupação usa `('agendado','confirmado','chegou')` EXATOS. | `agendamentos.status` é texto livre (sem CHECK). A checagem de slots depende desses 3 valores literais batendo. |
| D7 | **Timezone** | Fixar `America/Sao_Paulo` em todo cálculo de "hoje"/"agora" dentro das edge fns (Deno roda em UTC). | `getHours/getDay/toISOString` do CBA assumem horário local do servidor. Em UTC isso desloca horários e erra "hoje" perto da meia-noite. |
| D8 | **Origem do agendamento** | ADD COLUMN `agendamentos.origem text DEFAULT 'interno'` (booking público grava `'publico'`) + colunas UTM opcionais. | Distinguir agendamento criado pelo cliente público do criado no painel; habilita atribuição. |

---

## Passo 1 — Migration(s)

Criar `supabase/migrations_salao/20260623_onda2_booking_pacotes.sql` (mesma pasta não-padrão `migrations_salao/` já usada pelo ERP do NX). DDL pronto pra colar, idempotente:

```sql
-- =====================================================================
-- ONDA 2: Booking público de salão + Pacotes pré-pagos
-- project: fzhlbwhdejumkyqosuvq (NexvyBeauty)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. organizations.slug — chave de lookup público (D2)
-- ---------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug text;

-- backfill: slugify(name) + sufixo do id quando colidir
UPDATE public.organizations
SET slug = lower(
  regexp_replace(
    regexp_replace(unaccent(coalesce(name, 'salao')), '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-+|-+$)', '', 'g'
  )
) || '-' || substr(id::text, 1, 6)
WHERE slug IS NULL;

-- exige extensão unaccent; se indisponível, trocar unaccent(name) por name
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_uidx
  ON public.organizations (slug)
  WHERE slug IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. profissionais — jornada (D3) — input do algoritmo de slots
-- ---------------------------------------------------------------------
ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS hora_inicio      time,
  ADD COLUMN IF NOT EXISTS hora_fim         time,
  ADD COLUMN IF NOT EXISTS dias_atendimento jsonb;  -- ex: [1,2,3,4,5] ou ["seg","ter",...]

-- default operacional para não retornar vazio em profissional sem jornada setada
UPDATE public.profissionais
SET hora_inicio = COALESCE(hora_inicio, '09:00'::time),
    hora_fim    = COALESCE(hora_fim,    '18:00'::time),
    dias_atendimento = COALESCE(dias_atendimento, '[1,2,3,4,5,6]'::jsonb);

-- ---------------------------------------------------------------------
-- 3. agendamentos — origem pública + UTM (D8)
-- ---------------------------------------------------------------------
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS origem        text DEFAULT 'interno',
  ADD COLUMN IF NOT EXISTS utm_source    text,
  ADD COLUMN IF NOT EXISTS utm_medium    text,
  ADD COLUMN IF NOT EXISTS utm_campaign  text,
  ADD COLUMN IF NOT EXISTS pacote_cliente_id uuid;  -- elo de consumo (uso futuro)

-- ---------------------------------------------------------------------
-- 4. pacotes — catálogo de oferta (espelha CBA `pacote`)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pacotes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome               text NOT NULL,
  descricao          text,
  servicos_incluidos text[],                 -- descritivo; não usado na venda/consumo
  total_sessoes      int  NOT NULL,
  valor              numeric NOT NULL,
  validade_dias      int  NOT NULL DEFAULT 90,
  ativo              boolean NOT NULL DEFAULT true,
  -- MOAT Cakto (catálogo)
  cakto_offer_slug   text,
  cakto_checkout_url text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pacotes_org_ativo_idx
  ON public.pacotes (organization_id, ativo);

-- ---------------------------------------------------------------------
-- 5. pacote_clientes — compra concreta / saldo (espelha CBA `pacote_cliente`)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pacote_clientes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pacote_id       uuid NOT NULL REFERENCES public.pacotes(id) ON DELETE RESTRICT,
  pacote_nome     text,                        -- snapshot
  cliente_id      uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  cliente_nome    text,                        -- snapshot
  total_sessoes   int  NOT NULL,               -- snapshot
  sessoes_usadas  int  NOT NULL DEFAULT 0,
  valor_pago      numeric,                     -- snapshot
  data_inicio     date,
  data_validade   date,
  status          text NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo','concluido','vencido','cancelado','pendente_pagamento')),
  -- MOAT Cakto (compra)
  cakto_offer_slug   text,
  cakto_checkout_url text,
  cakto_order_id     text,                     -- idempotência do webhook
  pagamento_status   text DEFAULT 'pendente'
                     CHECK (pagamento_status IN ('pendente','pago','cancelado')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pacote_clientes_org_idx
  ON public.pacote_clientes (organization_id);
CREATE INDEX IF NOT EXISTS pacote_clientes_cliente_idx
  ON public.pacote_clientes (organization_id, cliente_id);
-- idempotência Cakto: 1 compra por order_id
CREATE UNIQUE INDEX IF NOT EXISTS pacote_clientes_cakto_order_uidx
  ON public.pacote_clientes (cakto_order_id)
  WHERE cakto_order_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 6. RLS por organization_id via profiles (CLAUDE.md §11)
--    Leitura pública do salão NÃO usa RLS — acontece dentro da edge fn
--    com service_role (que bypassa RLS). RLS protege só o lado admin.
-- ---------------------------------------------------------------------
ALTER TABLE public.pacotes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacote_clientes ENABLE ROW LEVEL SECURITY;

-- helper de tenant (já existe get_user_organization no NX; usar o padrão local).
-- Aqui via subselect direto em profiles para não depender de função externa.

CREATE POLICY pacotes_select ON public.pacotes
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY pacotes_insert ON public.pacotes
  FOR INSERT WITH CHECK (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY pacotes_update ON public.pacotes
  FOR UPDATE USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY pacote_clientes_select ON public.pacote_clientes
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY pacote_clientes_insert ON public.pacote_clientes
  FOR INSERT WITH CHECK (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY pacote_clientes_update ON public.pacote_clientes
  FOR UPDATE USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- 7. Anti-double-booking (endurecimento além-do-port, opcional mas recomendado)
--    Índice único parcial impede 2 agendamentos ativos no MESMO instante
--    para o mesmo profissional. NÃO cobre overlap parcial — a edge fn
--    ainda revalida overlap; isto fecha só a corrida no slot exato.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_no_doublebook_uidx
  ON public.agendamentos (organization_id, profissional_id, data, hora)
  WHERE status IN ('agendado','confirmado','chegou');
```

**Pós-migration (obrigatório):**
```bash
# regenerar tipos
supabase gen types typescript --project-id fzhlbwhdejumkyqosuvq \
  > apps/NexvyBeauty/src/integrations/supabase/types.ts
```

> Antes de aplicar, rodar `list_tables` no project ao vivo (regra naming-map nº1: "disco mente") para confirmar que `pacotes`/`pacote_clientes` ainda não existem e que as colunas-alvo de `profissionais`/`organizations`/`agendamentos` batem com o DDL.

---

## Passo 2 — Edge function `salao-availability`

Arquivo: `supabase/functions/salao-availability/index.ts` (Deno, `verify_jwt=false`, service_role só dentro). Casca de `evolution-send` (cors + `createClient`).

### Contrato

**Request body:**
```json
{
  "slug": "studio-bella-a1b2c3",
  "servico_id": "uuid",
  "profissional_id": "uuid",
  "data": "2026-06-25"
}
```

**Response 200:**
```json
{ "slots": ["09:00", "09:30", "10:00", "14:00"] }
```
**Response 4xx:** `{ "error": "mensagem" }` (404 slug não achado; 400 input inválido; 422 profissional/serviço sem dados).

### Validação (Zod, espelhando o CBA)
```
slug:           string 1..120
servico_id:     uuid
profissional_id:uuid
data:           regex /^\d{4}-\d{2}-\d{2}$/
```

### Pseudocódigo (algoritmo fiel ao CBA, com re-home NX)

```
// TZ fixo (D7)
const TZ = "America/Sao_Paulo";
function nowSP(): { ymd: string, minutes: number } {
  const now = new Date();
  // partes no fuso SP
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ,
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false });
  const p = Object.fromEntries(fmt.formatToParts(now).map(x => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, minutes: (+p.hour)*60 + (+p.minute) };
}

handler(body):
  validate(body)  // zod

  // 1. resolve org por slug  (CBA: salao por slug → salao.id)
  org = sb.from("organizations").select("id").eq("slug", body.slug).maybeSingle()
  if (!org) return 404

  // 2. carrega profissional (jornada) + serviço (duração) — escopo organization_id
  [prof, serv] = await Promise.all([
    sb.from("profissionais")
      .select("id, hora_inicio, hora_fim, dias_atendimento")
      .eq("organization_id", org.id).eq("id", body.profissional_id).maybeSingle(),
    sb.from("servico_catalogo")
      .select("duracao_minutos")
      .eq("organization_id", org.id).eq("id", body.servico_id).maybeSingle()
  ])
  if (!prof || !serv) return 422

  // 3. checagem dia-da-semana (CBA: getDay 0=dom..6=sab)
  const dow = new Date(body.data + "T00:00:00").getUTCDay()   // data pura → use UTCDay p/ não deslocar
  const map = { dom:0, seg:1, ter:2, qua:3, qui:4, sex:5, sab:6 }
  const dias = (prof.dias_atendimento ?? []).map(d =>
    typeof d === "number" ? d : map[String(d).toLowerCase().slice(0,3)]
  )
  if (dias.length > 0 && !dias.includes(dow)) return { slots: [] }

  // 4. jornada → minutos
  const [hi, mi] = (prof.hora_inicio ?? "09:00").split(":").map(Number)
  const [hf, mf] = (prof.hora_fim    ?? "18:00").split(":").map(Number)
  const inicio = hi*60 + mi
  const fim    = hf*60 + mf
  const dur    = serv.duracao_minutos ?? 60
  const STEP   = 30                                   // passo FIXO (CBA)

  // 5. ocupados (status EXATOS — D6)
  ocup = sb.from("agendamentos")
    .select("hora, duracao_minutos")
    .eq("organization_id", org.id)
    .eq("profissional_id", body.profissional_id)
    .eq("data", body.data)
    .in("status", ["agendado","confirmado","chegou"])
  const intervals = ocup.map(a => {
    const [h,m] = a.hora.split(":").map(Number)
    const ini = h*60 + m
    return { ini, fim: ini + (a.duracao_minutos ?? 60) }
  })

  // 6. loop de geração
  const sp = nowSP()
  const isToday = body.data === sp.ymd
  const slots = []
  for (let t = inicio; t + dur <= fim; t += STEP) {
    if (isToday && t <= sp.minutes) continue                       // não oferece passado hoje
    const conflito = intervals.some(o => t < o.fim && o.ini < t + dur)  // overlap
    if (!conflito) {
      const hh = String(Math.floor(t/60)).padStart(2,"0")
      const mm = String(t % 60).padStart(2,"0")
      slots.push(`${hh}:${mm}`)
    }
  }
  return { slots }
```

Notas de fidelidade: `STEP=30` é independente da duração (CBA); overlap `t < o.fim && o.ini < t+dur` é a MESMA fórmula usada no submit; profissional/serviço escopados por `organization_id` (era `company_id` no CBA).

---

## Passo 3 — Edge function `salao-public-booking`

Arquivo: `supabase/functions/salao-public-booking/index.ts` (`verify_jwt=false`, service_role interno). **NÃO** reusar `booking-submit` (Cal.com).

### Contrato

**Request body:**
```json
{
  "slug": "studio-bella-a1b2c3",
  "servico_id": "uuid",
  "profissional_id": "uuid",
  "data": "2026-06-25",
  "hora": "14:00",
  "cliente_nome": "Ana Souza",
  "cliente_telefone": "11999998888",
  "cliente_email": "ana@x.com",
  "observacoes": "",
  "tracking": { "utm_source": "ig", "utm_medium": "bio", "utm_campaign": "junho" }
}
```

**Response 200:** `{ "id": "uuid", "data": "2026-06-25", "hora": "14:00", "whatsapp_enviado": true }`
**Response 409:** `{ "error": "Horário indisponível — já existe um agendamento neste intervalo." }`

### Validação (Zod)
```
slug 1..120 · servico_id uuid · profissional_id uuid
data /^\d{4}-\d{2}-\d{2}$/ · hora /^\d{2}:\d{2}$/
cliente_nome 2..120 · cliente_telefone 8..20 · cliente_email email opcional/''
observacoes opcional max 500 · tracking opcional
```

### Passos

```
1. validate(body); resolve org por slug → org.id (senão 404).

2. carrega serviço (preço/duração/nome) e profissional (nome) escopados:
   serv = servico_catalogo.select("id, nome, preco_base, duracao_minutos")
          .eq(organization_id, org.id).eq(id, servico_id).single()
   prof = profissionais.select("id, nome").eq(organization_id, org.id).eq(id, prof_id).single()

3. RE-CHECA CONFLITO (anti-double-booking server-side, overlap — não confiar no slot do client):
   novoIni = HH*60+MM ; novoFim = novoIni + (serv.duracao_minutos ?? 60)
   ocup = agendamentos.select("hora, duracao_minutos")
          .eq(organization_id, org.id).eq(profissional_id, prof_id).eq(data, data)
          .in(status, ["agendado","confirmado","chegou"])
   if (ocup.some(o => novoIni < o.fim && o.ini < novoFim)) → return 409

4. UPSERT CLIENTE por telefone (idempotência):
   existente = clientes.select("id")
       .eq(organization_id, org.id).eq(telefone, cliente_telefone).maybeSingle()
   cliente_id = existente?.id
     ?? clientes.insert({ organization_id: org.id, nome, telefone, email||null,
                          status: 'ativo' })   // re-home: ativo:true → status:'ativo'
                .select("id").single().id

5. INSERT agendamento (snapshots desnormalizados + origem público):
   ag = agendamentos.insert({
     organization_id: org.id,
     cliente_id, cliente_nome: body.cliente_nome,
     servico_id: serv.id, servico_nome: serv.nome,
     profissional_id: prof.id, profissional_nome: prof.nome,
     data: body.data, hora: body.hora,
     duracao_minutos: serv.duracao_minutos,
     valor: serv.preco_base,                 // re-home: CBA valor → servico_catalogo.preco_base
     status: 'agendado',                     // EXATO (D6)
     origem: 'publico',
     utm_source: tracking?.utm_source, utm_medium: tracking?.utm_medium,
     utm_campaign: tracking?.utm_campaign,
     observacoes: body.observacoes || null
   }).select("id, data, hora").single()
   // se 23505 (índice único do Passo 1.7) → return 409 (corrida)

6. MOAT WhatsApp (fire-and-forget — não bloqueia, falha silenciosa se sem instância):
   const to = normalizePhone(cliente_telefone)   // +55, reusar do booking-dispatcher
   sb.functions.invoke("evolution-send", {
     body: { type: "text", organization_id: org.id, to,
             payload: { text:
               `Olá ${cliente_nome}! Seu agendamento de ${serv.nome} foi confirmado para `
               + `${formatBR(body.data)} às ${body.hora}. Até lá! 💅` } }
   }).catch(() => {})   // erro não derruba o agendamento

7. return { id: ag.id, data: ag.data, hora: ag.hora, whatsapp_enviado: true }
```

`normalizePhone` (+55): copiar verbatim de `booking-dispatcher/index.ts`. `formatBR`: `dd/MM/yyyy` sem `new Date(iso)` (regex direto, evita shift TZ — lição MEMORY).

---

## Passo 4 — Páginas React Router

NX usa React Router (não file-routing TanStack). Reusar UI do `PublicBooking.tsx` existente (Calendar shadcn, slots grid, form, captura UTM, `BookingThankYou`) — mas **não** os hooks/edge fns Cal.com. Hook novo `useSalaoBooking.ts` encapsula os 3 `supabase.functions.invoke`.

### 4a. `src/pages/PublicSalaoBooking.tsx` — rota `/s/:slug`

Wizard de 5 passos idêntico ao CBA. Componentes shadcn já no NX: `Card`, `Button`, `Input`, `Badge`, `Label`, `Calendar`.

```
estado: { step, servicoId, profId, data(=hoje), hora, done }

// bootstrap
useQuery(["public-salao", slug], () =>
  invoke("salao-public-bootstrap", { slug }))   // → { org, servicos[], profissionais[], pacotes[] }
  loading: "Carregando..."  |  null → "Salão não encontrado"

Header: org.name + org.address + botão "Ver pacotes" → Link to=`/s/${slug}/pacotes`

Stepper:
  1 Serviço      : grid cards servicos {nome, <Badge>categoria</Badge>, `${duracao_minutos} min · R$ ${valor}`}
                   (valor = preco_base aliasado no bootstrap). canNext = !!servicoId
  2 Profissional : grid cards profissionais {nome, especialidades[0], `${hora_inicio}–${hora_fim}`}
                   canNext = !!profId
  3 Data+horário : <Input type=date min=hoje> onChange→reseta hora
                   useQuery(["slots", slug, servicoId, profId, data],
                     () => invoke("salao-availability", {slug, servico_id, profissional_id, data}),
                     { enabled: step===3 && profId && servicoId && data })
                   "Calculando disponibilidade..." | slots vazio → "Sem horários disponíveis nessa data."
                   | grid de botões de horário → seta hora. canNext = !!hora
  4 Seus dados   : react-hook-form + zodResolver(clienteSchema), mode:onChange
                   cliente_nome(min2), cliente_telefone(min8), cliente_email(opcional email)
                   // CAPTURA UTM (igual PublicBooking):
                   const q = new URLSearchParams(window.location.search)
                   tracking = { utm_source:q.get("utm_source"), utm_medium:q.get("utm_medium"),
                                utm_campaign:q.get("utm_campaign") }
                   canNext = isValid
  5 Confirmar    : card-resumo (serviço, profissional, data dd/MM/yyyy, hora, duração,
                   cliente, telefone, Total = valor do serviço) + botão "Confirmar agendamento"

submit: useMutation(() => invoke("salao-public-booking",
          { slug, servico_id, profissional_id, data, hora, ...cliente, tracking }))
  onSuccess: setDone({data,hora}) + toast "Agendamento confirmado!"
             subtoast "Confirmação enviada por WhatsApp para {telefone}" (agora é VERDADE — MOAT)
  onError:   toast.error(e.message)   // 409 → "Horário indisponível..."

done: card sucesso (data/hora formatada) + botão "Novo agendamento" (reseta wizard)

nav: Voltar (disabled step 1) · Próximo (disabled !canNext) / Confirmar (step 5, disabled isPending)
```

### 4b. `src/pages/PublicSalaoPacotes.tsx` — rota `/s/:slug/pacotes`

```
useQuery(["public-salao", slug], invoke("salao-public-bootstrap", {slug}))  // reusa cache
Header: org.name + org.address + botão "Agendar" → Link to=`/s/${slug}`

grid cards de pacotes ativos (ordenado por valor):
  {nome, descricao, `R$ ${valor.toFixed(2)}`, <Badge>{total_sessoes} sessões</Badge>,
   <Badge>{validade_dias} dias</Badge>}
  vazio → "Nenhum pacote disponível no momento."

card "Comprar" → <Dialog "Seus dados para compra">:
  form (nome, telefone/WhatsApp, email opcional) zod + react-hook-form
  submit → useMutation(invoke("salao-buy-pacote",
            { slug, pacote_id, cliente_nome, cliente_telefone, cliente_email }))
    pending: "Processando…"
    success (Caminho A): fecha dialog, toast "Compra registrada!",
             Dialog "O salão entrará em contato para confirmar o pagamento e ativar suas sessões."
    success (Caminho B / Cakto): window.location = resp.checkout_url  (redireciona pro checkout)
    error: toast(e.message)
```

### 4c. Edge fn `salao-buy-pacote` (referenciada acima)

`supabase/functions/salao-buy-pacote/index.ts` (`verify_jwt=false`). Re-home de `comprarPacote`:

```
validate(body)  // slug 1..120, pacote_id uuid, cliente_nome 2..120, cliente_telefone 8..20, email opcional
org = organizations por slug → org.id (404 senão)
pac = pacotes.select("id, nome, total_sessoes, valor, validade_dias, cakto_offer_slug, cakto_checkout_url")
       .eq(organization_id, org.id).eq(id, pacote_id).eq(ativo, true).maybeSingle()  // 422 senão
upsert cliente por (organization_id, telefone)  // status:'ativo'

// VALIDADE — manter padrão epoch+ms (NÃO new Date(iso)+setDate — bug TZ MEMORY):
dataInicio = new Date().toISOString().slice(0,10)
validade   = new Date(Date.now() + pac.validade_dias * 86400000).toISOString().slice(0,10)

// Caminho A (flag off / sem Cakto):
pc = pacote_clientes.insert({
  organization_id: org.id, cliente_id, cliente_nome,
  pacote_id: pac.id, pacote_nome: pac.nome,
  total_sessoes: pac.total_sessoes, sessoes_usadas: 0,
  valor_pago: pac.valor, data_inicio: dataInicio, data_validade: validade,
  status: 'ativo', pagamento_status: 'pendente'
}).select("id").single()
// MOAT WhatsApp: invoke evolution-send confirmando compra (fire-and-forget)
return { ok: true, id: pc.id }

// Caminho B (flag on / Cakto):
// status 'pendente_pagamento', gera/usa checkout via _shared/cakto-client.ts
checkout_url = pac.cakto_checkout_url
  ?? `${Deno.env.get("CAKTO_CHECKOUT_BASE")}/${ buildOrEnsureOffer(pac) }`  // caktoCreateOffer + montar URL
pc = pacote_clientes.insert({ ...mesmos campos..., status:'pendente_pagamento',
       cakto_offer_slug: pac.cakto_offer_slug, cakto_checkout_url: checkout_url })
     .select("id").single()
return { ok:true, id: pc.id, checkout_url }
```

**Confirmação Cakto (Caminho B):** `cakto-webhook` (já existe) ao receber pagamento → `UPDATE pacote_clientes SET status='ativo', pagamento_status='pago', cakto_order_id=$order WHERE id=$pc AND cakto_order_id IS NULL` (idempotente pelo índice único `pacote_clientes_cakto_order_uidx`) → dispara `evolution-send`. **Não** reusar `cakto-sync-offer` (é B2B de planos da plataforma); usar `_shared/cakto-client.ts` por baixo.

### 4d. `salao-public-bootstrap`

`supabase/functions/salao-public-bootstrap/index.ts` (`verify_jwt=false`). Re-home de `getPublicSalao`:
```
org = organizations.select("id, name, logo_url, phone, address").eq(slug, body.slug).maybeSingle()
servicos = servico_catalogo.select("id, nome, categoria, duracao_minutos, valor:preco_base")
            .eq(organization_id, org.id).eq(ativo, true)
profissionais = profissionais.select("id, nome, especialidades, hora_inicio, hora_fim")
            .eq(organization_id, org.id).eq(ativo, true)
pacotes = pacotes.select("id, nome, descricao, total_sessoes, valor, validade_dias")
            .eq(organization_id, org.id).eq(ativo, true).order("valor")
return { org, servicos, profissionais, pacotes }
```
Re-home aplicado: `salao→organizations`, `valor→preco_base` (alias), `especialidade(singular)→especialidades[0]` no front.

---

## Passo 5 — Wiring + Verificação

### Wiring

**1. Rotas em `src/App.tsx`** (públicas, FORA de `ProtectedRoute`, perto de `/agendar/:userSlug` ~linhas 173-174 — sem colidir):
```tsx
<Route path="/s/:slug" element={<PublicSalaoBooking />} />
<Route path="/s/:slug/pacotes" element={<PublicSalaoPacotes />} />
```

**2. `verify_jwt=false`** para as 4 fns em `supabase/config.toml`:
```toml
[functions.salao-public-bootstrap]
verify_jwt = false
[functions.salao-availability]
verify_jwt = false
[functions.salao-public-booking]
verify_jwt = false
[functions.salao-buy-pacote]
verify_jwt = false
```

**3. Deploy:**
```bash
supabase functions deploy salao-public-bootstrap --project-ref fzhlbwhdejumkyqosuvq --no-verify-jwt
supabase functions deploy salao-availability     --project-ref fzhlbwhdejumkyqosuvq --no-verify-jwt
supabase functions deploy salao-public-booking    --project-ref fzhlbwhdejumkyqosuvq --no-verify-jwt
supabase functions deploy salao-buy-pacote        --project-ref fzhlbwhdejumkyqosuvq --no-verify-jwt
```

### Checklist binário de DONE

| # | Critério verificável | Como provar (check binário) |
|---|----------------------|------------------------------|
| V1 | Migration aplicada | `list_tables` mostra `pacotes` e `pacote_clientes`; `\d profissionais` mostra `hora_inicio/hora_fim/dias_atendimento`; `\d organizations` mostra `slug`. |
| V2 | Slug resolvível | `SELECT slug FROM organizations LIMIT 5` retorna slugs únicos não-nulos. |
| V3 | Availability retorna slots | `curl -X POST .../salao-availability -H "apikey: $ANON" -d '{"slug":"<slug>","servico_id":"<uuid>","profissional_id":"<uuid>","data":"<dia-útil futuro>"}'` → HTTP 200 com `"slots":[...]` não-vazio. |
| V4 | Dia fora da jornada → vazio | mesma curl com data de domingo (se `dias_atendimento` exclui 0) → `{"slots":[]}`. |
| V5 | Agendamento criado aparece na Agenda real | `curl .../salao-public-booking` → 200 `{id}`; depois `SELECT * FROM agendamentos WHERE id='<id>'` mostra `origem='publico'`, `status='agendado'`, `valor=preco_base`, snapshots de nome preenchidos; abrir `src/pages/salao/Agenda.tsx` no app → o agendamento aparece. |
| V6 | Anti-double-booking | repetir a MESMA curl de V5 (mesmo prof/data/hora) → HTTP 409. |
| V7 | Confirmação WhatsApp disparada | logs da edge fn (`get_logs`) mostram invoke de `evolution-send`; se org tem instância Evolution conectada, mensagem chega no telefone (+55). Sem instância → agendamento ainda criado (fire-and-forget). |
| V8 | Pacote vendido grava validade | `curl .../salao-buy-pacote` → 200; `SELECT data_inicio, data_validade, total_sessoes, sessoes_usadas, status FROM pacote_clientes WHERE id='<id>'` → `data_validade = data_inicio + validade_dias`, `sessoes_usadas=0`. |
| V9 | (Cakto, Caminho B) idempotência | reenviar webhook com mesmo `cakto_order_id` → não duplica linha (índice único `pacote_clientes_cakto_order_uidx`); `status='ativo'`, `pagamento_status='pago'`. |
| V10 | Rota pública isolada | `/s/<slug>` renderiza booking de salão; `/agendar/<userSlug>` Cal.com continua funcionando intacto (smoke test ambos). |

---

## Riscos & o que preservar do NX

**Não tocar / preservar (anti-NIH, domínios disjuntos):**
- `booking-availability`, `booking-submit`, `booking-dispatcher`, `send-booking-confirmation`, `PublicBooking.tsx`, `usePublicBooking.ts`, `profiles.booking_slug`, `booking_event_types`, `calendar_events`, `booking_requests`, rota `/agendar/:userSlug` → tudo Cal.com por-USUÁRIO. **Reusar só UI/padrões** (Calendar, slots grid, form, `BookingThankYou`, captura UTM, `normalizePhone`). Nunca sobrescrever.
- Tabelas ERP existentes (`agendamentos`, `clientes`, `servico_catalogo`, `profissionais`, `organizations`) — só ADD COLUMN, nunca alterar colunas existentes. `Agenda.tsx` (lado admin) continua a fonte de verdade do consumo/edição.

**Riscos a vigiar:**
1. **Re-home silencioso que quebra em runtime:** `servico.valor→preco_base`, `cliente.ativo(bool)→status(text 'ativo')`, `profissional.especialidade→especialidades[0]`, `company_id→organization_id`. Qualquer query portada que use o nome CBA quebra silenciosamente. `servico_catalogo` **não tem `updated_at`** (só `created_at`) — não assumir em UPDATE.
2. **TZ (D7):** se esquecer de fixar `America/Sao_Paulo`, slots somem/atrasam e "hoje" erra perto da meia-noite. É o bug mais provável.
3. **Concorrência:** a revalidação SELECT-then-INSERT não é atômica; o índice único parcial (Passo 1.7) fecha a corrida no slot exato (e o INSERT vira 23505 → 409), mas overlap parcial (durações diferentes) ainda depende da revalidação. Aceitável; documentado.
4. **Endpoint público sem auth (CLAUDE.md §11.2/§11.3):** `verify_jwt=false` expõe as 4 fns. Mitigar com Zod rígido (limite de chars, regex de data/hora/uuid), service_role nunca no bundle Vite, e rate-limit/anti-bot recomendável. O `slug` é a única fronteira de tenant para o público — validar que a org existe e está ativa antes de qualquer escrita.
5. **WhatsApp fire-and-forget:** se a org não tem instância Evolution conectada, a confirmação falha em silêncio; o agendamento ainda é criado. O toast "enviada por WhatsApp" só é verdade quando há instância — considerar checar `whatsapp_enviado` no retorno antes de prometer no UI.
6. **Cakto:** não confundir `cakto-sync-offer` (B2B/planos da plataforma) com a venda de pacote ao consumidor (usar `_shared/cakto-client.ts` + `cakto-webhook`). `Create Offer` não devolve URL → montar `${CAKTO_CHECKOUT_BASE}/${slug}`.
7. **Consumo de sessão fora de escopo:** `sessoes_usadas`/decremento (`agendamentos.pacote_cliente_id` + `forma_pagamento='Pacote'`) é lógica do painel/ERP interno — Onda futura, não entra aqui. Esta Onda 2 porta só catálogo + venda + booking público.
