-- ============================================================================
-- RÉGUA DE COBRANÇA POR FATURA (NexvyPayments) — D1+D2+D3.
--
-- A CORREÇÃO-CHAVE (adversarial): o motor `cadence_*` do Beauty é LEAD-cêntrico
-- (enrollment keyed por lead_id; stop por lead em cadence-tick:42-50 / -on-response).
-- A régua de COBRANÇA é POR FATURA: a unidade de vida da régua é a `invoices.id`,
-- não o lead. Um mesmo payer pode ter N faturas abertas, cada uma com sua própria
-- régua independente — pagar uma NÃO pode parar a outra. Por isso esta esteira
-- espelha o SHAPE do motor do Beauty (enrollment + step_runs + scheduled_at +
-- lock otimista status='scheduled'->'sent'), mas re-chaveia a identidade em
-- `invoice_id`.
--
-- ISOLAMENTO (hard fork §0): SÓ CREATE de tabelas/índices NOVOS. ZERO ALTER/DROP
-- em objeto do core. Única dependência no core é por REFERENCE (FK de leitura):
-- public.organizations, public.leads (opcional) — e public.invoices desta mesma
-- esteira. Estilo espelha migrations_cobranca/20260706101000_billing_model.sql.
--
-- MOLDE do shape de cadência (read-only): NexvyBeauty cadence_enrollments /
-- cadence_step_runs — colunas status/scheduled_at/executed_at/skip_reason vistas
-- em cadence-tick/index.ts:102-107,124-130,243-267. Aqui NÃO reusamos aquelas
-- tabelas (são lead-keyed): criamos as gêmeas invoice-keyed.
--
-- RLS canônica (blueprint §3.1) idêntica ao billing_model.sql: SELECT p/ membros
-- da org; INSERT/UPDATE/DELETE p/ admin|manager; super_admin cross-org. Escrita
-- de runtime é por service_role (BYPASSRLS) nas Edge Functions.
-- ============================================================================


-- ============================================================================
-- 1. BILLING_CADENCE_ENROLLMENTS — inscrição de UMA FATURA na régua.
-- ----------------------------------------------------------------------------
-- Diferença estrutural vs. Beauty: a chave de vida é `invoice_id` (NOT NULL), não
-- lead_id. `lead_id`/`payer_id` são vínculos de CONVENIÊNCIA (herdar omnichannel,
-- filtrar por payer no painel), NUNCA a chave do stop. `source_ref` (D1) guarda o
-- contexto estruturado do gatilho (ex.: {event_id, tipo:'emitida', competencia}).
-- `stop_reason` documenta por que parou (paga|cancelada|substituida|manual).
--
-- IDEMPOTÊNCIA: UNIQUE parcial (org, invoice_id) WHERE status='active' — uma
-- única régua ATIVA por fatura (re-emitir o evento 'emitida' não duplica a régua).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_cadence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,   -- CHAVE DE VIDA da régua (por fatura, não por lead)
  payer_id uuid REFERENCES public.payers(id) ON DELETE SET NULL,               -- conveniência: filtrar/agrupar por pagador
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,                 -- conveniência: herdar conversa do CRM embutido
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','stopped')),
  current_step_index int NOT NULL DEFAULT 0,
  source text,                                                                 -- 'billing_event'|'manual'|...
  source_ref jsonb DEFAULT '{}'::jsonb,                                        -- D1: {event_id, tipo, competencia, ...} estruturado
  stopped_at timestamptz,
  stop_reason text,                                                            -- paga|cancelada|substituida|manual
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bce_org ON public.billing_cadence_enrollments (organization_id);
CREATE INDEX IF NOT EXISTS idx_bce_invoice ON public.billing_cadence_enrollments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_bce_payer ON public.billing_cadence_enrollments (payer_id);
-- Uma régua ATIVA por fatura (idempotência de enroll). Índice parcial único.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bce_active_per_invoice
  ON public.billing_cadence_enrollments (organization_id, invoice_id)
  WHERE status = 'active';

ALTER TABLE public.billing_cadence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view bce" ON public.billing_cadence_enrollments
  FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org admin/manager can insert bce" ON public.billing_cadence_enrollments
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can update bce" ON public.billing_cadence_enrollments
  FOR UPDATE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can delete bce" ON public.billing_cadence_enrollments
  FOR DELETE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "super admin manage bce" ON public.billing_cadence_enrollments
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));


-- ============================================================================
-- 2. BILLING_CADENCE_STEP_RUNS — execução agendada de UM passo da régua.
-- ----------------------------------------------------------------------------
-- Gêmea de cadence_step_runs do Beauty (mesmo shape de lock otimista:
-- status 'scheduled' -> 'sent'; executed_at; skip_reason). Carrega REDUNDANTE o
-- `invoice_id` (além do enrollment_id) para o STOP por fatura ser um UPDATE
-- direto keyed por invoice_id — sem precisar join. `offset_days` documenta o
-- passo relativo ao vencimento (D-3=-3, D0=0, D+1=1, D+7=7) para auditoria.
--
-- D2: `scheduled_at` é computado RELATIVO a invoices.vencimento (NÃO now+delay).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_cadence_step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.billing_cadence_enrollments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,   -- redundante p/ stop O(1) por fatura
  step_key text NOT NULL,                                                      -- 'D-3'|'D0'|'D+1'|'D+7' (rótulo do passo)
  offset_days int NOT NULL,                                                    -- dias relativos ao vencimento (D2)
  scheduled_at timestamptz NOT NULL,                                           -- computado a partir do vencimento (D2)
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','sent','skipped','failed')),
  skip_reason text,
  error text,
  agent_message text,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bcsr_org ON public.billing_cadence_step_runs (organization_id);
CREATE INDEX IF NOT EXISTS idx_bcsr_enrollment ON public.billing_cadence_step_runs (enrollment_id);
-- Índice de trabalho do tick: passos vencidos ainda agendados.
CREATE INDEX IF NOT EXISTS idx_bcsr_due
  ON public.billing_cadence_step_runs (scheduled_at)
  WHERE status = 'scheduled';
-- STOP por fatura (D3): parar todos os runs agendados de UMA fatura em O(1).
CREATE INDEX IF NOT EXISTS idx_bcsr_invoice_scheduled
  ON public.billing_cadence_step_runs (invoice_id)
  WHERE status = 'scheduled';
-- Idempotência: um passo (por step_key) por enrollment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bcsr_step_per_enrollment
  ON public.billing_cadence_step_runs (enrollment_id, step_key);

ALTER TABLE public.billing_cadence_step_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view bcsr" ON public.billing_cadence_step_runs
  FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org admin/manager can insert bcsr" ON public.billing_cadence_step_runs
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can update bcsr" ON public.billing_cadence_step_runs
  FOR UPDATE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can delete bcsr" ON public.billing_cadence_step_runs
  FOR DELETE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "super admin manage bcsr" ON public.billing_cadence_step_runs
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));


-- ============================================================================
-- 3. GRANTs — mesmo padrão do billing_model.sql:466-472.
-- authenticated sob RLS; service_role BYPASSRLS (Edge Functions da régua).
-- ============================================================================
GRANT ALL ON public.billing_cadence_enrollments TO authenticated, service_role;
GRANT ALL ON public.billing_cadence_step_runs   TO authenticated, service_role;
