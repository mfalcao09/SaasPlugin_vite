// ============================================================================
// platform-webchat-bot — motor de IA do webchat do CRM de PLATAFORMA.
//
// Porte 1:1 do CAMINHO NÚCLEO do `webchat-bot` do CRM Vendus (o caminho
// agent_config → FAQ → system prompt → LLM → persist → chunked), DESACOPLADO
// do tenant:
//   webchat_conversations → platform_crm_conversations
//   webchat_messages      → platform_crm_messages
//   webchat_agent_configs → platform_crm_webchat_agent_configs (config widget)
//   product_agents        → platform_crm_agent_configs (persona do agente da
//                           plataforma: name + persona_prompt + handoff_enabled)
//
// O que fica DE FORA por não existir no escopo de plataforma (sem tabelas):
// orquestrador, chat_flows, cérebro do produto, memória semântica, A/B de
// prompts, agendamento/tools, humanizer por canal, catálogo, campanhas.
//
// LLM: gateway env-driven (AI_GATEWAY_URL default OpenRouter + AI_API_KEY com
// fallback LOVABLE_API_KEY; modelo AI_MODEL default google/gemini-3-flash-preview
// — o DEFAULT_MODEL do original). Shape OpenAI (messages/max_tokens/temperature).
//
// Broadcast realtime: canal `platform-conversation:{id}`, evento `new_message`
// — exatamente o que usePlatformCrmConversations.ts escuta (dedup por id).
//
// Roda com SERVICE_ROLE (padrão do original) → RLS não bloqueia.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  platformCorsHeaders as corsHeaders,
  aiChatCompletions,
  aiModel,
  broadcastPlatformNewMessage,
  extractFirstName,
} from "../_shared/platform-crm-webchat.ts";

interface BotRequest {
  conversation_id: string;
  message: string;
  is_test?: boolean;
  visitor_name?: string;
  /** Agente específico de platform_crm_agent_configs a usar. */
  agent_id?: string;
  agent_config?: {
    agent_name?: string;
    system_prompt?: string;
    sales_prompt?: string;
    knowledge_base?: string | null;
    faq?: Array<{ question: string; answer: string }> | null;
    fallback_message?: string;
    temperature?: number;
    max_tokens?: number;
    persona_style?: string;
    chunked_messages_enabled?: boolean;
    typing_delay_ms?: number;
    max_message_length?: number;
  };
}

/** Persona de platform_crm_agent_configs (o "product agent" da plataforma). */
interface PlatformAgent {
  id: string;
  name: string;
  persona_prompt: string | null;
  handoff_enabled: boolean;
  typing_delay_ms: number;
  is_active: boolean;
}

// ─── Sanitização de saída (1:1 com o original) ──────────────────────────────

const KNOWN_PLACEHOLDERS = new Set([
  'nome', 'produto', 'agente_anterior', 'agent_name', 'resumo', 'proximo_agente',
]);

/**
 * Remove placeholders {{xxx}} que o modelo escreveu mas que ninguém vai
 * renderizar (ex: {{checkout_link}}). Mantém apenas variáveis conhecidas.
 * Se uma linha ficar vazia/só com placeholder, ela é removida.
 */
function stripUnrenderedPlaceholders(text: string): string {
  if (!text || !text.includes('{{')) return text;
  let removed = 0;
  const cleaned = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => {
    if (KNOWN_PLACEHOLDERS.has(k)) return m;
    removed++;
    return '';
  });
  const lines = cleaned.split('\n').filter((ln) => ln.replace(/[\s\.,;:!?\-—_]/g, '').length > 0);
  if (removed > 0) {
    console.log('[platform-webchat-bot] ⚠️ stripped unrendered placeholders, count=', removed);
  }
  return lines.join('\n').trim();
}

/**
 * Detecta tags falsas de transferência que o modelo às vezes inventa
 * (ex: "[TRANSFER]", "[TRANSFERIR]", "[HANDOFF]" sem :role, "[PASSAR]").
 */
