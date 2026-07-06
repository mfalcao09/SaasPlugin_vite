-- L8 (LOTE P4) — histórico de transferência de lead do CRM de PLATAFORMA.
-- Aplicada em prod via MCP apply_migration em 2026-07-03 (projeto fzhlbwhdejumkyqosuvq).
-- Porte 1:1 de `lead_transfer_history` (fonte Bizon), desacoplado do tenant:
-- FKs para platform_crm_leads / platform_crm_sales_squads / auth.users.
-- Sem organization_id; RLS super_admin-only (mesmo padrão das demais platform_crm_*).
-- product_id omitido de propósito (1:1 com a fonte; derivável do lead).
CREATE TABLE public.platform_crm_lead_transfer_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_squad_id uuid REFERENCES public.platform_crm_sales_squads(id) ON DELETE SET NULL,
  to_squad_id uuid REFERENCES public.platform_crm_sales_squads(id) ON DELETE SET NULL,
  transferred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_crm_lead_transfer_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_crm_lead_transfer_history_super_admin_only
  ON public.platform_crm_lead_transfer_history
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_platform_crm_lead_transfer_history_lead
  ON public.platform_crm_lead_transfer_history (lead_id, created_at DESC);
