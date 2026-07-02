// platform-sales-copilot — "Sugerir Resposta IA" do CRM de PLATAFORMA (super_admin)
//
// Porte 1:1 do `sales-copilot` do CRM Vendus, desacoplado do tenant:
//   * Entrada: `conversation_id` — o histórico é lido de `platform_crm_messages`
//     (visitor → role user; agent/bot → role assistant). Também aceita `messages[]`
//     direto (contrato do original), útil para follow-ups do vendedor.
//   * Contexto de produto: FIXO — a plataforma vende o SaaS NexvyBeauty (planos
//     Essencial / Premium / Ultra). Substitui o fetch de products/objections/
//     knowledge base do tenant (adaptação única permitida no prompt).
//   * LLM: gateway OpenRouter via env `AI_API_KEY` (+ `AI_GATEWAY_URL` opcional,
//     default https://openrouter.ai/api/v1). Modelo: google/gemini-2.5-flash
//     (mesmo default do original; override via env AI_SALES_COPILOT_MODEL).
//   * Saída: JSON `{ suggestion }` (o original streamava SSE; o front da
//     plataforma consome Promise<string> — adaptação anotada).
//   * Auth: Bearer JWT + gate super_admin (o original checava org do produto).
//
// System prompt: VERBATIM do original (formato de 3 partes, regras, análise de
// prints, o-que-nunca-fazer) — só o bloco de conhecimento foi adaptado.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

/** Contexto de conhecimento da PLATAFORMA (substitui produto/objeções do tenant). */
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

    // Modo plataforma: monta o histórico a partir de platform_crm_messages.
    if (messages.length === 0 && conversationId) {
      const [convRes, msgsRes] = await Promise.all([
        supabase
          .from('platform_crm_conversations')
          .select('id, visitor_name, lead_id')
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

    // System prompt — VERBATIM do original; só o bloco de conhecimento adaptado.
    const systemPrompt = `Você é o COPILOTO DE VENDAS — estrategista que ajuda vendedores a responder clientes.

PRODUTO: NexvyBeauty
${visitorName ? `CLIENTE: ${visitorName}` : ''}

${PLATFORM_KNOWLEDGE_CONTEXT}

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
