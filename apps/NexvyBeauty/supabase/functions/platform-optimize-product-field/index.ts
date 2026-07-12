// platform-optimize-product-field — OTIMIZA um campo de texto de um PRODUTO do
// CRM de PLATAFORMA (super_admin) usando IA. STATELESS: só chama a IA com o
// prompt específico do campo + productContext e devolve o texto otimizado; NÃO
// persiste nada (idêntico à irmã org-scoped `optimize-product-field`).
//
// Porte 1:1 de `optimize-product-field`, DESACOPLADO do tenant:
//   * Escopo: product-scoped puro — NUNCA organization_id.
//   * IA: MESMO provider/prompt/tools do original — aiChat com organizationId=null
//     usa a chave de IA da PLATAFORMA (AI_API_KEY), idêntico às demais platform-*.
//   * Auth: super_admin via authenticatePlatformAgent (JWT do usuário OU
//     service_role + actorUserId no body), padrão dos outros platform-*. O edge
//     roda com SERVICE_ROLE; o gate é re-aplicado em código (RLS não se aplica).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { aiChat, describeAIError } from '../_shared/ai-call.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

const fieldPrompts: Record<string, string> = {
  description: `Você é um especialista em copywriting para vendas B2B.
Reescreva a descrição do produto para ser mais clara, profissional e persuasiva.
Mantenha a essência, mas torne-a mais impactante para vendedores usarem.`,

  icp: `Você é um especialista em definição de ICP (Ideal Customer Profile).
Reescreva o perfil do cliente ideal para ser mais detalhado e acionável.
Inclua características demográficas, comportamentais e sinais de compra.`,

  pitch_15s: `Você é um especialista em elevator pitch.
Reescreva este pitch de 15 segundos para ser memorável, impactante e gerar curiosidade.
Deve ser algo que um vendedor pode falar naturalmente em uma conversa.`,

  pitch_30s: `Você é um especialista em apresentações de vendas.
Reescreva este pitch de 30 segundos para incluir problema, solução e valor.
Mantenha natural e conversacional, mas persuasivo.`,

  pitch_2min: `Você é um especialista em storytelling para vendas.
Reescreva este pitch de 2 minutos usando a estrutura: Problema → Impacto → Solução → Resultados.
Inclua elementos de prova social e urgência quando apropriado.`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bodyParsed = await req.json().catch(() => ({}));
    const { field, value, productContext } = bodyParsed ?? {};

    if (!field || !value) {
      return new Response(
        JSON.stringify({ error: 'Field and value are required' }),
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

    const systemPrompt = fieldPrompts[field] || `Você é um especialista em vendas B2B.
Reescreva o conteúdo para ser mais profissional, claro e persuasivo.
Mantenha a essência original, mas torne-o mais impactante.`;

    const contextInfo = productContext ? `
Contexto do produto:
- Nome: ${productContext.name || 'Não definido'}
- Descrição: ${productContext.description || 'Não definida'}
- ICP: ${productContext.icp || 'Não definido'}
` : '';

    const { response, config } = await aiChat({
      organizationId: null,
      capability: 'content_generation',
      model: 'google/gemini-3-flash-preview',
      label: 'platform-optimize-product-field',
      supabase,
      body: {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${contextInfo}\n\nTexto original para otimizar:\n"${value}"\n\nRetorne APENAS o texto otimizado, sem explicações ou marcadores.` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'optimize_text',
            description: 'Return the optimized text with improvements',
            parameters: {
              type: 'object',
              properties: {
                optimized: { type: 'string' },
                improvements: { type: 'array', items: { type: 'string' } },
              },
              required: ['optimized', 'improvements'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'optimize_text' } },
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fallback to content if no tool call
    const content = data.choices?.[0]?.message?.content || value;
    return new Response(
      JSON.stringify({ optimized: content, improvements: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('platform-optimize-product-field error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
