-- ─────────────────────────────────────────────────────────────────────────────
-- 20260714_onboarding_fase_handoff.sql — HANDOFF Duda→CS no MESMO thread +
-- rastreio de fase do wizard de implantação.
-- Data: 2026-07-14 · AGUARDA APLICAÇÃO PELO DONO (revisão + apply via MCP,
-- projeto fzhlbwhdejumkyqosuvq). NÃO aplicada por este agente.
--
-- 4 blocos, todos idempotentes (reaplicar não muda o resultado):
--   1) onboarding_submissions.current_step / current_step_id — a FASE do wizard
--      (1-9), persistida pelo frontend a cada troca de página.
--   2) platform_crm_conversations.provisioned_organization_id — o VÍNCULO
--      conversa-de-venda ↔ org provisionada, gravado no handoff pós-compra.
--      DECISÃO (coluna dedicada, NÃO metadata jsonb): a conversa TEM metadata
--      (20260710), mas ela é mesclada client-side pelo PlatformCrmTransferModal
--      (read-merge-write do objeto inteiro → risco de lost-update engolir o
--      vínculo). Coluna nullable dedicada = escrita atômica, FK íntegra com
--      organizations (SET NULL no delete da org), indexável, e ZERO impacto:
--      sem default, sem trigger, sem mudança de RLS.
--   3) RPCs set_onboarding_step (autenticado) + set_onboarding_step_public
--      (token+session) — telemetria de fase, baratas (1 UPDATE), SECURITY
--      DEFINER, espelhando os modos de auth das RPCs existentes (20260713).
--   4) Seed idempotente do agente de CS/implantação "Lia · Implantação"
--      (agent_type='support') no produto nexvybeauty.
--      ⚠️ POR QUE NÃO "Duda · Implantação": platform-sales-brain roteia o SDR
--      por isSdrAgent() = name/agent_type ILIKE sdr|qualifica|DUDA. Um agente
--      com "duda" no nome entraria na disputa de SDR e poderia ABRIR conversas
--      de VENDA ao vivo no lugar da Duda real (ordem do SELECT é indefinida).
--      "Lia · Implantação" + agent_type='support' não casa com nenhum matcher
--      (sdr/qualifica/duda/closer/bia) — invisível pro funil de venda; só fala
--      quando o handoff pós-compra fixa current_agent_id nela.
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================================================
-- 1) Fase do wizard em onboarding_submissions
-- ============================================================
ALTER TABLE public.onboarding_submissions
  ADD COLUMN IF NOT EXISTS current_step integer,
  ADD COLUMN IF NOT EXISTS current_step_id text;

COMMENT ON COLUMN public.onboarding_submissions.current_step IS
  'Página atual do wizard de implantação (1-based; wizard novo tem 9 páginas). Telemetria: gravada pelo frontend via set_onboarding_step(_public) a cada troca de página. Consumida pelo platform-sales-brain (modo implantação) para a Lia saber onde a cliente está.';
COMMENT ON COLUMN public.onboarding_submissions.current_step_id IS
  'Id textual da página atual (ex.: "espaco", "horarios", "whatsapp_qr"). Redundante com current_step de propósito — sobrevive a reordenação de páginas do wizard.';

-- ============================================================
-- 2) Vínculo conversa de venda ↔ org provisionada
-- ============================================================
ALTER TABLE public.platform_crm_conversations
  ADD COLUMN IF NOT EXISTS provisioned_organization_id uuid NULL
    REFERENCES public.organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.platform_crm_conversations.provisioned_organization_id IS
  'Org provisionada pós-compra Cakto vinculada a esta conversa de venda (handoff Duda→CS no mesmo thread). Gravado por _shared/onboarding-handoff.ts (gated por ONBOARDING_HANDOFF_ENABLED). NULL = conversa de venda normal — o platform-sales-brain só entra em modo implantação quando NÃO-NULL.';

CREATE INDEX IF NOT EXISTS idx_platform_crm_conversations_provisioned_org
  ON public.platform_crm_conversations(provisioned_organization_id)
  WHERE provisioned_organization_id IS NOT NULL;

