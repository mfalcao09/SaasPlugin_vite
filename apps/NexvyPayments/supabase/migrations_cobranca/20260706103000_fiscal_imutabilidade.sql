-- ============================================================================
-- IMUTABILIDADE FISCAL (NexvyPayments) — Entregável C3 / spec §3.2
-- Esteira NOVA e ISOLADA `migrations_cobranca/`. 100% ADITIVA: só CREATE de
-- funções/triggers NOVOS sobre a tabela `public.invoices` (já criada em
-- 20260706101000_billing_model.sql). ZERO ALTER/DROP de coluna do core.
--
-- PROBLEMA (§3.2 C3): nota fiscal EMITIDA é IMUTÁVEL. Uma vez que a fatura
-- atingiu um estado fiscal (`emitida`/`enviada`/`paga`/`substituida`), ela não
-- pode ser DELETADA nem ter seus dados fiscais apagados por UPDATE. O
-- cancelamento é uma operação FORMAL — muda o status para `cancelada` E deixa
-- trilha em `billing_events(tipo='cancelada')` — NUNCA um DELETE.
--
-- MOLDE SEGUIDO (estilo verbatim):
--   - Função SECURITY DEFINER + `set search_path = public` + org-scope via
--     `profiles.organization_id`/auth.uid() + `revoke all ... from public,anon`
--     + `grant execute ... to authenticated`  → espelha
--     migrations_salao/20260624_merge_clientes_rpc.sql:8-54 (merge_clientes).
--   - RLS/policies e comentários densos → migrations_cobranca/20260706101000_billing_model.sql.
--
-- ESTRATÉGIA DO GUARD (por que um trigger e não só RLS):
--   RLS decide QUEM acessa a linha; NÃO consegue expressar "esta linha em estado
--   fiscal é imutável, exceto pela transição formal de cancelamento". Isso é uma
--   REGRA DE NEGÓCIO sobre a MUTAÇÃO — o lugar canônico é um trigger BEFORE.
--   O trigger vale inclusive para `service_role` (Edge Functions) e para o dono
--   admin/manager — a imutabilidade fiscal não tem exceção por papel. A ÚNICA
--   porta autorizada é `invoice_cancelar()`, que sinaliza a transição legítima
--   via uma flag de sessão (GUC `nexvy.fiscal_cancel`) que o trigger reconhece.
--
-- ESTADOS FISCAIS (imutáveis): emitida, enviada, paga, substituida.
-- ESTADOS EDITÁVEIS (pré-fiscais, seguem livres): rascunho, aprovada, emitindo.
--   'vencida' é sub-estado de cobrança (não terminal fiscal) e fica FORA do
--   conjunto imutável para permitir baixa/reprocessamento. Conjunto imutável =
--   estritamente {emitida, enviada, paga, substituida}.
-- ============================================================================


