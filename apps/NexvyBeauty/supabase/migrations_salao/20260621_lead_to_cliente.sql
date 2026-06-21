-- Vínculo Lead→Cliente (ciclo de vida do NexvyBeauty):
-- o LEAD (prospecção no CRM, tabela `leads`) vira CLIENTE (base do salão,
-- tabela `clientes`) ao agendar/contratar. `clientes.lead_id` rastreia de qual
-- lead o cliente veio. Aditivo + idempotente. Aplicado em prod 2026-06-21
-- (fzhlbwhdejumkyqosuvq) via Supabase MCP apply_migration.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_lead_id ON public.clientes(lead_id);

COMMENT ON COLUMN public.clientes.lead_id IS
  'Lead (CRM) que originou este cliente. Setado na conversao lead->cliente (ao agendar/contratar).';
