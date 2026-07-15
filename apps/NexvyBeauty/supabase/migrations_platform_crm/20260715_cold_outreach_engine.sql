-- ============================================================================
-- 20260715_cold_outreach_engine.sql — MOTOR DE COLD OUTREACH (platform-side)
--
-- Tabelas de estado do pipeline de cold outreach WhatsApp/Instagram sobre os
-- leads raspados (platform_crm_extracted_leads). É a espinha que o edge
-- `platform-cold-outreach` lê/escreve. NADA aqui dispara mensagem — o disparo
-- real (número burner + start do warm-up) é ativação do Marcelo (dry_run=true
-- por default em toda campanha).
--
-- Camada anti-ban (o que separa 1.200 de 300 leads tocados, COLD-OUTREACH §4):
--   • warm-up ramp + teto diário  -> platform_crm_cold_daily_counters + config
--   • kill-switch / saúde         -> platform_crm_cold_instance_health
--   • fila/cadência/dedupe         -> platform_crm_cold_outreach_queue
--   • campanha (canal, burner, flags) -> platform_crm_cold_campaigns
--
-- Opt-out runtime reusa platform_crm_lead_optout (já existe, 20260712); a
-- instrumentação por etapa reusa platform_crm_journey_events + pcrm_log_journey_event
-- (já existem). Não há tabela nova pra esses dois.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS.
-- Segurança: RLS super_admin-only (padrão _super_admin_only); edges escrevem via
--   SERVICE_ROLE (bypass RLS) e re-aplicam o gate em código. Sem input concatenado.
-- ⚠️ ESCRITA-NÃO-DEPLOYADA: as tabelas SÃO aplicadas (apply_migration); os edges
--   são deployados gated OFF. Aplicar esta migration NÃO dispara nada.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1) platform_crm_cold_campaigns  (a CAMPANHA — canal, burner, flags anti-ban)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_crm_cold_campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  name          text NOT NULL,
  channel       text NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp','instagram')),
  status        text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','warming','active','paused','killed','completed')),
  -- Persona BDR (prospector) que abre. FK solta (agente pode ser removido).
  agent_id      uuid,
  -- Instância de envio: burner Evolution (WA) OU conexão IG. CONFIG do Marcelo
  -- (nunca hardcode); nulo até ele indicar. O oficial Meta NUNCA entra aqui.
  instance_id   uuid,
  sender_name   text,                              -- [SeuNome] do script
  -- GATE MESTRE: dry_run=true = simula (gera+enfileira) sem enviar. Default ON.
  dry_run       boolean NOT NULL DEFAULT true,
  -- Configs anti-ban (defaults do código quando null): {startPerDay,doublingEveryDays,maxPerDay}
  warmup_config     jsonb NOT NULL DEFAULT '{"startPerDay":20,"doublingEveryDays":2,"maxPerDay":200}'::jsonb,
  window_config     jsonb NOT NULL DEFAULT '{"startHour":9,"endHour":18,"days":[1,2,3,4,5],"timeZone":"America/Sao_Paulo"}'::jsonb,
  jitter_config     jsonb NOT NULL DEFAULT '{"minMs":40000,"maxMs":180000}'::jsonb,
  killswitch_config jsonb NOT NULL DEFAULT '{"maxBlockRate":0.05,"maxReportRate":0.02,"minSample":20,"maxConsecutiveFailures":10}'::jsonb,
  paused_reason text,
  started_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cold_campaigns_product_status
  ON public.platform_crm_cold_campaigns (product_id, status);

