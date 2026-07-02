-- ============================================================
-- Platform CRM — Motor de Distribuicao de Leads (auto-dispatch)
-- Porte 1:1 do "BIZON AUTO DISPATCH" do CRM Vendus -> platform_crm (super-admin).
-- Fontes (.vendus-src-reference/supabase/migrations/):
--   * 20260218150936_*.sql  -> user_status, process_pending_queue
--   * 20260219194028_*.sql  -> distribute_lead (versao corrigida) + sync_active_leads_count
-- Adaptacao (guardrails do porte): SEM organization_id, SEM product_id (pipeline unico);
--   tabelas -> platform_crm_*; refs de usuario -> auth.users; RLS super_admin_only
--   (padrao public.has_role(auth.uid(),'super_admin'::app_role)).
-- Consumido por: edge platform-distribute-lead (RPCs platform_crm_distribute_lead /
--   platform_crm_process_pending_queue).
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / guards).
-- ============================================================

-- 1) Presenca/disponibilidade (porte 1:1 de user_status; sem org; ref auth.users)
CREATE TABLE IF NOT EXISTS public.platform_crm_user_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online','away','offline')),
  last_status_change timestamptz NOT NULL DEFAULT now(),
  active_leads_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_user_status_user_uniq UNIQUE (user_id)
);

ALTER TABLE public.platform_crm_user_status ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'platform_crm_user_status'
      AND policyname = 'platform_crm_user_status_super_admin_only'
  ) THEN
    CREATE POLICY "platform_crm_user_status_super_admin_only"
      ON public.platform_crm_user_status
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'super_admin'::app_role))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
  END IF;
END $$;

-- 2) ON CONFLICT (lead_id) exige indice unico (o original tinha UNIQUE(lead_id))
CREATE UNIQUE INDEX IF NOT EXISTS platform_crm_lead_queue_lead_uniq
  ON public.platform_crm_lead_queue(lead_id);

-- 3) Sync de active_leads_count no assign/reassign (porte 1:1; sem org)
CREATE OR REPLACE FUNCTION public.platform_crm_sync_active_leads_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- Decrementa contador do antigo responsavel
  IF OLD.assigned_to IS NOT NULL AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    UPDATE platform_crm_user_status
      SET active_leads_count = GREATEST(0, active_leads_count - 1), updated_at = now()
      WHERE user_id = OLD.assigned_to;
  END IF;
  -- Incrementa contador do novo responsavel (garante linha de status)
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO platform_crm_user_status (user_id, status, active_leads_count)
      SELECT NEW.assigned_to, 'offline', 0
      WHERE NOT EXISTS (
        SELECT 1 FROM platform_crm_user_status WHERE user_id = NEW.assigned_to
      );
    UPDATE platform_crm_user_status
      SET active_leads_count = active_leads_count + 1, updated_at = now()
      WHERE user_id = NEW.assigned_to;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS platform_crm_leads_assignee_change ON public.platform_crm_leads;
CREATE TRIGGER platform_crm_leads_assignee_change
  AFTER UPDATE OF assigned_to ON public.platform_crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.platform_crm_sync_active_leads_count();

DROP TRIGGER IF EXISTS platform_crm_leads_assignee_insert ON public.platform_crm_leads;
CREATE TRIGGER platform_crm_leads_assignee_insert
  AFTER INSERT ON public.platform_crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.platform_crm_sync_active_leads_count();

-- 4) distribute_lead (porte da versao corrigida 20260219194028; sem org/product)
CREATE OR REPLACE FUNCTION public.platform_crm_distribute_lead(
  p_lead_id uuid,
  p_squad_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_config RECORD;
  v_assigned_user_id uuid;
  v_members uuid[];
  v_idx integer;
BEGIN
  -- Config de distribuicao do squad
  SELECT * INTO v_config
  FROM platform_crm_distribution_config
  WHERE squad_id = p_squad_id;

  IF NOT FOUND THEN
    INSERT INTO platform_crm_distribution_config (squad_id, method)
    VALUES (p_squad_id, 'round_robin')
    RETURNING * INTO v_config;
  END IF;

  -- Membros ONLINE do squad (filtro por squad_id ja garante escopo)
  SELECT ARRAY_AGG(sm.user_id ORDER BY sm.user_id) INTO v_members
  FROM platform_crm_squad_members sm
  JOIN platform_crm_user_status us ON us.user_id = sm.user_id
  WHERE sm.squad_id = p_squad_id
    AND us.status = 'online';

  -- Nenhum online? Enfileira
  IF v_members IS NULL OR array_length(v_members, 1) IS NULL THEN
    INSERT INTO platform_crm_lead_queue (lead_id, squad_id, status)
    VALUES (p_lead_id, p_squad_id, 'pending')
    ON CONFLICT (lead_id) DO NOTHING;
    RETURN NULL;
  END IF;

  -- Metodo de distribuicao
  IF v_config.method = 'round_robin' THEN
    v_idx := v_config.round_robin_index % array_length(v_members, 1);
    v_assigned_user_id := v_members[v_idx + 1];
    UPDATE platform_crm_distribution_config
      SET round_robin_index = v_config.round_robin_index + 1
      WHERE id = v_config.id;

  ELSIF v_config.method = 'least_busy' THEN
    SELECT us.user_id INTO v_assigned_user_id
    FROM platform_crm_user_status us
    WHERE us.user_id = ANY(v_members) AND us.status = 'online'
    ORDER BY us.active_leads_count ASC
    LIMIT 1;

  ELSE -- performance / fallback -> round_robin
    v_idx := v_config.round_robin_index % array_length(v_members, 1);
    v_assigned_user_id := v_members[v_idx + 1];
    UPDATE platform_crm_distribution_config
      SET round_robin_index = v_config.round_robin_index + 1
      WHERE id = v_config.id;
  END IF;

  -- Atribui (contador sincronizado pelo trigger platform_crm_sync_active_leads_count)
  IF v_assigned_user_id IS NOT NULL THEN
    UPDATE platform_crm_leads SET assigned_to = v_assigned_user_id WHERE id = p_lead_id;
    RETURN v_assigned_user_id;
  END IF;

  -- Fallback: enfileira
  INSERT INTO platform_crm_lead_queue (lead_id, squad_id, status)
  VALUES (p_lead_id, p_squad_id, 'pending')
  ON CONFLICT (lead_id) DO NOTHING;
  RETURN NULL;
END;
$fn$;

-- 5) process_pending_queue (porte 20260218150936; sem org)
CREATE OR REPLACE FUNCTION public.platform_crm_process_pending_queue(p_user_id uuid)
RETURNS TABLE(assigned_lead_id uuid, assigned_squad_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_queue_item RECORD;
  v_user_squads uuid[];
BEGIN
  SELECT ARRAY_AGG(squad_id) INTO v_user_squads
  FROM platform_crm_squad_members WHERE user_id = p_user_id;

  IF v_user_squads IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_queue_item
  FROM platform_crm_lead_queue lq
  WHERE lq.squad_id = ANY(v_user_squads)
    AND lq.status = 'pending'
  ORDER BY lq.priority DESC, lq.queued_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE platform_crm_leads SET assigned_to = p_user_id WHERE id = v_queue_item.lead_id;

  UPDATE platform_crm_lead_queue SET
    status = 'assigned',
    assigned_to = p_user_id,
    assigned_at = now()
  WHERE id = v_queue_item.id;

  assigned_lead_id := v_queue_item.lead_id;
  assigned_squad_id := v_queue_item.squad_id;
  RETURN NEXT;
END;
$fn$;
