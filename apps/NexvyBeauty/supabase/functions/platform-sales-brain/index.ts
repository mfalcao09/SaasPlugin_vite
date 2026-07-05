// platform-sales-brain — F2 "O CÉREBRO": motor de resposta automática do
// WhatsApp de VENDAS da PLATAFORMA (número oficial Cloud API). É a peça que faz
// o funil de fundadoras vender sozinho.
//
// Fluxo (server-to-server; o webhook chama isto DEPOIS que o orquestrador liga o
// gatilho — este arquivo NÃO toca o webhook):
//   POST { conversation_id }
//   auth = service-role key  OU  x-brain-secret == BRAIN_INTERNAL_SECRET.
//   1. Carrega a conversa; só age se channel='whatsapp' E status='bot_active'.
//   2. Idempotência leve: se a última msg é outbound do bot com <5s, não repete.
//   3. Últimas 30 msgs (is_deleted=false) → histórico.
//   4. PERSONA: platform_crm_product_agents do produto (ativo + whatsapp);
//      escolhe o SDR/qualificação (agent_type/role contendo 'sdr'|'qualifica'),
//      senão o primeiro. System prompt com os campos ricos da persona.
//   5. CONHECIMENTO: bloco do produto (mesmo builder do platform-sales-copilot)
//      + escassez REAL da view founder_campaign_status.
//   6. Regras fixas: nunca desconto; piloto = Piloto Fundadora PAGO (nunca
//      "teste gratuito"); escassez só a real; pedido de humano/reclamação grave
//      → tag [HANDOFF_HUMANO] no fim.
//   7. LLM: mesmo gateway da casa (AI_API_KEY + AI_GATEWAY_URL, default
//      google/gemini-2.5-flash, override AI_SALES_BRAIN_MODEL).
//   8. [HANDOFF_HUMANO] → remove a tag, status='waiting_human' + needs_human=true;
//      senão mantém bot_active.
//   9. Entrega via Cloud API (mesmo padrão do platform-webchat-inbox:
//      connection active + decryptSecret + POST {phone_number_id}/messages),
//      persiste em platform_crm_messages (outbound/bot + metadata),
//      broadcastPlatformNewMessage, atualiza last_message_at.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { GRAPH_BASE, timingSafeEqual } from '../_shared/meta-graph.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
} from '../_shared/platform-crm-auth.ts';
import { broadcastPlatformNewMessage } from '../_shared/platform-crm-webchat.ts';

const DEFAULT_MODEL = 'google/gemini-2.5-flash';
// Janela de deduplicação: se o bot acabou de falar (<5s), não responde de novo.
const DEDUP_WINDOW_MS = 5000;
// Tag de escalada — o modelo emite no fim quando o lead pede humano / reclama grave.
const HANDOFF_TAG = '[HANDOFF_HUMANO]';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Auth server-to-server: aceita a service-role key (Authorization/apikey) OU o
 * segredo interno x-brain-secret. NÃO usa JWT de usuário — é chamada de máquina
 * (webhook → cérebro). O segredo interno é a auth real (config.toml verify_jwt=false).
 */
function isAuthorized(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const brainSecret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';

  const brainHeader = req.headers.get('x-brain-secret') ?? '';
  if (brainSecret && brainHeader && timingSafeEqual(brainHeader, brainSecret)) return true;

  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const apikey = req.headers.get('apikey') ?? '';
  if (serviceKey && ((bearer && timingSafeEqual(bearer, serviceKey)) || (apikey && timingSafeEqual(apikey, serviceKey)))) return true;

  return false;
}

/**
 * Entrega uma mensagem outbound no WhatsApp Cloud API (número de VENDAS).
 * Porte 1:1 do deliverViaWhatsAppCloud do platform-webchat-inbox: mono-connection
 * (a `active` mais recente), decrypt do token, dígitos do destino, POST no Graph.
 * Retorna o wamid pra casar com os statuses (sent/delivered/read) do webhook.
 */
