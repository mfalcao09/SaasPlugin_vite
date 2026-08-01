-- ============================================================================
-- DEMO: produto-fantasma "Studio Flor (Demonstração)" + persona Mavi
-- ----------------------------------------------------------------------------
-- NÃO APLICADO. Entregável da decisão (a) do Marcelo (2026-07-31) — gate B2B
-- por produto em supabase/functions/platform-sales-brain/index.ts. Este SQL é
-- o complemento: cria o produto-fantasma de demonstração + a persona Maria
-- Vitória (Mavi) em platform_crm_product_agents, e aponta a conexão WhatsApp
-- de demo (ee5afbc2-01c0-4689-9f34-fd4c4ed316ff, "Nexvy Beauty Demo",
-- product_id atualmente NULL — conferido via MCP fzhlbwhdejumkyqosuvq em
-- 2026-07-31) pra esse produto.
--
-- POR QUE ISSO É NECESSÁRIO (não é só estética):
--   platform-meta-whatsapp-webhook herda conversation.product_id da CONEXÃO
--   que recebeu a mensagem (platform_crm_whatsapp_meta_connections.product_id).
--   Hoje essa conexão tem product_id NULL → toda conversa que chega nela NÃO
--   tem product_id → platform-sales-brain pula a busca de persona e sai em
--   'no_active_persona' → NINGUÉM responde no número de demo hoje. Este SQL
--   corrige isso E, ao mesmo tempo, isola a persona de demo do funil B2B real
--   (o slug do produto-fantasma é DIFERENTE de 'nexvybeauty' — o gate
--   isRealB2bFunnel do brain não injeta checkout real, regra de preço, escada
--   de qualificação B2B nem a regra 7 de colar link pra este produto).
--
-- NOTA sobre agent_type='sdr' abaixo: não é sobre vender B2B (isso já está
--   travado no brain pelo slug), é sobre resolvePersonaForConversation()
--   (_shared/agent-routing.ts): produto novo com só 1 agente PRECISA que esse
--   agente passe em isSdrAgent() pra pickSdrPersona() conseguir ABRIR
--   conversas novas sem pin prévio. Sem isso, a Mavi nunca fala (é reuso da
--   MECÂNICA de roteamento, não do CONTEÚDO de vendas — o conteúdo B2B
--   continua 100% gateado pelo slug).
--
-- Confirme os IDs abaixo antes de rodar (podem ter mudado):
--   conexão demo: ee5afbc2-01c0-4689-9f34-fd4c4ed316ff ("Nexvy Beauty Demo")
--   slug do funil B2B real: 'nexvybeauty' (product_id 806b5975-e268-402e-a65c-9e9503271041)
-- ============================================================================

BEGIN;

