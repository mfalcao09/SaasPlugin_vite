// platform-generate-objections — GERA objeções de venda com IA para um PRODUTO
// do CRM de PLATAFORMA (super_admin) e as PERSISTE em platform_crm_objections.
//
// Porte 1:1 do org-scoped `generate-objections`, DESACOPLADO do tenant:
//   * Escopo: product_id (platform_crm_*), nunca organization_id.
//   * Fonte do produto: platform_crm_products (name/description/pitch_*/icp/
//     differentials/pricing) — sem organization_id (o CRM de plataforma é
//     product-scoped puro).
//   * Cérebro/knowledge: platform_crm_product_knowledge_sources (equivalente ao
//     ai_knowledge_base do salão). Colunas reais: title / extracted_content /
//     description / data_category / source_type / is_active.
//   * IA: MESMO provider/prompt/tools do original — aiChat com organizationId=null
//     usa a chave de IA da PLATAFORMA (AI_API_KEY), idêntico ao
//     platform-meta-whatsapp-template-ai-generate.
//   * Auth: super_admin via authenticatePlatformAgent (JWT do usuário OU
//     service_role + actorUserId no body). RLS não se aplica ao edge (roda com
//     SERVICE_ROLE); o gate é re-aplicado em código.
//   * PERSISTÊNCIA (diferença dirigida vs. o original, que só retornava): as
//     objeções geradas são gravadas em platform_crm_objections mapeando
//     category / what_they_say / what_they_mean / suggested_response /
//     follow_up_question (mesmo shape que useCreateProductObjection insere).
//     A resposta devolve tanto as objeções persistidas quanto o productName,
//     para o front (useProductObjections) revalidar.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { aiChat, describeAIError } from '../_shared/ai-call.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bodyParsed = await req.json().catch(() => ({}));
    const { productId } = bodyParsed ?? {};

    if (!productId) {
      return new Response(
        JSON.stringify({ error: 'productId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Gate super_admin (mesma fonte de verdade do RLS: user_roles).
    const { errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      serviceRoleKey,
      bodyParsed,
    );
    if (errorResponse) return errorResponse;

    // Fetch product details (product-scoped — SEM organization_id).
    const { data: product, error: productError } = await supabase
      .from('platform_crm_products')
      .select('name, description, pitch_15s, pitch_30s, pitch_2min, icp, differentials, pricing')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return new Response(
        JSON.stringify({ error: 'Product not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch knowledge base (Cérebro do Produto). Equivalente product-scoped do
    // ai_knowledge_base: platform_crm_product_knowledge_sources. content =
    // extracted_content || answer || description; category = data_category ||
    // source_type (colunas reais do schema).
    const { data: knowledge } = await supabase
      .from('platform_crm_product_knowledge_sources')
      .select('title, extracted_content, answer, description, data_category, source_type')
      .eq('product_id', productId)
      .eq('is_active', true);

    // Build product context
    const productContext = `
PRODUTO: ${product.name}
DESCRIÇÃO: ${product.description || 'Não informada'}
PITCH 15s: ${product.pitch_15s || 'Não definido'}
PITCH 30s: ${product.pitch_30s || 'Não definido'}
PITCH 2min: ${product.pitch_2min || 'Não definido'}
ICP (Cliente Ideal): ${product.icp || 'Não definido'}
DIFERENCIAIS: ${product.differentials?.join(', ') || 'Não definidos'}
PRICING: ${JSON.stringify(product.pricing) || 'Não definido'}
`;

    let knowledgeContext = '';
    if (knowledge && knowledge.length > 0) {
      knowledgeContext = '\nBASE DE CONHECIMENTO:\n' + knowledge
        .map((k: any) => {
          const content = k.extracted_content || k.answer || k.description || '';
          const category = k.data_category || k.source_type || '';
          return `- ${k.title} (${category}): ${content}`;
        })
        .join('\n\n');
    }

    const systemPrompt = `Você é um especialista em vendas via WhatsApp. Gere objeções prováveis com respostas CURTAS e DIRETAS, otimizadas para mensagens de texto.

${productContext}
${knowledgeContext}

CATEGORIAS:
- price: Preço/orçamento
- timing: "Não é o momento"
- trust: Falta de confiança
- thinking: "Vou pensar"
- partner: "Preciso falar com sócio"
- competitor: "Já uso outra solução"

⚠️ REGRAS CRÍTICAS - RESPOSTAS PARA WHATSAPP:
1. SIGNIFICADO: Máximo 1 linha (20-30 palavras)
2. RESPOSTA: Máximo 3-4 linhas curtas, use emojis estratégicos (✅ 💡 🎯 ⏰ 💰)
3. PERGUNTA: Uma única pergunta direta (máximo 15 palavras)
4. Use quebras de linha para facilitar leitura no celular
5. Tom conversacional, como mensagem de WhatsApp
6. Gere 6 objeções variadas`;

    const { response, config } = await aiChat({
      organizationId: null,
      capability: 'content_generation',
      model: 'google/gemini-3-flash-preview',
      label: 'platform-generate-objections',
      supabase,
      body: {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Analise o produto e gere as objeções mais prováveis com suas respectivas respostas estratégicas.' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'generate_objections',
              description: 'Generate a list of probable sales objections with strategic responses',
              parameters: {
                type: 'object',
                properties: {
                  objections: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        category: { type: 'string', enum: ['price', 'timing', 'trust', 'thinking', 'partner', 'competitor'] },
                        what_they_say: { type: 'string' },
                        what_they_mean: { type: 'string' },
                        suggested_response: { type: 'string' },
                        follow_up_question: { type: 'string' },
                      },
                      required: ['category', 'what_they_say', 'what_they_mean', 'suggested_response', 'follow_up_question'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['objections'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'generate_objections' } },
      },
    });

    if (!response.ok) {
      const errMsg = await describeAIError(response, config.provider);
      return new Response(JSON.stringify({ error: errMsg }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'generate_objections') {
      return new Response(
        JSON.stringify({ error: 'Failed to generate objections' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const generatedObjections = JSON.parse(toolCall.function.arguments);
    const objections: Array<{
      category: string;
      what_they_say: string;
      what_they_mean: string;
      suggested_response: string;
      follow_up_question: string;
    }> = Array.isArray(generatedObjections?.objections) ? generatedObjections.objections : [];

    // PERSIST into platform_crm_objections (product-scoped). Mapeia 1:1 os
    // campos gerados às colunas reais da tabela (mesmo shape que
    // useCreateProductObjection insere). NOT NULL: category / what_they_say /
    // suggested_response — linhas sem esses campos são descartadas para não
    // violar a constraint.
    const rows = objections
      .filter((o) => o?.category && o?.what_they_say && o?.suggested_response)
      .map((o) => ({
        product_id: productId,
        category: o.category,
        what_they_say: o.what_they_say,
        what_they_mean: o.what_they_mean || null,
        suggested_response: o.suggested_response,
        follow_up_question: o.follow_up_question || null,
      }));

    let savedObjections: Array<Record<string, unknown>> = [];
    if (rows.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('platform_crm_objections')
        .insert(rows)
        .select('*');
      if (insertError) {
        console.error('[platform-generate-objections] insert error:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to save objections', details: insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      savedObjections = inserted ?? [];
    }

    return new Response(
      JSON.stringify({
        success: true,
        objections: savedObjections,
        saved: savedObjections.length,
        productName: product.name,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('platform-generate-objections error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
