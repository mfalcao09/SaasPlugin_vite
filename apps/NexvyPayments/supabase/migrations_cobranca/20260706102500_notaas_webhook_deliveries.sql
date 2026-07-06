-- ============================================================================
-- DEDUP de entregas do webhook NotaAS (NexvyPayments) — Entregável C2.
--
-- O NotaAS envia webhooks com um id de entrega em `X-Notaas-Delivery`. A rede
-- re-entrega (timeout, 5xx, retry do provedor), então a MESMA entrega pode
-- chegar 2+ vezes. Esta tabela é o LEDGER de idempotência: o receptor grava o
-- delivery_id ANTES de agir; se o INSERT conflita (UNIQUE), a entrega já foi
-- processada e o handler devolve 200 sem re-executar o efeito (dedup atômico,
-- à prova de corrida — dois workers competindo, só um vence o INSERT).
--
-- Por que tabela dedicada (e não billing_events): billing_events é trilha
-- append-only SEM UNIQUE por delivery — dedup ali seria SELECT-depois-INSERT
-- (janela de corrida). Aqui o dedup é o próprio UNIQUE + ON CONFLICT DO NOTHING:
-- uma ida ao banco, atômica. O spec C2 autoriza explicitamente "uma tabela de
-- dedup em migrations_cobranca".
--
-- ISOLAMENTO (hard fork §0): SÓ CREATE de tabela/índice NOVOS. ZERO ALTER/DROP
-- em tabela do core. A coluna `invoices.nfse_status` que o C2 atualiza JÁ EXISTE
-- (billing_model.sql:302) — nenhum ALTER é necessário. Estilo espelha
-- migrations_salao/ e billing_credentials.sql (public., IF NOT EXISTS,
-- gen_random_uuid(), RLS negada ao client, service_role only).
--
-- RLS: como billing_credentials (A4) — é infra server-side do webhook, o client
-- NUNCA lê/escreve. RLS ON, sem policy permissiva; só service_role (BYPASSRLS)
-- opera. `organization_id` mantém a chave de dedup escopada por tenant (o mesmo
-- delivery_id de orgs diferentes nunca colide).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notaas_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  delivery_id text NOT NULL,                         -- valor de X-Notaas-Delivery
  event_type text,                                   -- 'nfse.issued' | 'nfse.documents_ready' | ...
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,  -- fatura afetada, quando resolvida
  processed_at timestamptz NOT NULL DEFAULT now(),
  -- Chave de idempotência: um delivery por org. O INSERT ON CONFLICT DO NOTHING
  -- do receptor usa exatamente este UNIQUE para o dedup atômico.
  UNIQUE (organization_id, delivery_id)
);
CREATE INDEX IF NOT EXISTS idx_notaas_webhook_deliveries_org
  ON public.notaas_webhook_deliveries (organization_id);
CREATE INDEX IF NOT EXISTS idx_notaas_webhook_deliveries_invoice
  ON public.notaas_webhook_deliveries (invoice_id);

-- RLS: negada ao client (mesma disciplina de billing_credentials.sql). Habilitada,
-- SEM policy alguma para anon/authenticated. service_role opera por baixo (BYPASSRLS).
ALTER TABLE public.notaas_webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Defesa em profundidade: revoga o privilégio herdado do baseline (o schema public
-- concede a anon/authenticated via DEFAULT PRIVILEGES). É ledger de webhook — só
-- as Edge Functions server-side o tocam.
REVOKE ALL ON public.notaas_webhook_deliveries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notaas_webhook_deliveries TO service_role;