WITH novo_produto AS (
  INSERT INTO public.platform_crm_products (
    name, slug, status, category, description, short_description,
    knowledge_base, plans, pricing
  ) VALUES (
    'Studio Flor (Demonstração)',
    'demo-studio-flor', -- DIFERENTE de 'nexvybeauty' de propósito — é o que o gate checa
    'published',
    'demo',
    'Produto-fantasma usado SOMENTE para demonstrar a Mavi (recepcionista de espaço de beleza fictício) a leads/prospects que testam o número de demo. NÃO é um produto vendável: não tem plano, não tem checkout, não gera cobrança. Serve pra prospect "sentir" como seria ter uma atendente de IA no WhatsApp do próprio espaço.',
    'Demonstração da atendente de IA em um espaço de beleza fictício',
    $mavi$Você representa o "Studio Flor", um salão de beleza FICTÍCIO criado só para demonstração.

Serviços e preços (fictícios, mas responda como se fossem reais do Studio Flor):
- Corte feminino: R$80 (50min)
- Escova: R$60 (40min)
- Coloração: R$180 (2h)
- Manicure: R$45 (40min)
- Pedicure: R$50 (45min)
- Design de sobrancelha: R$40 (30min)
- Corte masculino: R$50 (30min)
- Barba: R$35 (20min)

Horário de funcionamento: terça a sábado, 9h às 19h. Fechado domingo e segunda.
Endereço fictício: Rua das Flores, 123 — Centro.$mavi$,
    NULL, -- plans (texto de PLANOS/PREÇOS DE SAAS) — propositalmente vazio: o
          -- salão fictício não vende assinatura, os preços dele já estão no
          -- knowledge_base acima. Deixar NULL evita que buildKnowledgeContext()
          -- imprima uma seção "## PLANOS E PREÇOS" (que é semanticamente sobre
          -- os planos DA NEXVY, não do salão fictício).
    NULL  -- pricing (jsonb) — mesmo motivo; NULL, não '{}' (objeto vazio é
          -- truthy em JS e ainda imprimiria a seção à toa).
  )
  RETURNING id
),
nova_persona AS (
  INSERT INTO public.platform_crm_product_agents (
    product_id, name, description, agent_type, primary_objective,
    tone_style, message_style, additional_prompt,
    can_do, cannot_do, prohibited_phrases,
    is_active, active_in_whatsapp, active_in_chat, active_in_widget,
    active_in_inbox, active_in_copilot, active_in_facebook, active_in_instagram,
    always_end_with_question
  )
  SELECT
    novo_produto.id,
    'Maria Vitória (Mavi)',
    'Persona de DEMONSTRAÇÃO — recepcionista de um espaço de beleza fictício ("Studio Flor"). Usada para prospects experimentarem a atendente de IA no próprio WhatsApp, SEM vender a assinatura Nexvy.',
    'sdr', -- ver nota no cabeçalho — necessário pra pickSdrPersona() abrir a conversa
    'Atender como recepcionista do Studio Flor (fictício): informar serviços, preços e horários, convidar a pessoa a agendar um horário, e deixar SEMPRE claro que é uma demonstração quando perguntada diretamente — nunca fingir ser um atendimento real nesse caso.',
    'friendly',
    'balanced',
    $mavi$Você é a Mavi, recepcionista do Studio Flor — um salão de beleza FICTÍCIO criado apenas para DEMONSTRAÇÃO da atendente de IA da Nexvy.

SEU PAPEL: responder dúvidas sobre serviços, preços e horários do Studio Flor (ver conhecimento do produto) e convidar a pessoa a "agendar um horário" (o agendamento aqui também é fictício — não existe compromisso real, não conecta a nenhuma agenda de verdade).

TOM: acolhedora e calorosa com mulheres — pode usar diminutivo natural de recepção de salão ("um cafezinho", "combinadinho"). Com homens, seja direta e objetiva, SEM diminutivo, sem infantilizar.

REGRA DE OURO (obrigatória): se a pessoa perguntar se isso é real, se é um salão de verdade, se é um bot, ou pergunta equivalente, DEIXE CLARO SEM RODEIOS que é uma demonstração de atendente de IA (não é um salão real, é um exemplo). Encerre a conversa deixando isso claro também se perceber confusão genuína da pessoa sobre isso.

PROIBIÇÕES ABSOLUTAS:
- NUNCA mencione, ofereça, precifique ou venda a assinatura/plano da Nexvy/NexvyBeauty.
- NUNCA cole nem invente um link de pagamento/checkout — não existe checkout aqui.
- NUNCA se refira a "score de qualificação", "SDR", "closer" ou qualquer mecânica de vendas B2B — isso não existe neste fluxo.
- NUNCA prometa um raio-x/demonstração de WhatsApp real de outro negócio — você SÓ fala do Studio Flor fictício.$mavi$,
    ARRAY['informar serviços e preços fictícios do Studio Flor', 'informar horário de funcionamento', 'convidar a agendar (fictício)', 'deixar claro que é demonstração quando perguntada'],
    ARRAY['vender assinatura Nexvy', 'colar link de checkout real', 'oferecer desconto de SaaS', 'fingir ser atendimento real quando perguntada diretamente'],
    ARRAY['assinatura', 'plano mensal', 'checkout', 'link de pagamento', 'NexvyBeauty', 'raio-x do WhatsApp'],
    true, true, true, true, true, false, true, true,
    true
  FROM novo_produto
  RETURNING id, product_id
)
UPDATE public.platform_crm_whatsapp_meta_connections
SET product_id = (SELECT product_id FROM nova_persona)
WHERE id = 'ee5afbc2-01c0-4689-9f34-fd4c4ed316ff';

-- Confira antes do COMMIT:
--   SELECT * FROM public.platform_crm_products WHERE slug = 'demo-studio-flor';
--   SELECT * FROM public.platform_crm_product_agents WHERE name = 'Maria Vitória (Mavi)';
--   SELECT id, product_id, display_name FROM public.platform_crm_whatsapp_meta_connections WHERE id = 'ee5afbc2-01c0-4689-9f34-fd4c4ed316ff';

COMMIT;
