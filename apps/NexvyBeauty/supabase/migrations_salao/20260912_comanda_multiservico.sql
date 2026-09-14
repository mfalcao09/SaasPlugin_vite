-- ============================================================================
-- Comanda Multi-Serviço — agendamento público /s/:slug (Fase 0)
-- Aplicada em 2026-09-11 no projeto fzhlbwhdejumkyqosuvq (NexvyBeauty).
--
-- Fonte única de verdade: `agendamentos` continua sendo o item (1 linha =
-- 1 serviço, como já é lido por Agenda.tsx, comissão e financeiro).
-- `comandas` é SÓ cabeçalho (cliente + pagamento + total) — não duplica item.
--
-- ATENÇÃO (divergência descoberta): `servico_catalogo` é VIEW sobre `products`
-- (WHERE tipo='servico'), com preco_base e duracao_minutos dentro do jsonb
-- `settings`. A migration 20260618_erp_salao.sql faz ALTER TABLE nela, o que
-- NÃO reflete o banco real — as migrations desta pasta divergem do estado
-- aplicado. Sempre conferir o banco antes de assumir o schema pelos arquivos.
-- ============================================================================

-- ─── 1. Comanda: cabeçalho (cliente + pagamento + total) ────────────────────
CREATE TABLE IF NOT EXISTS public.comandas (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cliente_id                 uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome               text NOT NULL,
  cliente_telefone           text NOT NULL,
  cliente_email              text,
  forma_pagamento_pretendida text CHECK (forma_pagamento_pretendida IN ('pix','cartao_credito','cartao_debito','dinheiro')),
  valor_total                numeric NOT NULL DEFAULT 0,
  duracao_total_minutos      int     NOT NULL DEFAULT 0,
  desconto                   numeric NOT NULL DEFAULT 0,
  acrescimo                  numeric NOT NULL DEFAULT 0,
  status                     text    NOT NULL DEFAULT 'confirmado'
                             CHECK (status IN ('confirmado','cancelado','concluido')),
  origem                     text DEFAULT 'publico',
  utm_source text, utm_medium text, utm_campaign text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comandas_org_idx ON public.comandas (organization_id);

-- ─── 2. Vínculo item → comanda (nullable: agendamento avulso segue válido) ──
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS comanda_id      uuid REFERENCES public.comandas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_order int NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS agendamentos_comanda_idx
  ON public.agendamentos (comanda_id) WHERE comanda_id IS NOT NULL;

-- ─── 3. Pausa/intervalo do profissional ─────────────────────────────────────
-- Sem isso um roteiro longo (comanda de 2h30) atravessa o almoço.
ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS intervalo_inicio time,
  ADD COLUMN IF NOT EXISTS intervalo_fim    time;

-- ─── 4. Tipo do serviço: principal (catálogo) vs extra (adicional rápido) ───
-- Mora em products.settings, mesmo padrão de preco_base/duracao_minutos.
-- `products` é compartilhada com CRM/vendas e não recebe coluna de salão.
CREATE OR REPLACE VIEW public.servico_catalogo AS
SELECT p.id,
       p.organization_id,
       p.name AS nome,
       (p.settings ->> 'preco_base'::text)::numeric AS preco_base,
       p.status = 'published'::product_status AS ativo,
       p.created_at,
       (p.settings ->> 'duracao_minutos'::text)::integer AS duracao_minutos,
       p.category AS categoria,
       p.description AS descricao,
       CASE WHEN (p.settings ->> 'tipo_servico'::text) = 'extra' THEN 'extra' ELSE 'principal' END AS tipo
  FROM public.products p
 WHERE p.tipo = 'servico'::text;

-- ─── 5. Cross-sell configurável por tenant ──────────────────────────────────
-- FK aponta para `products` (tabela real), pois servico_catalogo é view.
CREATE TABLE IF NOT EXISTS public.servico_cross_sell (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  servico_origem_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  servico_sugerido_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  prioridade          int     NOT NULL DEFAULT 0,
  ativo               boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT servico_cross_sell_nao_auto CHECK (servico_origem_id <> servico_sugerido_id),
  CONSTRAINT servico_cross_sell_unico UNIQUE (organization_id, servico_origem_id, servico_sugerido_id)
);
CREATE INDEX IF NOT EXISTS servico_cross_sell_origem_idx
  ON public.servico_cross_sell (organization_id, servico_origem_id) WHERE ativo;

-- ─── 6. RLS (padrão de `pacotes`; público usa service_role nas edge fns) ────
ALTER TABLE public.comandas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servico_cross_sell ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comandas_select ON public.comandas;
CREATE POLICY comandas_select ON public.comandas FOR SELECT
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS comandas_insert ON public.comandas;
CREATE POLICY comandas_insert ON public.comandas FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS comandas_update ON public.comandas;
CREATE POLICY comandas_update ON public.comandas FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS servico_cross_sell_select ON public.servico_cross_sell;
CREATE POLICY servico_cross_sell_select ON public.servico_cross_sell FOR SELECT
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS servico_cross_sell_insert ON public.servico_cross_sell;
CREATE POLICY servico_cross_sell_insert ON public.servico_cross_sell FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS servico_cross_sell_update ON public.servico_cross_sell;
CREATE POLICY servico_cross_sell_update ON public.servico_cross_sell FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS servico_cross_sell_delete ON public.servico_cross_sell;
CREATE POLICY servico_cross_sell_delete ON public.servico_cross_sell FOR DELETE
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- ─── 7. Trava REAL de sobreposição de horário ───────────────────────────────
-- O índice único agendamentos_no_doublebook_uidx (org, prof, data, hora) só pega
-- horários IDÊNTICOS. Funcionava porque os slots eram sempre múltiplos de 30min;
-- com encaixe back-to-back e multi-serviço, horários arbitrários passam a existir
-- e o furo abre (14:00+1h vs 14:30 passava). Trigger e não coluna GERADA porque
-- conversão de timezone não é IMMUTABLE no Postgres.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS periodo tstzrange;

CREATE OR REPLACE FUNCTION public.fn_agendamentos_set_periodo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.data IS NULL OR NEW.hora IS NULL THEN
    NEW.periodo := NULL;
  ELSE
    NEW.periodo := tstzrange(
      (NEW.data + NEW.hora) AT TIME ZONE 'America/Sao_Paulo',
      (NEW.data + NEW.hora + make_interval(mins => COALESCE(NEW.duracao_minutos, 30))) AT TIME ZONE 'America/Sao_Paulo',
      '[)'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamentos_set_periodo ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_set_periodo
  BEFORE INSERT OR UPDATE OF data, hora, duracao_minutos ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_agendamentos_set_periodo();

UPDATE public.agendamentos
   SET periodo = tstzrange(
         (data + hora) AT TIME ZONE 'America/Sao_Paulo',
         (data + hora + make_interval(mins => COALESCE(duracao_minutos, 30))) AT TIME ZONE 'America/Sao_Paulo',
         '[)')
 WHERE periodo IS NULL AND data IS NOT NULL AND hora IS NOT NULL;

ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_no_overlap_gist;
ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_no_overlap_gist
  EXCLUDE USING gist (profissional_id WITH =, periodo WITH &&)
  WHERE (status IN ('agendado','confirmado','chegou'));
-- agendamentos_no_doublebook_uidx segue ativo como cinto-e-suspensório;
-- remoção só numa migration posterior, após validação em uso real.

-- ─── 8. Gravação atômica: 1 comanda + N agendamentos ou nada ────────────────
-- Preço e duração vêm SEMPRE do banco, nunca do payload do navegador.
CREATE OR REPLACE FUNCTION public.fn_confirmar_comanda(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org        uuid := (payload ->> 'organization_id')::uuid;
  v_item       jsonb;
  v_serv       record;
  v_prof       record;
  v_comanda_id uuid;
  v_total      numeric := 0;
  v_dur_total  int := 0;
  v_ids        uuid[] := '{}';
  v_ag_id      uuid;
  v_ordem      int;
  v_data       date;
  v_hora       time;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'ORG_OBRIGATORIA';
  END IF;
  IF jsonb_typeof(payload -> 'itens') <> 'array' OR jsonb_array_length(payload -> 'itens') = 0 THEN
    RAISE EXCEPTION 'COMANDA_VAZIA';
  END IF;

  INSERT INTO public.comandas (
    organization_id, cliente_id, cliente_nome, cliente_telefone, cliente_email,
    forma_pagamento_pretendida, origem, utm_source, utm_medium, utm_campaign
  ) VALUES (
    v_org,
    NULLIF(payload ->> 'cliente_id','')::uuid,
    payload ->> 'cliente_nome',
    payload ->> 'cliente_telefone',
    NULLIF(payload ->> 'cliente_email',''),
    NULLIF(payload ->> 'forma_pagamento',''),
    COALESCE(NULLIF(payload ->> 'origem',''), 'publico'),
    NULLIF(payload ->> 'utm_source',''),
    NULLIF(payload ->> 'utm_medium',''),
    NULLIF(payload ->> 'utm_campaign','')
  )
  RETURNING id INTO v_comanda_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(payload -> 'itens')
  LOOP
    SELECT id, nome, COALESCE(preco_base,0) AS preco, COALESCE(duracao_minutos,30) AS dur
      INTO v_serv
      FROM public.servico_catalogo
     WHERE organization_id = v_org AND id = (v_item ->> 'servico_id')::uuid AND ativo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICO_INVALIDO: %', v_item ->> 'servico_id';
    END IF;

    SELECT id, nome INTO v_prof
      FROM public.profissionais
     WHERE organization_id = v_org AND id = (v_item ->> 'profissional_id')::uuid AND ativo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROFISSIONAL_INVALIDO: %', v_item ->> 'profissional_id';
    END IF;

    v_data  := (v_item ->> 'data')::date;
    v_hora  := (v_item ->> 'hora')::time;
    v_ordem := COALESCE((v_item ->> 'execution_order')::int, 1);

    INSERT INTO public.agendamentos (
      organization_id, comanda_id, execution_order,
      cliente_id, cliente_nome,
      servico_id, servico_nome, profissional_id, profissional_nome,
      data, hora, duracao_minutos, valor,
      status, origem, forma_pagamento,
      utm_source, utm_medium, utm_campaign, observacoes
    ) VALUES (
      v_org, v_comanda_id, v_ordem,
      NULLIF(payload ->> 'cliente_id','')::uuid, payload ->> 'cliente_nome',
      v_serv.id, v_serv.nome, v_prof.id, v_prof.nome,
      v_data, v_hora, v_serv.dur, v_serv.preco,
      'agendado',
      COALESCE(NULLIF(payload ->> 'origem',''), 'publico'),
      NULLIF(payload ->> 'forma_pagamento',''),
      NULLIF(payload ->> 'utm_source',''),
      NULLIF(payload ->> 'utm_medium',''),
      NULLIF(payload ->> 'utm_campaign',''),
      NULLIF(payload ->> 'observacoes','')
    )
    RETURNING id INTO v_ag_id;

    v_ids       := v_ids || v_ag_id;
    v_total     := v_total + v_serv.preco;
    v_dur_total := v_dur_total + v_serv.dur;
  END LOOP;

  UPDATE public.comandas
     SET valor_total = v_total, duracao_total_minutos = v_dur_total, updated_at = now()
   WHERE id = v_comanda_id;

  RETURN jsonb_build_object(
    'comanda_id', v_comanda_id,
    'agendamento_ids', to_jsonb(v_ids),
    'valor_total', v_total,
    'duracao_total_minutos', v_dur_total
  );

EXCEPTION
  WHEN exclusion_violation OR unique_violation THEN
    RAISE EXCEPTION 'HORARIO_INDISPONIVEL';
END;
$$;

-- Só a edge function (service_role) chama. Sem isso, qualquer um com a anon key
-- criaria agendamentos direto via /rest/v1/rpc/fn_confirmar_comanda.
REVOKE ALL ON FUNCTION public.fn_confirmar_comanda(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_confirmar_comanda(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.fn_confirmar_comanda(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_confirmar_comanda(jsonb) TO service_role;
