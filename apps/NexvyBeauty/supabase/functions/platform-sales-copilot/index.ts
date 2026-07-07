// platform-sales-copilot — "Sugerir Resposta IA" do CRM de PLATAFORMA (super_admin)
//
// Porte 1:1 do `sales-copilot` do CRM Vendus, desacoplado do tenant:
//   * Entrada: `conversation_id` — o histórico é lido de `platform_crm_messages`
//     (visitor → role user; agent/bot → role assistant). Também aceita `messages[]`
//     direto (contrato do original), útil para follow-ups do vendedor.
//   * Contexto de produto: DINÂMICO — lê `product_id` da conversa e monta o
//     bloco de conhecimento de `platform_crm_products` (playbook: oferta,
//     preços, garantia, objeções, pitches) + escassez real da view
//     `founder_campaign_status`. Sem product_id (webchat antigo) cai no
//     fallback fixo PLATFORM_KNOWLEDGE_CONTEXT — nada quebra.
//   * LLM: gateway OpenRouter via env `AI_API_KEY` (+ `AI_GATEWAY_URL` opcional,
//     default https://openrouter.ai/api/v1). Modelo: google/gemini-2.5-flash
//     (mesmo default do original; override via env AI_SALES_COPILOT_MODEL).
//   * Saída: JSON `{ suggestion }` (o original streamava SSE; o front da
//     plataforma consome Promise<string> — adaptação anotada).
//   * Auth: Bearer JWT + gate super_admin (o original checava org do produto).
//
// System prompt: VERBATIM do original (formato de 3 partes, regras, análise de
// prints, o-que-nunca-fazer) — só o bloco de conhecimento foi adaptado.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

const DEFAULT_MODEL = 'google/gemini-2.5-flash';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** FALLBACK de conhecimento da plataforma — usado apenas quando a conversa não
 *  tem product_id ou o produto não existe mais (webchat sem produto continua
 *  funcionando). O caminho principal monta o bloco de `platform_crm_products`. */
