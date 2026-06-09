-- ============================================================
-- ERP de Oficina — reintegração ao schema sales-spark
-- Tabelas: clientes, veiculos, ordens_servico, orcamentos, lancamentos
-- Todas org-scoped (organization_id) + RLS no padrão do schema:
--   organization_id = public.get_user_organization(auth.uid())
-- Campos derivados das telas antigas (338c9e5^) + entities base44.
-- ============================================================

-- ---------- CLIENTES ----------
CREATE TABLE IF NOT EXISTS public.clientes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  telefone        text,
  email           text,
  cpf_cnpj        text,
  endereco        text,
  status          text NOT NULL DEFAULT 'ativo',
  tags            text[] DEFAULT '{}'::text[],
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clientes_org ON public.clientes(organization_id);

-- ---------- VEICULOS ----------
CREATE TABLE IF NOT EXISTS public.veiculos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cliente_id      uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome    text,
  marca           text,
  modelo          text,
  ano             integer,
  placa           text,
  cor             text,
  quilometragem   integer,
  ultima_revisao  date,
  proxima_revisao date,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_veiculos_org ON public.veiculos(organization_id);
CREATE INDEX IF NOT EXISTS idx_veiculos_cliente ON public.veiculos(cliente_id);

-- ---------- ORDENS DE SERVICO ----------
CREATE TABLE IF NOT EXISTS public.ordens_servico (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  numero           text,
  orcamento_id     uuid,
  cliente_id       uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome     text,
  veiculo_id       uuid REFERENCES public.veiculos(id) ON DELETE SET NULL,
  veiculo_desc     text,
  data_abertura    date DEFAULT CURRENT_DATE,
  data_prevista    date,
  data_conclusao   date,
  status           text NOT NULL DEFAULT 'aberta',
  tecnico          text,
  tecnico_id       uuid,
  prioridade       text NOT NULL DEFAULT 'normal',
  total            numeric(12,2) DEFAULT 0,
  itens            jsonb DEFAULT '[]'::jsonb,
  observacoes      text,
  pagamento_status text NOT NULL DEFAULT 'pendente',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ordens_org ON public.ordens_servico(organization_id);
CREATE INDEX IF NOT EXISTS idx_ordens_cliente ON public.ordens_servico(cliente_id);

-- ---------- ORCAMENTOS ----------
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  numero           text,
  cliente_id       uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome     text,
  veiculo_id       uuid REFERENCES public.veiculos(id) ON DELETE SET NULL,
  veiculo_desc     text,
  data             date DEFAULT CURRENT_DATE,
  validade         date,
  status           text NOT NULL DEFAULT 'pendente',
  total            numeric(12,2) DEFAULT 0,
  itens            jsonb DEFAULT '[]'::jsonb,
  observacoes      text,
  convertido_em_os boolean NOT NULL DEFAULT false,
  os_id            uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orcamentos_org ON public.orcamentos(organization_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente ON public.orcamentos(cliente_id);

-- ---------- LANCAMENTOS (financeiro) ----------
CREATE TABLE IF NOT EXISTS public.lancamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  descricao       text NOT NULL,
  tipo            text NOT NULL DEFAULT 'entrada',
  valor           numeric(12,2) NOT NULL DEFAULT 0,
  data            date DEFAULT CURRENT_DATE,
  status          text NOT NULL DEFAULT 'confirmado',
  forma           text,
  categoria       text,
  os_id           uuid,
  orcamento_id    uuid,
  cliente_id      uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lancamentos_org ON public.lancamentos(organization_id);

-- ============================================================
-- RLS — org-scoped, padrao do schema sales-spark
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','veiculos','ordens_servico','orcamentos','lancamentos']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can view %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can view %1$s" ON public.%1$I FOR SELECT USING (organization_id = public.get_user_organization(auth.uid()));', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can insert %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (organization_id = public.get_user_organization(auth.uid()));', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can update %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can update %1$s" ON public.%1$I FOR UPDATE USING (organization_id = public.get_user_organization(auth.uid())) WITH CHECK (organization_id = public.get_user_organization(auth.uid()));', t);

    EXECUTE format('DROP POLICY IF EXISTS "org members can delete %1$s" ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY "org members can delete %1$s" ON public.%1$I FOR DELETE USING (organization_id = public.get_user_organization(auth.uid()));', t);
  END LOOP;
END $$;