-- ============================================================================
-- 1. GUARD DE IMUTABILIDADE — trigger BEFORE DELETE OR UPDATE em invoices
-- ----------------------------------------------------------------------------
-- Bloqueia DELETE de qualquer fatura em estado fiscal (imutável).
-- Bloqueia UPDATE que apague/altere dados fiscais de uma fatura em estado fiscal,
-- EXCETO a transição formal de cancelamento (status -> 'cancelada') disparada
-- por invoice_cancelar(), identificada pela GUC de sessão nexvy.fiscal_cancel.
--
-- "Apagar dados fiscais" = mexer em qualquer campo que compõe a nota:
--   competencia, referencia, valor_original, valor_total, valor_multa,
--   valor_juros, multa_pct, juros_pct, vencimento, iss_retido, retencoes,
--   notaas_invoice_id, notaas_ch_nfse, notaas_numero, nfse_status,
--   xml_nfse_url, pdf_nfse_url, contract_id, payer_id, agreement_id.
-- Mutação permitida SEM cancelamento numa nota fiscal: só campos de ciclo de
-- cobrança/baixa que NÃO alteram a nota (pago_em, valor_pago, c6_*, metadata,
-- pdf_boleto_url, updated_at) e a própria progressão de status entre estados
-- fiscais compatíveis (ex.: emitida->enviada->paga) — a nota permanece íntegra.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_invoice_fiscal_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_cancel boolean;
BEGIN
  -- Estados fiscais imutáveis. Se a linha (OLD) não está em estado fiscal, o
  -- guard não se aplica — deixa a operação seguir livre (pré-fiscal é editável).
  IF COALESCE(OLD.status, '') NOT IN ('emitida','enviada','paga','substituida') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- ------------------------------------------------------------------ DELETE
  -- Nota fiscal NUNCA é deletada. Cancelamento é status->cancelada + trilha.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Fatura % em estado fiscal (%) e imutavel: DELETE proibido. Use invoice_cancelar() para cancelar (status->cancelada + trilha).',
      OLD.id, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- ------------------------------------------------------------------ UPDATE
  -- Cancelamento formal? invoice_cancelar() seta a GUC de sessão. O 'true' no
  -- current_setting suprime o erro se a GUC não existir (retorna NULL -> não é cancel).
  v_is_cancel := (current_setting('nexvy.fiscal_cancel', true) = OLD.id::text);

  IF v_is_cancel THEN
    -- Única transição autorizada pelo cancelamento: status -> 'cancelada'.
    -- Nenhum dado fiscal pode ser tocado NEM MESMO no cancelamento (a nota fica
    -- íntegra como registro histórico; só o status muda).
    IF NEW.status <> 'cancelada' THEN
      RAISE EXCEPTION
        'invoice_cancelar so pode transicionar a fatura % para status cancelada (recebido: %).',
        OLD.id, NEW.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.competencia       IS DISTINCT FROM OLD.competencia
    OR NEW.referencia        IS DISTINCT FROM OLD.referencia
    OR NEW.valor_original    IS DISTINCT FROM OLD.valor_original
    OR NEW.valor_total       IS DISTINCT FROM OLD.valor_total
    OR NEW.valor_multa       IS DISTINCT FROM OLD.valor_multa
    OR NEW.valor_juros       IS DISTINCT FROM OLD.valor_juros
    OR NEW.multa_pct         IS DISTINCT FROM OLD.multa_pct
    OR NEW.juros_pct         IS DISTINCT FROM OLD.juros_pct
    OR NEW.vencimento        IS DISTINCT FROM OLD.vencimento
    OR NEW.iss_retido        IS DISTINCT FROM OLD.iss_retido
    OR NEW.retencoes         IS DISTINCT FROM OLD.retencoes
    OR NEW.contract_id       IS DISTINCT FROM OLD.contract_id
    OR NEW.payer_id          IS DISTINCT FROM OLD.payer_id
    OR NEW.agreement_id      IS DISTINCT FROM OLD.agreement_id
    OR NEW.notaas_invoice_id IS DISTINCT FROM OLD.notaas_invoice_id
    OR NEW.notaas_ch_nfse    IS DISTINCT FROM OLD.notaas_ch_nfse
    OR NEW.notaas_numero     IS DISTINCT FROM OLD.notaas_numero
    OR NEW.nfse_status       IS DISTINCT FROM OLD.nfse_status
    OR NEW.xml_nfse_url      IS DISTINCT FROM OLD.xml_nfse_url
    OR NEW.pdf_nfse_url      IS DISTINCT FROM OLD.pdf_nfse_url THEN
      RAISE EXCEPTION
        'Cancelamento da fatura % nao pode alterar dado fiscal — apenas status->cancelada.',
        OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE comum numa nota fiscal: nenhum dado fiscal pode mudar. Campos de
  -- baixa/cobrança (pago_em, valor_pago, c6_*, pdf_boleto_url, metadata,
  -- updated_at) e a progressão de status entre estados fiscais são permitidos.
  IF NEW.competencia       IS DISTINCT FROM OLD.competencia
  OR NEW.referencia        IS DISTINCT FROM OLD.referencia
  OR NEW.valor_original    IS DISTINCT FROM OLD.valor_original
  OR NEW.valor_total       IS DISTINCT FROM OLD.valor_total
  OR NEW.valor_multa       IS DISTINCT FROM OLD.valor_multa
  OR NEW.valor_juros       IS DISTINCT FROM OLD.valor_juros
  OR NEW.multa_pct         IS DISTINCT FROM OLD.multa_pct
  OR NEW.juros_pct         IS DISTINCT FROM OLD.juros_pct
  OR NEW.vencimento        IS DISTINCT FROM OLD.vencimento
  OR NEW.iss_retido        IS DISTINCT FROM OLD.iss_retido
  OR NEW.retencoes         IS DISTINCT FROM OLD.retencoes
  OR NEW.contract_id       IS DISTINCT FROM OLD.contract_id
  OR NEW.payer_id          IS DISTINCT FROM OLD.payer_id
  OR NEW.agreement_id      IS DISTINCT FROM OLD.agreement_id
  OR NEW.notaas_invoice_id IS DISTINCT FROM OLD.notaas_invoice_id
  OR NEW.notaas_ch_nfse    IS DISTINCT FROM OLD.notaas_ch_nfse
  OR NEW.notaas_numero     IS DISTINCT FROM OLD.notaas_numero
  OR NEW.nfse_status       IS DISTINCT FROM OLD.nfse_status
  OR NEW.xml_nfse_url      IS DISTINCT FROM OLD.xml_nfse_url
  OR NEW.pdf_nfse_url      IS DISTINCT FROM OLD.pdf_nfse_url THEN
    RAISE EXCEPTION
      'Fatura % em estado fiscal (%) e imutavel: dado fiscal nao pode ser alterado. Cancele via invoice_cancelar().',
      OLD.id, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Bloqueia sair de um estado fiscal para um estado NÃO-fiscal por UPDATE comum
  -- (ex.: emitida->rascunho "desemitiria" a nota). A única saída legítima é
  -- 'cancelada' via invoice_cancelar (tratada acima) ou progressão fiscal/vencida.
  IF NEW.status NOT IN ('emitida','enviada','paga','substituida','vencida') THEN
    RAISE EXCEPTION
      'Fatura % em estado fiscal (%) nao pode regredir para status % por UPDATE. Use invoice_cancelar() para cancelar.',
      OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger row-level BEFORE: intercepta antes de gravar, para todos os papéis
