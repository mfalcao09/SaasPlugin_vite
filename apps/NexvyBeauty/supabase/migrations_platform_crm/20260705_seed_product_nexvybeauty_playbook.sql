-- ─────────────────────────────────────────────────────────────────────────────
-- 20260705_seed_product_nexvybeauty_playbook.sql — carga canônica do playbook
--
-- platform_crm_products estava VAZIA (D3 criou a estrutura, ninguém cadastrou
-- produto). Consequência: o copiloto de vendas respondia genérico ("piloto =
-- teste gratuito") porque platform-sales-copilot só tinha conhecimento
-- hardcoded. Esta carga cria o produto NexvyBeauty com o playbook REAL
-- (fonte: tasks/KIT-COMERCIAL-PILOTO.md + oferta v3 Piloto Fundadora 30/30/1).
-- Idempotente via DO block por slug (não depende de unique constraint).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_id uuid;
  v_pricing jsonb := '{"planos":[{"nome":"Trial","preco_mensal":0,"nota":"teste do PRODUTO, sem condicoes de fundadora"},{"nome":"Essencial","preco_mensal":217,"publico":"profissional solo"},{"nome":"Premium","preco_mensal":387,"publico":"salao/equipe"},{"nome":"Ultra","preco_mensal":687,"publico":"operacao maior"}],"fonte_precos":"platform_plans via LP nexvybeauty.com.br — NUNCA inventar preco"}'::jsonb;
  v_pitch15 text := 'Quem vive de hora marcada perde dinheiro todo mês com cliente que some — e nem vê. O NexvyBeauty mostra quem sumiu, quanto vale, e traz de volta pelo seu WhatsApp com 1 clique.';
  v_pitch30 text := 'Quem vive de hora marcada perde dinheiro todo mês com cliente que some — e nem vê. O NexvyBeauty é uma IA que varre sua carteira, mostra quem sumiu e quanto vale, escreve a mensagem e dispara pelo SEU WhatsApp com 1 clique. Piloto de 30 dias: se não recuperar mais que a mensalidade, devolvemos o dinheiro.';
  v_pitch2m text := E'1. MECANISMO: Radar semanal na carteira + 4 automações (aniversário, lembrete 24h, pacote vencendo, cliente sumida) rodando sozinhas.\n2. ESFORÇO ZERO: setup concierge de 30 min, no WhatsApp atual, sem trocar número — ela só aprova mensagens.\n3. A CONTA QUE FECHA (por sub-vertical): Lash (ticket ~R$150-250): UMA cliente de volta paga o mês. Nails (~R$50-90): 3 clientes de volta pagam o mês. Sobrancelha (~R$80-150): 2 retornos pagam o mês. Salão/equipe: 2-3 clientes reativadas pagam o mês.\n4. RISCO NOSSO, NÃO DELA: painel "Recuperado (30 dias)" dentro do sistema é o juiz — não recuperou mais que a mensalidade, devolvemos 100%.\n5. ESCASSEZ REAL (30/30/1): 30 vagas de fundadora em 30 dias, no máximo 1 negócio novo por dia (limite real do acompanhamento 1-a-1). Vaga do dia não vendida NÃO acumula.';
  v_icp text := 'Profissionais da beleza: lash designer, nail designer/manicure, designer de sobrancelha, podóloga, esteticista, dona de salão. QUALIFICAÇÃO: ≥8 meses de atendimento E ≥80 clientes históricas no WhatsApp/caderno. Sem carteira parada = sem matéria-prima = não é lead do piloto.';
  v_obj text := E'"Vai funcionar mesmo?" → Demo na carteira DELA + garantia com painel-juiz: se em 30 dias o sistema não recuperar mais que a mensalidade, devolvemos 100%.\n"Vale o investimento?" → A conta da sub-vertical: lash = 1 cliente de volta paga o mês; nails = 3; sobrancelha = 2; salão = 2-3.\n"Vai me dar trabalho?" → Setup concierge de 30 min; ela só aprova mensagens. Nada de planilha, nada de app novo pra clientela.\n"Resolve meu problema?" → O problema é cadeira vazia; a primeira tela mostra o R$ recuperável da carteira dela.\n"Já uso WhatsApp Business + agenda" → Não substituímos: turbinamos o que ela já usa. Mesmo número, mesmo WhatsApp.\n"Tá caro / pede desconto" → NUNCA dar desconto. Reancorar na garantia: o risco é nosso — se não recuperar mais que a mensalidade, devolvemos.';
  v_benefits text := E'Radar de clientes sumidas com valor em R$ · 4 automações prontas (aniversário, lembrete 24h, pacote vencendo, reativação) · dispara pelo WhatsApp DELA (sem trocar número) · painel "Recuperado (30 dias)" que prova o retorno · agenda + booking público /s/<slug> · setup concierge';
  v_guar text := E'GARANTIA PILOTO FUNDADORA: 30 dias corridos a partir do SETUP individual. Se o painel "Recuperado (30 dias)" não mostrar valor recuperado MAIOR que a mensalidade paga, devolução de 100%. O painel dentro do sistema é o juiz — sem letra miúda.';
  v_disc text := E'PROIBIDO DAR DESCONTO — regra inviolável. Se pedirem desconto, reancorar na garantia (o risco já é nosso). Preço travado de fundadora já é a condição especial. Nunca prometer feature futura para fechar venda.';
  v_plans text := E'Trial (R$0, teste do produto — SEM condições de fundadora) · Essencial R$217/mês (solo) · Premium R$387/mês (salão/equipe) · Ultra R$687/mês. Preços oficiais SEMPRE do banco/LP (nexvybeauty.com.br) — nunca inventar ou arredondar.';
  v_kb text := E'═══ OFERTA VIGENTE: PILOTO FUNDADORA "CLIENTE DE VOLTA" (30/30/1) ═══\n\nVOCABULÁRIO OBRIGATÓRIO: "piloto" = Piloto Fundadora — programa PAGO com acompanhamento 1-a-1 e garantia de devolução. NUNCA descrever como "teste gratuito", "trial" ou "demonstração". O Trial gratuito existe como plano separado, SEM as condições de fundadora.\n\nA OFERTA: 30 vagas de FUNDADORA em 30 dias, máximo 1 onboarding por dia (capacidade real de acompanhamento concierge). A vaga do dia que não for preenchida NÃO acumula. Depois das 30 vagas (ou do dia 30), o produto continua aberto — mas SEM as condições de fundadora.\n\nCONDIÇÕES DE FUNDADORA (só nas 30 vagas): preço travado para sempre + garantia individual de 30 dias (painel-juiz) + linha direta com o fundador.\n\nESCASSEZ: 100% verdadeira por construção. Frase de campo: "hoje ainda tenho A vaga do dia — quer que eu segure pra você?". NUNCA inventar urgência falsa; a vaga diária é real.\n\nFLUXO DE FECHAMENTO (ordem fixa): 1º garantia ("o risco é meu") → 2º preço → 3º vaga do dia. Qualificar antes de ofertar: ≥8 meses de atendimento e ≥80 clientes históricas.\n\nREGRAS INVIOLÁVEIS: (1) PROIBIDO desconto — reancorar na garantia; (2) proibido prometer feature futura; (3) escassez só a real; (4) preços sempre os oficiais do banco/LP; (5) tom: profissional-próximo, direto, sem pressão artificial — a oferta é forte o suficiente.\n\nPROVA/DEMO: oferecer demo de 20 min na carteira DELA (conectar WhatsApp em 2 min → importar top-30 clientes → rodar o scan → o R$ DELA na tela).';
BEGIN
  SELECT id INTO v_id FROM public.platform_crm_products WHERE slug = 'nexvybeauty' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.platform_crm_products (
      name, slug, status, category, description, short_description,
      pricing, pitch_15s, pitch_30s, pitch_2min, icp, objections,
      benefits, differentials, guarantee, discount_policy, plans, knowledge_base
    ) VALUES (
      'NexvyBeauty', 'nexvybeauty', 'active', 'SaaS',
      'Sistema de gestão + IA para profissionais da beleza (salão, lash, nails, sobrancelha, podologia, estética). IA que varre a carteira no WhatsApp, mostra quem sumiu e quanto vale, escreve a mensagem e dispara com 1 clique.',
      'IA que recupera clientes sumidas pelo WhatsApp da profissional',
      v_pricing, v_pitch15, v_pitch30, v_pitch2m, v_icp, v_obj,
      v_benefits,
      ARRAY['IA que mostra ONDE tem dinheiro parado na carteira (R$, não achismo)','Dispara pelo WhatsApp da própria profissional — cliente recebe da pessoa que conhece','Garantia julgada por painel DENTRO do produto (transparência total)','Feito para beleza multi-vertical: lash, nails, sobrancelha, podologia, estética, salão'],
      v_guar, v_disc, v_plans, v_kb
    );
  ELSE
    UPDATE public.platform_crm_products SET
      pricing = v_pricing, pitch_15s = v_pitch15, pitch_30s = v_pitch30,
      pitch_2min = v_pitch2m, icp = v_icp, objections = v_obj,
      benefits = v_benefits, guarantee = v_guar, discount_policy = v_disc,
      plans = v_plans, knowledge_base = v_kb, updated_at = now()
    WHERE id = v_id;
  END IF;
END $$;
