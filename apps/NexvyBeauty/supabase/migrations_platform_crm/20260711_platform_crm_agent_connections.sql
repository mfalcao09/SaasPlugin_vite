-- ============================================================================
-- B11/Wave3 — GÊMEA product-scoped: platform_crm_agent_connections
-- ----------------------------------------------------------------------------
-- Junction agente↔conexão de canal. Fecha o TODO(edge) explícito deixado em:
--   • src/components/superadmin/crm/agents/AgentEditor.tsx (~68-71, useAgentConnections)
--   • src/components/superadmin/crm/agents/AgentCard.tsx (~79-81, dedicatedSummary)
--   • src/components/superadmin/crm/data/usePlatformCrmProductAgents.ts (sync dedicated_connections)
--
-- Espelha a org-scoped `public.product_agent_connections` da fonte Bizon
-- (.vendus-src-reference), trocando organization_id + agent_id por
-- product_agent_id (FK → platform_crm_product_agents). Product-scoped puro:
-- SEM organization_id (convenção da camada platform_crm_*).
--
-- Uma linha = "este agente só responde nesta conexão de canal". Sem nenhuma
-- linha = agente atende em QUALQUER conexão (comportamento padrão). connection_id
-- referencia o id da conexão do respectivo tipo:
--   • 'evolution'      → platform_crm_evolution_instances(id)       (WhatsApp QR)
--   • 'meta_whatsapp'  → platform_crm_whatsapp_meta_connections(id) (WhatsApp Oficial)
--   • 'instagram'      → platform_crm_instagram_connections(id)     (Instagram Direct)
-- FK poliforma (o tipo decide a tabela-alvo) → connection_id fica solto (sem FK
-- rígida), igual à origem; a UI só oferece ids válidos e o cleanup é por CASCADE
-- do agente. UNIQUE evita duplicar o mesmo vínculo.
--
-- RLS = padrão vigente `_super_admin_only` (has_role super_admin), idêntico às
-- tabelas de conexão e ao platform_crm_product_agents. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_crm_agent_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_agent_id  uuid NOT NULL REFERENCES public.platform_crm_product_agents(id) ON DELETE CASCADE,
  connection_type   text NOT NULL CHECK (connection_type IN ('evolution','meta_whatsapp','instagram')),
  connection_id     uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_agent_connections_unique
    UNIQUE (product_agent_id, connection_type, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_pcrm_agent_connections_agent
  ON public.platform_crm_agent_connections(product_agent_id);
CREATE INDEX IF NOT EXISTS idx_pcrm_agent_connections_conn
  ON public.platform_crm_agent_connections(connection_type, connection_id);

COMMENT ON TABLE public.platform_crm_agent_connections IS
  'Junction agente↔conexão de canal (product-scoped, sem organization_id). Gêmea de product_agent_connections. Sem linha = agente atende em qualquer conexão.';

-- ============================================================================
-- RLS — padrão vigente `_super_admin_only`
-- ============================================================================
ALTER TABLE public.platform_crm_agent_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_crm_agent_connections_super_admin_only" ON public.platform_crm_agent_connections;
CREATE POLICY "platform_crm_agent_connections_super_admin_only" ON public.platform_crm_agent_connections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_crm_agent_connections TO authenticated;
GRANT ALL ON public.platform_crm_agent_connections TO service_role;

-- ============================================================================
-- CHECK (rodar pós-aplicação):
--   • pg_tables.rowsecurity = true para platform_crm_agent_connections
--   • pg_policies: 1 policy `_super_admin_only` FOR ALL
--   • INSERT com connection_type fora do set → viola CHECK (esperado)
--   • 2º INSERT do mesmo (product_agent_id, connection_type, connection_id) → viola UNIQUE
--   • DELETE do agente em platform_crm_product_agents → CASCADE remove os vínculos
-- ============================================================================