-- ════════════════════════════════════════════════════════════════════════════
-- 2) platform_crm_cold_outreach_queue  (FILA/CADÊNCIA por lead)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_crm_cold_outreach_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       uuid NOT NULL
    REFERENCES public.platform_crm_cold_campaigns(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  -- Lead raspado alvo (SET NULL se o extraído sumir; o histórico permanece).
  extracted_lead_id uuid
    REFERENCES public.platform_crm_extracted_leads(id) ON DELETE SET NULL,
  handle            text,
  telefone          text,
  tier              text CHECK (tier IN ('semente_limpa','is_seed','massa')),
  variant           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- A/B assignment
  status            text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','replied','opted_out','handed_off','failed','skipped')),
  step              int  NOT NULL DEFAULT 0,   -- 0=abertura, 1=D+2, 2=breakup
  conversation_id   uuid,                       -- platform_crm_conversations
  lead_id           uuid,                       -- platform_crm_leads (pós-import)
  scheduled_for     timestamptz,
  sent_at           timestamptz,
  last_outreach_at  timestamptz,
  next_followup_at  timestamptz,
  followups_sent    int NOT NULL DEFAULT 0,
  attempts          int NOT NULL DEFAULT 0,
  skip_reason       text,
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Dedupe: 1 enfileiramento por (campanha, lead raspado). Índice parcial ignora
-- linhas sem extracted_lead_id (smoke/seeds sintéticos podem não referenciar).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cold_queue_campaign_lead
  ON public.platform_crm_cold_outreach_queue (campaign_id, extracted_lead_id)
  WHERE extracted_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cold_queue_due
  ON public.platform_crm_cold_outreach_queue (campaign_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_cold_queue_followup
  ON public.platform_crm_cold_outreach_queue (campaign_id, next_followup_at)
  WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_cold_queue_conversation
  ON public.platform_crm_cold_outreach_queue (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) platform_crm_cold_daily_counters  (WARM-UP CAP + taxas p/ kill-switch)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_crm_cold_daily_counters (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      uuid NOT NULL
    REFERENCES public.platform_crm_cold_campaigns(id) ON DELETE CASCADE,
  instance_id      uuid,           -- burner (nulo em dry-run sem instância)
  day              date NOT NULL,  -- dia local (America/Sao_Paulo) do envio
  sent_count       int NOT NULL DEFAULT 0,
  delivered_count  int NOT NULL DEFAULT 0,
  blocked_count    int NOT NULL DEFAULT 0,
  reported_count   int NOT NULL DEFAULT 0,
  failed_count     int NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- COALESCE(instance_id, zero-uuid) pra unicidade funcionar com instância nula.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cold_counters_day
  ON public.platform_crm_cold_daily_counters
     (campaign_id, COALESCE(instance_id, '00000000-0000-0000-0000-000000000000'::uuid), day);

-- ════════════════════════════════════════════════════════════════════════════
-- 4) platform_crm_cold_instance_health  (idade de warm-up + estado do kill-switch)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_crm_cold_instance_health (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           uuid NOT NULL
    REFERENCES public.platform_crm_cold_campaigns(id) ON DELETE CASCADE,
  instance_id           uuid,
  first_send_at         timestamptz,        -- ancora o dia de warm-up
  consecutive_failures  int NOT NULL DEFAULT 0,
  killed                boolean NOT NULL DEFAULT false,
  killed_reason         text,
  killed_at             timestamptz,
  last_quality          text,               -- eco do quality-rating quando existir
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cold_health_campaign_instance
  ON public.platform_crm_cold_instance_health
     (campaign_id, COALESCE(instance_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ════════════════════════════════════════════════════════════════════════════
-- 5) RPC atômico de incremento de contador (upsert + increment)
--    O edge chama isto após cada tentativa de envio; concorrência-safe.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.pcrm_cold_bump_counter(
  p_campaign   uuid,
  p_instance   uuid,
  p_day        date,
  p_sent       int DEFAULT 0,
  p_delivered  int DEFAULT 0,
  p_blocked    int DEFAULT 0,
  p_reported   int DEFAULT 0,
  p_failed     int DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.platform_crm_cold_daily_counters
    (campaign_id, instance_id, day, sent_count, delivered_count, blocked_count, reported_count, failed_count)
  VALUES
    (p_campaign, p_instance, p_day, p_sent, p_delivered, p_blocked, p_reported, p_failed)
  ON CONFLICT (campaign_id, COALESCE(instance_id, '00000000-0000-0000-0000-000000000000'::uuid), day)
  DO UPDATE SET
    sent_count      = public.platform_crm_cold_daily_counters.sent_count      + EXCLUDED.sent_count,
    delivered_count = public.platform_crm_cold_daily_counters.delivered_count + EXCLUDED.delivered_count,
    blocked_count   = public.platform_crm_cold_daily_counters.blocked_count   + EXCLUDED.blocked_count,
    reported_count  = public.platform_crm_cold_daily_counters.reported_count  + EXCLUDED.reported_count,
    failed_count    = public.platform_crm_cold_daily_counters.failed_count    + EXCLUDED.failed_count,
    updated_at      = now();
EXCEPTION WHEN OTHERS THEN
  NULL;  -- best-effort: contador nunca bloqueia o envio
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6) RLS — super_admin only (padrão _super_admin_only) — 4 tabelas
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.platform_crm_cold_campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_crm_cold_outreach_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_crm_cold_daily_counters   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_crm_cold_instance_health  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_crm_cold_campaigns_super_admin_only ON public.platform_crm_cold_campaigns;
CREATE POLICY platform_crm_cold_campaigns_super_admin_only ON public.platform_crm_cold_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS platform_crm_cold_outreach_queue_super_admin_only ON public.platform_crm_cold_outreach_queue;
CREATE POLICY platform_crm_cold_outreach_queue_super_admin_only ON public.platform_crm_cold_outreach_queue
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS platform_crm_cold_daily_counters_super_admin_only ON public.platform_crm_cold_daily_counters;
CREATE POLICY platform_crm_cold_daily_counters_super_admin_only ON public.platform_crm_cold_daily_counters
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS platform_crm_cold_instance_health_super_admin_only ON public.platform_crm_cold_instance_health;
CREATE POLICY platform_crm_cold_instance_health_super_admin_only ON public.platform_crm_cold_instance_health
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Fim 20260715_cold_outreach_engine.sql
