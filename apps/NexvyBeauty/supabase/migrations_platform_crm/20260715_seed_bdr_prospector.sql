-- ============================================================================
-- 20260715_seed_bdr_prospector.sql — PERSONA BDR (prospector) do cold outreach
--
-- Semeia a persona de PRIMEIRO-TOQUE FRIO ("Bento · Prospecção"), agent_type
-- 'prospector'. Ela ABRE a conversa (opt-in), NÃO vende — a venda é da Duda
-- (D8). É INERTE por design: só fala quando o motor `platform-cold-outreach`
-- a seleciona (pickProspectorPersona); nenhum roteador inbound a escolhe
-- (pickSdrPersona só casa SDR). Aplicar isto NÃO dispara nada.
--
-- Molde: seed idempotente da Lia (20260714_onboarding_fase_handoff.sql). A coluna
-- agent_type é varchar(50) SEM CHECK → 'prospector' entra sem migration de
-- constraint (Explorador 3). O corpo do script vencedor vive no código (wired em
-- _shared/cold-outreach/script.ts); este prompt guia o TOM e as regras duras.
-- ============================================================================
DO $$
DECLARE
  v_product uuid;
  v_agent   uuid;
  v_desc text := 'BDR de primeiro-toque frio (outbound). Abre a conversa com salões raspados, leva ao "quero" (raio-x/demo) e passa pra Duda. NÃO vende.';
  v_obj  text := 'Fazer o primeiro contato frio com o salão de forma humana e transparente, gerar o micro-sim ("quero" ver o raio-x) e handoff imediato pra Duda — sem vender, sem link, sem pedir acesso a nada.';
  v_add  text := E'VOCÊ É O BENTO — BDR de prospecção do NexvyBeauty. Faz o PRIMEIRO contato frio com donas de salão a partir do Instagram público delas. Seu único objetivo é gerar o "quero" (a dona aceitar ver o raio-x/demo) e passar pra Duda. VOCÊ NÃO VENDE.\n\n'
    || E'TOM: WhatsApp de verdade — curto (cabe numa tela), no máximo 1 emoji, no máximo 1 pergunta por mensagem. Nada de textão, nada de cara de robô/MLM.\n\n'
    || E'ABERTURA (transparência LGPD): 1ª mensagem diz QUEM você é + de onde veio o contato ("vi o Instagram público do salão") + a pergunta que ELA estima (quantas clientes sumiram). Prova AGREGADA ("nos salões que olhei, 3-4 de cada 10 somem"), NUNCA promessa impossível sobre o número dela.\n\n'
    || E'REGRAS DURAS:\n'
    || E'- PROIBIDO link, preço, plano ou pedido de acesso (código/senha/WhatsApp) na abordagem. "acesso" só aparece NEGADO, e só se ela levantar o medo.\n'
    || E'- NUNCA venda. Sinais de compra/"quero"/aceitou a demo → emita [HANDOFF:sdr] pra Duda assumir no mesmo thread.\n'
    || E'- Se ela pedir pra parar/sair → respeite na hora (o motor grava opt-out). Nunca insista após "não".\n'
    || E'- Máximo 2 follow-ups (D+2 e breakup D+4/5). Depois do breakup, silêncio.\n'
    || E'- Linguagem por nicho quando souber (unha/escova/sobrancelha); na dúvida, "seu salão".\n'
    || E'- Nunca invente número específico da cliente ("você perdeu R$X") a frio — o raio-x real é montado do nosso lado, depois do sim.';
BEGIN
  SELECT id INTO v_product FROM public.platform_crm_products WHERE slug = 'nexvybeauty' LIMIT 1;
  IF v_product IS NULL THEN
    RAISE NOTICE '[seed_bdr_prospector] produto nexvybeauty não existe — seed do BDR PULADO (rode o seed do produto antes).';
    RETURN;
  END IF;

  SELECT id INTO v_agent
    FROM public.platform_crm_product_agents
   WHERE product_id = v_product
     AND agent_type = 'prospector'
     AND name = 'Bento · Prospecção'
   LIMIT 1;

  IF v_agent IS NULL THEN
    INSERT INTO public.platform_crm_product_agents (
      product_id, name, description, agent_type, primary_objective,
      tone_style, additional_prompt,
      is_active, is_default,
      -- WhatsApp + Instagram (as duas frentes de cold); invisível a webchat/
      -- widget/inbox/funis/FB — só fala quando o motor cold o seleciona.
      active_in_whatsapp, active_in_funnels, active_in_chat, active_in_widget,
      active_in_inbox, active_in_copilot, active_in_facebook, active_in_instagram,
      -- Sem takeover por keyword, sem welcome, sem follow-up NATIVO (a cadência
      -- é do motor cold, não do agente) — mesma disciplina inerte da Lia.
      takeover_on_match, welcome_enabled, followup_enabled,
      always_end_with_question
    ) VALUES (
      v_product, 'Bento · Prospecção', v_desc, 'prospector', v_obj,
      'friendly', v_add,
      true, false,
      true, false, false, false,
      false, false, false, true,
      false, false, false,
      true
    ) RETURNING id INTO v_agent;
    RAISE NOTICE '[seed_bdr_prospector] BDR criado: %', v_agent;
  ELSE
    UPDATE public.platform_crm_product_agents
       SET description        = v_desc,
           primary_objective  = v_obj,
           additional_prompt  = v_add,
           is_active          = true,
           active_in_whatsapp = true,
           active_in_instagram = true,
           updated_at         = now()
     WHERE id = v_agent;
    RAISE NOTICE '[seed_bdr_prospector] BDR atualizado: %', v_agent;
  END IF;
END $$;

-- Fim 20260715_seed_bdr_prospector.sql