-- ============================================================
-- 3) RPCs de fase (SECURITY DEFINER, mesmos modos de auth do 20260713)
-- ============================================================

-- ------------------------------------------------------------
-- set_onboarding_step (autenticado) — espelha o gate de save_onboarding_draft:
-- mesmo org do profile + role admin/super_admin. DIVERGÊNCIA DELIBERADA:
-- aceita status draft/submitted/applied — as páginas 8 (QR) e 9 (montando)
-- vivem PÓS-submit; telemetria de fase não pode morrer na página 7. Não toca
-- payload, então o lock de conteúdo não se aplica.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_onboarding_step(
  _submission_id uuid,
  _step integer,
  _step_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.onboarding_submissions%ROWTYPE;
  _user_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF _step IS NULL OR _step < 1 OR _step > 50 THEN RAISE EXCEPTION 'invalid_step'; END IF;

  SELECT * INTO _row FROM public.onboarding_submissions WHERE id = _submission_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  SELECT p.organization_id INTO _user_org FROM public.profiles p WHERE p.id = auth.uid();
  IF _user_org IS NULL OR _user_org <> _row.organization_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _row.status NOT IN ('draft','submitted','applied') THEN
    RAISE EXCEPTION 'locked';
  END IF;

  UPDATE public.onboarding_submissions
     SET current_step    = _step,
         current_step_id = left(_step_id, 60)
   WHERE id = _submission_id;
END $$;

GRANT EXECUTE ON FUNCTION public.set_onboarding_step(uuid, integer, text) TO authenticated;

-- ------------------------------------------------------------
-- set_onboarding_step_public (token + session_token) — espelha as travas de
-- save_onboarding_draft_public (token hash + revoked + expires + session),
-- com a MESMA divergência deliberada de status (draft/submitted/applied) e
-- SEM o gate de org onboarding_locked: fase é telemetria, não conteúdo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_onboarding_step_public(
  _token text,
  _session_token text,
  _step integer,
  _step_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  _hash text;
  _row public.onboarding_submissions%ROWTYPE;
BEGIN
  IF _token IS NULL OR _session_token IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF _step IS NULL OR _step < 1 OR _step > 50 THEN RAISE EXCEPTION 'invalid_step'; END IF;

  _hash := encode(extensions.digest(_token, 'sha256'), 'hex');
  SELECT * INTO _row FROM public.onboarding_submissions WHERE token_hash = _hash;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF _row.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'link_revoked'; END IF;
  IF _row.expires_at IS NOT NULL AND _row.expires_at < now() THEN RAISE EXCEPTION 'expired_token'; END IF;
  IF _row.session_token IS NULL OR _row.session_token <> _session_token THEN
    RAISE EXCEPTION 'link_already_in_use';
  END IF;
  IF _row.status NOT IN ('draft','submitted','applied') THEN
    RAISE EXCEPTION 'locked';
  END IF;

  UPDATE public.onboarding_submissions
     SET current_step    = _step,
         current_step_id = left(_step_id, 60)
   WHERE id = _row.id;
END $$;

GRANT EXECUTE ON FUNCTION public.set_onboarding_step_public(text, text, integer, text) TO anon, authenticated;

-- ============================================================
-- 4) Seed idempotente do agente CS "Lia · Implantação" (support)
--    (nome SEM 'duda'/'bia'/'sdr'/'closer'/'qualifica' — ver header)
-- ============================================================
DO $$
DECLARE
  v_product uuid;
  v_agent   uuid;
  v_desc text := 'CS de implantação (pós-compra): assume o MESMO thread de WhatsApp da venda e guia a cliente pelo wizard de 9 páginas, sabendo em que página ela está. Nunca vende, nunca cita preço/plano.';
  v_obj  text := 'Guiar a cliente recém-chegada pela implantação do espaço dela (wizard de 9 páginas), sabendo em que página ela está (bloco FASE DA IMPLANTAÇÃO do contexto), respondendo dúvidas e destravando um passo por mensagem até o espaço ficar no ar.';
  v_add  text := E'VOCÊ É A LIA — CS de implantação do NexvyBeauty. A cliente acabou de COMPRAR conversando com a Duda neste MESMO WhatsApp; agora é você quem cuida dela.\n\n'
    || E'TOM: caloroso, paciente e comemorativo — WhatsApp de verdade (até 300 caracteres, no máximo 1 pergunta por mensagem, máx 1 emoji). Trate cada avanço como conquista dela.\n\n'
    || E'CONTINUIDADE: NUNCA se apresente do zero como estranha — você é do time que ela já conhece. Primeira fala: dê boas-vindas pela compra e se apresente como quem vai acompanhar a implantação.\n\n'
    || E'REGRAS DURAS:\n'
    || E'- A venda ACABOU. PROIBIDO ofertar plano, preço, upgrade, link de pagamento ou condição de fundadora. Se ela perguntar de cobrança/reembolso, use [ESCALAR_HUMANO].\n'
    || E'- Linguagem NEUTRA sempre: "seu espaço" — NUNCA "salão" (ela pode ser lash, nails, sobrancelha, podologia, estética...).\n'
    || E'- Use o bloco FASE DA IMPLANTAÇÃO pra saber em que página ela está; se não souber, pergunte com leveza em que tela ela parou.\n'
    || E'- UM passo por mensagem. Nada de despejar o wizard inteiro.\n'
    || E'- Problema técnico que você não resolve (erro na tela, QR que não conecta após 2 tentativas) ou pedido de humano → [ESCALAR_HUMANO].\n'
    || E'- Nunca invente funcionalidade nem prometa prazo que não está no conhecimento do produto.';
BEGIN
  SELECT id INTO v_product FROM public.platform_crm_products WHERE slug = 'nexvybeauty' LIMIT 1;
  IF v_product IS NULL THEN
    RAISE NOTICE '[onboarding_fase_handoff] produto nexvybeauty não existe — seed do agente CS PULADO (rode o seed do produto antes).';
    RETURN;
  END IF;

  SELECT id INTO v_agent
    FROM public.platform_crm_product_agents
   WHERE product_id = v_product
     AND agent_type = 'support'
     AND name = 'Lia · Implantação'
   LIMIT 1;

  IF v_agent IS NULL THEN
    INSERT INTO public.platform_crm_product_agents (
      product_id, name, description, agent_type, primary_objective,
      tone_style, additional_prompt,
      is_active, is_default,
      -- Só WhatsApp: invisível a webchat/widget/inbox/funis/FB/IG — este agente
      -- SÓ fala quando o handoff pós-compra fixa current_agent_id nele.
      active_in_whatsapp, active_in_funnels, active_in_chat, active_in_widget,
      active_in_inbox, active_in_copilot, active_in_facebook, active_in_instagram,
      -- Sem ativação por keyword/takeover, sem welcome, sem follow-up automático.
      takeover_on_match, welcome_enabled, followup_enabled,
      always_end_with_question
    ) VALUES (
      v_product, 'Lia · Implantação', v_desc, 'support', v_obj,
      'friendly', v_add,
      true, false,
      true, false, false, false,
      false, false, false, false,
      false, false, false,
      false
    ) RETURNING id INTO v_agent;
    RAISE NOTICE '[onboarding_fase_handoff] agente CS criado: %', v_agent;
  ELSE
    UPDATE public.platform_crm_product_agents
       SET description        = v_desc,
           primary_objective  = v_obj,
           additional_prompt  = v_add,
           is_active          = true,
           active_in_whatsapp = true,
           updated_at         = now()
     WHERE id = v_agent;
    RAISE NOTICE '[onboarding_fase_handoff] agente CS atualizado: %', v_agent;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIM. Ativação em produção exige, NESTA ORDEM:
--   1. aplicar esta migration (colunas + RPCs + seed);
--   2. deploy de cakto-webhook (+ _shared) e platform-sales-brain;
--   3. setar ONBOARDING_HANDOFF_ENABLED=true nos secrets das edge functions.
-- Sem o passo 3 NADA muda em produção (gate duplo no código).
-- ─────────────────────────────────────────────────────────────────────────────
