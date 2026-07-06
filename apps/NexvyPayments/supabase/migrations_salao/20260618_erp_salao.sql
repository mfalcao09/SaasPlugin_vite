-- ============================================================================
-- Vertical Salão (NexvyBeauty) — integrado ao core via organization_id.
-- Reaproveita: clientes, lancamentos. Estende: servico_catalogo.
-- Cria: profissionais, agendamentos. RLS idêntica ao core (get_user_organization).
-- ============================================================================

-- 1. Estender servico_catalogo para salão (duração/categoria/descrição)
ALTER TABLE public.servico_catalogo
  ADD COLUMN IF NOT EXISTS duracao_minutos integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS descricao text;

-- 2. Profissionais (cabeleireiros, manicures, esteticistas...)
CREATE TABLE IF NOT EXISTS public.profissionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  nome text NOT NULL,
  email text,
  telefone text,
  especialidades text[] DEFAULT '{}',
  comissao_pct numeric DEFAULT 0,
  foto_url text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view profissionais" ON public.profissionais
  FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org members can insert profissionais" ON public.profissionais
  FOR INSERT WITH CHECK (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org members can update profissionais" ON public.profissionais
  FOR UPDATE USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org members can delete profissionais" ON public.profissionais
  FOR DELETE USING (organization_id = get_user_organization(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_profissionais_org ON public.profissionais(organization_id);

-- 3. Agendamentos (agenda operacional do salão)
CREATE TABLE IF NOT EXISTS public.agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome text,
  profissional_id uuid REFERENCES public.profissionais(id) ON DELETE SET NULL,
  profissional_nome text,
  servico_id uuid REFERENCES public.servico_catalogo(id) ON DELETE SET NULL,
  servico_nome text,
  data date NOT NULL,
  hora time without time zone NOT NULL,
  duracao_minutos integer DEFAULT 30,
  valor numeric DEFAULT 0,
  forma_pagamento text,
  status text DEFAULT 'agendado',
  observacoes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view agendamentos" ON public.agendamentos
  FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org members can insert agendamentos" ON public.agendamentos
  FOR INSERT WITH CHECK (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org members can update agendamentos" ON public.agendamentos
  FOR UPDATE USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org members can delete agendamentos" ON public.agendamentos
  FOR DELETE USING (organization_id = get_user_organization(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_agendamentos_org_data ON public.agendamentos(organization_id, data);

-- 4. GRANTs (mesmo padrão do core)
GRANT ALL ON public.profissionais TO anon, authenticated, service_role;
GRANT ALL ON public.agendamentos TO anon, authenticated, service_role;
