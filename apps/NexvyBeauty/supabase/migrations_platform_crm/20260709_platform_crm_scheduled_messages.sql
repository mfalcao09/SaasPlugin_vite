-- ─────────────────────────────────────────────────────────────────────────────
-- 20260709_platform_crm_scheduled_messages.sql — A1.2 (agendamento de mensagens)
--
-- Fila interna de mensagens agendadas do CRM de PLATAFORMA (super_admin).
-- Drenada pela action `dispatch-scheduled` de platform-webchat-inbox (cron
-- pg_cron a cada minuto — migration 20260709_platform_cron_dispatch_scheduled).
-- A UI já aguarda esta tabela (TODO(A1-schedule) em PlatformCrmChatArea /
-- usePlatformCrmOperationCenter): criação/cancelamento são client-side via RLS.
--
-- Fluxo de status:
--   pending → sending → sent | failed        (cancelled: via UI, só de pending)
--
-- DESVIOS do spec (deliberados, documentados):
--   * status 'sending' ADICIONADO ao check — claim atômico por linha
--     (UPDATE ... WHERE status='pending'), mesmo padrão de idempotência do
--     platform-campaign-dispatcher (queued→sending→sent/failed). Sem ele, dois
--     ticks concorrentes poderiam entregar a MESMA mensagem 2x no WhatsApp.
--   * dispatched_at ADICIONADO — timestamp do claim; permite detectar linha
--     órfã ('sending' presa >10min por crash do tick) e marcá-la failed SEM
--     reenvio automático (anti-duplicação: não há como provar que a Meta não
--     recebeu; o resend manual na conversa decide).
--
-- media jsonb — MESMO shape do payload `media` da action send:
--   { "bucket": "platform-crm-media", "path": "whatsapp-outbound/<conv>/<arq>",
--     "mimeType": "image/jpeg", "kind": "image|audio|video|document",
--     "filename": "opcional.pdf", "caption": "opcional",
--     "size_bytes": 12345, "duration_ms": null, "width": null, "height": null }
--
-- Regras de design (mesmas do 20260701_platform_crm_schema.sql):
--   * SEM organization_id (dado global da plataforma, tenant-of-one).
--   * FKs só para platform_crm_* / auth.users.
--   * RLS super_admin-only via public.has_role.
--   * Migration idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_crm_scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES public.platform_crm_conversations(id) ON DELETE CASCADE,
  content text NOT NULL,
  media jsonb NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  error text NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz NULL,
  sent_at timestamptz NULL
);

COMMENT ON TABLE public.platform_crm_scheduled_messages IS
  'Fila de mensagens agendadas do inbox do CRM da plataforma. Drenada pela action dispatch-scheduled de platform-webchat-inbox (pg_cron 1/min). pending→sending→sent|failed; cancelled via UI (só de pending).';
COMMENT ON COLUMN public.platform_crm_scheduled_messages.media IS
  'Shape idêntico ao payload media da action send: {bucket, path, mimeType, kind, filename?, caption?, size_bytes?, duration_ms?, width?, height?, thumbnail_url?} (bucket platform-crm-media).';
COMMENT ON COLUMN public.platform_crm_scheduled_messages.dispatched_at IS
  'Timestamp do claim (pending→sending). sending presa >10min = tick morto → failed sem reenvio (anti-duplicação).';

-- Índice de drenagem do dispatcher (WHERE status='pending' AND scheduled_at<=now()).
CREATE INDEX IF NOT EXISTS idx_platform_crm_scheduled_messages_status_scheduled
  ON public.platform_crm_scheduled_messages(status, scheduled_at);

-- Listagem por conversa na UI (aba/indicador de agendadas da conversa).
CREATE INDEX IF NOT EXISTS idx_platform_crm_scheduled_messages_conversation
  ON public.platform_crm_scheduled_messages(conversation_id);

-- ─── RLS — padrão platform_crm_* (super_admin-only; espelho do bloco DO $$ do
--     20260701_platform_crm_inbox.sql) ──────────────────────────────────────
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_scheduled_messages'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_super_admin_only" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_super_admin_only" ON public.%I '
      'FOR ALL TO authenticated '
      'USING (public.has_role(auth.uid(), ''super_admin''::app_role)) '
      'WITH CHECK (public.has_role(auth.uid(), ''super_admin''::app_role));',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
  END LOOP;
END$$;