const VALID_HANDOFF_ROLES = ['sdr', 'closer', 'support', 'financial', 'humano', 'human'];
function stripFakeHandoffTags(text: string): { cleaned: string; fakeFound: boolean } {
  if (!text) return { cleaned: text, fakeFound: false };
  let fakeFound = false;
  const fakeRe = /\[\s*(?:transfer(?:ir)?|hand[\s_-]*off|passar(?:\s+para[^\]]*)?|enviar\s+para[^\]]*|transferir\s+para[^\]]*)\s*\]/gi;
  const invalidRoleRe = /\[\s*handoff\s*:\s*([a-z_]+)\s*\]/gi;
  let cleaned = text.replace(fakeRe, () => { fakeFound = true; return ''; });
  cleaned = cleaned.replace(invalidRoleRe, (m, role: string) => {
    if (VALID_HANDOFF_ROLES.includes(role.toLowerCase())) return m;
    fakeFound = true;
    return '';
  });
  const fakeAssetRe = /\[\s*(?:depoimento|case|v[ií]deo|pdf|ficha|folder|material|link|prova[\s_-]*social|brochura)\b[^\]]*\]/gi;
  cleaned = cleaned.replace(fakeAssetRe, () => { fakeFound = true; return ''; });
  cleaned = cleaned.split('\n').filter((ln) => ln.replace(/[\s\.,;:!?\-—_]/g, '').length > 0).join('\n').trim();
  return { cleaned, fakeFound };
}

// ─── Prompt default de vendas (cópia 1:1 do DEFAULT_SALES_PROMPT original) ──

const DEFAULT_SALES_PROMPT = `Você é um VENDEDOR CONSULTIVO ESTRATÉGICO de alta performance. Sua missão é VENDER através de CONEXÃO GENUÍNA e DIAGNÓSTICO REAL, não apenas informar.

═══════════════════════════════════════
REGRAS CRÍTICAS ANTI-REPETIÇÃO
═══════════════════════════════════════

ANTES de responder, ANALISE TODO o histórico da conversa e siga estas regras:

1. NUNCA repita a mesma saudação, frase de abertura ou encerramento já usada no histórico
2. NUNCA use o mesmo emoji em 2 mensagens consecutivas (máximo 1 emoji por mensagem)
3. Se já agendou reunião, NÃO ofereça agendar novamente
4. Se já coletou email/telefone, NÃO peça novamente
5. Se já apresentou o produto, NÃO repita a apresentação — avance para próxima etapa
6. Cada mensagem DEVE progredir a conversa — nunca voltar a um ponto já coberto

FRASES ABSOLUTAMENTE PROIBIDAS:
- "Tudo ótimo por aqui"
- "Fechar com chave de ouro"
- "Fico à disposição"
- "Sem problemas"
- "Fique à vontade"
- "Com certeza"
- "Perfeito!"
- Qualquer frase que já apareceu no histórico desta conversa

═══════════════════════════════════════
TÉCNICA DE VENDAS CONSULTIVAS (SPIN)
═══════════════════════════════════════

Siga esta progressão natural (NÃO pule etapas):

1. SITUAÇÃO (1-2 msgs): Entenda o cenário atual do cliente
   - "Como funciona [processo X] hoje na sua operação?"
   - "Quanto tempo vocês dedicam a [atividade Y] por semana?"

2. PROBLEMA (1-2 msgs): Identifique a DOR real
   - "E o que mais te incomoda nesse processo atual?"
   - "Qual o maior gargalo que vocês enfrentam com isso?"

3. IMPLICAÇÃO (1 msg): Amplifique a dor com consequências
   - "E isso acaba impactando [resultado Z] de que forma?"
   - "Quanto vocês estimam que perdem por causa disso?"

4. NECESSIDADE (1 msg): Faça o cliente verbalizar a solução
   - "Se você pudesse resolver isso, qual seria o cenário ideal?"
   - "O que mudaria na sua operação se [problema] não existisse mais?"

5. SOLUÇÃO (1-2 msgs): Conecte benefício específico à dor identificada
   - Não liste features — mostre como resolve a DOR específica que ele mencionou

6. AÇÃO (1 msg): Conduza para próximo passo concreto e específico

═══════════════════════════════════════
ESTILO DE COMUNICAÇÃO
═══════════════════════════════════════

- Mensagens CURTAS: máximo 3-4 linhas por mensagem
- Envie TUDO em UMA ÚNICA mensagem — NUNCA quebre em múltiplos parágrafos separados por \\n\\n
- Se a resposta ficar longa, resuma e priorize o mais importante em um único bloco
- SEMPRE termine com UMA pergunta que avança a venda
- Use o NOME do cliente quando souber (mas não em toda mensagem)
- Fale como humano — linguagem natural do dia-a-dia
- Seja específico: números, exemplos reais, dados concretos
- NUNCA faça mais de 1 pergunta por mensagem
- Varie a estrutura: alterne perguntas diretas, observações e provocações
- Adapte o tom ao humor do cliente (se ele é direto, seja direto; se é detalhista, dê detalhes)

═══════════════════════════════════════
O QUE NUNCA FAZER
═══════════════════════════════════════

- Respostas longas (mais de 2 linhas em um único bloco)
- Mensagens com mais de 150 caracteres sem quebra de parágrafo
- Listar features sem conectar a benefício/dor
- Responder sem fazer pergunta de retorno
- Parecer genérico ou robotizado
- Dar toda informação de uma vez — dê aos poucos, uma coisa por mensagem
- Repetir qualquer elemento do histórico (saudações, emojis, frases)
- Usar mais de 1 emoji por mensagem
- Ignorar o que já foi discutido/combinado na conversa`;