const PLATFORM_KNOWLEDGE_CONTEXT = `
## PRODUTO: NexvyBeauty
Descrição: Plataforma SaaS de gestão para salões de beleza e clínicas de estética — agenda inteligente, CRM de atendimento com WhatsApp, campanhas/automações de marketing e agentes de IA para atendimento e vendas.
ICP (Cliente Ideal): donos e gestores de salões de beleza, barbearias e clínicas de estética que querem organizar a agenda, não perder cliente por falta de resposta no WhatsApp e automatizar retorno/recorrência.
Planos: Essencial, Premium e Ultra — diferenciam por QUANTITATIVOS (instâncias de WhatsApp, usuários, agentes de IA) e acessos. NÃO invente preços dos planos: se o cliente perguntar valor exato e ele não estiver na conversa, direcione para confirmar a tabela vigente.
Diferenciais: atendimento WhatsApp integrado ao CRM, agentes de IA treináveis, automações de retorno/aniversário/pós-venda, gestão completa do salão em um só lugar.
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const conversationId: string | null = body?.conversation_id ?? null;
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Autenticação obrigatória: copiloto é ferramenta interna do time da plataforma.
    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      serviceKey,
      body,
    );
    if (errorResponse) return errorResponse;
    if (!user) return json({ error: 'Unauthorized' }, 401);

    // Sanitize: keep only valid {role, content} entries with non-empty content
    let messages = rawMessages.filter((m: any) => {
      if (!m || typeof m.role !== 'string') return false;
      if (typeof m.content === 'string') return m.content.trim().length > 0;
      if (Array.isArray(m.content)) return m.content.length > 0;
      return false;
    });

    let visitorName: string | null = null;
    let productId: string | null = null;

    // Modo plataforma: monta o histórico a partir de platform_crm_messages.
    if (messages.length === 0 && conversationId) {
      const [convRes, msgsRes] = await Promise.all([
        supabase
          .from('platform_crm_conversations')
          .select('id, visitor_name, lead_id, product_id')
          .eq('id', conversationId)
          .maybeSingle(),
        supabase
          .from('platform_crm_messages')
          .select('content, sender_type, is_deleted, created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (!convRes.data) {
        return json({ error: 'Conversation not found' }, 404);
      }

      visitorName = convRes.data.visitor_name ?? null;
      productId = (convRes.data.product_id as string | null) ?? null;
      if (!visitorName && convRes.data.lead_id) {
        const { data: lead } = await supabase
          .from('platform_crm_leads')
          .select('name')
          .eq('id', convRes.data.lead_id)
          .maybeSingle();
        visitorName = lead?.name ?? null;
      }

      const history = (msgsRes.data || [])
        .filter((m: any) => !m.is_deleted && typeof m.content === 'string' && m.content.trim().length > 0)
        .reverse();

      messages = history.map((m: any) => ({
        role: m.sender_type === 'visitor' ? 'user' : 'assistant',
        content: m.content,
      }));
    }

    if (messages.length === 0) {
      console.warn(
        '[platform-sales-copilot] empty messages. body keys:',
        Object.keys(body || {}),
        'rawLen:',
        rawMessages.length,
        'conversationId:',
        conversationId,
      );
      return json({ error: 'Nenhuma mensagem enviada ao copiloto.' }, 400);
    }

    // ── Conhecimento dinâmico do playbook (mesmo padrão do sales-copilot do
    // tenant: seções tituladas, texto puro). Ordem deliberada: OFERTA/
    // knowledge_base primeiro (contém o vocabulário obrigatório — "piloto" ≠
    // "teste gratuito"), depois preços, garantia, desconto, objeções, pitches,
    // ICP, diferenciais. Qualquer falha aqui degrada para o fallback fixo. ──
    let knowledgeContext = PLATFORM_KNOWLEDGE_CONTEXT;
    let productName = 'NexvyBeauty';

    if (productId) {
      const [productRes, campaignRes] = await Promise.all([
        supabase
          .from('platform_crm_products')
          .select(
            'name, description, pitch_15s, pitch_30s, pitch_2min, icp, objections, benefits, differentials, guarantee, discount_policy, plans, pricing, knowledge_base, custom_info',
          )
          .eq('id', productId)
          .maybeSingle(),
        // View de 1 linha derivada de organizations (30 − fundadoras ativas):
        // escassez VERDADEIRA lida do banco em tempo real, nunca inventada.
        supabase
          .from('founder_campaign_status')
          .select('total_vagas, fundadoras_ativas, slots_left, campanha_encerrada')
          .limit(1)
          .maybeSingle(),
      ]);

      const product = productRes.data as Record<string, any> | null;
      if (!product) {
        console.warn(
          '[platform-sales-copilot] product_id sem produto correspondente — usando fallback fixo:',
          productId,
        );
      } else {
        productName = product.name || productName;

        let ctx = `\n## PRODUTO: ${product.name}\n`;
        if (product.description) ctx += `Descrição: ${product.description}\n`;

        if (product.knowledge_base) {
          ctx += `\n## OFERTA E BASE DE CONHECIMENTO\n${product.knowledge_base}\n`;
        }

        // Escassez da campanha fundadora: só entra se a view respondeu (erro
        // na view não pode derrubar a sugestão — non-fatal por construção).
        const campaign = campaignRes.data as Record<string, any> | null;
        if (campaign) {
          ctx += campaign.campanha_encerrada
            ? `\nCAMPANHA FUNDADORA AGORA: campanha encerrada — as ${campaign.total_vagas} vagas de fundadora foram preenchidas. NÃO ofertar condições de fundadora.\n`
            : `\nCAMPANHA FUNDADORA AGORA: restam ${campaign.slots_left} de ${campaign.total_vagas} vagas de fundadora (dado real do banco, neste momento).\n`;
        }

        if (product.plans || product.pricing) {
          ctx += `\n## PLANOS E PREÇOS\n`;
          if (product.plans) ctx += `${product.plans}\n`;
          if (product.pricing) ctx += `Tabela vigente (JSON): ${JSON.stringify(product.pricing)}\n`;
        }
        if (product.guarantee) ctx += `\n## GARANTIA\n${product.guarantee}\n`;
        if (product.discount_policy) ctx += `\n## POLÍTICA DE DESCONTO\n${product.discount_policy}\n`;
        if (product.objections) ctx += `\n## OBJEÇÕES E RESPOSTAS\n${product.objections}\n`;
        if (product.pitch_15s || product.pitch_30s || product.pitch_2min) {
          ctx += `\n## PITCHES\n`;
          if (product.pitch_15s) ctx += `Pitch 15s: ${product.pitch_15s}\n`;
          if (product.pitch_30s) ctx += `Pitch 30s: ${product.pitch_30s}\n`;
          if (product.pitch_2min) ctx += `Pitch 2min:\n${product.pitch_2min}\n`;
        }
        if (product.icp) ctx += `\n## ICP (CLIENTE IDEAL)\n${product.icp}\n`;
        if (Array.isArray(product.differentials) && product.differentials.length) {
          ctx += `\n## DIFERENCIAIS\n${product.differentials.map((d: string) => `- ${d}`).join('\n')}\n`;
        }
        if (product.benefits) ctx += `\n## BENEFÍCIOS\n${product.benefits}\n`;
        if (product.custom_info) ctx += `\n## INFORMAÇÕES ADICIONAIS\n${product.custom_info}\n`;

        knowledgeContext = ctx;
      }
    }

    // System prompt — VERBATIM do original; só o bloco de conhecimento adaptado.
    const systemPrompt = `Você é o COPILOTO DE VENDAS — estrategista que ajuda vendedores a responder clientes.

PRODUTO: ${productName}
${visitorName ? `CLIENTE: ${visitorName}` : ''}

${knowledgeContext}

═══════════════════════════════════════
COMO USAR A BASE DE CONHECIMENTO
═══════════════════════════════════════

- Para DADOS DO PRODUTO (preços, funcionalidades, prazos, specs): use SOMENTE o que está no contexto acima. Se não tiver, diga: "Sobre esse detalhe específico do produto, sugiro confirmar com o gestor antes de responder ao cliente."
- Para ESTRATÉGIA DE VENDAS (como abordar, como reativar, como negociar, como contornar objeções): use seu conhecimento de vendas consultivas livremente, adaptando ao contexto do produto quando houver informação disponível
- Quando existir uma FAQ ou treinamento que responda à pergunta, USE como base
- NUNCA invente preços, custos ou dados técnicos do produto

═══════════════════════════════════════
COMO RESPONDER
═══════════════════════════════════════

Para TODA situação do vendedor, entregue exatamente neste formato:

**O QUE ELE QUIS DIZER:**
[1-2 frases explicando a real intenção ou objeção oculta do cliente]

**RESPOSTA ESTRATÉGICA:**
[Mensagem pronta para copiar e enviar. 2-4 linhas. Tom humano e profissional]

**PERGUNTA DE RETORNO:**
[1 pergunta para manter a conversa e avançar a venda]

═══════════════════════════════════════
REGRAS
═══════════════════════════════════════

- Resposta otimizada para WhatsApp (curta, direta)
- NÃO use emojis
- NÃO use asteriscos ou formatação markdown nas respostas prontas
- Use o nome do cliente quando souber
- Linguagem natural e profissional
- Foque em gerar ação, não explicar teoria

═══════════════════════════════════════
ANÁLISE DE PRINTS
═══════════════════════════════════════

Quando receber print de conversa:
1. Analise rapidamente o contexto
2. Entregue no mesmo formato das 3 partes
3. Seja cirúrgico e objetivo

═══════════════════════════════════════
O QUE NUNCA FAZER
═══════════════════════════════════════

- Dar aula ou explicar conceitos de vendas
- Fazer listas longas
- Usar emojis
- Enrolar com introduções
- Fugir do formato de 3 partes
- Inventar preços, custos ou dados técnicos do produto
- Recusar perguntas estratégicas de vendas alegando falta de informação`;

    // Gateway OpenRouter via env (sem roteamento por organização — plataforma
    // tem UMA chave: AI_API_KEY; o original resolvia por org via ai-router).
    const apiKey = Deno.env.get('AI_API_KEY') ?? '';
    if (!apiKey) {
      return json(
        { error: 'AI_API_KEY não configurada na plataforma. Configure o secret e tente novamente.' },
        500,
      );
    }
    const gatewayBase = (Deno.env.get('AI_GATEWAY_URL') ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const model = Deno.env.get('AI_SALES_COPILOT_MODEL') ?? DEFAULT_MODEL;

    const response = await fetch(`${gatewayBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('AI gateway error:', response.status, errorText);
      if (response.status === 429) {
        return json(
          { error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' },
          429,
        );
      }
      if (response.status === 402) {
        return json(
          { error: 'Créditos de IA esgotados. Adicione créditos na conta do gateway (OpenRouter).' },
          402,
        );
      }
      if (response.status === 401 || response.status === 403) {
        return json(
          { error: 'Chave do gateway de IA (AI_API_KEY) inválida ou sem permissão.' },
          response.status,
        );
      }
      return json(
        { error: `Erro do provedor de IA: ${errorText.slice(0, 200) || response.statusText}` },
        500,
      );
    }

    const completion = await response.json().catch(() => null);
    const suggestion: string =
      completion?.choices?.[0]?.message?.content?.trim?.() ?? '';

    if (!suggestion) {
      console.error('[platform-sales-copilot] empty completion:', JSON.stringify(completion)?.slice(0, 300));
      return json({ error: 'O modelo não retornou sugestão. Tente novamente.' }, 502);
    }

    return json({ suggestion, model });
  } catch (error) {
    console.error('Platform sales copilot error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Erro desconhecido' },
      500,
    );
  }
});