async function deliverViaWhatsAppCloud(
  supabase: any,
  toPhone: string,
  content: string,
): Promise<{ wamid: string | null; error: string | null }> {
  try {
    const { data: conn } = await supabase
      .from('platform_crm_whatsapp_meta_connections')
      .select('id, phone_number_id, access_token_encrypted')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conn?.access_token_encrypted || !conn?.phone_number_id) {
      return { wamid: null, error: 'no_active_connection' };
    }
    const token = await decryptSecret(conn.access_token_encrypted as string);
    const to = String(toPhone ?? '').replace(/\D/g, '');
    if (!to) return { wamid: null, error: 'no_destination_phone' };

    const payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: content } };

    const res = await fetch(`${GRAPH_BASE}/${conn.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message ?? `graph ${res.status}`;
      console.error('[platform-sales-brain] entrega WhatsApp falhou:', msg);
      return { wamid: null, error: String(msg).slice(0, 300) };
    }
    return { wamid: data?.messages?.[0]?.id ?? null, error: null };
  } catch (e) {
    console.error('[platform-sales-brain] entrega WhatsApp exception:', e);
    return { wamid: null, error: String(e).slice(0, 300) };
  }
}

/**
 * Monta o bloco de conhecimento do produto — MESMO builder do platform-sales-copilot
 * (ordem deliberada: knowledge_base primeiro, contém o vocabulário obrigatório).
 * Escassez real via view founder_campaign_status (nunca inventada). Non-fatal:
 * qualquer falha aqui degrada, mas não derruba a resposta.
 */
function buildKnowledgeContext(
  product: Record<string, any> | null,
  campaign: Record<string, any> | null,
): string {
  if (!product) return '';
  let ctx = `\n## PRODUTO: ${product.name}\n`;
  if (product.description) ctx += `Descrição: ${product.description}\n`;

  if (product.knowledge_base) {
    ctx += `\n## OFERTA E BASE DE CONHECIMENTO\n${product.knowledge_base}\n`;
  }

  if (campaign) {
    ctx += campaign.campanha_encerrada
      ? `\nCAMPANHA: campanha encerrada — as ${campaign.total_vagas} vagas de fundadora foram preenchidas. NÃO ofertar condições de fundadora.\n`
      : `\nCAMPANHA: restam ${campaign.slots_left} de ${campaign.total_vagas} vagas de fundadora (dado real do banco, neste momento).\n`;
  }

  if (product.plans || product.pricing) {
    ctx += `\n## PLANOS E PREÇOS\n`;
    if (product.plans) ctx += `${product.plans}\n`;
    if (product.pricing) ctx += `Tabela vigente (JSON): ${JSON.stringify(product.pricing)}\n`;
  }
  if (product.guarantee) ctx += `\n## GARANTIA\n${product.guarantee}\n`;
  if (product.discount_policy) ctx += `\n## POLÍTICA DE DESCONTO\n${product.discount_policy}\n`;
  if (product.objections) ctx += `\n## OBJEÇÕES E RESPOSTAS\n${product.objections}\n`;
  if (product.pitch_2min) ctx += `\n## PITCH 2MIN\n${product.pitch_2min}\n`;
  if (product.icp) ctx += `\n## ICP (CLIENTE IDEAL)\n${product.icp}\n`;
  return ctx;
}