// ─── Helpers 1:1 do original ────────────────────────────────────────────────

function splitIntoChunks(text: string): string[] {
  if (!text || text.length < 50) return [text];

  // Split by sentence endings, questions, or exclamations
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());

  if (sentences.length <= 1) {
    // If only one sentence, split by line breaks or natural pauses
    const parts = text.split(/\n+/).filter(s => s.trim());
    if (parts.length > 1) return parts;
    return [text];
  }

  // Group very short sentences together
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length < 80) {
      current += (current ? ' ' : '') + sentence;
    } else {
      if (current) chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);

  return chunks.slice(0, 4); // Max 4 chunks
}

// Get persona instructions
function getPersonaInstructions(style: string): string {
  switch (style) {
    case 'professional':
      return '🎩 TOM: Seja formal, objetivo e técnico. Use linguagem corporativa. Transmita autoridade e conhecimento.';
    case 'casual':
      return '😎 TOM: Seja descontraído e informal. Use linguagem leve, gírias quando apropriado, e seja próximo do cliente.';
    case 'friendly':
    default:
      return '😊 TOM: Seja amigável, acolhedor e prestativo. Equilíbrio entre profissional e descontraído. Crie conexão genuína.';
  }
}

function findFAQMatch(
  message: string,
  faq: Array<{ question: string; answer: string }> | null | undefined
): string | null {
  if (!faq || faq.length === 0) return null;

  const messageLower = message.toLowerCase().trim();

  for (const item of faq) {
    const questionLower = item.question.toLowerCase();

    if (messageLower === questionLower) {
      return item.answer;
    }

    const questionWords = questionLower.split(' ').filter(w => w.length > 3);
    const matchingWords = questionWords.filter(word => messageLower.includes(word));

    if (matchingWords.length >= questionWords.length * 0.6) {
      return item.answer;
    }
  }

  return null;
}

