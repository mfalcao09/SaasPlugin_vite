-- ============================================================================
-- OUTBOX de emissão idempotente (NexvyPayments) — blueprint §3.2 B2.
--
-- Fila pgmq `billing_outbox` + wrappers RPC. É o transactional outbox que
-- desacopla a DECISÃO de emitir (gravar a intenção na fila, dentro da mesma
-- transação que muda o estado da fatura) do EFEITO externo (POST a NotaAS/C6).
--
-- IDEMPOTÊNCIA (o coração do B2): a mensagem carrega a `referencia` ÚNICA da
-- fatura e é gravada ANTES de qualquer POST externo. NotaAS/C6 NÃO deduplicam
-- por conta própria — se o worker crashar após o POST mas antes do delete, o VT
-- expira e a msg é relida; o worker consumidor usa a `referencia` como chave de
-- deduplicação (checa billing_events / status da invoice antes de re-POSTar).
-- Assim, "gravou na fila -> exactly-once na emissão" mesmo com retries.
--
-- MOLDE: espelha byte-a-byte os wrappers pgmq do Beauty (mesmo corpo, mesmo
-- SECURITY DEFINER + SET search_path TO 'public','pgmq', mesmo tratamento de
-- undefined_table com auto-create):
--   - enqueue_email      -> beauty-schema-combined.sql:828-838  (molde de enqueue)
--   - read_email_batch   -> beauty-schema-combined.sql:2006-2016 (molde de read_batch)
--   - move_to_dlq        -> beauty-schema-combined.sql:1784-1807 (molde de DLQ)
--   - delete_email       -> beauty-schema-combined.sql:555-564  (referência de delete)
-- process-email-queue/index.ts:195-199,123-128 consome esses RPCs no runtime do Beauty.
--
-- SEGURANÇA (endurecimento vs. molde — blueprint §3.1 / CLAUDE.md §11): a fila de
-- emissão fiscal NÃO é enfileirável pelo client. Diferente do dump do Beauty (que
-- deixa EXECUTE em PUBLIC), aqui REVOGAMOS de anon/authenticated e concedemos
-- EXECUTE só a service_role — mesmo espírito do REVOKE/GRANT de billing_credentials
-- (20260706100000_billing_credentials.sql:50-51). Só as Edge Functions server-side
-- (service_role) enfileiram/leem/DLQ.
--
-- ADITIVA: cria fila/funções NOVAS. Zero ALTER/DROP em objeto do core.
-- ============================================================================

-- pgmq já existe (schema pgmq provisionado na fundação). Criar as filas é
-- idempotente — pgmq.create é no-op se a fila já existe. Envolvido em DO para
-- não falhar caso a extensão exponha assinaturas ligeiramente diferentes.
DO $$
BEGIN
  PERFORM pgmq.create('billing_outbox');
  PERFORM pgmq.create('billing_outbox_dlq');
END;
$$;

-- ----------------------------------------------------------------------------
-- billing_outbox_enqueue(payload jsonb) -> bigint (msg_id)
-- Molde: public.enqueue_email (beauty-schema-combined.sql:828-838).
-- O payload DEVE carregar a `referencia` única da fatura. Gravado ANTES de
-- qualquer POST externo — é a âncora de idempotência do consumidor.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_outbox_enqueue(payload jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pgmq'
    AS $$
BEGIN
  RETURN pgmq.send('billing_outbox', payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create('billing_outbox');
  RETURN pgmq.send('billing_outbox', payload);
END;
$$;

-- ----------------------------------------------------------------------------
-- billing_outbox_read_batch(qty int, vt int)
--   -> TABLE(msg_id bigint, read_ct int, enqueued_at timestamptz, message jsonb)
-- Molde: public.read_email_batch (beauty-schema-combined.sql:2006-2016).
-- Expõe enqueued_at (para TTL/observabilidade, como process-email-queue usa
-- msg.enqueued_at). vt = visibility timeout: a msg fica invisível `vt`s; se o
-- worker não deletar (crash pós-POST), o VT expira e ela é relida -> retry.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_outbox_read_batch(qty integer, vt integer)
    RETURNS TABLE(msg_id bigint, read_ct integer, enqueued_at timestamptz, message jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pgmq'
    AS $$
BEGIN
  RETURN QUERY
    SELECT r.msg_id, r.read_ct, r.enqueued_at, r.message
    FROM pgmq.read('billing_outbox', vt, qty) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create('billing_outbox');
  RETURN;
END;
$$;

-- ----------------------------------------------------------------------------
-- billing_outbox_move_to_dlq(msg_id bigint, reason text) -> bigint (dlq msg_id)
-- Molde: public.move_to_dlq (beauty-schema-combined.sql:1784-1807) — mesmo
-- send(dlq)+delete(source). Difere na ASSINATURA pedida pelo B2: recebe só
-- (msg_id, reason), sem o payload. Por isso lê o payload direto da tabela
-- interna da fila pgmq.q_billing_outbox POR msg_id — e não via pgmq.read.
-- MOTIVO (correção de bug de VT): no fluxo real o worker já leu a msg com
-- read_batch, então ela está sob VT ativo (invisível). Um novo pgmq.read NÃO a
-- retornaria; ler a q_-table por id enxerga a msg independentemente do VT e
-- preserva a `referencia` original. pgmq.delete por msg_id remove mesmo sob VT.
-- Anexa motivo em _dlq.reason/_dlq.moved_at. Auto-cria a DLQ no EXCEPTION.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_outbox_move_to_dlq(msg_id bigint, reason text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pgmq'
    AS $$
DECLARE
  new_id bigint;
  src_payload jsonb;
  dlq_payload jsonb;
BEGIN
  -- Lê o payload original (com a referencia) direto da tabela interna da fila,
  -- por msg_id, ignorando o VT. pgmq materializa cada fila em pgmq.q_<nome>.
  SELECT q.message INTO src_payload
  FROM pgmq.q_billing_outbox q
  WHERE q.msg_id = billing_outbox_move_to_dlq.msg_id;

  IF src_payload IS NULL THEN
    -- msg já removida/consumida por outro worker; nada a mover (idempotente).
    RETURN NULL;
  END IF;

  dlq_payload := src_payload || jsonb_build_object(
    '_dlq', jsonb_build_object('reason', reason, 'moved_at', now())
  );

  SELECT pgmq.send('billing_outbox_dlq', dlq_payload) INTO new_id;
  PERFORM pgmq.delete('billing_outbox', billing_outbox_move_to_dlq.msg_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  -- DLQ ainda não existe: cria e reenvia (mesmo caminho de recuperação do molde).
  BEGIN
    PERFORM pgmq.create('billing_outbox_dlq');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  dlq_payload := COALESCE(src_payload, '{}'::jsonb) || jsonb_build_object(
    '_dlq', jsonb_build_object('reason', reason, 'moved_at', now())
  );
  SELECT pgmq.send('billing_outbox_dlq', dlq_payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete('billing_outbox', billing_outbox_move_to_dlq.msg_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- GRANTs — endurecimento vs. molde do Beauty. Só service_role opera a fila de
-- emissão fiscal. Revoga o EXECUTE herdado de PUBLIC (o CREATE FUNCTION concede
-- EXECUTE a PUBLIC por default) e concede explicitamente a service_role.
-- Espelha billing_credentials REVOKE/GRANT (20260706100000:50-51).
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.billing_outbox_enqueue(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_outbox_read_batch(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_outbox_move_to_dlq(bigint, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.billing_outbox_enqueue(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_outbox_read_batch(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_outbox_move_to_dlq(bigint, text) TO service_role;
