// platform-meta-whatsapp-template-ai-generate — gera template HSM via IA (best
// practices Meta). Retorna JSON pronto p/ o editor (NAO submete a Meta).
// Porte 1:1 do `meta-whatsapp-template-ai-generate`, DESACOPLADO do tenant:
//   * Tabela: platform_crm_whatsapp_meta_connections (sem organization_id).
//   * Auth: super_admin via authenticatePlatformAgent.
//   * aiChat com organizationId=null -> usa a chave de IA da PLATAFORMA (AI_API_KEY).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { aiChat, describeAIError } from '../_shared/ai-call.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

interface GeneratedTemplate {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: Array<{
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
    format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    text?: string;
    example?: { body_text?: string[][]; header_text?: string[] };
    buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone_number?: string }>;
  }>;
  variable_labels: Record<string, string>;
}

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  const {
    connection_id,
    objective,
    tone = 'profissional consultivo',
    category = 'UTILITY',
    language = 'pt_BR',
    include_optout_button = true,
    audience_hint = '',
    org_context = '',
  } = body ?? {};

  if (!connection_id || !objective) return json({ error: 'connection_id e objective sao obrigatorios' }, 400);

  const { data: conn } = await sb.from('platform_crm_whatsapp_meta_connections').select('display_name').eq('id', connection_id).maybeSingle();
  if (!conn) return json({ error: 'connection not found' }, 404);

  const systemPrompt = `Voce e especialista em criar templates HSM aprovados pela Meta WhatsApp Cloud API.

REGRAS OBRIGATORIAS:
1. Nome: snake_case, maximo 60 chars, apenas [a-z0-9_], descritivo (ex: abertura_webinar_v1).
2. Categoria escolhida: ${category}
   - MARKETING: promocoes, lembretes de evento, reativacao. EXIGE opt-out.
   - UTILITY: confirmacoes operacionais (pedido, agendamento, ticket). Nao pode ter teor promocional.
   - AUTHENTICATION: apenas OTP/codigos.
3. Body: maximo 1024 chars, claro, direto, sem caps excessivo, sem exagero comercial ("PROMOCAO IMPERDIVEL!!!").
4. Variaveis numeradas {{1}}, {{2}}... sequenciais comecando em {{1}}. Para cada variavel forneca um exemplo realista em "example.body_text".
5. Idioma: ${language}.
6. ${include_optout_button ? 'INCLUA OBRIGATORIAMENTE 1 botao Quick Reply com texto "Sair da lista" (sera usado para opt-out automatico).' : 'Sem botoes de opt-out.'}
7. Pode incluir Footer curto (max 60 chars) com identificacao ou disclaimer.
8. EVITAR gatilhos de rejeicao: emojis excessivos, urgencia falsa ("ULTIMA CHANCE"), promessas absolutas, claims de saude sem disclaimer.

Retorne APENAS JSON no formato:
{
  "name": "snake_case_name",
  "language": "${language}",
  "category": "${category}",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Opcional, max 60 chars com no max 1 variavel" },
    { "type": "BODY", "text": "Corpo com {{1}} variaveis", "example": { "body_text": [["valor1", "valor2"]] } },
    { "type": "FOOTER", "text": "Opcional" },
    { "type": "BUTTONS", "buttons": [{ "type": "QUICK_REPLY", "text": "Sair da lista" }] }
  ],
  "variable_labels": { "1": "nome_do_lead", "2": "nome_do_evento" }
}`;

  const userPrompt = `Empresa: ${conn.display_name}${org_context ? '\nContexto: ' + org_context : ''}
Objetivo do template: ${objective}
Tom: ${tone}
Publico: ${audience_hint || 'leads B2C que se cadastraram via formulario'}

Gere o template completo seguindo as regras.`;

  try {
    const { response, config } = await aiChat({
      supabase: sb,
      organizationId: null,
      capability: 'content_generation',
      model: 'google/gemini-3-flash-preview',
      label: 'platform-meta-template-ai',
      body: {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      },
    });

    if (!response.ok) {
      return json({ error: await describeAIError(response, config.provider) }, response.status);
    }
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content ?? '{}';
    let parsed: GeneratedTemplate;
    try { parsed = JSON.parse(raw); }
    catch {
      const cleaned = String(raw).replace(/^```json\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    parsed.name = String(parsed.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
    parsed.language = parsed.language || language;
    parsed.category = (parsed.category as any) || category;
    parsed.components = Array.isArray(parsed.components) ? parsed.components : [];
    parsed.variable_labels = parsed.variable_labels || {};

    return json({ ok: true, template: parsed });
  } catch (e) {
    console.error('[platform-meta-template-ai] error', e);
    return json({ error: (e as Error).message || 'erro ao gerar template' }, 500);
  }
});
