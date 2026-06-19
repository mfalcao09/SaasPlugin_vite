-- ============================================================================
-- Estágio 0 — Afiliados + Rastreamento + Captura (camada PRÓPRIA, provider-agnóstica)
-- O afiliado é entidade de PLATAFORMA (não tenant) -> RLS por is_super_admin().
-- A captura pública (LP anônima) grava via Edge Function com service_role.
-- A atribuição do afiliado mora na NOSSA camada (antes do checkout) -> o meio
-- de pagamento (Cakto hoje, PSP próprio depois) é apenas um adaptador.
-- ============================================================================

-- 1. AFILIADOS (parceiros que vendem a plataforma e recebem comissão)
CREATE TABLE IF NOT EXISTS public.affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,                              -- futuro: vínculo com auth p/ painel self-service
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  pix_key text,                             -- chave PIX p/ payout da comissão
  status text NOT NULL DEFAULT 'active',    -- active | paused | blocked
  commission_pct numeric NOT NULL DEFAULT 0,-- % padrão de comissão por venda
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_email ON public.affiliates(lower(email));
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin manage affiliates" ON public.affiliates
  FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "affiliate reads self" ON public.affiliates
  FOR SELECT USING (user_id = auth.uid());

-- 2. LINKS DE AFILIADO (cada ref_code -> afiliado; permite vários canais por parceiro)
CREATE TABLE IF NOT EXISTS public.affiliate_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  ref_code text NOT NULL,                    -- = ?ref=<code> na URL da LP
  label text,                               -- "Instagram", "Grupo WhatsApp"...
  default_utm_source text,
  default_utm_medium text,
  default_utm_campaign text,
  clicks integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_links_ref ON public.affiliate_links(lower(ref_code));
CREATE INDEX IF NOT EXISTS idx_affiliate_links_aff ON public.affiliate_links(affiliate_id);
ALTER TABLE public.affiliate_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin manage affiliate_links" ON public.affiliate_links
  FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "affiliate reads own links" ON public.affiliate_links
  FOR SELECT USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()));

-- 3. COMISSÕES (1 por venda atribuída; idempotente por pedido)
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  lead_id uuid,                             -- sales_leads.id que originou a venda
  order_ref text,                           -- id do pedido no provedor (Cakto/PSP)
  organization_id uuid,                     -- empresa provisionada pela venda
  amount_cents integer NOT NULL DEFAULT 0,  -- valor da comissão em centavos
  pct_applied numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending',   -- pending | approved | paid | cancelled
  idempotency_key text NOT NULL,            -- = id do pedido no provedor (anti-duplicação)
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_aff_comm_idem ON public.affiliate_commissions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_aff_comm_aff ON public.affiliate_commissions(affiliate_id, status);
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin manage affiliate_commissions" ON public.affiliate_commissions
  FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "affiliate reads own commissions" ON public.affiliate_commissions
  FOR SELECT USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()));

-- 4. Estender sales_leads com tracking completo (canal + plataforma) + afiliado
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS referrer_url text,
  ADD COLUMN IF NOT EXISTS landing_page text,
  ADD COLUMN IF NOT EXISTS lead_channel text,    -- 'afiliado:<ref>' | 'organico'
  ADD COLUMN IF NOT EXISTS src text,
  ADD COLUMN IF NOT EXISTS sck text,
  ADD COLUMN IF NOT EXISTS fbc text,
  ADD COLUMN IF NOT EXISTS fbp text,
  ADD COLUMN IF NOT EXISTS ref_code text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES public.affiliates(id) ON DELETE SET NULL;
-- captura "salva mesmo sem qualificação completa": nome do negócio deixa de ser obrigatório
ALTER TABLE public.sales_leads ALTER COLUMN company_name DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_leads_affiliate ON public.sales_leads(affiliate_id);

-- 5. RPC: resolve ref_code -> affiliate_id (usado na captura server-side).
--    SECURITY DEFINER p/ resolver sem expor a tabela inteira.
CREATE OR REPLACE FUNCTION public.resolve_affiliate_ref(p_ref text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT affiliate_id FROM public.affiliate_links
  WHERE lower(ref_code) = lower(p_ref)
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_affiliate_ref(text) TO authenticated, service_role;

-- 6. GRANTs (afiliado é plataforma; anon NÃO acessa as tabelas direto — só via Edge Function service_role)
GRANT ALL ON public.affiliates TO authenticated, service_role;
GRANT ALL ON public.affiliate_links TO authenticated, service_role;
GRANT ALL ON public.affiliate_commissions TO authenticated, service_role;
