-- =====================================================================
-- ONDA 2: Booking público de salão + Pacotes pré-pagos (port CBA->NX)
-- project: fzhlbwhdejumkyqosuvq (NexvyBeauty)
-- Aplicado live 2026-06-23 via Supabase MCP. Backfill usa translate()
-- (built-in) em vez de unaccent() — a extensão não estava habilitada.
-- =====================================================================

-- 1. organizations.slug — chave de lookup público (D2)
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.organizations
SET slug = lower(
  regexp_replace(
    regexp_replace(
      translate(coalesce(name,'salao'),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
      '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-+|-+$)', '', 'g')
) || '-' || substr(id::text, 1, 6)
WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_uidx
  ON public.organizations (slug) WHERE slug IS NOT NULL;

-- 2. profissionais — jornada (D3) — input do algoritmo de slots
ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS hora_inicio      time,
  ADD COLUMN IF NOT EXISTS hora_fim         time,
  ADD COLUMN IF NOT EXISTS dias_atendimento jsonb;
UPDATE public.profissionais
SET hora_inicio = COALESCE(hora_inicio, '09:00'::time),
    hora_fim    = COALESCE(hora_fim,    '18:00'::time),
    dias_atendimento = COALESCE(dias_atendimento, '[1,2,3,4,5,6]'::jsonb);

-- 3. agendamentos — origem pública + UTM (D8)
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS origem        text DEFAULT 'interno',
  ADD COLUMN IF NOT EXISTS utm_source    text,
  ADD COLUMN IF NOT EXISTS utm_medium    text,
  ADD COLUMN IF NOT EXISTS utm_campaign  text,
  ADD COLUMN IF NOT EXISTS pacote_cliente_id uuid;

-- 4. pacotes — catálogo (espelha CBA `pacote`)
CREATE TABLE IF NOT EXISTS public.pacotes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome               text NOT NULL,
  descricao          text,
  servicos_incluidos text[],
  total_sessoes      int  NOT NULL,
  valor              numeric NOT NULL,
  validade_dias      int  NOT NULL DEFAULT 90,
  ativo              boolean NOT NULL DEFAULT true,
  cakto_offer_slug   text,
  cakto_checkout_url text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pacotes_org_ativo_idx ON public.pacotes (organization_id, ativo);

-- 5. pacote_clientes — compra concreta / saldo (espelha CBA `pacote_cliente`)
CREATE TABLE IF NOT EXISTS public.pacote_clientes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pacote_id       uuid NOT NULL REFERENCES public.pacotes(id) ON DELETE RESTRICT,
  pacote_nome     text,
  cliente_id      uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  cliente_nome    text,
  total_sessoes   int  NOT NULL,
  sessoes_usadas  int  NOT NULL DEFAULT 0,
  valor_pago      numeric,
  data_inicio     date,
  data_validade   date,
  status          text NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo','concluido','vencido','cancelado','pendente_pagamento')),
  cakto_offer_slug   text,
  cakto_checkout_url text,
  cakto_order_id     text,
  pagamento_status   text DEFAULT 'pendente'
                     CHECK (pagamento_status IN ('pendente','pago','cancelado')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pacote_clientes_org_idx ON public.pacote_clientes (organization_id);
CREATE INDEX IF NOT EXISTS pacote_clientes_cliente_idx ON public.pacote_clientes (organization_id, cliente_id);
CREATE UNIQUE INDEX IF NOT EXISTS pacote_clientes_cakto_order_uidx
  ON public.pacote_clientes (cakto_order_id) WHERE cakto_order_id IS NOT NULL;

-- 6. RLS por organization_id via profiles (lado admin; público usa service_role na edge fn)
ALTER TABLE public.pacotes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacote_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pacotes_select ON public.pacotes;
CREATE POLICY pacotes_select ON public.pacotes FOR SELECT
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS pacotes_insert ON public.pacotes;
CREATE POLICY pacotes_insert ON public.pacotes FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS pacotes_update ON public.pacotes;
CREATE POLICY pacotes_update ON public.pacotes FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS pacote_clientes_select ON public.pacote_clientes;
CREATE POLICY pacote_clientes_select ON public.pacote_clientes FOR SELECT
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS pacote_clientes_insert ON public.pacote_clientes;
CREATE POLICY pacote_clientes_insert ON public.pacote_clientes FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS pacote_clientes_update ON public.pacote_clientes;
CREATE POLICY pacote_clientes_update ON public.pacote_clientes FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- 7. Anti-double-booking (índice único parcial; 0 conflitos no pré-check)
CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_no_doublebook_uidx
  ON public.agendamentos (organization_id, profissional_id, data, hora)
  WHERE status IN ('agendado','confirmado','chegou');