/** Seleciona a persona SDR/qualificação; senão a primeira ativa (determinístico). */
function pickSdrPersona(agents: Array<Record<string, any>>): Record<string, any> | null {
  if (!agents.length) return null;
  const isSdr = (a: Record<string, any>) => {
    const hay = `${a.agent_type ?? ''} ${a.role ?? ''} ${a.name ?? ''}`.toLowerCase();
    return hay.includes('sdr') || hay.includes('qualifica');
  };
  return agents.find(isSdr) ?? agents[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const conversationId: string | null = body?.conversation_id ?? null;
    if (!conversationId) return json({ error: 'conversation_id is required' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1) Conversa — só age em WhatsApp com bot ativo.
    const { data: conversation, error: convError } = await supabase
      .from('platform_crm_conversations')
      .select('id, channel, status, product_id, visitor_name, visitor_phone, visitor_whatsapp')
      .eq('id', conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      return json({ error: 'Conversation not found' }, 404);
    }
    if (conversation.channel !== 'whatsapp') {
      return json({ skipped: 'not_whatsapp', channel: conversation.channel });
    }
    if (conversation.status !== 'bot_active') {
      return json({ skipped: 'bot_not_active', status: conversation.status });
    }

    // 3) Histórico: últimas 30 msgs vivas (desc → reverse pra ordem cronológica).
    const { data: rawMsgs } = await supabase
      .from('platform_crm_messages')
      .select('content, sender_type, direction, is_deleted, created_at')
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(30);

    const historyDesc = rawMsgs || [];

    // 2) Idempotência leve: última msg = outbound do bot com <5s ⇒ não responde.
    const latest = historyDesc[0];
    if (
      latest &&
      latest.direction === 'outbound' &&
      latest.sender_type === 'bot' &&
      Date.now() - new Date(latest.created_at).getTime() < DEDUP_WINDOW_MS
    ) {
      return json({ skipped: 'recent_bot_message' });
    }

    const history = historyDesc
      .filter((m: any) => typeof m.content === 'string' && m.content.trim().length > 0)
      .reverse();
    const messages = history.map((m: any) => ({
      role: m.sender_type === 'visitor' ? 'user' : 'assistant',
      content: m.content,
    }));

    if (messages.length === 0) {
      return json({ skipped: 'no_messages' });
    }

    // 4) PERSONA — agentes do produto ativos e habilitados no WhatsApp.
    let persona: Record<string, any> | null = null;
    if (conversation.product_id) {
      const { data: agents } = await supabase
        .from('platform_crm_product_agents')
        .select(
          'id, name, agent_type, primary_objective, tone_style, additional_prompt, prohibited_phrases, qualification_schema, is_active, active_in_whatsapp, product_id',
        )
        .eq('product_id', conversation.product_id)
        .eq('is_active', true)
        .eq('active_in_whatsapp', true);
      persona = pickSdrPersona((agents as Array<Record<string, any>>) || []);
    }

    if (!persona) {
      // Sem persona não há motor — não improvisa uma voz genérica no número oficial.
      console.warn('[platform-sales-brain] sem persona ativa no WhatsApp para product_id:', conversation.product_id);
      return json({ skipped: 'no_active_persona' });
    }

    // 5) CONHECIMENTO do produto + escassez real da campanha fundadora.
    let product: Record<string, any> | null = null;
    let campaign: Record<string, any> | null = null;
    if (conversation.product_id) {
      const [productRes, campaignRes] = await Promise.all([
        supabase
          .from('platform_crm_products')
          .select(
            'name, description, pitch_2min, icp, objections, guarantee, discount_policy, plans, pricing, knowledge_base',
          )
          .eq('id', conversation.product_id)
          .maybeSingle(),
        // View de 1 linha derivada de organizations (30 − fundadoras ativas):
        // escassez VERDADEIRA lida do banco em tempo real, nunca inventada.
        supabase
          .from('founder_campaign_status')
          .select('total_vagas, fundadoras_ativas, slots_left, campanha_encerrada')
          .limit(1)
          .maybeSingle(),
      ]);
      product = (productRes.data as Record<string, any> | null) ?? null;
      campaign = (campaignRes.data as Record<string, any> | null) ?? null;
    }

    const knowledgeContext = buildKnowledgeContext(product, campaign);
    const productName = product?.name ?? 'NexvyBeauty';
    const visitorName = conversation.visitor_name ?? null;

    // Campos ricos da persona → identidade + objetivo + tom + regras próprias.
    const prohibited = Array.isArray(persona.prohibited_phrases) && persona.prohibited_phrases.length
      ? persona.prohibited_phrases.map((p: string) => `- ${p}`).join('\n')
      : '';
    const qualification = persona.qualification_schema
      ? JSON.stringify(persona.qualification_schema)
      : '';

    // 6) System prompt: persona + conhecimento + REGRAS FIXAS do cérebro.
    const systemPrompt = `Você é ${persona.name}, atendente de VENDAS por WhatsApp do produto ${productName}.
${persona.primary_objective ? `\nSEU OBJETIVO PRINCIPAL: ${persona.primary_objective}` : ''}
${persona.tone_style ? `\nTOM E ESTILO: ${persona.tone_style}` : ''}
${visitorName ? `\nCLIENTE: ${visitorName}` : ''}
${persona.additional_prompt ? `\nINSTRUÇÕES ADICIONAIS DA PERSONA:\n${persona.additional_prompt}` : ''}
${qualification ? `\nESQUEMA DE QUALIFICAÇÃO (colete estes dados naturalmente na conversa): ${qualification}` : ''}
${prohibited ? `\nFRASES PROIBIDAS (nunca use):\n${prohibited}` : ''}
${knowledgeContext}

═══════════════════════════════════════
REGRAS INVIOLÁVEIS DO CÉREBRO
═══════════════════════════════════════
1. NUNCA ofereça desconto. Se pedirem, reancore na garantia ("o risco é meu") — não no preço.
2. "piloto" = Piloto Fundadora — programa PAGO com acompanhamento 1-a-1 e garantia de devolução. NUNCA descreva como "teste gratuito", "trial" ou "demonstração".
3. Escassez SÓ a real (o dado da campanha acima, quando presente). NUNCA invente urgência falsa.
4. Preços e dados do produto: use SOMENTE o que está no conhecimento acima. Se não tiver, diga que confirma e não invente.
5. Se o cliente PEDIR falar com humano, ou fizer uma RECLAMAÇÃO GRAVE, encerre sua resposta com a tag exata ${HANDOFF_TAG} na última linha (o sistema transfere para um atendente humano).

═══════════════════════════════════════
COMO RESPONDER
═══════════════════════════════════════
- Otimizado para WhatsApp: curto, direto, humano. 2-5 linhas.
- NÃO use emojis. NÃO use markdown (asteriscos, listas). Texto corrido natural.
- Use o nome do cliente quando souber.
- Sempre avance a conversa (qualifique ou proponha próximo passo).`;

    // 7) LLM: gateway da casa. Task fixa o modelo (default gemini-2.5-flash,
    // override AI_SALES_BRAIN_MODEL) — mesmo transporte do platform-sales-copilot.
    const apiKey = Deno.env.get('AI_API_KEY') ?? '';
    if (!apiKey) {
      console.error('[platform-sales-brain] AI_API_KEY não configurada.');
      return json({ error: 'AI_API_KEY não configurada na plataforma.' }, 500);
    }
    const gatewayBase = (Deno.env.get('AI_GATEWAY_URL') ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const model = Deno.env.get('AI_SALES_BRAIN_MODEL') ?? DEFAULT_MODEL;

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
      console.error('[platform-sales-brain] AI gateway error:', response.status, errorText.slice(0, 200));
      return json({ error: `Erro do provedor de IA: ${response.status}` }, 502);
    }

    const completion = await response.json().catch(() => null);
    let reply: string = completion?.choices?.[0]?.message?.content?.trim?.() ?? '';
    if (!reply) {
      console.error('[platform-sales-brain] completion vazia:', JSON.stringify(completion)?.slice(0, 300));
      return json({ error: 'O modelo não retornou resposta.' }, 502);
    }

    // 8) Handoff: detecta a tag, remove do texto e escala a conversa.
    const needsHandoff = reply.includes(HANDOFF_TAG);
    if (needsHandoff) {
      // Remove a tag (e limpa quebras/espaços que sobraram no fim).
      reply = reply.split(HANDOFF_TAG).join('').replace(/\s+$/, '').trim();
    }
    if (!reply) {
      // Só a tag e nada de texto útil — não manda bolha vazia, mas ainda escala.
      reply = 'Já vou te transferir para um atendente humano, um instante.';
    }

    // 9) Persiste a resposta ANTES de entregar (mesmo padrão do webchat-inbox:
    // a mensagem existe no CRM mesmo se a entrega externa falhar).
    const { data: message, error: msgError } = await supabase
      .from('platform_crm_messages')
      .insert({
        conversation_id: conversationId,
        direction: 'outbound',
        sender_type: 'bot',
        content: reply,
        content_type: 'text',
        metadata: { channel: 'whatsapp_cloud', agent_id: persona.id, delivery_status: 'sent' },
      })
      .select('*')
      .single();

    if (msgError || !message) {
      console.error('[platform-sales-brain] insert msg error:', msgError);
      return json({ error: 'Failed to persist reply' }, 500);
    }

    // Entrega no WhatsApp Cloud (número de vendas).
    const dest = conversation.visitor_whatsapp ?? conversation.visitor_phone ?? '';
    const { wamid, error: deliveryError } = await deliverViaWhatsAppCloud(supabase, dest, reply);

    const deliveryMeta = wamid
      ? { ...(message.metadata ?? {}), wamid, delivery_status: 'sent', channel: 'whatsapp_cloud', agent_id: persona.id }
      : { ...(message.metadata ?? {}), delivery_status: 'failed', delivery_error: deliveryError, agent_id: persona.id };

    const { data: updated } = await supabase
      .from('platform_crm_messages')
      .update({ metadata: deliveryMeta })
      .eq('id', message.id)
      .select('*')
      .single();
    const finalMessage = updated ?? message;
    if (!wamid) {
      console.error('[platform-sales-brain] WhatsApp NÃO entregue:', deliveryError);
    }

    // Status da conversa: handoff → fila humana; senão mantém bot ativo.
    // last_message_at sempre atualizado (a conversa acabou de receber uma msg).
    const convUpdate: Record<string, unknown> = { last_message_at: new Date().toISOString() };
    if (needsHandoff) {
      convUpdate.status = 'waiting_human';
      convUpdate.needs_human = true;
    }
    await supabase
      .from('platform_crm_conversations')
      .update(convUpdate)
      .eq('id', conversationId);

    // Broadcast no canal da conversa (mesmo canal/evento que o front assina).
    await broadcastPlatformNewMessage(supabase, conversationId, finalMessage);

    return json({
      success: true,
      handoff: needsHandoff,
      agent_id: persona.id,
      model,
      ...(wamid ? {} : { delivery_warning: deliveryError ?? 'entrega falhou' }),
    });
  } catch (error) {
    console.error('[platform-sales-brain] error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Erro desconhecido' },
      500,
    );
  }
});
