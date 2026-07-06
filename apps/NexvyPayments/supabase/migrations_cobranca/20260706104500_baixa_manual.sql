-- ============================================================================
-- BAIXA MANUAL de fatura (NexvyPayments) — Entregável E1 / spec §3.2.
-- Esteira NOVA e ISOLADA `migrations_cobranca/`. 100% ADITIVA: só CREATE de uma
-- função NOVA sobre tabelas já criadas (invoices/billing_events). ZERO ALTER/DROP
-- de coluna do core.
--
-- PROBLEMA (§3.2 E1 / conciliação): nem toda liquidação chega por webhook do C6.
-- O gestor concilia o extrato e dá baixa MANUAL: recebeu por transferência/
-- dinheiro/outro meio. A baixa precisa (a) mudar invoices.status -> 'paga' e
-- (b) deixar trilha em billing_events(tipo='paga', origem='manual').
--
-- POR QUE UMA RPC (e não só o client PostgREST): a baixa é DUAS gravações que
-- devem ser ATÔMICAS (o update de status + o evento-trilha). Via PostgREST o
-- service-role client não abre BEGIN/COMMIT; uma RPC plpgsql é uma unidade
-- transacional — se o INSERT do evento falhar, o UPDATE do status faz rollback
-- junto (nunca fatura paga sem trilha, nem trilha sem baixa). O caminho
-- PostgREST equivalente (fallback/testável) vive em _shared/billing-baixa.ts.
--
-- COMPATIBILIDADE COM O TRIGGER C3 (20260706103000_fiscal_imutabilidade.sql):
--   A baixa transiciona 'emitida'/'enviada'/'vencida' -> 'paga' mexendo SÓ em
--   campos de baixa (status, pago_em, valor_pago, updated_at). O guard C3 permite
--   essa mutação: nenhum campo fiscal muda (linhas 125-149 do guard) e 'paga'
--   está no conjunto de status permitidos por UPDATE comum (linha 154). NÃO é
--   preciso a GUC de cancelamento — a baixa é uma progressão fiscal legítima, não
--   um cancelamento. Se a fatura já for 'paga', a função é idempotente (no-op).
--
-- MOLDE (estilo verbatim): invoice_cancelar (fiscal_imutabilidade.sql:189-262) —
--   SECURITY DEFINER + set search_path = public + org-scope via
--   profiles.organization_id/auth.uid() + FOR UPDATE + trilha billing_events +
--   revoke public/anon / grant authenticated,service_role.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.invoice_baixa_manual(
  p_invoice_id uuid,
  p_valor_pago numeric DEFAULT NULL,
  p_meio       text    DEFAULT 'outro',
  p_observacao text    DEFAULT NULL,
  p_pago_em    timestamptz DEFAULT now()
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid;
  v_inv        public.invoices;
  v_valor      numeric(12,2);
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'invoice_id obrigatorio';
  END IF;

  -- org do chamador (auth). service_role/cron chama sem auth.uid() -> NULL,
  -- e nesse caso pulamos o gate de tenant (fluxo server-side confiável).
  SELECT organization_id INTO v_caller_org
  FROM public.profiles WHERE id = auth.uid();

  -- carrega e trava a fatura (FOR UPDATE) — precisa existir.
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fatura % nao encontrada', p_invoice_id;
  END IF;

  -- anti cross-tenant (IDOR): se há org de caller (chamada autenticada da UI), a
  -- fatura tem de ser da mesma org. service_role (v_caller_org NULL) passa.
  IF v_caller_org IS NOT NULL AND v_inv.organization_id <> v_caller_org THEN
    RAISE EXCEPTION 'fatura de outra organizacao';
  END IF;

  -- idempotência: já paga -> retorna como está, sem nova baixa nem evento.
  IF v_inv.status = 'paga' THEN
    RETURN v_inv;
  END IF;

  -- só faturas emitidas/enviadas/vencidas recebem baixa (as demais são pré-fiscais
  -- ou terminais). Espelha o conjunto BAIXAVEL_DE de _shared/billing-baixa.ts.
  IF v_inv.status NOT IN ('emitida','enviada','vencida') THEN
    RAISE EXCEPTION
      'fatura % em status % nao pode receber baixa manual (baixavel: emitida/enviada/vencida)',
      p_invoice_id, v_inv.status;
  END IF;

  v_valor := COALESCE(p_valor_pago, v_inv.valor_total);

  -- transição status -> 'paga'. SÓ campos de baixa (o guard C3 permite; nenhum
  -- dado fiscal é tocado). Atômico com o INSERT abaixo (mesma tx da função).
  UPDATE public.invoices
     SET status     = 'paga',
         valor_pago = v_valor,
         pago_em    = p_pago_em,
         updated_at = now()
   WHERE id = p_invoice_id
  RETURNING * INTO v_inv;

  -- trilha imutável (append-only): billing_events(tipo='paga', origem='manual').
  -- É o critério binário do E1. Se este INSERT falhar, o UPDATE acima faz rollback
  -- junto (atomicidade da função).
  INSERT INTO public.billing_events (organization_id, invoice_id, tipo, origem, payload)
  VALUES (
    v_inv.organization_id,
    v_inv.id,
    'paga',
    'manual',
    jsonb_build_object(
      'meio', COALESCE(p_meio, 'outro'),
      'valor_pago', v_valor,
      'pago_em', p_pago_em,
      'observacao', p_observacao,
      'baixado_por', auth.uid(),
      'baixa', 'manual'
    )
  );

  RETURN v_inv;
END;
$$;

-- Acesso: mesma disciplina do invoice_cancelar (revoke public/anon; grant
-- authenticated para a UI de gestão + service_role para as Edge Functions).
REVOKE ALL ON FUNCTION public.invoice_baixa_manual(uuid, numeric, text, text, timestamptz)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.invoice_baixa_manual(uuid, numeric, text, text, timestamptz)
  TO authenticated, service_role;