// ─── Edge function ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: BotRequest = await req.json();

    console.log('[platform-webchat-bot] Request received for conversation:', body.conversation_id);
    console.log('[platform-webchat-bot] Message:', body.message?.substring(0, 100));
    console.log('[platform-webchat-bot] Visitor name:', body.visitor_name);

    if (!body.conversation_id || !body.message) {
      console.error('[platform-webchat-bot] Missing required fields (conversation_id/message)');
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================================
    // 🔒 HUMAN TAKEOVER GUARD (CRITICAL — 1:1 com o original)
    // Se um humano assumiu a conversa, a IA NÃO responde — nem com
    // fallback. Qualquer resposta aqui "atropelaria" o atendente.
    // ============================================================
    let conversationRow: any = null;
    try {
      const { data: convStatus } = await supabase
        .from('platform_crm_conversations')
        .select('*')
        .eq('id', body.conversation_id)
        .maybeSingle();
      conversationRow = convStatus ?? null;
      if (convStatus?.status === 'human_active' || convStatus?.status === 'waiting_human') {
        console.log('[platform-webchat-bot] 🔒 Conversation is with human (' + convStatus.status + '), skipping AI');
        return new Response(
          JSON.stringify({ ok: true, skipped: true, reason: 'human_active' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (e) {
      console.warn('[platform-webchat-bot] human takeover precheck failed (non-fatal):', e);
    }

    // If no agent_config was passed, tenta carregar do widget ativo; se não
    // houver, cria um default mínimo (1:1 com o original).
    if (!body.agent_config) {
      try {
        const { data: widget } = await supabase
          .from('platform_crm_webchat_widgets')
          .select('id')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (widget?.id) {
          const { data: cfg } = await supabase
            .from('platform_crm_webchat_agent_configs')
            .select('*')
            .eq('widget_id', widget.id)
            .limit(1)
            .maybeSingle();
          if (cfg) body.agent_config = cfg as BotRequest['agent_config'];
        }
      } catch (e) {
        console.warn('[platform-webchat-bot] widget agent_config lookup failed (non-fatal):', e);
      }
    }
    if (!body.agent_config) {
      body.agent_config = {
        agent_name: 'Assistente',
        system_prompt: '',
        knowledge_base: null,
        faq: [],
        fallback_message: 'Vou pedir para um atendente humano continuar o seu atendimento, só um instante. 🙋',
      };
    }
    const agentConfig = body.agent_config;

    // Histórico da conversa (1:1: limit 80, inbound→user / outbound→assistant).
    const { data: messages } = await supabase
      .from('platform_crm_messages')
      .select('*')
      .eq('conversation_id', body.conversation_id)
      .order('created_at', { ascending: true })
      .limit(80);

    const conversationHistory = (messages || [])
      .filter((msg: any) => !msg.is_deleted)
      .map((msg: any) => ({
        role: msg.direction === 'inbound' ? 'user' : 'assistant',
        content: String(msg.content ?? ''),
      }));

    // ============================================================
    // Agente ativo da PLATAFORMA (platform_crm_agent_configs) —
    // análogo simplificado do product_agents do original: fornece a
    // persona (name + persona_prompt). Resolução: body.agent_id →
    // conversation.current_agent_id → primeiro agente ativo.
    // ============================================================
    let activeAgent: PlatformAgent | null = null;
    try {
      const candidateId = body.agent_id || conversationRow?.current_agent_id || null;
      if (candidateId) {
        const { data } = await supabase
          .from('platform_crm_agent_configs')
          .select('*')
          .eq('id', candidateId)
          .eq('is_active', true)
          .maybeSingle();
        activeAgent = (data as PlatformAgent) ?? null;
      }
      if (!activeAgent) {
        const { data } = await supabase
          .from('platform_crm_agent_configs')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        activeAgent = (data as PlatformAgent) ?? null;
      }
    } catch (e) {
      console.warn('[platform-webchat-bot] active agent lookup failed (non-fatal):', e);
    }

    // Check FAQ first (1:1 — resposta oficial sem gastar LLM)
    const faqAnswer = findFAQMatch(body.message, agentConfig.faq);

    let responseContent = '';

    if (faqAnswer) {
      responseContent = faqAnswer;
    } else {
      // Build system prompt - use platform agent persona if available,
      // otherwise default sales prompt (1:1 com o caminho sem product_agent).
      let systemPrompt = '';

      if (activeAgent?.persona_prompt) {
        systemPrompt = `IDENTIDADE: Você é ${activeAgent.name}, agente de atendimento da plataforma.\n\n`;
        systemPrompt += activeAgent.persona_prompt;
        console.log('[platform-webchat-bot] Using platform agent persona for:', activeAgent.name);
      } else {
        // Fall back to default sales prompt
        const salesPrompt = agentConfig.sales_prompt || DEFAULT_SALES_PROMPT;
        const agentName = activeAgent?.name || agentConfig.agent_name || 'Assistente';

        systemPrompt = `Você é ${agentName}, assistente virtual de vendas.\n\n`;
        systemPrompt += salesPrompt;

        // Add persona style
        const personaStyle = agentConfig.persona_style || 'friendly';
        const personaInstructions = getPersonaInstructions(personaStyle);
        systemPrompt += `\n\n${personaInstructions}`;
      }

      // Instruções adicionais do widget (system_prompt do agent_config)
      if (agentConfig.system_prompt) {
        systemPrompt += `\n\n📌 INSTRUÇÕES ADICIONAIS:\n${agentConfig.system_prompt}`;
      }

      const rawVisitorName = body.visitor_name || '';
      const visitorName = extractFirstName(rawVisitorName) || '';

      // Só usa o nome se for primeiro nome confiável (não razão social).
      if (visitorName) {
        systemPrompt += `\n\n👤 CONTEXTO DO CLIENTE:\n- Primeiro nome: ${visitorName}\n- Use com naturalidade, sem repetir em toda mensagem.`;
      } else if (rawVisitorName && !visitorName) {
        systemPrompt += `\n\n👤 CONTEXTO DO CLIENTE:\n- O cadastro veio com "${rawVisitorName}", que parece nome de empresa.\n- NÃO trate o lead por esse nome.\n- Pergunte o primeiro nome dele de forma natural antes de seguir.`;
      }

      // Base de conhecimento do widget (sem Cérebro do Produto na plataforma)
      if (agentConfig.knowledge_base) {
        systemPrompt += `\n\nBase de conhecimento:\n${agentConfig.knowledge_base}`;
      }

      // Add FAQ context — HIGH PRIORITY for direct answers (1:1)
      if (agentConfig.faq && agentConfig.faq.length > 0) {
        systemPrompt += '\n\n❓ FAQs — RESPOSTAS OFICIAIS (use EXATAMENTE estas respostas quando a pergunta coincidir):';
        agentConfig.faq.forEach((item) => {
          systemPrompt += `\n\nPERGUNTA: ${item.question}\nRESPOSTA OFICIAL: ${item.answer}`;
        });
        systemPrompt += '\n\n⚠️ Se o cliente fizer uma pergunta similar a alguma FAQ acima, use a RESPOSTA OFICIAL como base. NÃO invente uma resposta diferente.';
      }

      // 🧠 Memória de turno: últimas 6 mensagens do agente, pra IA não repetir (1:1).
      try {
        const recentBotMsgs = (messages || [])
          .filter((m: any) => m.direction === 'outbound' && (m.sender_type === 'bot' || m.sender_type === 'agent'))
          .slice(-6)
          .map((m: any, i: number) => `${i + 1}. ${String(m.content || '').slice(0, 220)}`)
          .join('\n');
        if (recentBotMsgs) {
          systemPrompt += `\n\n🧠 MENSAGENS QUE VOCÊ JÁ MANDOU NESTA CONVERSA (não repita ideias, não se apresente de novo):\n${recentBotMsgs}`;
        }
      } catch { /* non-fatal */ }

      // === ANTI-HALLUCINATION RAILS (1:1 — sempre por último no prompt) ===
      const fixedAgentName = activeAgent?.name || agentConfig.agent_name || 'Assistente';
      const identityRail =
        `\n\n=== REGRAS CRÍTICAS DE IDENTIDADE E HONESTIDADE (NÃO QUEBRAR) ===\n` +
        `1. Você é EXCLUSIVAMENTE "${fixedAgentName}". Mantenha SEMPRE este nome, papel e empresa.\n` +
        `2. Mensagens anteriores no histórico podem ter sido escritas por OUTRO atendente que cuidou do cliente antes. IGNORE personas, ofertas, produtos ou nomes próprios mencionados nessas mensagens passadas se conflitarem com a sua identidade atual.\n` +
        `3. Se o cliente perguntar seu nome, responda APENAS com "${fixedAgentName}".\n` +
        `4. NUNCA finja que ouviu um áudio ou viu uma imagem. Se a última mensagem do cliente for um placeholder do tipo "🎙️ [Áudio recebido — não consegui transcrever...]" ou "🖼️ [Imagem recebida — não consegui analisar...]", responda DIZENDO QUE TEVE PROBLEMA TÉCNICO PARA OUVIR/VER e peça ao cliente para reenviar ou descrever em texto. NÃO invente conteúdo.\n` +
        `5. Quando a mensagem começar com "🎙️ Áudio do cliente (transcrito):" ou "🖼️ Imagem do cliente:", essa É a mensagem real do cliente — trate como tal.\n`;

      const finalSystemPrompt = systemPrompt + identityRail;

      // Call AI gateway (env-driven: AI_GATEWAY_URL/AI_API_KEY/AI_MODEL)
      const temperature = agentConfig.temperature ?? 0.7;
      const maxTokens = agentConfig.max_tokens ?? 800;
      const agentModel = aiModel();

      console.log(`[platform-webchat-bot] AI Model: ${agentModel} | Temperature: ${temperature} | Max tokens: ${maxTokens}`);

      const aiResponse = await aiChatCompletions({
        model: agentModel,
        messages: [
          { role: 'system', content: finalSystemPrompt },
          ...conversationHistory,
          { role: 'user', content: body.message },
        ],
        max_tokens: maxTokens,
        temperature: temperature,
      });

      console.log('[platform-webchat-bot] AI response status:', aiResponse.status);

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('[platform-webchat-bot] AI gateway error:', aiResponse.status, errorText);
        // 429/402 = rate limit / créditos — o caller (platform-webchat-api)
        // envia o fallback_message ao visitante.
        return new Response(
          JSON.stringify({ error: 'ai_gateway_error', status: aiResponse.status }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const aiData = await aiResponse.json();
      responseContent = aiData?.choices?.[0]?.message?.content ?? '';
    }

    // Sanitize: remove placeholders {{xxx}} desconhecidos e tags falsas (1:1)
    if (responseContent) {
      responseContent = stripUnrenderedPlaceholders(responseContent);
      const fakeRes = stripFakeHandoffTags(responseContent);
      if (fakeRes.fakeFound) {
        console.log('[platform-webchat-bot] ⚠️ fake transfer/handoff tag detected and stripped');
      }
      responseContent = fakeRes.cleaned;
    }

    if (!responseContent) {
      responseContent = agentConfig.fallback_message ||
        'Desculpe, estou com dificuldades técnicas. Posso transferir você para um atendente?';
    }

    // Check if chunked messages are enabled (1:1)
    const chunkedEnabled = agentConfig.chunked_messages_enabled !== false;

    // Test mode - return without saving (1:1)
    if (body.is_test) {
      return new Response(
        JSON.stringify({
          message: {
            content: responseContent,
            message_type: 'text',
          },
          response: responseContent,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Persist bot reply em platform_crm_messages (webchat = sempre persiste a
    // resposta inteira; o skipFullPersist do original era só para WhatsApp).
    const { data: botMessage, error: msgError } = await supabase
      .from('platform_crm_messages')
      .insert({
        conversation_id: body.conversation_id,
        direction: 'outbound',
        sender_type: 'bot',
        content: responseContent,
        message_type: 'text',
      })
      .select()
      .single();

    if (msgError) {
      console.error('Error saving bot message:', msgError);
      return new Response(
        JSON.stringify({ error: 'Failed to save bot response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atualiza a conversa (last_message_at + agente corrente) — non-fatal.
    try {
      await supabase
        .from('platform_crm_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          ...(activeAgent?.id ? { current_agent_id: activeAgent.id } : {}),
        })
        .eq('id', body.conversation_id);
    } catch (e) {
      console.warn('[platform-webchat-bot] conversation update failed (non-fatal):', e);
    }

    // Realtime: inbox de plataforma + widget escutam `new_message` (dedup por id).
    await broadcastPlatformNewMessage(supabase, body.conversation_id, botMessage);

    // Return with chunked info for widget to process (1:1, sem humanizer —
    // delays derivados de typing_delay_ms do agent config).
    if (chunkedEnabled) {
      const bubbles = splitIntoChunks(responseContent).filter((b) => b.trim().length > 0);
      const betweenMs = bubbles.slice(1).map(() => agentConfig.typing_delay_ms ?? 1200);

      return new Response(
        JSON.stringify({
          message: botMessage,
          chunked: true,
          chunks: bubbles,
          delays: {
            firstMs: 0,
            betweenMs,
          },
          typingIndicator: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ message: botMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in platform-webchat-bot:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