-- (inclusive service_role).
DROP TRIGGER IF EXISTS trg_invoices_fiscal_immutability ON public.invoices;
CREATE TRIGGER trg_invoices_fiscal_immutability
  BEFORE DELETE OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_invoice_fiscal_immutability();


-- ============================================================================
-- 2. invoice_cancelar(invoice_id, motivo) — cancelamento FORMAL
-- ----------------------------------------------------------------------------
-- Operação canônica de cancelamento (spec §3.2 C3): NUNCA deleta. Muda o status
-- da fatura para 'cancelada' e grava a trilha em billing_events(tipo='cancelada')
-- com o motivo no payload. Transacional (a função é uma unidade atômica).
--
-- Segurança (molde merge_clientes:26-37): SECURITY DEFINER + org-scope. O caller
-- só cancela fatura da PRÓPRIA org (anti cross-tenant / IDOR). service_role (org
-- do caller = NULL) é permitido para os fluxos server-side das Edge Functions.
--
-- Autorização do trigger: seta a GUC de sessão `nexvy.fiscal_cancel` = id da
-- fatura (LOCAL = escopo da transação) ANTES do UPDATE, para o guard reconhecer
-- a transição legítima; o UPDATE muda SÓ o status. A GUC LOCAL some no fim da tx.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.invoice_cancelar(p_invoice_id uuid, p_motivo text)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid;
  v_inv        public.invoices;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'invoice_id obrigatorio';
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo do cancelamento obrigatorio';
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

  -- anti cross-tenant: se há org de caller (chamada autenticada da UI), a fatura
  -- tem de ser da mesma org. service_role (v_caller_org NULL) passa.
  IF v_caller_org IS NOT NULL AND v_inv.organization_id <> v_caller_org THEN
    RAISE EXCEPTION 'fatura de outra organizacao';
  END IF;

  -- idempotência: já cancelada -> retorna como está, sem novo evento.
  IF v_inv.status = 'cancelada' THEN
    RETURN v_inv;
  END IF;

  -- autoriza a transição no guard (GUC LOCAL: escopo desta transação apenas).
  PERFORM set_config('nexvy.fiscal_cancel', p_invoice_id::text, true);

  UPDATE public.invoices
     SET status = 'cancelada',
         updated_at = now()
   WHERE id = p_invoice_id
  RETURNING * INTO v_inv;

  -- limpa a autorização imediatamente após o UPDATE guardado.
  PERFORM set_config('nexvy.fiscal_cancel', '', true);

  -- trilha imutável (append-only): billing_events(tipo='cancelada').
  INSERT INTO public.billing_events (organization_id, invoice_id, tipo, origem, payload)
  VALUES (
    v_inv.organization_id,
    v_inv.id,
    'cancelada',
    'invoice_cancelar',
    jsonb_build_object(
      'motivo', p_motivo,
      'cancelado_por', auth.uid(),
      'cancelado_em', now()
    )
  );

  RETURN v_inv;
END;
$$;

-- Acesso: mesma disciplina do merge_clientes (revoke public/anon; grant
-- authenticated). service_role executa via BYPASS de grants padrão do Supabase.
REVOKE ALL ON FUNCTION public.invoice_cancelar(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.invoice_cancelar(uuid, text) TO authenticated, service_role;
