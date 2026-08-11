// platform-sales-brain — F2 "O CÉREBRO": motor de resposta automática do
// WhatsApp de VENDAS da PLATAFORMA (número oficial Cloud API). É a peça que faz
// o funil de vendas rodar sozinho.
//
// Fluxo (server-to-server; o webhook chama isto DEPOIS que o orquestrador liga o
// gatilho — este arquivo NÃO toca o webhook):
//   POST { conversation_id }
//   auth = service-role key  OU  x-brain-secret == BRAIN_INTERNAL_SECRET.
//   1. Carrega a conversa; só age se channel='whatsapp' E status='bot_active'.
//   2. ANTI-RE-ENTREGA: se a inbound mais recente tem wa_timestamp > 10 min de
//      idade (Meta re-entregou msg velha), EXIT — não se reapresenta.
//   3. DEBOUNCE/AGREGAÇÃO: se a lead ainda está digitando (última inbound < ~25s),
//      aguarda e recarrega; se surgiu inbound mais nova, EXIT ('superseded') — a
//      invocação da mensagem mais nova responde por todas.
//   4. Idempotência leve: se a última msg é outbound do bot com <5s, não repete.
//   5. Últimas 30 msgs (is_deleted=false) → histórico.
//   6. MEMÓRIA DE QUALIFICAÇÃO: carrega o lead da conversa (estado BANT + o que
//      já sabemos em metadata) e injeta no prompt — a Duda nunca repergunta.
//   7. PERSONA (linha travada Duda→Bia): platform_crm_product_agents do produto
//      (ativo + whatsapp). ROTEAMENTO POR CONVERSA — se current_agent_id aponta
//      um agente ativo, é ELE quem fala (a Bia continua o que a Duda passou);
//      senão a Duda (SDR) abre e persistimos current_agent_id=duda.id.
//   8. CONHECIMENTO: bloco do produto (mesmo builder do platform-sales-copilot)
//      + preço COMPARADO DO PRESENTE (de-para em LINKS DE PAGAMENTO, do banco).
//   9. Regras fixas: nunca desconto; SEM Piloto Fundadora e SEM garantia de
//      devolução (risco reduzido por PROVA + arrependimento 7d); ZERO escassez —
//      NÃO EXISTE DATA DE SUBIDA de preço (decisão Marcelo, 2026-08-04), então a
//      âncora é o preço comparado de HOJE (fato verificável agora), nunca uma
//      promessa sobre o futuro; humano/reclamação grave → [HANDOFF_HUMANO];
//      [ESCALAR_HUMANO] SÓ p/ pedido de humano/caso sensível — venda NUNCA é
//      rejeitada (diretiva Marcelo 05/07: "pagou é cliente"; score roteia OFERTA,
//      não aceite/rejeite). A instrução de [PASSAR_BIA] saiu do prompt em
//      2026-08-04 (a Bia foi desativada) — o mecanismo continua, mas só se arma
//      com closer ATIVO; ver 11b.
//  10. LLM: mesmo gateway da casa (AI_API_KEY + AI_GATEWAY_URL).
//  11. GUARDRAILS DE FORMA (pós-processamento): sanitize de vocabulário, corte na
//      1ª pergunta, divisão em até 3 bolhas curtas — cada bolha é entregue via
//      Cloud API com pausa proporcional, persistida (wamid próprio) e broadcast.
//  11b. [PASSAR_BIA] (só Duda; a tag NÃO é mais instruída no prompt): resolve o
//      closer ATIVO ANTES de tocar no texto. SÓ com closer a tag vira transição
//      calorosa + current_agent_id=bia.id (a próxima msg da lead ativa a Bia);
//      SEM closer a tag é apenas removida e a Duda segue — a lead nunca ouve
//      "te deixo com a Bia" sem a Bia existir.
//  12. Handoff/escalada → status='waiting_human' + needs_human=true; última bolha
//      vira transição calorosa. Passagem Duda→Bia mantém bot_active. Senão idem.
//  13. MEMÓRIA (pós-resposta): 2ª chamada LLM barata extrai fatos → atualiza o
//      lead (bant_*, temperature, name) e grava o estado em leads.metadata.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { GRAPH_BASE, timingSafeEqual } from '../_shared/meta-graph.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
} from '../_shared/platform-crm-auth.ts';
import { broadcastPlatformNewMessage } from '../_shared/platform-crm-webchat.ts';
import {
  isSdrAgent,
  isCloserAgent,
  isRetentionAgent,
  pickSdrPersona,
  resolvePersonaForConversation,
} from '../_shared/agent-routing.ts';
import { type CtwaReferral, ctwaAdSummary, parseCtwaReferral } from '../_shared/ctwa-attribution.ts';
import { debounceWaitMs, inboundEpochMs, slidingDebounceExtraMs } from '../_shared/inbound-clock.ts';
import { sanitizeReply } from '../_shared/reply-sanitizer.ts';
import {
  type ConversationState,
  politica,
  predicadoTravaOtimista,
  reduzir,
  type TurnEvents,
} from '../_shared/conversation-state.ts';
import { BLOCO_TAGS_CLASSIFICADORAS, extrairTags } from '../_shared/turn-tags.ts';
import { aplicarGateBolha } from '../_shared/bubble-gate.ts';
import { sendTelegramAlert, sendTelegramAlertThrottled } from '../_shared/platform-alerts.ts';
import {
  type ConversationConnectionHints,
  connectionErrorCode,
  reportUnresolvedConnection,
  resolveConnectionForConversation,
} from '../_shared/whatsapp-connection.ts';
import {
  buildInactivityRepertoire,
  parseRepertoireStage,
} from '../_shared/inactivity-cadence.ts';

const DEFAULT_MODEL = 'google/gemini-2.5-flash';
// Canais de WhatsApp que o cérebro atende. 'whatsapp' = Meta Cloud API (número
// oficial); 'whatsapp_evolution' = Evolution (número não-oficial via QR, criado
// pelo platform-evolution-webhook). Não é lista de "canais existentes": webchat e
// Instagram têm outro motor e continuam de fora.
const BRAIN_CHANNELS: string[] = ['whatsapp', 'whatsapp_evolution'];
// Janela de deduplicação: se o bot acabou de falar (<5s), não responde de novo.
const DEDUP_WINDOW_MS = 5000;
// Debounce: agrega mensagens curtas da lead que chegam em rajada numa só resposta.
// 12s (era 25s): a Nina usa 10s e o ritmo dela foi aprovado; 12s dá margem pra lead
// B2B, que digita frases mais longas. 25s deixava a lead no vácuo tempo demais.
const DEBOUNCE_MS = Number(Deno.env.get('AI_BRAIN_DEBOUNCE_MS') ?? '12000');
const DEBOUNCE_MAX_EXTEND = Number(Deno.env.get('AI_BRAIN_DEBOUNCE_MAX_EXTEND') ?? '3');
const DEBOUNCE_MAX_TOTAL_MS = Number(Deno.env.get('AI_BRAIN_DEBOUNCE_MAX_TOTAL_MS') ?? String(DEBOUNCE_MS * 3));
// Re-entrega velha do Meta: inbound com timestamp mais velho que isto = ignorar
// (bug real: Meta re-entregou msg de 13 min atrás e a Duda se reapresentou).
const STALE_REDELIVERY_MS = 10 * 60 * 1000;
// ─── CLAIM DA CONVERSA (serialização entre invocações) ──────────────────────
// O webhook dispara UMA invocação por mensagem recebida. Duas mensagens da lead
// em rajada (texto + áudio, 1,7s de intervalo) viravam DUAS invocações rodando
// lado a lado e ENTRELAÇANDO as bolhas: duas saudações, duas explicações, a
// mesma pergunta final duas vezes — diferindo por uma vírgula (bug real
// 2026-08-04). O debounce não resolvia porque ele não COALESCE, ele ALINHA: as
// duas dormem e acordam a ~2s uma da outra e recarregam o histórico no mesmo
// instante, quando nenhuma escreveu ainda.
// Agora toda invocação tenta TOMAR a conversa (UPDATE condicional com RETURNING,
// atômico no Postgres). Quem não toma SAI na hora — nunca espera a vez: fila só
// reordenaria o entrelaçamento e ainda o disfarçaria de robustez.
// TTL: invocação que morre (OOM/timeout do isolate, antes do release) não pode
// travar a conversa para sempre. 120s cobre o pior caso real com folga —
// debounce 12s + pausa de leitura + LLM + até 4 bolhas com pausa de digitação de
// até 8s cada + a 2ª chamada de LLM da memória.
const BRAIN_CLAIM_TTL_MS = Number(Deno.env.get('AI_BRAIN_CLAIM_TTL_MS') ?? '120000');
// HAND-BACK: mensagem que entra no banco DEPOIS do reload do vencedor não cabe
// na resposta dele, e a invocação dela já morreu no claim. Sem hand-back
// trocaríamos resposta dobrada por lead GHOSTADA — que é pior. O caso não é
// hipotético: o áudio vira linha ~12s depois do próprio wa_timestamp (passa por
// transcrição), ou seja, DEPOIS da janela de debounce da mensagem irmã.
// Teto de saltos: cada salto responde mensagem real da lead; acima disso é
// sintoma de loop, não de conversa.
const HANDBACK_MAX_DEPTH = 3;
// Guardrails de forma (reclamação real: textão + várias perguntas juntas).
// INVARIANTE deste pipeline: nenhuma função pode REDUZIR o número de caracteres
// entregues — só reagrupar. Perder o preço/link no meio da palavra custa a venda;
// uma bolha comprida custa só estilo. Bug > estilo.
const MAX_BUBBLES = 4;      // era 3 — 3 forçava o merge que decepava a última bolha
const MAX_BUBBLE_CHARS = 160; // era 300 — 300 era "textão" e saturava a pausa
// ─── Ritmo de digitação humana ──────────────────────────────────────────────
// Humano em celular: 25-40 wpm ≈ 2,1-3,3 chars/s ≈ 300-470 ms/char.
// 70 ms/char ≈ 171 wpm — de propósito 4-6x mais rápido que humano (ninguém espera
// 2 min por um SDR). O que torna a compressão aceitável é o INDICADOR DE DIGITANDO:
// com "digitando…" visível, "digitador rápido" passa; sem ele, nada passa.
// Estado anterior: 30 ms/char com teto de 4s → saturava em 134 chars, ou seja
// QUASE TODA bolha saía com 4s fixos (intervalo determinístico = assinatura de bot).
const TYPING_MS_PER_CHAR = Number(Deno.env.get('AI_BRAIN_TYPING_MS_PER_CHAR') ?? '70');
const TYPING_FLOOR_MS = 1400;
const TYPING_CAP_MS = 8000;
// Jitter ±18% mata a assinatura determinística. Zerável por env no smoke test.
const TYPING_JITTER = Number(Deno.env.get('AI_BRAIN_TYPING_JITTER') ?? '0.18');
// Tempo de "ler o que a lead escreveu" antes da 1ª bolha. Leitura adulta pt-BR
// ~200 wpm ≈ 60 ms/char, comprimido pelo mesmo motivo acima.
const READ_MS_PER_CHAR = 18;
const READ_FLOOR_MS = 1200;
const READ_CAP_MS = 4200;
// Tags de escalada — o modelo emite no fim.
const HANDOFF_TAG = '[HANDOFF_HUMANO]';   // lead pediu humano / reclamou grave
const ESCALATE_TAG = '[ESCALAR_HUMANO]';  // SÓ pediu-humano/caso sensível — JAMAIS por perfil (venda nunca é rejeitada)
// Passagem interna SDR→closer. NÃO é escalada humana — troca o agente da conversa
// (current_agent_id) e o closer assume na PRÓXIMA mensagem da lead; a conversa
// segue bot_active o tempo todo.
// ⚠️ 2026-08-04: o prompt NÃO instrui mais esta tag (a Bia foi desativada). O
// mecanismo fica de pé para o dia em que houver closer, mas é CONDICIONADO: sem
// closer ativo a tag é só descartada — nada de transição é dito à lead (ver 11a).
const PASS_BIA_TAG = '[PASSAR_BIA]';
// [ENVIAR_RAIOX] — a Duda DISPARA A ISCA NO AUTOMÁTICO: o handler chama demo-start
// (nome+whatsapp da própria conversa), recebe /implantacao/<token> e entrega o link
// na mesma resposta. Sem humano de plantão (pedido explícito Marcelo 2026-07-19 —
// o prompt já mandava "disparar a isca" sem existir braço para isso).
const RAIOX_TAG = '[ENVIAR_RAIOX]';
// Bolha de transição calorosa da passagem SDR→closer. SÓ pode sair quando existe
// closer ATIVO: prometer uma especialista que não vai falar é pior que não passar.
const PASS_BIA_MSG = 'Te deixo com a Bia, nossa especialista — ela já sabe tudo que a gente conversou 💚';
// Mensagem calorosa de transição ao escalar (nunca "você não se encaixa").
const WARM_HANDOFF_MSG = 'Vou te conectar com nosso time pra achar o melhor caminho pra você 💚';

// Continuity: Camila device opening arrives as sender_type=agent (fromMe), not bot.
// Count both as "we already spoke" so the brain continues instead of re-greeting.
// CRM dedup (recent_bot_message) stays bot-only — device outbound must NOT block brain.
function isOurOutbound(m: { direction?: string; sender_type?: string }): boolean {
  return m.direction === 'outbound'
    && (m.sender_type === 'bot' || m.sender_type === 'agent');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

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
 * Entrega uma mensagem outbound no WhatsApp Cloud API RESPONDENDO PELO MESMO
 * NÚMERO QUE RECEBEU a mensagem da lead: a conexão sai de
 * resolveConnectionForConversation (conversation.meta_connection_id → product_id
 * → única ativa). Se a resolução for ambígua (2+ ativas e nada resolve), NÃO
 * envia — loga + alerta. Responder pelo número errado (outra thread no aparelho
 * da lead) é pior do que falhar visível.
 * Retorna o wamid pra casar com os statuses (sent/delivered/read) do webhook.
 */
/**
 * Pausa de "digitação" proporcional ao texto, com piso, teto e jitter.
 * O jitter existe para matar a assinatura determinística: antes, QUALQUER bolha
 * ≥134 chars saía com exatamente 4000ms — intervalo idêntico e mensurável por
 * quem quisesse detectar bot.
 */
function typingPauseMs(text: string): number {
  const base = Math.min(Math.max(text.length * TYPING_MS_PER_CHAR, TYPING_FLOOR_MS), TYPING_CAP_MS);
  const jitter = 1 + (Math.random() * 2 - 1) * TYPING_JITTER;
  return Math.round(base * jitter);
}

// ─── Ritmo humano no canal Evolution (PR-BDR-13) — SÓ Camila. ────────────────
// MEDIDO 2026-08-05: bolhas de 60-100 chars caindo a cada ~6s — 70ms/char com
// teto de 8s satura em ~114 chars e vira assinatura de robô ("mensagens grandes
// chegando em sequência", nas palavras do dono). Humano no celular digita
// ~6-9 chars/s. 120ms/char ≈ 8,3 chars/s: bolha de 100 chars ≈ 12s, teto 22s.
// A pausa longa é SEGURA porque o portão pós-pausa (PR-BDR-12) aborta o lote
// se a lead falar durante o "digitando". A Duda no oficial NÃO muda — a
// cadência dela é alçada da controladora.
const EVO_TYPING_MS_PER_CHAR = Number(Deno.env.get('AI_BRAIN_EVO_TYPING_MS_PER_CHAR') ?? '120');
const EVO_TYPING_FLOOR_MS = 3500;
const EVO_TYPING_CAP_MS = 22000;

function evoTypingPauseMs(text: string): number {
  const base = Math.min(
    Math.max(text.length * EVO_TYPING_MS_PER_CHAR, EVO_TYPING_FLOOR_MS),
    EVO_TYPING_CAP_MS,
  );
  const jitter = 1 + (Math.random() * 2 - 1) * TYPING_JITTER;
  return Math.round(base * jitter);
}

/**
 * Marca a última inbound como lida E liga o indicador "digitando…" no WhatsApp.
 * Sem isto, aumentar a pausa só produz SILÊNCIO suspeito — é o indicador que
 * transforma espera em "ela está escrevendo". Nem a Nina tem isso.
 *
 * NON-FATAL por contrato: qualquer falha aqui (versão do Graph sem suporte,
 * token, wamid ausente) é logada e ignorada — nunca aborta a entrega.
 */
async function sendTypingIndicator(
  supabase: any,
  conversation: ConversationConnectionHints | null,
  inboundWamid: string | null,
): Promise<void> {
  if (!inboundWamid) return; // régua de inatividade não tem inbound recente
  try {
    const resolved = await resolveConnectionForConversation(supabase, conversation);
    const conn = resolved.conn;
    if (!conn) return;
    const token = await decryptSecret(conn.access_token_encrypted as string);
    await fetch(`${GRAPH_BASE}/${conn.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: inboundWamid,
        typing_indicator: { type: 'text' },
      }),
    });
  } catch (e) {
    console.warn('[platform-sales-brain] typing indicator falhou (ignorado):', String(e).slice(0, 200));
  }
}

/**
 * "Digitando…" no canal Evolution. NÃO existe equivalente ao par
 * read+typing_indicator do Graph (que se pendura num wamid): a Evolution expõe
 * presença de chat (`/chat/sendPresence`, type 'presence' no platform-evolution-send),
 * que é justamente o sinal que transforma a pausa em "ela está escrevendo".
 * NON-FATAL pelo mesmo contrato do irmão Graph: qualquer falha aqui é logada e
 * ignorada — a pausa e a entrega seguem.
 */
async function sendEvolutionPresence(
  supabase: any,
  conversation: Record<string, any> | null,
  toPhone: string,
  delayMs: number,
): Promise<void> {
  const conversationId = typeof conversation?.id === 'string' ? conversation.id : null;
  const instanceId = typeof conversation?.evolution_instance_id === 'string'
    ? conversation.evolution_instance_id
    : null;
  const to = String(toPhone ?? '').replace(/\D/g, '');
  if (!instanceId || !to) {
    console.warn(
      `[platform-sales-brain] presença Evolution pulada conversation_id=${conversationId} instance_id=${instanceId ?? 'null'} to_digits=${to.length}`,
    );
    return;
  }
  // Evolution exige `delay` (ms que o composing fica ativo). Sem ele → 400 e
  // silêncio no aparelho; a pausa local continua, mas sem "digitando…".
  const delay = Math.max(1000, Math.min(60_000, Math.round(delayMs || 5000)));
  try {
    const productId = await evolutionInstanceProductId(supabase, instanceId, conversationId);
    if (!productId) return; // já logado como error lá dentro
    const meta = (conversation?.metadata && typeof conversation.metadata === 'object')
      ? conversation.metadata as Record<string, unknown>
      : {};
    const waLid = typeof meta.wa_lid === 'string' && meta.wa_lid.trim()
      ? meta.wa_lid.trim()
      : null;
    const { data, error } = await supabase.functions.invoke('platform-evolution-send', {
      body: {
        product_id: productId,
        instance_id: instanceId,
        type: 'presence',
        to,
        ...(waLid ? { wa_lid: waLid } : {}),
        payload: { state: 'composing', delay },
      },
    });
    // Mesma régua do text send: invoke pode devolver HTTP 200 com {ok:false}
    // (Evolution 400) — checar só `error` engolia a falha do digitando.
    if (error || (data as any)?.ok === false || (data as any)?.error) {
      console.warn(
        `[platform-sales-brain] presença Evolution falhou (ignorado) conversation_id=${conversationId} reason=${
          error?.message ?? String(JSON.stringify(data ?? null)).slice(0, 300)
        }`,
      );
    }
  } catch (e) {
    console.warn(
      `[platform-sales-brain] presença Evolution exception (ignorado) conversation_id=${conversationId}:`,
      String(e).slice(0, 200),
    );
  }
}

/** Roteia o "digitando…" pelo canal da conversa. Meta = código de hoje, intacto. */
async function sendTypingSignal(
  supabase: any,
  conversation: Record<string, any> | null,
  inboundWamid: string | null,
  toPhone: string,
  pauseMs = 0,
): Promise<void> {
  if (conversation?.channel === 'whatsapp_evolution') {
    await sendEvolutionPresence(supabase, conversation, toPhone, pauseMs);
    return;
  }
  await sendTypingIndicator(supabase, conversation as ConversationConnectionHints | null, inboundWamid);
}

async function deliverViaWhatsAppCloud(
  supabase: any,
  conversation: ConversationConnectionHints | null,
  toPhone: string,
  content: string,
): Promise<{ wamid: string | null; error: string | null; connectionId: string | null }> {
  try {
    const resolved = await resolveConnectionForConversation(supabase, conversation);
    const conn = resolved.conn;
    if (!conn) {
      await reportUnresolvedConnection('platform-sales-brain', resolved, {
        conversation_id: conversation?.id ?? null,
      });
      return { wamid: null, error: connectionErrorCode(resolved), connectionId: null };
    }
    const token = await decryptSecret(conn.access_token_encrypted as string);
    const to = String(toPhone ?? '').replace(/\D/g, '');
    if (!to) return { wamid: null, error: 'no_destination_phone', connectionId: conn.id };

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
      return { wamid: null, error: String(msg).slice(0, 300), connectionId: conn.id };
    }
    return { wamid: data?.messages?.[0]?.id ?? null, error: null, connectionId: conn.id };
  } catch (e) {
    console.error('[platform-sales-brain] entrega WhatsApp exception:', e);
    return { wamid: null, error: String(e).slice(0, 300), connectionId: null };
  }
}

/**
 * Resultado de entrega, agnóstico de canal. `delivered` existe porque no canal
 * Evolution "entregue" e "tem id de mensagem" não são a mesma coisa (o shape da
 * resposta varia por versão do servidor); no canal Meta os dois coincidem, e é
 * assim que a não-regressão se mantém: `delivered = wamid !== null`.
 */
interface DeliveryResult {
  wamid: string | null;
  error: string | null;
  connectionId: string | null;
  delivered: boolean;
  evolutionMessageId?: string | null;
}

/**
 * Resolve o product_id DA INSTÂNCIA Evolution. Não serve o product_id da
 * CONVERSA: o webhook herda o produto da instância só no INSERT e nunca
 * sobrescreve atribuição manual — os dois podem divergir, e o
 * platform-evolution-send casa `id + product_id` (`.eq().eq()`), então
 * product_id errado devolve 404 "No platform Evolution instance found".
 */
async function evolutionInstanceProductId(
  supabase: any,
  instanceId: string,
  conversationId: string | null,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('platform_crm_evolution_instances')
    .select('id, product_id')
    .eq('id', instanceId)
    .maybeSingle();
  if (error) {
    console.error(
      `[platform-sales-brain] instância Evolution não lida conversation_id=${conversationId} instance_id=${instanceId} reason=${error.message}`,
    );
    return null;
  }
  const productId = typeof data?.product_id === 'string' && data.product_id ? data.product_id : null;
  if (!productId) {
    console.error(
      `[platform-sales-brain] instância Evolution sem product_id conversation_id=${conversationId} instance_id=${instanceId} — envio impossível`,
    );
  }
  return productId;
}

/**
 * AMARRAÇÃO AGENTE↔NÚMERO (canal dedicado).
 *
 * A tela "Canais → Conexões dedicadas" do editor de agente já grava em
 * `platform_crm_agent_connections` (e mantém `platform_crm_product_agents
 * .evolution_instance_id` em sync como legado). Até aqui NENHUMA edge function
 * lia esse vínculo — medido: 0 leituras no repo, 0 linhas na tabela. O efeito
 * era que conversa nova SEMPRE abria com a SDR: uma lead prospectada pela BDR
 * num número dedicado a ela era atendida pela Duda.
 *
 * Espelha a regra que já roda em produção do lado do salão — webchat-bot
 * ("instance-bound agent"), que resolve o agente por `evolution_instance_id`.
 *
 * Devolve o id do agente dedicado à conexão por onde a conversa corre, ou null
 * quando não há vínculo — nesse caso o roteamento anterior segue intacto.
 */
async function resolveConnectionBoundAgentId(
  supabase: any,
  conversation: Record<string, any> | null,
): Promise<string | null> {
  const evo = typeof conversation?.evolution_instance_id === 'string'
    ? conversation.evolution_instance_id
    : null;
  const meta = typeof conversation?.meta_connection_id === 'string'
    ? conversation.meta_connection_id
    : null;

  const pairs: Array<{ type: string; id: string }> = [];
  if (evo) pairs.push({ type: 'evolution', id: evo });
  if (meta) pairs.push({ type: 'meta_whatsapp', id: meta });
  if (pairs.length === 0) return null;

  for (const p of pairs) {
    const { data, error } = await supabase
      .from('platform_crm_agent_connections')
      .select('product_agent_id')
      .eq('connection_type', p.type)
      .eq('connection_id', p.id)
      .limit(1)
      .maybeSingle();
    if (error) {
      // Falha de leitura NÃO vira silêncio: denuncia e cai no roteamento anterior.
      console.error(
        `[platform-sales-brain] leitura de agent_connections falhou type=${p.type} id=${p.id}:`,
        error?.message ?? error,
      );
      continue;
    }
    if (data?.product_agent_id) return data.product_agent_id as string;
  }

  // Fallback legado: coluna única no agente (mesma que o AgentCard usa de fallback).
  if (evo) {
    const { data } = await supabase
      .from('platform_crm_product_agents')
      .select('id')
      .eq('evolution_instance_id', evo)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

/**
 * Entrega no canal Evolution (WhatsApp não-oficial via QR) pela edge
 * platform-evolution-send — a mesma que o cold outreach usa. O `connectionId`
 * devolvido aqui é o evolution_instance_id (é ele que diz por qual número saiu a
 * bolha); e `evolutionMessageId` é o key.id da Evolution, que o
 * platform-evolution-webhook usa como chave de idempotência — persistir isso
 * impede que o eco fromMe do nosso próprio envio vire uma segunda linha outbound.
 */
async function deliverViaEvolution(
  supabase: any,
  conversation: Record<string, any> | null,
  toPhone: string,
  content: string,
): Promise<DeliveryResult> {
  const conversationId = typeof conversation?.id === 'string' ? conversation.id : null;
  const instanceId = typeof conversation?.evolution_instance_id === 'string'
    ? conversation.evolution_instance_id
    : null;
  if (!instanceId) {
    console.error(
      `[platform-sales-brain] entrega Evolution SEM evolution_instance_id conversation_id=${conversationId} — não há por qual número responder`,
    );
    return { wamid: null, error: 'no_evolution_instance', connectionId: null, delivered: false };
  }
  const to = String(toPhone ?? '').replace(/\D/g, '');
  if (!to) {
    console.error(
      `[platform-sales-brain] entrega Evolution sem telefone de destino conversation_id=${conversationId} instance_id=${instanceId}`,
    );
    return { wamid: null, error: 'no_destination_phone', connectionId: instanceId, delivered: false };
  }
  // LID persistido pelo webhook em metadata.wa_lid — send preferirá @lid.
  const meta = (conversation?.metadata && typeof conversation.metadata === 'object')
    ? conversation.metadata as Record<string, unknown>
    : {};
  const waLid = typeof meta.wa_lid === 'string' && meta.wa_lid.trim()
    ? meta.wa_lid.trim()
    : null;
  try {
    const productId = await evolutionInstanceProductId(supabase, instanceId, conversationId);
    if (!productId) {
      return {
        wamid: null,
        error: 'evolution_instance_product_unresolved',
        connectionId: instanceId,
        delivered: false,
      };
    }
    const { data, error } = await supabase.functions.invoke('platform-evolution-send', {
      body: {
        product_id: productId,
        instance_id: instanceId,
        type: 'text',
        to,
        ...(waLid ? { wa_lid: waLid } : {}),
        payload: { text: content },
      },
    });
    // A edge devolve o envelope do evoFetch ({ok,status,body}) — `ok:false` é
    // falha do servidor Evolution COM HTTP 200 no invoke, então checar só
    // `error` deixaria passar entrega não feita (mesma régua do cold outreach).
    if (error || (data as any)?.ok === false || (data as any)?.error) {
      // INSTRUMENTO (2026-08-04): `error.message` do supabase-js é SEMPRE o
      // genérico "Edge Function returned a non-2xx status code". Foi ele que
      // escondeu por completo o motivo do 401 do platform-evolution-send — as
      // bolhas ficaram com delivery_status='failed' e um erro que não diz nada,
      // e o diagnóstico só saiu lendo log de gateway. O corpo da resposta vive
      // em `error.context` (Response); lê-lo AQUI faz o motivo do callee
      // aterrissar em platform_crm_messages.metadata.delivery_error, legível
      // por SQL sem depender de log de console.
      let calleeBody = '';
      let httpStatus: number | null = null;
      try {
        const ctx = (error as any)?.context;
        if (ctx) {
          httpStatus = typeof ctx.status === 'number' ? ctx.status : null;
          if (typeof ctx.text === 'function') calleeBody = String(await ctx.text()).slice(0, 200);
          else if (typeof ctx === 'object') calleeBody = JSON.stringify(ctx).slice(0, 200);
        }
      } catch (_ctxErr) {
        // Corpo já consumido ou ilegível — segue com o reason genérico, mas
        // NUNCA em silêncio: a ausência fica visível no próprio campo.
        calleeBody = '<corpo do callee ilegivel>';
      }
      const reason = [
        error?.message ?? String(JSON.stringify(data ?? null)).slice(0, 300),
        httpStatus ? `http=${httpStatus}` : '',
        calleeBody ? `callee=${calleeBody}` : '',
      ].filter(Boolean).join(' | ');
      console.error(
        `[platform-sales-brain] entrega Evolution FALHOU conversation_id=${conversationId} instance_id=${instanceId} reason=${reason}`,
      );
      return { wamid: null, error: String(reason).slice(0, 500), connectionId: instanceId, delivered: false };
    }
    const evolutionMessageId = typeof (data as any)?.body?.key?.id === 'string'
      ? (data as any).body.key.id
      : null;
    // Entregue = a Evolution aceitou. O id pode faltar (shape varia por versão) e
    // isso NÃO é falha — marcar como falha aqui geraria alarme falso e um
    // delivery_status errado numa bolha que a lead recebeu.
    return { wamid: evolutionMessageId, error: null, connectionId: instanceId, delivered: true, evolutionMessageId };
  } catch (e) {
    console.error(
      `[platform-sales-brain] entrega Evolution EXCEPTION conversation_id=${conversationId} instance_id=${instanceId}:`,
      e,
    );
    return { wamid: null, error: String(e).slice(0, 300), connectionId: instanceId, delivered: false };
  }
}

/**
 * Roteador de entrega por canal. O ramo 'whatsapp' delega ao
 * deliverViaWhatsAppCloud INTACTO (mesma sequência de chamadas Graph, mesmo
 * wamid, mesmo tratamento de erro); `delivered` é derivado de `wamid !== null`,
 * que é exatamente o critério que o call-site usava antes.
 */
async function deliver(
  supabase: any,
  conversation: Record<string, any> | null,
  toPhone: string,
  content: string,
): Promise<DeliveryResult> {
  if (conversation?.channel === 'whatsapp_evolution') {
    return await deliverViaEvolution(supabase, conversation, toPhone, content);
  }
  const r = await deliverViaWhatsAppCloud(
    supabase,
    conversation as ConversationConnectionHints | null,
    toPhone,
    content,
  );
  return { ...r, delivered: r.wamid !== null };
}

/**
 * Monta o bloco de conhecimento do produto — MESMO builder do platform-sales-copilot
 * (ordem deliberada: knowledge_base primeiro, contém o vocabulário obrigatório).
 * NÃO há escassez de espécie alguma: a âncora é o PREÇO COMPARADO DO PRESENTE
 * (via de-para em LINKS DE PAGAMENTO) — nem vaga de campanha, nem promessa de
 * subida. Non-fatal: qualquer falha aqui degrada, mas não derruba a resposta.
 */
function buildKnowledgeContext(
  product: Record<string, any> | null,
): string {
  if (!product) return '';
  let ctx = `\n## PRODUTO: ${product.name}\n`;
  if (product.description) ctx += `Descrição: ${product.description}\n`;

  if (product.knowledge_base) {
    ctx += `\n## OFERTA E BASE DE CONHECIMENTO\n${product.knowledge_base}\n`;
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

/**
 * slugify — normaliza o nome da persona para o valor de ?src=. Lowercase, sem
 * acento, espaços/pontuação → '-', colapsa hifens repetidos e apara as pontas.
 * Ex.: 'Duda — SDR' → 'duda-sdr'; 'Bia' → 'bia'. Vazio se nada sobrar.
 */
function slugify(name: string): string {
  return String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // não-alfanumérico vira hífen
    .replace(/-+/g, '-')         // colapsa hifens repetidos
    .replace(/^-+|-+$/g, '');    // apara hifens das pontas
}

/**
 * appendSellerRef — carimba ?src=<slug-do-agente> no checkout_url pra atribuir a
 * venda a quem fechou (Duda/Bia). DEFENSIVO: usa new URL()/searchParams (preserva
 * query existente, sobrescreve src anterior); se a URL for inválida ou o slug
 * vazio, devolve a url original SEM quebrar.
 */
function appendSellerRef(url: string, personaName: string): string {
  // Ref estável = 1º token do nome ('Duda — SDR Qualificadora' → 'duda'),
  // casando com o ref_code seedado em 20260706_sellers_e_relatorio_vendas.sql
  // (renomear o sufixo da persona não quebra a atribuição).
  const src = slugify(personaName).split('-')[0];
  if (!url || !src) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('src', src);
    return u.toString();
  } catch {
    return url; // url malformada (sem protocolo, etc.) — não quebra o fluxo
  }
}

/** Links de checkout reais (do banco). É a "maquininha" da Duda: cliente que
 *  DECIDE recebe o link na hora, sem passar por closer. Cada link carrega
 *  ?src=<slug-do-agente> pra atribuir a venda a quem fechou. Vazio se não houver. */
function buildCheckoutContext(plans: Array<Record<string, any>>, personaName: string): string {
  if (!plans.length) return '';
  let ctx = `\n## LINKS DE PAGAMENTO (a sua maquininha — mande o link DIRETO quando o cliente DECIDIR contratar)\n`;
  for (const p of plans) {
    const url = appendSellerRef(p.checkout_url, personaName);
    // PREÇO COMPARADO DO PRESENTE: quando há preço de TABELA (list_price_monthly)
    // acima do vigente (price_monthly), renderiza "custa R$X, hoje sai por R$Y".
    // Os dois números continuam vindo do banco em runtime; o que MORREU aqui foi a
    // afirmação sobre o futuro ("sobe em breve"). NÃO EXISTE DATA DE SUBIDA
    // (Marcelo, 2026-08-04) — e esta linha é a FONTE que a persona é instruída a
    // citar como preço, então prometer aqui é prometer na boca da agente.
    const priceLabel = Number(p.list_price_monthly) > Number(p.price_monthly)
      ? `custa R$${p.list_price_monthly}, hoje sai por R$${p.price_monthly}`
      : `R$${p.price_monthly}`;
    ctx += `- ${p.name} (${priceLabel}): ${url}\n`;
  }
  ctx += `REGRA: cliente que já decidiu ("quero contratar", "como pago", "quero começar") NÃO precisa de demonstração nem de passar pra ninguém — mande o link do plano recomendado, diga que assim que o pagamento cair o acesso é liberado na hora, e fique à disposição. O cliente QUALIFICADO que ainda está EM DÚVIDA/CÉTICO é SEU também: aprofunde o valor e conduza ao fechamento você mesma — não existe passar adiante.\n`;
  return ctx;
}

/** AGORA — fonte única de data e hora (America/Sao_Paulo).
 *
 *  O modelo não tem relógio. Sem este bloco ele CHUTA o dia da semana; pior, ao
 *  ser desmentido pela cliente não tem DE QUE se corrigir e reafirma o chute.
 *  Reproduzido na demo em 2026-08-01 (sábado): a Mavi ofereceu "amanhã,
 *  quarta-feira", o cliente respondeu "amanhã é domingo", ela pediu desculpas e
 *  repetiu "hoje é terça-feira". Insistir contra o cliente não foi teimosia do
 *  modelo — foi ausência de chão.
 *
 *  Vale para toda persona da plataforma: mesmo as proibidas de agendar podem
 *  errar o dia numa frase solta, e errar data na frente do cliente custa a venda. */
function buildNowContext(): string {
  const TZ = 'America/Sao_Paulo';
  const now = new Date();
  const data = now.toLocaleDateString('pt-BR', {
    timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const hora = now.toLocaleTimeString('pt-BR', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit',
  });
  return `\n═══ AGORA (fonte única de data e hora) ═══\n` +
    `Hoje é ${data}, ${hora} (horário de Brasília).\n` +
    `- Calcule "hoje", "amanhã", "depois de amanhã", "essa semana" SEMPRE a partir\n` +
    `  desta linha. Nunca de memória — sua memória não tem calendário.\n` +
    `- Se a cliente te corrigir sobre o dia, ELA está certa até esta linha provar o\n` +
    `  contrário: confira aqui, assuma o erro e NÃO repita o dado errado.\n` +
    `- Nunca ofereça dia ou horário fora do funcionamento informado na base de\n` +
    `  conhecimento — confira o dia da semana acima antes de oferecer qualquer data.\n`;
}

/** FONTE-ÚNICA DE PREÇO (INVIOLÁVEL). Injetado logo após a seção LINKS DE
 *  PAGAMENTO (que vem do banco em runtime). Fixa a REGRA de onde ler o preço
 *  (que não envelhece), no lugar de fixar o número (que envelhece). Precede
 *  qualquer instrução de persona. Só é injetado quando há plano(s) com preço. */
const PRICE_RULE_BLOCK =
  `\n═══ REGRA DE PREÇO (INVIOLÁVEL — precede qualquer instrução de persona) ═══\n` +
  `O ÚNICO lugar com preço e link verdadeiros é a seção "LINKS DE PAGAMENTO" acima,\n` +
  `gerada agora a partir do banco (public_plans). Ela é a verdade.\n` +
  `- NUNCA diga um valor de mensalidade de memória, de exemplo, do histórico da conversa\n` +
  `  ou de qualquer texto de treinamento. Se você "lembra" de um preço, IGNORE — pode\n` +
  `  estar desatualizado. Só vale o que está em LINKS DE PAGAMENTO desta mensagem.\n` +
  `- Ao citar preço, use exatamente o número que aparece ao lado do nome do plano em\n` +
  `  LINKS DE PAGAMENTO. Nada de arredondar, "por volta de", "a partir de".\n` +
  `- Se um plano NÃO está em LINKS DE PAGAMENTO, ele não tem preço público — não invente:\n` +
  `  diga que confirma o valor e siga, sem chutar.\n` +
  `- Quando um plano aparecer como "custa R$X, hoje sai por R$Y", X é o preço de TABELA e Y é\n` +
  `  o que a cliente paga HOJE: cite Y como o preço e X só como referência do quanto ela\n` +
  `  economiza agora. Nunca troque os dois.\n` +
  `- NUNCA diga, sugira ou insinue que o preço VAI SUBIR, nem prometa data, prazo, "em breve",\n` +
  `  "por tempo limitado" ou qualquer versão disso: NÃO EXISTE DATA DE SUBIDA. O de-para é um\n` +
  `  fato do PRESENTE (quanto custa × quanto sai hoje), não uma promessa sobre o futuro.\n` +
  `- Recomende UM plano pelo dossiê e mande o link DESSE plano (o link já está na seção).\n` +
  `Preço e link são dados do banco, não da sua memória. Divergir da seção = erro grave.\n`;

// ROTEAMENTO de personas (isSdrAgent / isCloserAgent / isRetentionAgent /
// pickSdrPersona / pickPersonaForConversation) foi EXTRAÍDO para
// _shared/agent-routing.ts (P2 · PR-B) — funções puras, unit-testadas em
// agent-routing.test.ts. Importadas no topo. Comportamento idêntico ao inline.

// ─── Memória de qualificação ────────────────────────────────────────────────

/**
 * Injeta no prompt o que a Duda JÁ SABE da lead (estado, não só janela de msgs).
 * A regra de ouro: nunca repergunte o que já está aqui.
 */
function buildLeadMemoryContext(lead: Record<string, any> | null): string {
  if (!lead) return '';
  const known: string[] = [];
  const meta = (lead.metadata && typeof lead.metadata === 'object') ? lead.metadata as Record<string, any> : {};
  const q = (meta.qualificacao && typeof meta.qualificacao === 'object') ? meta.qualificacao as Record<string, any> : {};

  // Nome só conta como "sabido" se não for um telefone (lead novo entra com o número no name).
  const nameLooksReal = typeof lead.name === 'string' && lead.name.trim() && !/^\+?\d[\d\s()-]{5,}$/.test(lead.name.trim());
  if (nameLooksReal) known.push(`Nome: ${lead.name}`);
  if (q.sub_vertical) known.push(`Área de atuação: ${q.sub_vertical}`);
  if (q.tempo_atendimento_meses != null) known.push(`Tempo de atendimento: ~${q.tempo_atendimento_meses} meses`);
  if (q.num_clientes != null) known.push(`Carteira histórica: ~${q.num_clientes} clientes`);
  if (q.ticket_medio != null) known.push(`Ticket médio: ~R$${q.ticket_medio}`);
  if (q.recorrencia) known.push(`Recorrência: ${q.recorrencia}`);
  if (Array.isArray(q.dor_flags) && q.dor_flags.length) known.push(`Dores ditas: ${q.dor_flags.join(', ')}`);
  if (lead.bant_need) known.push(`Necessidade/dor: ${lead.bant_need}`);
  if (lead.bant_budget) known.push(`Potencial/carteira: ${lead.bant_budget}`);
  if (lead.bant_timing) known.push(`Tempo de casa: ${lead.bant_timing}`);
  if (lead.temperature) known.push(`Temperatura atual: ${lead.temperature}`);

  // BLOCO DE SCORE COMO FATO (computado em TS no turno anterior — NÃO recalcule).
  // A Duda/Bia CONDUZ a conversa a partir daqui; a matemática já está feita.
  const scoreBlock = buildScoreFactBlock(q);

  if (!known.length && !scoreBlock) return '';
  const memoryLines = known.length
    ? `\n═══════════════════════════════════════\nO QUE JÁ SABEMOS DA LEAD (não repergunte)\n═══════════════════════════════════════\n${known.map((k) => `- ${k}`).join('\n')}\n`
    : '';
  return memoryLines + scoreBlock;
}

/**
 * Renderiza o score QCR-V PERSISTIDO como FATO imperativo no prompt. O modelo
 * recebe a conta pronta e CONDUZ (não recalcula). Vazio se ainda não há score.
 * Formato pedido no briefing: "SCORE ATUAL: X/100 (provisório?) · PR=R$Y · rota=Z".
 */
function buildScoreFactBlock(q: Record<string, any>): string {
  const score = (typeof q.score_0_100 === 'number') ? q.score_0_100 : null;
  if (score == null) return '';
  const provisorio = q.score_provisorio === true;
  const pr = (typeof q.pr === 'number') ? q.pr : null;
  const rota = typeof q.rota === 'string' ? q.rota : null;

  const rotaGuidance: Record<string, string> = {
    premium: 'carteira robusta → conduza para o plano recomendado (Premium/Ultra) com a conta da recuperação.',
    // ⚠️ NÃO devolver "descubra carteira/ticket" aqui. Medido em 2026-08-03:
    // em 8 de 8 conversas o score ficou no piso e a rota em 'aprofundar', com
    // carteira/ticket NULL em todas — a Duda perguntava, ninguém respondia, e
    // esta linha mandava perguntar de novo. Laço fechado: ela falava de 1,5 a
    // 9,0 vezes por fala da lead, e um lead passou 1h na conversa para no fim
    // perguntar "qual é esse serviço".
    // O RAIO-X calcula carteira e ticket a partir do WhatsApp dela — pedir os
    // números à mão é pedir que ela faça de cabeça o trabalho da ferramenta.
    aprofundar: provisorio
      ? 'ainda não sabemos os números dela — e está TUDO BEM: OFEREÇA O RAIO-X (é ele que lê o WhatsApp e calcula carteira/ticket). NÃO repita perguntas de qualificação; se ela não respondeu, avance MOSTRANDO o que a ferramenta faz.'
      : 'lead qualificada mas indecisa/cética → aprofunde o VALOR (a conta personalizada + PROVA na carteira) antes de fechar.',
    essencial: 'carteira pequena/começando → recomende o plano de ENTRADA com a conta honesta. NUNCA rejeite.',
  };
  const rotaLine = rota && rotaGuidance[rota] ? `\nCONDUTA SUGERIDA (${rota}): ${rotaGuidance[rota]}` : '';

  const parts = [`SCORE ATUAL: ${score}/100${provisorio ? ' (provisório — falta carteira/ticket)' : ''}`];
  if (pr != null) parts.push(`PR=R$${pr}`);
  if (rota) parts.push(`rota sugerida=${rota}`);

  return `\n═══════════════════════════════════════\nSCORE DE QUALIFICAÇÃO (já calculado — use como FATO, NÃO recalcule)\n═══════════════════════════════════════\n${parts.join(' · ')}${rotaLine}\n`;
}

/** Faixa de temperatura a partir do score (hot ≥70 / warm 40-69 / cold <40). */
function scoreToTemperature(score: number | null): 'hot' | 'warm' | 'cold' | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

// ─── Guardrails de forma ─────────────────────────────────────────────────────

/**
 * Censura de vocabulário: o produto é PAGO e NÃO tem garantia de devolução. Se o
 * modelo escorregar em "teste grátis / desconto / promoção" em contexto de oferta,
 * reancoramos no VALOR (a conta da recuperação) — nunca em garantia, promo ou
 * pressa. Retorna { text, sanitized }.
 *
 * ⚠️ Esta tabela REESCREVE A SAÍDA DO MODELO, depois dele: o que entra aqui a lead
 * lê como se a agente tivesse dito. Até 2026-08-04 a substituição de "desconto" e
 * "promoção" INJETAVA "sobe em breve" — ou seja, o código plantava na boca da Duda
 * uma promessa de subida que não existe, e nenhuma configuração de banco alcançava
 * isso. A reancoragem agora é VALOR (a conta), nunca pressa.
 */
/**
 * ⚠️ GUARD DE NEGAÇÃO (2026-08-04) — sem ele o sanitizador INVERTIA a frase.
 *
 * O prompt MANDA a agente dizer "NUNCA ofereça desconto. Se pedirem, reancore no
 * VALOR". Ela então escreve a palavra proibida em enquadramento NEGATIVO, obedecendo
 * corretamente — e a substituição cega destruía justamente a frase certa:
 *
 *   "não damos desconto"   →  "não damos a conta da recuperação (…)"
 *   "não fazemos promoção" →  "não fazemos o preço que está valendo hoje"
 *
 * A agente saía negando o próprio argumento de venda. Medido em 100% das negações.
 * Mesmo padrão do detector que pune a proibição junto com a infração — só que aqui
 * o custo não é ruído num relatório: é o que a lead lê.
 */
// A censura de vocabulário mudou de casa: _shared/reply-sanitizer.ts.
//
// O que morava aqui fazia substituição no MEIO da frase e tinha guarda de uma porta
// só: olhava `fonte.slice(offset - 40, offset)`, isto é, apenas à ESQUERDA do termo.
// O eval E1 (2026-08-06) capturou o resultado saindo pra lead: a agente escreveu
// "Desconto não tem como, Fernanda — mas olha a conta..." (negação à DIREITA, que o
// guard não via) e a lead recebeu "a conta da recuperação (2-3 clientes de volta já
// pagam a mensalidade) não tem como, Fernanda — ...". Frase destruída, golden verde.
//
// O módulo novo decide por SENTENÇA: ou a frase do modelo sai inteira, ou cai inteira
// e a reancoragem entra como sentença própria. Nunca um enxerto dos dois.

/**
 * Normaliza markdown para a sintaxe REAL do WhatsApp. CONVERTE, nunca remove
 * conteúdo. O WhatsApp usa UM asterisco para negrito — `**Essencial**` aparece
 * com asterisco CRU na tela da lead (aconteceu em produção 2026-07-20).
 * Por que em código e não no prompt: o prompt JÁ manda ("sem markdown, sem
 * asteriscos") e o modelo escorregou mesmo assim. Instrução probabilística não
 * é guardrail. Ordem importa: `**`→`*` ANTES de qualquer regra que toque `*`
 * isolado, senão negrito duplo vira bullet.
 */
function normalizeWhatsAppMarkup(input: string): { text: string; changed: boolean } {
  const before = input;
  let text = input;
  text = text.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, '$1'); // cercas → conteúdo cru
  text = text.replace(/`([^`\n]+)`/g, '$1');                  // inline code
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2'); // link md
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '*$1*');          // negrito md → WhatsApp
  text = text.replace(/__([^_\n]+)__/g, '_$1_');              // itálico/underline
  text = text.replace(/~~([^~\n]+)~~/g, '~$1~');              // tachado
  text = text.replace(/^\s{0,3}#{1,6}\s*/gm, '');             // headings
  text = text.replace(/^\s*[-*+]\s+/gm, '• ');                // bullets
  return { text, changed: text !== before };
}

/**
 * EXATAMENTE UMA pergunta por resposta: se o modelo emitiu >1 '?', mantém só até
 * a primeira interrogação. Melhor perder uma pergunta que sobrecarregar a lead.
 *
 * ⚠️ GUARD DE VENDA (bug real 2026-07-20): a regra 7 do prompt OBRIGA a URL do
 * checkout na resposta de quem já decidiu. Se o modelo escrevesse
 * "Quer o Essencial? Aqui: https://…", o corte na 1ª '?' APAGAVA O LINK — venda
 * perdida em silêncio, sem erro no log. Agora: se o descarte contiver URL ou
 * valor em R$, NÃO descartamos nada — removemos apenas as PERGUNTAS extras e
 * mantemos todo o conteúdo declarativo (preço, link, despedida).
 */
function keepFirstQuestion(input: string): string {
  // '?' dentro de URL é querystring, NÃO pergunta (bug D3: o link de checkout
  // "...?src=..." era truncado no meio). Mascara o '?' das URLs com um sentinela
  // (\u0001 — nunca ocorre em texto de chat), conta/corta no mascarado e restaura
  // no resultado — o corte nunca acontece dentro de um link.
  const SENT = '\u0001';
  const masked = input.replace(/https?:\/\/\S+/g, (u) => u.split('?').join(SENT));
  const marks = (masked.match(/\?/g) || []).length;
  if (marks <= 1) return input.trim();
  const firstQ = masked.indexOf('?');

  // GUARD DE VENDA: o que seria jogado fora carrega link/preço? Então não corta —
  // só tira as perguntas EXTRAS e preserva todo o declarativo.
  const discarded = masked.slice(firstQ + 1).split(SENT).join('?');
  if (/https?:\/\//i.test(discarded) || /R\$\s*\d/i.test(discarded)) {
    const restored = masked.split(SENT).join('?');
    const sentences = restored.match(/[^.!?]+[.!?]*\s*/g) ?? [restored];
    let keptQuestion = false;
    const kept = sentences.filter((s) => {
      if (!s.trim().endsWith('?')) return true;   // declarativo: SEMPRE mantém
      if (keptQuestion) return false;              // 2ª pergunta em diante: descarta
      keptQuestion = true;
      return true;                                 // 1ª pergunta: mantém
    });
    console.warn('[platform-sales-brain] keepFirstQuestion: descarte continha link/preço — preservado');
    return kept.join('').trim();
  }

  return masked.slice(0, firstQ + 1).split(SENT).join('?').trim();
}

/**
 * Divide a resposta em até MAX_BUBBLES bolhas por parágrafo / quebra dupla,
 * cada uma respeitando o teto de caracteres (quebra longas por sentença). Tom
 * WhatsApp: cada bolha é uma ideia.
 */
function splitIntoBubbles(input: string): string[] {
  const paras = input
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const out: string[] = [];
  for (const para of paras) {
    if (para.length <= MAX_BUBBLE_CHARS) {
      out.push(para);
      continue;
    }
    // Parágrafo longo: quebra por sentença acumulando até o teto.
    const sentences = para.match(/[^.!?]+[.!?]*\s*/g) ?? [para];
    let buf = '';
    for (const s of sentences) {
      if ((buf + s).length > MAX_BUBBLE_CHARS && buf) {
        out.push(buf.trim());
        buf = s;
      } else {
        buf += s;
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  // Teto de BOLHAS (não de caracteres): o excedente é REAGRUPADO na última bolha,
  // INTEIRO. Nunca cortado.
  //
  // ⚠️ BUG CORRIGIDO 2026-07-20: aqui havia `.slice(0, MAX_BUBBLE_CHARS)`, que
  // cortava cego por índice e DESCARTAVA o resto para sempre — foi o que produziu
  // "…O preço de la" (decepado no meio de "lançamento", matando a âncora de preço).
  // O WhatsApp aceita 4096 chars por mensagem, então nada precisa ser perdido.
  if (out.length > MAX_BUBBLES) {
    const head = out.slice(0, MAX_BUBBLES - 1);
    const tail = out.slice(MAX_BUBBLES - 1).join(' ').trim();
    if (tail.length > MAX_BUBBLE_CHARS) {
      // Sinal de que o PROMPT está produzindo textão — não é para ser normal.
      console.warn(`[platform-sales-brain] bolha final longa (${tail.length} chars) — revisar regras de forma do prompt`);
    }
    return [...head, tail].filter(Boolean);
  }
  return out.filter(Boolean);
}

// ─── Extração de fatos (2ª chamada LLM, barata) ─────────────────────────────

/**
 * Pede ao mesmo gateway um JSON estrito com os FATOS CRUS da conversa. O LLM
 * NÃO calcula mais o score (errava a conta) — só EXTRAI os fatos; quem pontua é
 * computeQcrScore() em TypeScript (determinístico). Parse defensivo — qualquer
 * falha degrada para {} e não derruba o fluxo. Non-fatal.
 *
 * Novo campo cru `dor_flags`: sinais de dor DITOS pela lead (agenda vazia, cliente
 * sumindo, faturamento caindo, etc.) — a D4 (dor) do score deriva DELES, não de um
 * chute do modelo. `score_0_100` foi REMOVIDO do schema de propósito.
 */
async function extractLeadFacts(
  gatewayBase: string,
  apiKey: string,
  model: string,
  transcript: string,
): Promise<Record<string, any>> {
  try {
    const sys = 'Você extrai FATOS de uma conversa de qualificação de vendas (profissional da beleza) e responde SOMENTE com um objeto JSON válido, sem texto ao redor, sem markdown. NÃO calcule score — apenas extraia o que a lead DISSE. Campos (use null quando desconhecido, exceto dor_flags que é sempre um array — vazio se nada): {"sub_vertical": string|null, "tempo_atendimento_meses": number|null, "num_clientes": number|null, "ticket_medio": number|null, "recorrencia": string|null, "nome_lead": string|null, "dor_flags": string[]}. Em dor_flags liste sinais de DOR/urgência que a lead expressou, um por item, texto curto (ex.: "agenda vazia", "clientes sumindo", "faturamento caindo", "depende de indicação", "quer previsibilidade"). Se a lead não expressou dor, retorne dor_flags: []. num_clientes = tamanho da carteira/base histórica de clientes. ticket_medio = valor médio em R$ por atendimento. tempo_atendimento_meses = há quantos meses atende (converta anos para meses).';
    const res = await fetch(`${gatewayBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        temperature: 0,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: `Conversa:\n${transcript}\n\nRetorne o JSON dos fatos.` },
        ],
        stream: false,
      }),
    });
    if (!res.ok) {
      console.warn('[platform-sales-brain] extração de fatos: gateway', res.status);
      return {};
    }
    const data = await res.json().catch(() => null);
    const raw: string = data?.choices?.[0]?.message?.content ?? '';
    // Isola o 1º objeto JSON (o modelo às vezes embrulha em cercas).
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return {};
    const parsed = JSON.parse(m[0]);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    console.warn('[platform-sales-brain] extração de fatos falhou (non-fatal):', String(e).slice(0, 200));
    return {};
  }
}

/** Coerção defensiva: number | string numérica → number; senão null. */
function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.,-]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ─── Score QCR-V DETERMINÍSTICO (TypeScript, não o LLM) ─────────────────────
// O LLM errava a conta; aqui a matemática é fixa e auditável. As faixas são as
// do briefing Marcelo 05/07 (5.1).
//
// Preço-âncora: FONTE-ÚNICA DE PREÇO. O denominador da razão R = PR ÷ âncora é o
// price_monthly do plano de ENTRADA (slug 'starter' = Essencial), lido do banco
// (public_plans) na MESMA request via resolveAnchor(plans) — nada de número
// hardcoded. Se o preço do Essencial mudar no super-admin, o score recalibra
// sozinho. Fallback numérico só existe se `plans` vier vazio (ver resolveAnchor).
const ENTRY_PLAN_SLUG = 'starter'; // Essencial = plano de entrada (menor price_monthly público)
const QCRV_ANCHOR_FALLBACK = 275; // FALLBACK documentado: preço do Essencial (lançamento) em 2026-07-14 (só se public_plans vier vazio)

/**
 * resolveAnchor — deriva o preço-âncora do plano de entrada a partir dos `plans`
 * já buscados de public_plans (mesma request). Preferência: (1) plano por slug
 * 'starter'; (2) senão o menor preço público pago; (3) senão o fallback numérico
 * documentado. Nunca retorna 0/NaN (protege o divisor de R = PR ÷ âncora).
 */
function resolveAnchor(plans: Array<Record<string, any>>): number {
  const publicPaid = plans
    .map((p) => Number(p.price_monthly))
    .filter((n) => Number.isFinite(n) && n > 0);
  const entry = plans.find((p) => p.slug === ENTRY_PLAN_SLUG);
  const anchor = entry ? Number(entry.price_monthly)
               : publicPaid.length ? Math.min(...publicPaid)
               : QCRV_ANCHOR_FALLBACK;
  return Number.isFinite(anchor) && anchor > 0 ? anchor : QCRV_ANCHOR_FALLBACK;
}

/** Resultado do score determinístico — vira FATO no prompt e estado no lead. */
type QcrRota = 'premium' | 'aprofundar' | 'essencial';
interface QcrScore {
  score: number;          // 0-100 (soma das dimensões pontuadas)
  provisorio: boolean;    // true quando falta carteira OU ticket (D1 incompleta)
  rota: QcrRota;          // sugestão de OFERTA (nunca aceite/rejeite — "pagou é cliente")
  pr: number | null;      // Potencial de Receita mensal estimado (R$)
  r: number | null;       // razão PR ÷ preço-âncora (quantas mensalidades a carteira paga)
}

/**
 * computeQcrScore — pontuação determinística a partir dos FATOS CRUS extraídos.
 *
 *   PR (Potencial de Receita) = num_clientes × ticket_medio × 0.35
 *   R                          = PR ÷ anchor (preço-âncora do banco, plano de entrada)
 *
 *   D1 Potencial (0-50): R>=5→50 · 3-5→40 · 1.5-3→25 · <1.5→10.
 *       Sem num_clientes OU sem ticket → provisorio=true e D1=10 (parcial, não
 *       decide rota — a Duda ainda precisa descobrir carteira/ticket).
 *   D2 Tempo    (0-20): >=24m→20 · 8-24→15 · 3-8→8 · <3→3 (0 se desconhecido).
 *   D3 Recorrência (0-15): por sub_vertical (map de dias): cílios/unhas/podologia
 *       (ciclo <=30d) →15 · sobrancelha/estética/salão (30-60d) →10 · eventual →5
 *       (0 se sub_vertical desconhecido).
 *   D4 Dor      (0-15): heurística por nº de dor_flags detectados: >=3→15 · 2→10
 *       · 1→5 · 0→0.
 *
 * Rota (sugestão de OFERTA, jamais gate de aceite): score>=70 & !provisorio →
 * 'premium' (carteira robusta → plano recomendado Premium/Ultra); 40-69 OU
 * provisório → 'aprofundar' (falta dado/valor — a Duda cava mais / a Bia mostra
 * valor); <40 → 'essencial' (carteira pequena/começando → plano de entrada com a
 * conta honesta). NUNCA rejeita a venda.
 */
function computeQcrScore(facts: {
  num_clientes?: number | null;
  ticket_medio?: number | null;
  tempo_atendimento_meses?: number | null;
  sub_vertical?: string | null;
  dor_flags?: unknown;
}, anchor: number = QCRV_ANCHOR_FALLBACK): QcrScore {
  const numClientes = toNum(facts.num_clientes ?? null);
  const ticket = toNum(facts.ticket_medio ?? null);
  const tempoMeses = toNum(facts.tempo_atendimento_meses ?? null);
  const subVertical = typeof facts.sub_vertical === 'string' ? facts.sub_vertical.toLowerCase() : '';
  const dorFlags = Array.isArray(facts.dor_flags)
    ? facts.dor_flags.filter((f) => typeof f === 'string' && f.trim().length > 0)
    : [];

  // ── D1 Potencial (0-50) — depende de PR/R; provisório se faltar carteira/ticket.
  const haveCore = numClientes != null && numClientes > 0 && ticket != null && ticket > 0;
  let pr: number | null = null;
  let r: number | null = null;
  let d1 = 10; // parcial por padrão (sem base → não decide rota)
  const provisorio = !haveCore;
  if (haveCore) {
    pr = (numClientes as number) * (ticket as number) * 0.35;
    // anchor resolvido de public_plans (plano de entrada). Guarda anti-divisor-zero.
    const safeAnchor = Number.isFinite(anchor) && anchor > 0 ? anchor : QCRV_ANCHOR_FALLBACK;
    r = pr / safeAnchor;
    if (r >= 5) d1 = 50;
    else if (r >= 3) d1 = 40;
    else if (r >= 1.5) d1 = 25;
    else d1 = 10;
  }

  // ── D2 Tempo de atendimento (0-20).
  let d2 = 0;
  if (tempoMeses != null) {
    if (tempoMeses >= 24) d2 = 20;
    else if (tempoMeses >= 8) d2 = 15;
    else if (tempoMeses >= 3) d2 = 8;
    else d2 = 3; // <3 meses ainda pontua (começando, mas já atende)
  }

  // ── D3 Recorrência por sub_vertical → ciclo de retorno em dias (0-15).
  const d3 = recurrenceScoreForSubVertical(subVertical);

  // ── D4 Dor (0-15) por nº de flags de dor detectados na extração.
  let d4 = 0;
  if (dorFlags.length >= 3) d4 = 15;
  else if (dorFlags.length === 2) d4 = 10;
  else if (dorFlags.length === 1) d4 = 5;

  const score = d1 + d2 + d3 + d4;

  // Rota: sugestão de OFERTA (nunca aceite/rejeite). Provisório nunca vai direto
  // pro 'premium' (falta a conta da carteira) — cai em 'aprofundar'.
  let rota: QcrRota;
  if (!provisorio && score >= 70) rota = 'premium';
  else if (score >= 40 || provisorio) rota = 'aprofundar';
  else rota = 'essencial';

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    provisorio,
    rota,
    pr: pr != null ? Math.round(pr) : null,
    r: r != null ? Math.round(r * 100) / 100 : null,
  };
}

/**
 * D3 Recorrência: mapeia o sub_vertical ao ciclo de retorno típico (dias) e daí à
 * pontuação. Ciclo curto = mais recorrência = mais LTV. Match por palavra-chave
 * (o LLM devolve texto livre em sub_vertical). Desconhecido → 0.
 */
function recurrenceScoreForSubVertical(subVertical: string): number {
  if (!subVertical) return 0;
  const s = subVertical;
  const has = (...keys: string[]) => keys.some((k) => s.includes(k));
  // Ciclo <=30d (retorno mensal ou menos): cílios, unhas, podologia.
  if (has('cilio', 'cílio', 'lash', 'unha', 'nail', 'manicure', 'pedicure', 'podolog')) return 15;
  // Ciclo 30-60d: sobrancelha/design, estética, salão/cabelo/maquiagem.
  if (has('sobrancelha', 'brow', 'design', 'estetic', 'estét', 'salao', 'salão', 'cabelo', 'hair', 'maquiagem', 'make', 'depila')) return 10;
  // Eventual/pontual (baixa recorrência).
  if (has('eventual', 'pontual', 'noiva', 'evento', 'festa')) return 5;
  return 0; // não reconhecido — não pontua (a Duda ainda descobre a área)
}

// ─── MODO IMPLANTAÇÃO (pós-compra) — gated, default OFF ─────────────────────
// GATE DUPLO: só entra no prompt quando (1) ONBOARDING_HANDOFF_ENABLED=true no
// env E (2) a conversa carrega provisioned_organization_id (vínculo gravado
// pelo handoff pós-compra em _shared/onboarding-handoff.ts). Conversas de
// venda normais: as duas condições falham → strings vazias → prompt
// byte-idêntico ao de hoje. Nada abaixo roda sem a flag.

/** Regra 7 substituta no modo implantação: a venda ACABOU — papel é CS. */
/**
 * O QUE É a demonstração + COMO disparar. Vale para TODA lead em modo venda —
 * não só a que veio de anúncio.
 *
 * ⚠️ BUG REAL 2026-07-20: este conteúdo existia SÓ dentro de buildInboundAdContext
 * (bloco exclusivo de lead CTWA). Lead orgânica não recebia nada disso, mas
 * RECEBIA a regra 2 dizendo "demonstração de ~20 min". Com a duração e sem o
 * mecanismo, o modelo concluiu o óbvio — que era uma REUNIÃO — e começou a
 * AGENDAR horários que não existem ("hoje à tarde ou amanhã pela manhã"),
 * mentindo para a cliente no pico de intenção. A duração saiu da regra 2 e o
 * mecanismo subiu para cá.
 */
const DEMO_RULE_BLOCK = `
═══════════════════════════════════════
A DEMONSTRAÇÃO (o raio-x) — o que é e como disparar
═══════════════════════════════════════
O QUE É: um link automático que a própria cliente abre NA HORA e faz sozinha, em minutos. Ela conecta o WhatsApp dela e vê na tela quanto está parado em cliente que sumiu. É self-service, imediato, sem compromisso.
⛔ O QUE NÃO É: NÃO é reunião, NÃO é call, NÃO é videochamada, NÃO tem agenda, NÃO tem horário, NÃO tem uma pessoa do outro lado. É PROIBIDO oferecer para "agendar", perguntar "qual melhor horário", citar disponibilidade ("hoje à tarde", "amanhã de manhã") ou prometer duração de reunião. Nada disso existe — prometer isso é MENTIR para a cliente e ela ficará esperando alguém que nunca vai aparecer.
COMO DISPARAR: inclua a tag ${RAIOX_TAG} no FIM da sua mensagem — o sistema gera o link REAL e envia automaticamente com as instruções do QR code. NUNCA invente nem digite um link você mesma. NUNCA prometa "já te mando" sem emitir a tag. Se a lead topar fazer o raio-x/demonstração/teste em QUALQUER momento (um "pode ser", "quero ver", "como funciona?" depois da oferta), emita a tag NA MESMA resposta — não pergunte de novo, não peça horário, só dispare.
⚠️ AO EMITIR A TAG, SUA FALA É **UMA LINHA CURTA** e mais nada (ex.: "Boa! Já te mando aqui 👇"). O sistema anexa o link e a instrução do QR logo depois — se você TAMBÉM explicar o que o link faz, a cliente recebe a mesma coisa três vezes e vira textão. NÃO descreva o passo a passo, NÃO diga "vou te enviar um link", NÃO explique o QR. Uma linha e a tag.`;

/**
 * ESCADA DE QUALIFICAÇÃO — vale para TODA lead em modo venda.
 *
 * ⚠️ BUG REAL 2026-07-20: estas 4 perguntas viviam SÓ dentro de
 * buildInboundAdContext (bloco exclusivo de lead vinda de anúncio CTWA). Lead
 * ORGÂNICA — indicação, bio do Instagram, boca a boca, número no site — caía num
 * VAZIO DE ROTEIRO e a Duda improvisava uma escada genérica que não qualifica
 * nada e não alimenta o raio-x. Medido em produção: ela perguntou "área de
 * atuação" → "há quanto tempo você atua" → "quantos clientes ao longo desses 3
 * anos". Volume acumulado é métrica de vaidade; o que vende é base ativa vs
 * dormente, que é de onde sai o número da dor.
 */
const QUALIFICACAO_RULE_BLOCK = `
═══════════════════════════════════════
COMO QUALIFICAR (escada curta — no MÁXIMO 3 respostas dela)
═══════════════════════════════════════
UMA pergunta por vez, nesta ordem, PULANDO o que ela já respondeu (confira "O QUE JÁ SABEMOS DA LEAD" antes de perguntar):
(a) tem espaço próprio ou atende como autônoma?
(b) quantas cadeiras/profissionais atendem com você? (se autônoma: atende sozinha mesmo?)
(c) usa algum sistema/agenda hoje, ou é tudo no caderno e no WhatsApp?
(d) quantas clientes você tem na base e quantas sumiram nos últimos meses?
Depois da 2ª-3ª resposta, PARE de perguntar e DISPARE o raio-x — a demonstração qualifica o resto sozinha (ela se qualifica ao ver o próprio dinheiro parado).
⛔ NÃO faça perguntas de vaidade que não decidem nada: "há quanto tempo você atua", "quantos clientes ao longo dos anos", "como começou na área". O que importa é a base ATIVA e quantas SUMIRAM — é dessa conta que sai o valor a recuperar.
⛔ NUNCA se apresente por cargo interno ("sou a SDR", "SDR Qualificadora", "consultora de qualificação"). Ninguém fala assim no WhatsApp. Diga o que você FAZ, em linguagem de gente: "eu ajudo profissionais de beleza a trazer de volta cliente que sumiu".

⛔ NUNCA REPITA UMA PERGUNTA QUE ELA JÁ RESPONDEU, nem reformulada. Se ela deu um número vago ("bastante", "uns 200", "muitos"), ACEITE e siga — vago serve. Insistir no número exato faz a pessoa se sentir interrogada e desconfiar de você (caso real: a lead acusou "você quer roubar meus clientes?" depois da 3ª insistência). Se ela disser que não sabe ou não quer informar, ACEITE NA HORA e siga sem o dado.

🚨 PREÇO: se ela PERGUNTAR o preço, RESPONDA O PREÇO — na mesma mensagem. É permitido adiar UMA única vez, e só se você ainda não sabe o porte dela ("já te falo, só me diz antes se você atende sozinha ou tem equipe"). Perguntou de novo: RESPONDA, sem exceção e sem mais nenhuma pergunta antes. Segurar preço de quem pergunta destrói a confiança e é o jeito mais rápido de perder a venda. Recomende o plano coerente com o que você já sabe e diga o valor da seção LINKS DE PAGAMENTO.

⛔ Se ela levantar objeção explícita (desconto, prazo, "posso pagar mês que vem?", "é caro"), RESPONDA A OBJEÇÃO diretamente antes de qualquer nova pergunta. Ignorar objeção é pior que responder "não".`;

const ONBOARDING_RULE_BLOCK = `7. MODO IMPLANTAÇÃO (pós-compra): esta cliente JÁ COMPROU — a venda ACABOU. NUNCA oferte plano, preço, upgrade, link de pagamento ou condição de fundadora. Seu único papel é guiá-la na montagem do espaço dela (bloco FASE DA IMPLANTAÇÃO acima): responda a dúvida da página em que ela está, UM passo por mensagem, e comemore cada avanço. VOCÊ VÊ a página em que ela está (FASE ATUAL acima) — NUNCA pergunte "em qual tela você está?": AFIRME ("tô vendo aqui que você está em Serviços…") e oriente. Linguagem neutra sempre: "seu espaço" — NUNCA "salão". Dúvida de cobrança/reembolso, problema técnico que não destrava ou pedido de humano → use ${ESCALATE_TAG}.`;

// MODO RETENÇÃO (P2 · PR-B) — a Nina cuida de quem JÁ comprou e usa o produto.
// Espelha o ONBOARDING_RULE_BLOCK (pós-venda, sem venda), mas com foco em cuidado
// contínuo + salvar a renovação. Entra quando retentionActive (persona = Nina).
const RETENTION_RULE_BLOCK = `7. MODO RETENÇÃO (pós-venda): esta cliente JÁ COMPROU e já usa o produto — a venda ACABOU. NUNCA oferte plano, preço, upgrade, link de pagamento, desconto ou condição de fundadora. Seu papel é CUIDAR: resolver a dúvida/dor do dia a dia, destravar o que ela não conseguiu sozinha e lembrá-la do VALOR que ela já tem, pra ela continuar e renovar. Retenção NUNCA é desconto — é resolver e reancorar no valor. Linguagem neutra sempre: "seu espaço" — NUNCA "salão". UM passo por mensagem. Se ela quiser sair, entenda o porquê com calma (1 pergunta) e resolva o que der antes de escalar — nunca prometa reembolso/desconto por conta própria. Cobrança/reembolso, bug que você não resolve, cancelamento formal ou pedido de humano → use ${ESCALATE_TAG}; reclamação grave → use ${HANDOFF_TAG}.`;

// MODO INBOUND (Ads CTWA · gap G3) — a Duda (SDR) abre ESPELHANDO o anúncio de
// onde a lead veio. NÃO é persona nova nem 2º SDR (o roteamento do #68 continua
// intacto: a Duda é escolhida por pickSdrPersona). NÃO gata a oferta — Duda de
// anúncio ainda vende; por isso é um bloco de CONTEXTO adicional (espelho do
// onboardingPhaseContext), não um swap da regra 7. Entra só quando há referral
// CTWA (mensagem-gatilho = click atual, ou lead.metadata = first-touch).
function buildInboundAdContext(ref: CtwaReferral): string {
  const gancho = ctwaAdSummary(ref);
  return `\n═══════════════════════════════════════
LEAD VEIO DE ANÚNCIO (CTWA — MODO INBOUND)
═══════════════════════════════════════
Esta lead clicou num anúncio Click-to-WhatsApp e chegou QUENTE${gancho ? ` (o anúncio dela: ${gancho})` : ''}. Ela já quer o "raio-x do WhatsApp" — ver quanto tá parado em cliente que sumiu.
ABERTURA (só na PRIMEIRA fala): reconheça que ela veio pelo anúncio do raio-x, prometa mostrar em ~2 min, no número real dela, quanto tá parado, e faça JÁ a 1ª pergunta de qualificação. NUNCA abra genérico ("como posso te ajudar?") — isso queima o match do anúncio e derruba a conversão.
(QUALIFICAÇÃO: use a escada do bloco "COMO QUALIFICAR" — vale igual aqui.)
(COMO DISPARAR O RAIO-X: ver o bloco "A DEMONSTRAÇÃO" — vale igual aqui.)
FORA DO ICP (curiosa, concorrente, quer emprego/renda extra): agradeça com carinho e encerre — não insista.`;
}

/** Playbook das 9 páginas do wizard de implantação: o que a cliente vê ·
 *  dúvidas comuns · o que orientar. Tom Duda amigável, "seu espaço" sempre. */
const WIZARD_PAGES: Array<{ n: number; titulo: string; guia: string }> = [
  {
    n: 1,
    titulo: 'Seu espaço',
    guia: 'Ela vê: nome do espaço, logo, telefone, Instagram e endereço. Dúvidas comuns: "preciso de CNPJ/logo agora?" — não, dá pra completar depois nas configurações. Oriente: preencher o nome do jeito que as clientes conhecem; só isso já destrava a página.',
  },
  {
    n: 2,
    titulo: 'Horários de Funcionamento',
    guia: 'Ela vê: dias da semana com liga/desliga e horário de início/fim (+ fuso). Dúvidas: "atendo só com hora marcada / horário quebrado". Oriente: marcar os dias em que ATENDE e o intervalo geral; almoço e exceções se afinam depois — isso alimenta a agenda e a atendente virtual.',
  },
  {
    n: 3,
    titulo: 'Serviços',
    guia: 'Ela vê: lista de serviços com nome, duração e preço (já vem um catálogo-modelo pra ajustar). Dúvidas: "meu preço varia por cliente", "faço pacotes". Oriente: cadastrar os principais do dia-a-dia com o preço base; dá pra editar e criar pacotes depois. Sem serviço cadastrado a agenda não funciona.',
  },
  {
    n: 4,
    titulo: 'Seus profissionais',
    guia: 'Ela vê: quem atende no espaço (nome e quais serviços executa). Dúvidas: "trabalho sozinha, cadastro o quê?" — ela mesma é a profissional. Oriente: cadastrar quem atende hoje; equipe nova entra a qualquer momento depois.',
  },
  {
    n: 5,
    titulo: 'Sua EquipIA',
    guia: 'Ela vê: a atendente virtual do espaço (nome, tom de voz, o que pode responder). Dúvidas: "vai responder minhas clientes sozinha?" — responde pelo WhatsApp conectado, com o tom que ela escolher, e dá pra ajustar ou pausar quando quiser. Oriente: escolher um nome e um tom com a cara do espaço.',
  },
  {
    n: 6,
    titulo: 'Seus usuários da Plataforma',
    guia: 'Ela vê: convites de acesso ao painel (nome, e-mail, perfil admin/gestor/vendedor). Dúvidas: "preciso convidar alguém?" — não, o acesso dela já existe. Oriente: convidar só quem vai USAR o painel; cada convidado define a própria senha pelo link do e-mail.',
  },
  {
    n: 7,
    titulo: 'Resumo (LGPD)',
    guia: 'Ela vê: revisão de tudo que preencheu + aceite de tratamento de dados (LGPD). Dúvidas: "meus dados e os das minhas clientes estão seguros?" — sim: uso restrito à operação do espaço, conforme a LGPD. Oriente: conferir com calma e enviar; nada é definitivo, tudo se edita depois.',
  },
  {
    n: 8,
    titulo: 'Conectar seu WhatsApp (QR)',
    guia: 'Ela vê: um QR code pra conectar o WhatsApp do espaço. Dúvidas: onde escanear (WhatsApp > Configurações > Aparelhos conectados > Conectar aparelho), QR expirado (é só gerar de novo), "vou perder meu número?" — não perde: o WhatsApp continua normal no celular dela. Oriente passo a passo, UM passo por mensagem; se não conectar após 2 tentativas, escale.',
  },
  {
    n: 9,
    titulo: 'Montando seu Espaço',
    guia: 'Ela vê: tela de progresso enquanto tudo é criado automaticamente. Dúvidas: "travou?" — leva alguns instantes; recarregar não perde nada. Oriente: quando concluir, o painel está pronto — comemore e mostre o primeiro passo (abrir a agenda e conhecer o painel).',
  },
];

/**
 * Bloco curto de fase pro prompt: onde a cliente está no wizard + o playbook
 * das 9 páginas. `sub` = linha mais recente de onboarding_submissions da org
 * vinculada (ou null se ela ainda não abriu o assistente).
 */
function buildOnboardingPhaseContext(sub: Record<string, any> | null): string {
  const step = sub && typeof sub.current_step === 'number' ? sub.current_step : null;
  const stepId = typeof sub?.current_step_id === 'string' && sub.current_step_id ? sub.current_step_id : null;
  const status = typeof sub?.status === 'string' ? sub.status : null;

  let fase: string;
  if (!sub) {
    fase = 'Ela ainda NÃO abriu o assistente de implantação. Dê boas-vindas pela compra e convide-a a começar (o link da montagem foi enviado aqui no WhatsApp e o acesso chegou no e-mail dela).';
  } else if (status === 'applied' && (step == null || step >= 9)) {
    fase = 'Implantação CONCLUÍDA — o espaço dela já está no ar. Parabenize e oriente os primeiros passos no painel (agenda, atendente virtual).';
  } else if (step != null) {
    const pg = WIZARD_PAGES.find((p) => p.n === step);
    fase = `Ela está na PÁGINA ${step} de 9${pg ? ` — "${pg.titulo}"` : ''}${stepId ? ` (id: ${stepId})` : ''}. Oriente a partir DESSA página, AFIRMANDO que você vê onde ela está.`;
  } else {
    fase = 'Ela abriu o assistente há pouco (página ainda não registrada — deve estar no comecinho, página 1 "Seu espaço"). Oriente a partir do início; NÃO pergunte em qual tela ela está.';
  }

  const playbook = WIZARD_PAGES.map((p) => `${p.n}. ${p.titulo}: ${p.guia}`).join('\n');
  return (
    `\n═══════════════════════════════════════\nFASE DA IMPLANTAÇÃO (pós-compra — MODO IMPLANTAÇÃO ATIVO)\n═══════════════════════════════════════\n` +
    `A cliente JÁ COMPROU e agora monta o espaço dela no assistente de implantação (9 páginas).\nFASE ATUAL: ${fase}\n\n` +
    `PLAYBOOK DO ASSISTENTE (por página: o que ela vê · dúvidas comuns · como orientar):\n${playbook}\n\n` +
    `COMO O ASSISTENTE FUNCIONA (explique proativamente no início e sempre que fizer sentido):\n` +
    `- Tudo que ela preenche SALVA AUTOMATICAMENTE — pode parar e retomar depois de onde parou, inclusive em outro aparelho (o assistente reabre na mesma página).\n` +
    `- O link abre em UM navegador por vez. Se aparecer "link em uso em outro navegador", basta tocar em "Usar neste navegador" — a sessão vem pra onde ela está.\n` +
    `- O passo 8 tem um QR code que precisa ser escaneado com o CELULAR DELA — por isso o ideal é abrir o link no computador (ou em outro celular).\n`
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  // Estado do claim mora FORA do try DE PROPÓSITO: o `finally` lá embaixo precisa
  // soltar a conversa em TODA saída — os ~18 `return json({skipped:…})` do meio do
  // caminho, o erro 5xx e a exceção inclusive. Claim que vaza trava a lead até o
  // TTL expirar, então o release não pode depender de lembrar de cada return.
  let releaseClaim: (() => Promise<void>) | null = null;
  // Só é preenchido quando esta invocação REALMENTE respondeu: hand-back sem
  // resposta entregue viraria loop de invocação sem fala.
  let handback: (() => Promise<void>) | null = null;
  let forceOrphanWake = false;
  let orphanWakeConversationId: string | null = null;
  let orphanWakeHandbackDepth = 0;
  let orphanWakeReqUrl = '';

  try {
    const body = await req.json().catch(() => ({}));
    const conversationId: string | null = body?.conversation_id ?? null;
    if (!conversationId) return json({ error: 'conversation_id is required' }, 400);
    // Profundidade do hand-back (payload interno; ausente = chamada externa = 0).
    const handbackDepth = Number(body?.handback_depth) || 0;
    const ensureReply = body?.ensure_reply === true;
    orphanWakeConversationId = conversationId;
    orphanWakeHandbackDepth = handbackDepth;
    orphanWakeReqUrl = req.url;

    // ── MODO INATIVIDADE (régua — payload interno do platform-inactivity-sweeper).
    // { conversation_id, occurrence: N, repertoire_stage: 1-4|'janela_24h',
    //   deadline_context } → NÃO há mensagem nova da cliente; a Duda dá o
    // próximo passo usando o REPERTÓRIO do estágio (nunca texto fixo). Os guards
    // de re-entrega/debounce (feitos p/ inbound novo) não se aplicam aqui.
    const inactivityStage = parseRepertoireStage(body?.repertoire_stage);
    const inactivityMode = inactivityStage != null;
    const inactivityOccurrence = Number(body?.occurrence) || null;
    const inactivityDeadline = typeof body?.deadline_context === 'string'
      ? body.deadline_context.slice(0, 300)
      : '';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1) Conversa — só age nos canais de WhatsApp atendidos, com bot ativo.
    const { data: conversation, error: convError } = await supabase
      .from('platform_crm_conversations')
      // meta_connection_id é OBRIGATÓRIO no select: é ele que diz por qual
      // número responder (a conexão que RECEBEU a mensagem da lead).
      // evolution_instance_id é o equivalente do canal Evolution (qual número
      // burner recebeu) — sem ele não há por onde responder naquele canal.
      // conversation_state (PR-B): a memória do que JÁ foi feito nesta conversa.
      // Sem ela, cada invocação re-deriva do histórico bruto "já me apresentei?",
      // "já ofereci a demo?" — e re-deriva ERRADO sob pressão.
      // visitor_id: usado pelo GATE DO CANARY logo abaixo (prefixo 'wa:eval-').
      .select('id, channel, status, product_id, lead_id, current_agent_id, visitor_id, visitor_name, visitor_phone, visitor_whatsapp, meta_connection_id, evolution_instance_id, conversation_state, metadata')
      .eq('id', conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      return json({ error: 'Conversation not found' }, 404);
    }
    if (!BRAIN_CHANNELS.includes(String(conversation.channel))) {
      return json({ skipped: 'not_whatsapp', channel: conversation.channel });
    }
    // ─── GATE DO CANARY: só conversa de eval, e a trava mora AQUI ─────────────
    // Achado da revisão adversarial pré-deploy: NÃO existia nenhum guard de entrega
    // dentro desta função. O que impedia o canary de mandar WhatsApp de verdade era
    // um dado do CHAMADOR — o telefone sem dígitos que o harness grava. Ou seja: a
    // barreira não estava onde o comentário do canary dizia que estava.
    //
    // Cenário concreto que isso fecha: alguém invoca o canary com um conversation_id
    // REAL pra "reproduzir o bug com dado de verdade" — que é exatamente o que um
    // canary parece servir. Sem este gate, ele toma o claim da conversa, resolve a
    // conexão Meta real e ENTREGA no WhatsApp da lead, sem aviso e sem dry-run.
    //
    // A trava dentro da função sobrevive a mudança de harness; a do chamador não.
    if (new URL(req.url).pathname.endsWith('-canary')) {
      const vid = String(conversation.visitor_id ?? '');
      if (!vid.startsWith('wa:eval-')) {
        console.error('[platform-sales-brain] CANARY recusou conversa NÃO-eval', {
          conversation_id: conversation.id,
          visitor_id_prefixo: vid.slice(0, 12),
        });
        return json({
          error: 'canary_refuses_real_conversation',
          detail: "O canary só atende conversas de eval (visitor_id 'wa:eval-'). " +
            'Para conversa real, invoque platform-sales-brain.',
        }, 409);
      }
    }

    // O check de status vem DEPOIS do gate do canary — a ordem importa, e a inversão
    // foi achado da Controladora GO-LIVE ao testar o gate em runtime.
    //
    // Com o check ANTES, o gate ficava intestável pelo caminho óbvio: conversa real
    // em `human_active` retornava 'bot_not_active' e NUNCA 409, e a leitura natural
    // do resultado seria "o gate não existe" — falso negativo de desenho de teste.
    // Pior: só era possível alcançar o gate usando conversa `bot_active`, isto é,
    // uma lead REAL e ATIVA — o teste exigia apontar o canary justamente para o que
    // ele existe pra proteger.
    //
    // Com o gate primeiro, ele é a primeira decisão do canary sobre a conversa,
    // aparece sempre no log, e não depende do estado dela pra existir.
    if (conversation.status !== 'bot_active') {
      return json({ skipped: 'bot_not_active', status: conversation.status });
    }

    // 1b) CLAIM DA CONVERSA — INCONDICIONAL, e é o ponto todo desta correção.
    //     Não existe `if` de idade, de canal, de latência ou de modo antes daqui:
    //     TODA invocação que chegou até aqui tenta tomar a conversa. O defeito
    //     anterior nasceu exatamente disso — o guard 'superseded' morava DENTRO
    //     de `if (ageMs < DEBOUNCE_MS)`, então qualquer invocação com gatilho já
    //     maduro (áudio transcrito, cold start, retry, download de mídia, fila)
    //     pulava o sleep, o reload E o guard inteiro, e ia direto responder por
    //     cima de quem já estava falando. Claim que nasce dentro de um `if`
    //     herda o mesmo furo — e fica MAIS difícil de enxergar, porque com fila
    //     o sistema parece robusto.
    //     UPDATE condicional com RETURNING é atômico: as duas invocações
    //     serializam na trava da linha e o Postgres reavalia o WHERE na versão
    //     nova (READ COMMITTED), então só UMA leva a linha de volta.
    //     Advisory lock de sessão não serve aqui: supabase-js fala por pool HTTP,
    //     não há sessão persistente onde o lock sobreviva à requisição.
    const claimToken = crypto.randomUUID();
    const claimExpiredBefore = new Date(Date.now() - BRAIN_CLAIM_TTL_MS).toISOString();
    const { data: claimedRows, error: claimError } = await supabase
      .from('platform_crm_conversations')
      .update({ brain_claim_at: new Date().toISOString(), brain_claim_token: claimToken })
      .eq('id', conversationId)
      // Livre OU abandonado: claim mais velho que o TTL é de invocação morta.
      .or(`brain_claim_at.is.null,brain_claim_at.lt.${claimExpiredBefore}`)
      .select('id');
    if (claimError) {
      // Sem dono definido, calar é o erro barato; falar por cima é o caro.
      // 503 (não 200) porque o sweeper só alerta em resposta não-ok — falha de
      // infra no claim TEM que aparecer.
      console.error('[platform-sales-brain] claim falhou:', claimError.message);
      return json({ error: 'claim failed', detail: claimError.message }, 503);
    }
    if (!claimedRows || claimedRows.length === 0) {
      // Perdedor sai; agenda ensure_reply wake (anti-orfao de rajada). Nao reencadeia.
      if (!ensureReply && body?.repertoire_stage == null) {
        const base = Deno.env.get('SUPABASE_URL') ?? '';
        const secret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
        if (base && secret) {
          const segs = new URL(req.url).pathname.split('/').filter(Boolean);
          const iv1 = segs.indexOf('v1');
          const selfFn = (iv1 >= 0 && segs[iv1 + 1]) ? segs[iv1 + 1] : 'platform-sales-brain';
          const wake = (async () => {
            await sleep(DEBOUNCE_MS + 1500);
            try {
              const r = await fetch(`${base}/functions/v1/${selfFn}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-brain-secret': secret },
                body: JSON.stringify({ conversation_id: conversationId, ensure_reply: true }),
              });
              if (!r.ok) console.error('[platform-sales-brain] ensure_reply wake', r.status, (await r.text()).slice(0, 200));
            } catch (e) {
              console.error('[platform-sales-brain] ensure_reply wake error:', e);
            }
          })();
          const rt = (globalThis as any).EdgeRuntime;
          if (rt?.waitUntil) rt.waitUntil(wake); else void wake;
          console.warn('[platform-sales-brain] brain_busy — ensure_reply wake agendado', { conversation_id: conversationId });
        }
      }
      return json({ skipped: 'brain_busy', conversation_id: conversationId });
    }
    releaseClaim = async () => {
      // Solta SÓ o que ainda é nosso: se o TTL estourou no meio do caminho e
      // outra invocação assumiu, limpar aqui derrubaria o claim DELA e traria de
      // volta o entrelaçamento que este bloco existe pra matar.
      const { error } = await supabase
        .from('platform_crm_conversations')
        .update({ brain_claim_at: null, brain_claim_token: null })
        .eq('id', conversationId)
        .eq('brain_claim_token', claimToken);
      if (error) {
        console.warn('[platform-sales-brain] release do claim falhou (TTL cobre):', error.message);
      }
    };

    // Helper: carrega as msgs vivas (desc), com metadata (pro wa_timestamp).
    const loadMessages = async (): Promise<Array<Record<string, any>>> => {
      const { data } = await supabase
        .from('platform_crm_messages')
        // `seq` (identity, atribuído no INSERT) entra no select só pra marca
        // d'água da rajada. A ORDENAÇÃO do histórico segue por created_at de
        // propósito: mudar o critério de ordem das 30 msgs é outro assunto e
        // outro risco — aqui a régua é não mexer no que já fatura.
        .select('seq, content, sender_type, direction, is_deleted, created_at, metadata')
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(30);
      return (data as Array<Record<string, any>>) || [];
    };
    const lastInboundOf = (msgs: Array<Record<string, any>>) =>
      msgs.find((m) => m.direction === 'inbound' && m.sender_type === 'visitor') ?? null;
    // O relógio da inbound mudou de casa: _shared/inbound-clock.ts (PR-D).
    // A closure que morava aqui ancorava SÓ em metadata.wa_timestamp, e era essa a
    // doença — o comentário logo abaixo (marca d'água) já explicava por que aquele
    // relógio é o errado, mas a lição não tinha atravessado estas 20 linhas.

    let historyDesc = await loadMessages();
    const triggerInbound = lastInboundOf(historyDesc);

    // Marca d'água da rajada JÁ COBERTA por esta execução — base do hand-back.
    // Usa `seq` (identity, atribuído pelo banco no INSERT) e NUNCA created_at ou
    // metadata.wa_timestamp: esses dois dizem quando a mensagem existiu NO MUNDO,
    // não quando a linha ficou VISÍVEL no banco. O áudio prova a diferença — o
    // wa_timestamp dele é ANTERIOR ao da mensagem de texto irmã, mas a linha só
    // nasce ~12s depois, quando a transcrição termina. Ordenar visibilidade por
    // relógio do WhatsApp está errado por construção.
    const maxInboundSeq = (msgs: Array<Record<string, any>>): number | null =>
      msgs.reduce<number | null>((acc, m) => {
        if (m.direction !== 'inbound' || m.sender_type !== 'visitor') return acc;
        const s = typeof m.seq === 'number' && Number.isFinite(m.seq) ? m.seq : null;
        return s != null && (acc == null || s > acc) ? s : acc;
      }, null);
    let coveredInboundSeq = maxInboundSeq(historyDesc);

    // HAND-BACK — armado AQUI, logo depois do claim, e não lá no fim de propósito:
    // ele precisa valer para TODA saída que segure a conversa, inclusive as que
    // desistem no meio (stale_redelivery, erro do provedor de IA, sem persona).
    // Enquanto seguramos o claim, qualquer mensagem nova da lead bateu nele e saiu
    // com 'brain_busy'; se ela entrou no banco depois do nosso snapshot, não coube
    // nesta resposta E não sobrou ninguém pra respondê-la. Sem isto, consertar a
    // CORRIDA compraria lead GHOSTADA — troca ruim: resposta dobrada incomoda,
    // silêncio perde venda. Roda no `finally`, DEPOIS do release — senão a
    // invocação filha bateria no nosso próprio claim.
    handback = async () => {
      if (coveredInboundSeq == null) return;
      if (handbackDepth >= HANDBACK_MAX_DEPTH) {
        console.warn(
          `[platform-sales-brain] hand-back no teto (${handbackDepth}) em ${conversationId} — parando: cada salto responde mensagem real, acima disso é loop.`,
        );
        return;
      }
      const { data: pendentes, error: pendErr } = await supabase
        .from('platform_crm_messages')
        .select('seq')
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .eq('direction', 'inbound')
        .eq('sender_type', 'visitor')
        .gt('seq', coveredInboundSeq)
        .limit(1);
      if (pendErr) {
        console.warn('[platform-sales-brain] hand-back não pôde conferir pendências:', pendErr.message);
        return;
      }
      if (!pendentes || pendentes.length === 0) return;

      const base = Deno.env.get('SUPABASE_URL') ?? '';
      const secret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
      if (!base || !secret) {
        console.error('[platform-sales-brain] hand-back IMPOSSÍVEL (SUPABASE_URL/BRAIN_INTERNAL_SECRET ausentes) — mensagem nova da lead ficaria sem resposta.');
        return;
      }
      // AUTO-REFERÊNCIA: o hand-back tem que voltar pra ESTA função, não pro nome
      // hardcoded. Sem isto, o canary (platform-sales-brain-canary) faria hand-back
      // pro brain de PRODUÇÃO e o 2º salto de todo teste mediria a função errada —
      // um passe oco igual ao que a Controladora achou nos goldens da Bia.
      // Descoberto pela URL que nos invocou, e não por env: secret no Supabase é do
      // PROJETO, não por função — não existe "env do canary".
      // Extrai o segmento LOGO APÓS /functions/v1/ — não o último do path.
      // `pop()` cru tinha dois furos (achados na revisão adversarial):
      //  (a) sub-path (/functions/v1/platform-sales-brain/x) devolvia 'x' ⇒ 404;
      //  (b) pathname vazio caía no fallback 'platform-sales-brain', ou seja: o
      //      canary faria hand-back pra PRODUÇÃO. Um default que falha pro lado
      //      INSEGURO é pior do que não ter default.
      // Agora, path não reconhecido ⇒ hand-back falha ALTO e aparece no log, em vez
      // de vazar tráfego de teste pra função real.
      const segs = new URL(req.url).pathname.split('/').filter(Boolean);
      const iv1 = segs.indexOf('v1');
      const selfFn = (iv1 >= 0 && segs[iv1 + 1]) ? segs[iv1 + 1] : '';
      if (!selfFn) {
        console.error(
          '[platform-sales-brain] hand-back ABORTADO: não derivei o nome da função de',
          new URL(req.url).pathname,
        );
        return;
      }
      const call = fetch(`${base}/functions/v1/${selfFn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-brain-secret': secret },
        body: JSON.stringify({ conversation_id: conversationId, handback_depth: handbackDepth + 1 }),
      }).then(async (r) => {
        if (!r.ok) console.error('[platform-sales-brain] hand-back retornou', r.status, (await r.text()).slice(0, 200));
      }).catch((e) => console.error('[platform-sales-brain] hand-back fetch error:', e));
      // SEMPRE await. waitUntil-only (padrão antigo do webhook) perdia o hand-back
      // quando o isolate encerrava ao devolver a 1ª resposta — medido 2026-08-11
      // E2E Marcelo: inbound durante/após LLM ("E seu software" / "Faz o que?")
      // ficou sem 2º turno (conversation_state.atualizado_seq ficou no snapshot
      // pré-pergunta). Silêncio > latência extra neste request.
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(call);
      await call;
    };

    // MODO INATIVIDADE — corrida sweep→brain: se a cliente respondeu entre a
    // decisão do sweeper e esta execução, a retomada é OBSOLETA (o fluxo normal
    // do webhook responde a inbound nova). Também não há o que retomar se a
    // Duda nunca falou nesta conversa.
    if (inactivityMode) {
      const newest = historyDesc[0] ?? null;
      if (newest && newest.direction === 'inbound' && newest.sender_type === 'visitor') {
        return json({ skipped: 'client_replied' });
      }
      const botSpoke = historyDesc.some((m: any) => isOurOutbound(m));
      if (!botSpoke) return json({ skipped: 'no_bot_message_to_follow_up' });
    }

    // 2) ANTI-RE-ENTREGA VELHA: se a inbound-gatilho tem wa_timestamp real (segundos)
    //    e é mais velha que 10 min, o Meta re-entregou uma msg antiga — não responde
    //    (senão a Duda se reapresenta 13 min depois, bug real de 2026-07-04). Exige a
    //    fonte da Meta: o created_at recente de uma re-entrega enganaria o guard.
    //    NÃO se aplica ao modo inatividade: ali a inbound é VELHA por definição
    //    (o silêncio É o gatilho).
    if (triggerInbound && !inactivityMode) {
      const meta = (triggerInbound.metadata && typeof triggerInbound.metadata === 'object')
        ? triggerInbound.metadata as Record<string, any> : {};
      const tsSecs = typeof meta.wa_timestamp === 'number' ? meta.wa_timestamp
        : (typeof meta.wa_timestamp === 'string' ? Number(meta.wa_timestamp) : NaN);
      if (Number.isFinite(tsSecs) && tsSecs > 0) {
        const ageMs = Date.now() - tsSecs * 1000;
        if (ageMs > STALE_REDELIVERY_MS) {
          return json({ skipped: 'stale_redelivery', age_ms: ageMs });
        }
      }
    }

    // 3) DEBOUNCE / AGREGAÇÃO (o defeito da RAJADA): a lead manda um pensamento
    //    só, em pedaços. Aqui NÃO se decide mais QUEM responde — isso foi
    //    decidido no claim, e somos os donos. Aqui se decide só QUANTO ESPERAR
    //    antes de ler o histórico, pra que UMA resposta cubra a rajada inteira.
    //
    //    Duas mudanças deliberadas em relação à versão que produziu o bug:
    //    (a) o RELOAD virou incondicional. Antes ele morava dentro de
    //        `if (ageMs < DEBOUNCE_MS)`, então gatilho maduro nunca reconferia o
    //        histórico e respondia com uma foto velha do banco.
    //    (b) o guard 'superseded' foi REMOVIDO. Ele existia pra desempatar
    //        invocações concorrentes; com claim, quem perdeu JÁ SAIU — se a dona
    //        também saísse ao ver mensagem mais nova, ninguém responderia e a
    //        lead levaria silêncio. Mensagem que chega agora ENGROSSA esta
    //        resposta, não cancela ela.
    //    (Modo inatividade pula: não há rajada — não há mensagem nova.)
    let debounceWaitedMs = 0;
    if (triggerInbound && DEBOUNCE_MS > 0 && !inactivityMode) {
      const tDebounce0 = Date.now();
      let extensoes = 0;
      let refMs = inboundEpochMs(triggerInbound);
      let wait = debounceWaitMs(refMs, Date.now(), DEBOUNCE_MS);
      while (wait > 0) {
        await sleep(wait);
        debounceWaitedMs += wait;
        historyDesc = await loadMessages();
        const newest = lastInboundOf(historyDesc);
        refMs = inboundEpochMs(newest);
        wait = slidingDebounceExtraMs({
          newestRefMs: refMs,
          agoraMs: Date.now(),
          janelaMs: DEBOUNCE_MS,
          elapsedTotalMs: Date.now() - tDebounce0,
          maxTotalMs: DEBOUNCE_MAX_TOTAL_MS,
          extensoesFeitas: extensoes,
          maxExtensoes: DEBOUNCE_MAX_EXTEND,
        });
        if (wait > 0) {
          extensoes += 1;
          console.log('[platform-sales-brain] debounce deslizante: extensao', { conversation_id: conversationId, extensoes, wait_ms: wait });
        }
      }
      historyDesc = await loadMessages();
      coveredInboundSeq = maxInboundSeq(historyDesc);
    }

    // 4) Idempotência leve: última msg = outbound do bot com <5s ⇒ não responde.
    const latest = historyDesc[0];
    if (
      latest &&
      latest.direction === 'outbound' &&
      latest.sender_type === 'bot' &&
      Date.now() - new Date(latest.created_at).getTime() < DEDUP_WINDOW_MS
    ) {
      return json({ skipped: 'recent_bot_message' });
    }

    // 5) Histórico cronológico + detecção de conversa já iniciada pelo bot.
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
    // Já existe fala nossa (bot OU agent/device)? Então CONTINUA — proíbe reapresentação.
    const botAlreadySpoke = historyDesc.some((m: any) => isOurOutbound(m));

    // 6) MEMÓRIA: estado do lead (BANT + o que já sabemos em metadata).
    let lead: Record<string, any> | null = null;
    if (conversation.lead_id) {
      const { data: leadRow } = await supabase
        .from('platform_crm_leads')
        .select('id, name, temperature, bant_budget, bant_authority, bant_need, bant_timing, notes, metadata')
        .eq('id', conversation.lead_id)
        .maybeSingle();
      lead = (leadRow as Record<string, any> | null) ?? null;
    }
    const leadMemoryContext = buildLeadMemoryContext(lead);

    // 7) PERSONA — agentes do produto ativos e habilitados no WhatsApp.
    //    ROTEAMENTO POR CONVERSA (linha Duda→Bia): respeita current_agent_id
    //    (a Bia continua o que a Duda passou); sem ele, a Duda (SDR) abre e
    //    persistimos current_agent_id=duda.id na conversa (pin determinístico).
    let persona: Record<string, any> | null = null;
    let sdrAgentId: string | null = null; // id da Duda — alvo do pin inicial
    // Motivo do roteamento: 'pinned' | 'sdr_open' | 'sdr_fallback_orphan_pin' | 'no_persona'.
    // O fallback órfão (pin apontando pra agente inativo/inexistente) precisa GRITAR
    // e RE-PINAR — antes ele caía na Duda em silêncio, indistinguível de conversa nova.
    let routeReason: string = 'no_persona';
    let orphanAgentId: string | null = null;
    if (conversation.product_id) {
      const { data: agents } = await supabase
        .from('platform_crm_product_agents')
        .select(
          'id, name, agent_type, primary_objective, tone_style, additional_prompt, prohibited_phrases, qualification_schema, is_active, active_in_whatsapp, product_id, model',
        )
        .eq('product_id', conversation.product_id)
        .eq('is_active', true)
        .eq('active_in_whatsapp', true);
      const agentList = (agents as Array<Record<string, any>>) || [];
      const sdrPersona = pickSdrPersona(agentList);
      sdrAgentId = sdrPersona?.id ?? null;
      const route = resolvePersonaForConversation(agentList, conversation.current_agent_id ?? null);
      persona = route.persona;
      routeReason = route.reason;
      orphanAgentId = route.orphanAgentId;

      // AMARRAÇÃO POR CANAL — precedência: pin > número dedicado > SDR abre.
      // Só entra quando a conversa AINDA NÃO tem dono (é o que 'sdr_open'
      // significa: resolvePersonaForConversation só devolve esse motivo com
      // current_agent_id nulo). Pin existente continua mandando — a linha
      // Duda→Bia→Lia fica intacta — e, sem vínculo cadastrado, nada muda.
      //
      // DELIBERADAMENTE não grava current_agent_id: o vínculo é a fonte da
      // verdade e cada mensagem o reconsulta. Assim, trocar o número dedicado
      // na tela "Canais" passa a valer na hora, em vez de deixar conversas
      // carimbadas com um dono velho que só uma migration desfaria.
      if (routeReason === 'sdr_open') {
        const boundAgentId = await resolveConnectionBoundAgentId(supabase, conversation);
        const bound = boundAgentId ? agentList.find((a) => a.id === boundAgentId) : null;
        if (bound) {
          persona = bound;
          routeReason = 'connection_bound';
          console.log(
            `[platform-sales-brain] agente por amarração de canal: ${bound.name ?? bound.id} ` +
              `(${bound.id}) conversation_id=${conversationId}`,
          );
        } else if (boundAgentId) {
          // Vínculo aponta agente que o cérebro não pode usar. Antes de cair na
          // SDR, GRITA — senão o número dedicado "não funciona" sem explicação.
          console.warn(
            `[platform-sales-brain] amarração de canal aponta agente ${boundAgentId} que NÃO está ` +
              `is_active + active_in_whatsapp no product_id ${conversation.product_id ?? 'null'} — a SDR abre`,
          );
        }
      }
    }

    if (!persona) {
      // Sem persona não há motor — não improvisa uma voz genérica no número oficial.
      // O guard de segurança continua (melhor calar que botar voz aleatória no número
      // de vendas), MAS calar em silêncio com tráfego PAGO rodando = lead comprada
      // morrendo sem ninguém saber. Agora ele GRITA. (Auditoria pré-ads 2026-07.)
      console.warn('[platform-sales-brain] sem persona ativa no WhatsApp para product_id:', conversation.product_id);
      await sendTelegramAlert(
        `🚨 SDR AUSENTE no número de vendas\n` +
        `Nenhuma persona ativa em WhatsApp para product_id: ${conversation.product_id ?? 'null'}.\n` +
        (orphanAgentId
          ? `Pior: a conversa ${conversationId} apontava current_agent_id=${orphanAgentId}, que TAMBÉM não resolve — handoff quebrado E sem Duda pra assumir.\n`
          : '') +
        `A lead ficou SEM RESPOSTA. Verifique se a Duda está is_active + active_in_whatsapp.`,
      );
      return json({ skipped: 'no_active_persona' });
    }

    // FALLBACK ÓRFÃO → a Duda assume E o pin quebrado é CURADO no banco.
    // Acontece quando current_agent_id aponta um agente que o cérebro não pode
    // usar (desativado, removido, ou tirado do WhatsApp — ex.: pin da Nina com
    // active_in_whatsapp=false). O invariante manda: conversa sem agente que
    // responda VOLTA pra SDR. Antes isso já acontecia, mas EM SILÊNCIO e SEM
    // curar a linha — o pin órfão sobrevivia e cada mensagem repetia o desvio.
    if (routeReason === 'sdr_fallback_orphan_pin') {
      console.warn(
        `[platform-sales-brain] pin órfão em ${conversationId}: current_agent_id=${orphanAgentId} não está ativo+WhatsApp — Duda (${persona.id}) assume.`,
      );
      await sendTelegramAlertThrottled(
        `orphan-pin:${conversationId}`,
        `⚠️ HANDOFF QUEBRADO — Duda assumiu\n` +
        `Conversa: ${conversationId}\n` +
        `current_agent_id órfão: ${orphanAgentId} (não está is_active + active_in_whatsapp no product_id ${conversation.product_id ?? 'null'}).\n` +
        `A SDR (${persona.name ?? persona.id}) assumiu e o pin foi corrigido — a lead NÃO ficou sem resposta.\n` +
        `Confira se o agente de destino foi desativado sem querer.`,
      );
    }

    // Papel do agente que vai falar AGORA (condiciona [PASSAR_BIA] e continuidade).
    const personaIsSdr = isSdrAgent(persona);
    const personaIsCloser = isCloserAgent(persona);
    // MODO RETENÇÃO (P2 · PR-B): a Nina (retention) cuida de quem já comprou —
    // sem links/preço, regras de cuidado. Tem PRECEDÊNCIA sobre o modo
    // implantação/venda (a persona pinada é quem manda). Só vira true quando a
    // persona escolhida é a Nina (por pin do nina-health-scan).
    const retentionActive = isRetentionAgent(persona);

    // MODO INATIVIDADE: a régua SÓ corre com persona SDR (espec — funil de
    // venda com SDR ativa). O sweeper já filtra; este é o cinto duplo contra
    // race (handoff pra Bia/Nina entre o sweep e esta execução).
    if (inactivityMode && !personaIsSdr) {
      return json({ skipped: 'inactivity_requires_sdr', persona_id: persona.id });
    }

    // PIN INICIAL (+ CURA DO PIN ÓRFÃO): se a conversa ainda não tem agente
    // fixado e a Duda vai abrir, grava current_agent_id=duda.id — assim a linha
    // começa ancorada nela. E se o pin existia mas estava ÓRFÃO, sobrescreve
    // pela Duda: sem isso a conversa ficaria com um dono fantasma no banco e o
    // desvio se repetiria a cada mensagem.
    if (
      (!conversation.current_agent_id || routeReason === 'sdr_fallback_orphan_pin') &&
      sdrAgentId && persona.id === sdrAgentId
    ) {
      await supabase
        .from('platform_crm_conversations')
        .update({ current_agent_id: sdrAgentId })
        .eq('id', conversationId);
    }

    // 7.5) MODO IMPLANTAÇÃO (gated, default OFF — ver bloco de consts acima).
    //     SELECT separado do principal DE PROPÓSITO (deploy-safe): se a
    //     migration 20260714 ainda não criou provisioned_organization_id, só
    //     ESTE select falha (catch abaixo) e o fluxo de venda segue idêntico.
    let onboardingActive = false;
    let onboardingPhaseContext = '';
    const onboardingFlagOn =
      (Deno.env.get('ONBOARDING_HANDOFF_ENABLED') ?? '').toLowerCase() === 'true';
    if (onboardingFlagOn) {
      try {
        const { data: convLink, error: linkErr } = await supabase
          .from('platform_crm_conversations')
          .select('provisioned_organization_id')
          .eq('id', conversationId)
          .maybeSingle();
        if (linkErr) throw linkErr;
        const provisionedOrgId = (convLink as Record<string, any> | null)?.provisioned_organization_id ?? null;
        if (provisionedOrgId) {
          const { data: sub } = await supabase
            .from('onboarding_submissions')
            .select('current_step, current_step_id, status, updated_at')
            .eq('organization_id', provisionedOrgId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          onboardingActive = true;
          onboardingPhaseContext = buildOnboardingPhaseContext((sub as Record<string, any> | null) ?? null);
        }
      } catch (e) {
        console.warn('[platform-sales-brain] contexto de implantação falhou (non-fatal):', String(e).slice(0, 200));
      }
    }

    // 7.6) MODO INBOUND (Ads CTWA · gap G3): a lead veio de um anúncio
    //     Click-to-WhatsApp → a Duda (SDR) abre ESPELHANDO o anúncio + qualifica
    //     leve → dispara a isca. Detecção pelo referral gravado pelo webhook (G1):
    //     preferimos a mensagem-gatilho (click ATUAL) e caímos no lead (first-touch).
    //     Só vale pra Duda abrindo (personaIsSdr) e fora dos modos pós-venda —
    //     NÃO é persona nova (roteamento do #68 intacto) e NÃO gata a oferta.
    const ctwaRef: CtwaReferral | null =
      parseCtwaReferral(
        triggerInbound?.metadata && typeof triggerInbound.metadata === 'object'
          ? { referral: (triggerInbound.metadata as Record<string, any>).referral }
          : null,
      ) ??
      parseCtwaReferral(
        lead?.metadata && typeof lead.metadata === 'object'
          ? { referral: (lead.metadata as Record<string, any>).referral }
          : null,
      );
    const inboundActive = personaIsSdr && !onboardingActive && !retentionActive && !!ctwaRef;
    const inboundAdContext = inboundActive ? buildInboundAdContext(ctwaRef!) : '';

    // MODO INATIVIDADE × pós-compra: a régua é do FUNIL DE VENDA — cliente em
    // implantação (já comprou) não recebe toque de inatividade de venda.
    if (inactivityMode && onboardingActive) {
      return json({ skipped: 'inactivity_not_for_onboarding' });
    }
    // Repertório do estágio (1-4 ou aviso de janela) — a Duda ADAPTA ao contexto
    // real da conversa; princípios + literais PROIBIDOS vivem em
    // _shared/inactivity-cadence.ts (unit-testados).
    const inactivityContext = inactivityMode
      ? buildInactivityRepertoire(inactivityStage!, inactivityDeadline)
      : '';

    // 8) CONHECIMENTO do produto + planos/preços (a âncora é o preço comparado de
    //    HOJE — não há escassez nem promessa de subida).
    let product: Record<string, any> | null = null;
    let plans: Array<Record<string, any>> = [];
    if (conversation.product_id) {
      const [productRes, plansRes] = await Promise.all([
        supabase
          .from('platform_crm_products')
          .select(
            'slug, name, description, pitch_2min, icp, objections, guarantee, discount_policy, plans, pricing, knowledge_base',
          )
          .eq('id', conversation.product_id)
          .maybeSingle(),
        // Planos + LINK DE CHECKOUT reais (a "maquininha" da Duda): quando o
        // cliente DECIDE, ela mesma manda o link — não precisa de closer.
        // list_price_monthly = preço de tabela (de-para do preço comparado em LINKS DE PAGAMENTO).
        supabase
          .from('public_plans')
          .select('name, slug, price_monthly, list_price_monthly, checkout_url, is_public')
          .order('price_monthly', { ascending: true }),
      ]);
      product = (productRes.data as Record<string, any> | null) ?? null;
      // R5: só planos PÚBLICOS entram na venda. A view public_plans traz Trial/Teste
      // (is_public=false); sem is_public no filtro, o "Teste E2E" R$10 com checkout LIVE
      // vazaria como link ofertável a um lead real. Exige checkout_url + is_public=true.
      plans = ((plansRes.data as Array<Record<string, any>>) ?? []).filter((p) => p.checkout_url && p.is_public);
    }

    // GATE B2B POR PRODUTO (2026-07-31 · decisão Marcelo (a)): os blocos de VENDA
    // da assinatura Nexvy (checkout real, regra de preço, escada de qualificação,
    // disparo do raio-x) só valem para o funil B2B de verdade — hoje o único
    // produto com esse funil é o NexvyBeauty (slug fixo, é o mesmo slug já
    // seedado em platform_crm_products para Duda/Bia/Nina/Lia/Bento). Critério
    // ALLOW-LIST (fail-closed): só entra quem casa o slug; qualquer produto novo
    // (demo, NexvyLAW, NexvyAds, NexvyPayments, Cofounder…) fica de fora por
    // padrão, sem precisar listar exceções. Todos os agentes de produção hoje
    // pertencem ao product_id do NexvyBeauty (conferido via MCP em 2026-07-31),
    // então isRealB2bFunnel é SEMPRE true para Duda/Bia/Nina — zero mudança de
    // comportamento pra elas.
    const B2B_SALES_PRODUCT_SLUG = 'nexvybeauty';
    const isRealB2bFunnel = (product?.slug ?? '') === B2B_SALES_PRODUCT_SLUG;

    // knowledgeContext = conhecimento do produto + LINKS DE PAGAMENTO (banco) +,
    // quando há preço, a REGRA DE PREÇO INVIOLÁVEL logo após a seção de links.
    // ?src=<slug> de atribuição: quem fala AGORA (persona) leva o crédito da venda.
    // persona já é não-nula aqui (guard acima); fallback 'duda' se o nome vier vazio.
    // MODO IMPLANTAÇÃO / RETENÇÃO: SEM links de pagamento nem regra de preço — a
    // cliente já comprou; instruções de "mande o link" corromperiam o papel de CS
    // (Lia) ou de retenção (Nina). Com onboardingActive=false E retentionActive=
    // false (todo fluxo de venda), a expressão é IDÊNTICA à atual.
    // FORA DO FUNIL B2B (!isRealB2bFunnel): NUNCA injeta LINKS DE PAGAMENTO nem a
    // REGRA DE PREÇO — public_plans é global (sem filtro de produto) e vazaria o
    // checkout REAL da Nexvy pra uma persona de demonstração de outro produto.
    const knowledgeContext = buildKnowledgeContext(product)
      + ((!isRealB2bFunnel || onboardingActive || retentionActive) ? '' : buildCheckoutContext(plans, persona.name ?? 'duda')
      + (plans.length ? PRICE_RULE_BLOCK : ''));
    const productName = product?.name ?? 'NexvyBeauty';
    const visitorName = conversation.visitor_name ?? null;

    // Campos ricos da persona → identidade + objetivo + tom + regras próprias.
    const prohibited = Array.isArray(persona.prohibited_phrases) && persona.prohibited_phrases.length
      ? persona.prohibited_phrases.map((p: string) => `- ${p}`).join('\n')
      : '';
    const qualification = persona.qualification_schema
      ? JSON.stringify(persona.qualification_schema)
      : '';

    // CONTINUIDADE DA BIA (closer): quando é a Bia que assume, a conversa NÃO
    // recomeça — a Duda já fez toda a descoberta e a passou. O bloco "O QUE JÁ
    // SABEMOS DA LEAD" abaixo é o dossiê; a Bia confirma 1 detalhe e conduz ao
    // fechamento. Só entra quando a persona ativa é o closer.
    const closerContinuityContext = personaIsCloser
      ? `\n═══════════════════════════════════════\nVOCÊ ESTÁ ASSUMINDO UMA CONVERSA (HANDOFF DA DUDA)\n═══════════════════════════════════════\nA Duda te passou o dossiê desta lead — tudo que vocês precisam já está em "O QUE JÁ SABEMOS DA LEAD". NUNCA se apresente do zero nem recomece a descoberta. Valide UM detalhe do que ela já disse ("vi aqui que você trabalha com X há Y, certo?") e conduza direto para a demonstração/fechamento do plano recomendado. Você é a especialista que fecha: apresente a oferta com a conta da recuperação, trate a objeção mais provável e vá pro checkout como próximo passo concreto.\n`
      : '';

    // PR-BDR-14: racionamento de NOME como DADO do turno — SÓ canal Evolution.
    // Regra de contagem no prompt não segurou (3 violações medidas 05-06/08:
    // "Oi Marcelo!" 2x seguidas, "Funciona assim, Marcelo", "Marcelo, você
    // chegou…"). O que o flash não faz por disciplina, faz por fato: se o nome
    // já saiu nas últimas 4 mensagens do bot, o turno recebe a proibição como
    // FATO — injetada DEPOIS das instruções da persona (recência vence).
    let nomeParaRacionar = '';
    let nameRationContext = '';
    if (conversation.channel === 'whatsapp_evolution' && visitorName) {
      const primeiroNome = String(visitorName).trim().split(/\s+/)[0] ?? '';
      if (primeiroNome.length >= 3) {
        const nomeRe = new RegExp(
          `\\b${primeiroNome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'i',
        );
        const usouRecente = historyDesc
          .filter((m: any) => isOurOutbound(m) && typeof m.content === 'string')
          .slice(0, 4)
          .some((m: any) => nomeRe.test(m.content));
        if (usouRecente) {
          nomeParaRacionar = primeiroNome;
          nameRationContext =
            `\nFATO DESTE TURNO: você já usou o nome "${primeiroNome}" nas últimas mensagens. ` +
            `PROIBIDO usar o nome dela nesta resposta — nenhuma vez.`;
        }
      }
    }

    // 9) System prompt: persona + memória + conhecimento + REGRAS FIXAS + FORMA.
    //     No modo RETENÇÃO a Nina NÃO é "de vendas" — dizer isso contradiria as
    //     regras dela; o papel vira Sucesso/Suporte/Retenção.
    const systemPrompt = `Você é ${persona.name}, ${retentionActive ? 'do time de Sucesso, Suporte e Retenção' : 'atendente de VENDAS'} por WhatsApp do produto ${productName}.
${persona.primary_objective ? `\nSEU OBJETIVO PRINCIPAL: ${persona.primary_objective}` : ''}
${persona.tone_style ? `\nTOM E ESTILO: ${persona.tone_style}` : ''}
${visitorName ? `\nCLIENTE: ${visitorName}` : ''}
${buildNowContext()}${closerContinuityContext}${persona.additional_prompt ? `\nINSTRUÇÕES ADICIONAIS DA PERSONA:\n${persona.additional_prompt}` : ''}${nameRationContext}
${qualification ? `\nESQUEMA DE QUALIFICAÇÃO (colete estes dados naturalmente na conversa): ${qualification}` : ''}
${prohibited ? `\nFRASES PROIBIDAS (nunca use):\n${prohibited}` : ''}
${leadMemoryContext}${knowledgeContext}${onboardingPhaseContext}${inboundAdContext}${inactivityContext}

═══════════════════════════════════════
REGRAS INVIOLÁVEIS DO CÉREBRO
═══════════════════════════════════════
1. NUNCA ofereça desconto. Se pedirem, reancore no VALOR (a conta da recuperação: 2-3 clientes de volta já pagam a mensalidade) e no PREÇO COMPARADO DE HOJE (o plano custa R$X e hoje sai por R$Y — os dois números estão em LINKS DE PAGAMENTO) — nunca em garantia, nunca em desconto e NUNCA em pressa.
2. NÃO existe "Piloto Fundadora" nem garantia de devolução por resultado. A redução de risco é honesta: PROVA (o raio-x, feito pela própria cliente na hora — ver bloco A DEMONSTRAÇÃO) + direito de arrependimento de 7 dias do checkout (lei). NUNCA prometa "devolvo se não recuperar", "risco é meu/nosso" ou "painel-juiz". O produto é PAGO — nunca o descreva como "teste gratuito" ou "trial".
3. NÃO EXISTE ESCASSEZ NENHUMA. É PROIBIDO dizer, sugerir ou insinuar que o preço vai subir, que a condição acaba, que é "por tempo limitado", "aproveite antes", "última chance", vaga, lote ou relógio — NÃO EXISTE DATA DE SUBIDA e prometer isso é mentir para a cliente. O que você tem é o PREÇO COMPARADO DE HOJE (o plano custa R$X e hoje sai por R$Y, em LINKS DE PAGAMENTO): um fato do presente, verificável agora. Se a lead disser "vou pensar", reancore no VALOR (a conta da recuperação) e no preço de hoje — nunca na pressa.
4. Preços e dados do produto: use SOMENTE o que está no conhecimento acima. Se não tiver, diga que confirma e não invente.
5. Você NUNCA rejeita uma venda nem decide que a lead "não está apta" — somos SaaS: pagou, é cliente. Toda conversa caminha para RECOMENDAR o plano certo pra realidade dela (carteira pequena/começando → plano de entrada com a conta honesta). NUNCA diga "você não se encaixa"; Trial só se a lead pedir para testar sem compromisso.
6. A tag ${ESCALATE_TAG} é SÓ para: a lead pediu humano, caso sensível ou fora do script (preço custom, parceria, imprensa) — JAMAIS por perfil ou tamanho de carteira. Se o cliente fizer RECLAMAÇÃO GRAVE ou exigir humano, use ${HANDOFF_TAG}.
${retentionActive ? RETENTION_RULE_BLOCK : onboardingActive ? ONBOARDING_RULE_BLOCK : !isRealB2bFunnel ? '' : personaIsSdr ? `7. CLIENTE DECIDIU → VOCÊ MESMA FECHA (nunca passe adiante quem já quer contratar): se a lead sinaliza DECISÃO ("quero contratar", "como pago", "quero começar", "fechou", "manda o link", aceitou explicitamente), a SUA RESPOSTA DEVE CONTER A URL do link do plano recomendado — cole o https://… exato da seção LINKS DE PAGAMENTO acima (é PROIBIDO responder "como pago"/"quero contratar" SEM a URL, ou perguntar "quer começar?"/"quer que eu te ajude?" a quem JÁ decidiu — ele já quer, mande o link). Diga que assim que o pagamento cair o acesso é liberado na hora, e fique à disposição para dúvidas. NÃO demonstre mais nada — quem já decidiu não precisa de nada além do link.
8. VOCÊ CONDUZ A CONVERSA ATÉ O FIM. Não existe "passar para outra pessoa" dentro do bot: lead cética/hesitante é SUA — aprofunde o VALOR (a conta da recuperação + a PROVA na carteira dela) e conduza ao fechamento você mesma. Só ${ESCALATE_TAG}/${HANDOFF_TAG} tiram a conversa de você, e só pelos motivos da regra 6.` : `7. VOCÊ É A CLOSER DE VALOR. Recebeu um cliente QUALIFICADO e CÉTICO que a SDR não convenceu sozinha — ele pode pagar mas ainda não quer, é exigente, cobra coerência. Seu trabalho é vender VALOR: conecte a dor concreta dele (carteira parada, cadeira vazia) ao mecanismo, reduza o risco com PROVA (demonstração na carteira dele) e a conta personalizada — NUNCA com garantia de devolução e NUNCA com pressa (não existe data de subida de preço — ver regra 3). NUNCA se reapresente (continue do dossiê). Quando ELE decidir, mande o LINK DE PAGAMENTO do plano na hora — não enrole quem já fechou.`}
${botAlreadySpoke ? '8. Esta conversa JÁ ESTÁ EM ANDAMENTO. CONTINUE do ponto atual. NUNCA se reapresente, NUNCA recomece do zero, NUNCA repita a saudação inicial.' : ''}
${(isRealB2bFunnel && !onboardingActive && !retentionActive) ? DEMO_RULE_BLOCK : ''}
${(isRealB2bFunnel && !onboardingActive && !retentionActive && personaIsSdr) ? QUALIFICACAO_RULE_BLOCK : ''}

═══════════════════════════════════════
COMO RESPONDER (WhatsApp — regras de forma DURAS)
═══════════════════════════════════════
- Responda em pt-BR, tom de conversa de WhatsApp: curto, humano, direto.
- CADA MENSAGEM = UMA IDEIA, em 1-2 linhas (~120 caracteres). PESSOAS NÃO DIGITAM
  TEXTÃO no WhatsApp. Parede de texto é o sinal nº1 de robô e a lead percebe na hora.
- SE precisar de duas ideias, separe por LINHA EM BRANCO. Cada parágrafo vira uma
  mensagem SEPARADA no WhatsApp. **MÁXIMO 2 PARÁGRAFOS. NUNCA 3.** Uma resposta sua
  são 1 ou 2 mensagens — três seguidas já é monólogo, e ninguém conversa assim.
- COMO AGRUPAR — é AQUI que se erra, e a regra de "máximo 2" sozinha não resolve.
  O modelo escreve em 3 tempos naturais (reação → conteúdo → pergunta) e obedece à
  própria cadência. Sua resposta tem no máximo DOIS tempos:
  (1) reação + conteúdo JUNTOS na mesma mensagem, (2) a pergunta.
  ❌ "Aaah que delícia!" / "Manicure R$45, pedicure R$50." / "Qual prefere?"
  ✅ "Aaah que delícia! Manicure R$45, pedicure R$50, ou as duas por R$85." / "Qual prefere?"
- PROIBIDO TEASER: mensagem cujo único conteúdo é anunciar a próxima ("Temos:",
  "Olha só:", "Deixa eu te contar:", "Veja as opções:"). Se a frase não se sustenta
  sozinha na tela da cliente, ela pertence à bolha seguinte — junte.
- Prefira SEMPRE a versão mais curta. Se dá pra dizer em 8 palavras, não use 20.
  Corte adjetivo, corte preâmbulo, corte repetição. Frase curta soa humana.
- EXATAMENTE UMA pergunta por resposta (ou nenhuma). Nunca faça duas perguntas juntas.
- NUNCA use ** ou __ ou # ou listas com hífen: o WhatsApp NÃO renderiza isso e o
  asterisco aparece CRU na tela da cliente. Para dar ênfase use *um asterisco só*.
- No máximo 1 emoji, e só quando couber.
- Reaja com calor ao que a lead disse antes de perguntar (micro-ack).
- COM QUEM VOCÊ FALA: você fala SEMPRE com quem está no chat. Se o assunto é para
  OUTRA pessoa (esposa, filha, mãe, sócia), fale DELA em 3ª pessoa — jamais se dirija
  a quem não está na conversa. "Seja bem-vinda" para a esposa que não está no chat é
  erro grave: mostra que você perdeu de vista com quem está falando.
- Use o nome do cliente quando souber, mas NÃO em toda mensagem. Repetir o nome a cada
  bolha soa a script de call center — uma vez, quando fizer sentido, basta.
- Nunca repergunte o que já está em "O QUE JÁ SABEMOS DA LEAD".
- Sempre avance a conversa (qualifique ou proponha próximo passo).

ANTES DE ENVIAR, revise (obrigatório):
1) Cabe em 2-3 linhas por mensagem?  2) Tem só UMA pergunta?
3) Tem asterisco duplo ou lista? (se sim, tire)  4) As duas ideias estão separadas por linha em branco?

${isRealB2bFunnel ? `❌ ERRADO (parede de texto, markdown, 2 perguntas):
"Que ótimo! O plano **Essencial** vai organizar sua agenda, otimizar atendimentos e ainda usar IA pra trazer de volta clientes sumidos, e olha, com seu ticket você recupera 2 ou 3 e já paga o mês. Quer que eu te mande o link? Ou prefere entender melhor antes?"

✅ CERTO (DUAS mensagens, uma ideia cada, UMA pergunta):
"Com ticket de R$89 e 200 clientes na base, bastam 2 ou 3 voltarem pra pagar o mês inteiro — e o Essencial faz exatamente isso.

Quer que eu te mostre no seu número?"` : `❌ ERRADO (empresês, monólogo de 3 bolhas, fala com quem não está no chat):
"Nosso próximo dia de funcionamento é na terça-feira, a partir das 9h.

Ela gostaria de agendar para terça, ou prefere manter hoje às 16h?

Seja bem-vinda ao Studio Flor!"

✅ CERTO (fala de gente, DUAS mensagens, 3ª pessoa para quem não está no chat):
"Amanhã é domingo e a gente fecha — mas terça já abre 9h 😊

Prefere terça pra ela, ou deixa às 16h de hoje mesmo?"`}`;

    // 10) LLM: gateway da casa. Modelo resolvido POR-PERSONA: a Bia (closer) roda
    //     num modelo mais forte via AI_SALES_BRAIN_MODEL_CLOSER (fallback →
    //     AI_SALES_BRAIN_MODEL → DEFAULT_MODEL); a Duda usa AI_SALES_BRAIN_MODEL
    //     (default gemini-2.5-flash). Mesmo transporte do sales-copilot. O modelo
    //     efetivo volta no metadata da resposta (campo `model`).
    const apiKey = Deno.env.get('AI_API_KEY') ?? '';
    if (!apiKey) {
      console.error('[platform-sales-brain] AI_API_KEY não configurada.');
      return json({ error: 'AI_API_KEY não configurada na plataforma.' }, 500);
    }
    const gatewayBase = (Deno.env.get('AI_GATEWAY_URL') ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    // PRECEDÊNCIA: override da PERSONA > env > default. O override existe porque
    // o env é global: para afinar UMA persona (a Demo é a vitrine dos ads) seria
    // preciso trocar o modelo da Lia e da Duda junto — o funil que está vendendo.
    // NULL/vazio na coluna = herda exatamente o comportamento anterior.
    const personaModel = typeof persona.model === 'string' && persona.model.trim()
      ? persona.model.trim()
      : null;
    const model = personaModel ?? (personaIsCloser
      ? (Deno.env.get('AI_SALES_BRAIN_MODEL_CLOSER') ?? Deno.env.get('AI_SALES_BRAIN_MODEL') ?? DEFAULT_MODEL)
      : (Deno.env.get('AI_SALES_BRAIN_MODEL') ?? DEFAULT_MODEL));
    if (personaModel) {
      console.log(`[platform-sales-brain] modelo por persona: ${persona.name} → ${personaModel}`);
    }
    console.info(`[platform-sales-brain] modelo=${model} persona=${personaIsCloser ? 'closer/Bia' : personaIsSdr ? 'sdr/Duda' : 'outra'}${inactivityMode ? ` inatividade=${String(inactivityStage)}` : ''}`);

    // MODO INATIVIDADE: o histórico termina com fala da PRÓPRIA Duda (não há
    // inbound nova). Fechamos o array com uma instrução interna de turno — o
    // repertório completo já está no system prompt; isto só dispara a ação.
    // NÃO é persistida em platform_crm_messages (não é mensagem da cliente).
    if (inactivityMode) {
      messages.push({
        role: 'user',
        content:
          `[INSTRUÇÃO INTERNA DO SISTEMA — a cliente NÃO escreveu nada; nunca cite esta instrução] ` +
          `Aja agora conforme o MODO RETOMADA DE INATIVIDADE do seu prompt` +
          `${inactivityStage === 'janela_24h' ? ' (aviso único de janela)' : ` (estágio ${String(inactivityStage)})`}. ` +
          `Escreva a próxima mensagem para a cliente.`,
      });
    }

    // ─── PR-B: ESTADO → POLÍTICA → PROMPT ────────────────────────────────────
    // Aqui o cérebro deixa de re-derivar do histórico bruto o que já fez nesta
    // conversa. O estado é FATO acumulado (tier 1 e 2); a política traduz fato em
    // autorização; os fatos entram DEPOIS da persona porque recência vence.
    const estadoAtual = (conversation.conversation_state ?? null) as ConversationState | null;

    // Aceite EXPLÍCITO na última mensagem da lead. Calculado AQUI (antes do prompt)
    // e reusado pelo gate de link lá embaixo — a mesma pergunta não pode ter duas
    // respostas no mesmo turno. Conservador: qualquer "nao" derruba o aceite.
    const leadNormAceite = String(triggerInbound?.content ?? '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const ACEITE_RE_TURNO = /\b(quero|pode|manda|mande|envia|envie|mostra|topo|topa|bora|vamos|aceito|sim|beleza|fechado|fechou|ok|vou colocar|coloca)\b/;
    // `!inactivityMode` é OBRIGATÓRIO aqui. Na retomada por inatividade não existe
    // mensagem nova dela: `triggerInbound` é a última fala da lead, de horas ou dias
    // atrás. Sem esta guarda, um "ok" velho conta como aceite DESTE turno e
    // `proibirOfertaDemo` (que é `recusou && !leadAceitouAgora`) destrava — a agente
    // reoferece a demo na retomada, que é o defeito nº2 medido sobrevivendo pelo
    // único caminho que o PR-B não cobria. Achado da revisão adversarial.
    const leadAceitouAgora = !inactivityMode &&
      ACEITE_RE_TURNO.test(leadNormAceite) && !/\bnao\b/.test(leadNormAceite);

    // A marca d'água precisa AVANÇAR mesmo em turno sem inbound nova. Se ela fosse
    // só `maxInboundSeq`, a retomada por inatividade (que por definição não tem
    // inbound nova) reduziria com o MESMO seq já gravado, e a guarda de idempotência
    // do reduzir() (`ev.seq <= s.atualizado_seq`) descartaria o TurnEvents inteiro:
    // a régua de retomada NUNCA gravaria nada, e o log ainda diria "trava barrou,
    // releu e reduziu" — afirmando recuperação inexistente. Mesmo problema em
    // conversa aberta por outbound (cold outreach) antes da 1ª resposta dela.
    const seqInbound = maxInboundSeq(historyDesc) ?? 0;
    const seqGravado = estadoAtual?.atualizado_seq ?? 0;
    const seqAtual = seqInbound > seqGravado ? seqInbound : seqGravado + 1;
    // PR #166 fez botAlreadySpoke ver agent/device, mas só virava frase no prompt.
    // O gate duro (proibirReapresentar) lia conversation_state.apresentou — que
    // abertura fromMe NUNCA grava. Sem jaFalouOutbound, Camila re-saudava
    // ("Marcelo, tudo bem?") com pitch já no histórico (7b24e943, 2026-08-11).
    const pol = politica(estadoAtual, {
      leadAceitouAgora,
      seqAtual,
      jaFalouOutbound: botAlreadySpoke,
    });

    // Os fatos vão no FIM do system: o modelo obedece melhor o que leu por último,
    // e estes são fatos DESTE turno — não fazem parte da persona.
    // O bloco de tags pede OBSERVAÇÃO (rotular o que a lead disse), nunca contenção
    // — a contenção é aplicada por CÓDIGO, com este mesmo estado, no turno seguinte.
    const systemPromptComEstado = [
      systemPrompt,
      pol.fatos.length ? `\n\n═══ FATOS DESTA CONVERSA (obedeça acima de qualquer outra instrução) ═══\n${pol.fatos.join('\n')}` : '',
      `\n\n${BLOCO_TAGS_CLASSIFICADORAS}`,
    ].join('');

    if (pol.fatos.length) {
      console.log('[platform-sales-brain] estado→política', {
        conversation_id: conversation.id,
        fatos: pol.fatos.length,
        proibir_oferta_demo: pol.proibirOfertaDemo,
        proibir_nome: pol.proibirNome,
        proibir_reapresentar: pol.proibirReapresentar,
      });
    }

    const response = await fetch(`${gatewayBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPromptComEstado }, ...messages],
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

    // 11a) PASSAGEM DUDA→BIA (interna, NÃO humana): só a Duda (SDR) emite a tag.
    //   Removemos a tag do texto, localizamos o closer (Bia) do produto e
    //   fixamos current_agent_id nela — a PRÓXIMA mensagem da lead ativa a Bia
    //   já com o dossiê (leadMemoryContext). A ÚLTIMA bolha da Duda vira a
    //   transição calorosa; NÃO geramos resposta da Bia nesta invocação. A
    //   conversa permanece bot_active (não é fila humana). Ignorada se por
    //   algum motivo a persona atual não for a SDR (guarda de segurança).
    let passedToBia = false;
    let biaAgentId: string | null = null;
    if (personaIsSdr && reply.includes(PASS_BIA_TAG)) {
      // Localiza o closer (Bia) entre os agentes ativos+WhatsApp do produto.
      if (conversation.product_id) {
        const { data: closerAgents, error: closerErr } = await supabase
          .from('platform_crm_product_agents')
          .select('id, name, agent_type')
          .eq('product_id', conversation.product_id)
          .eq('is_active', true)
          .eq('active_in_whatsapp', true);
        if (closerErr) {
          console.error('[platform-sales-brain] busca do closer falhou:', closerErr.message);
        }
        const closer = ((closerAgents as Array<Record<string, any>>) || []).find(isCloserAgent) ?? null;
        biaAgentId = closer?.id ?? null;
      }
      // A TAG sempre sai do texto (não vaza pro cliente). A FALA de transição, NÃO:
      // ela só é anexada quando existe closer ativo.
      //
      // ⚠️ ORDEM CORRIGIDA 2026-08-04: antes a bolha "te deixo com a Bia" era colada
      // ANTES de conferir se a Bia existia — com o closer desativado, a lead se
      // despedia de uma especialista que nunca ia falar e a Duda continuava
      // respondendo. Pior que não passar. Conferir depois de falar não conserta
      // nada: o texto já saiu.
      reply = reply.split(PASS_BIA_TAG).join('').replace(/\s+$/, '').trim();
      if (biaAgentId) {
        reply = reply ? `${reply}\n\n${PASS_BIA_MSG}` : PASS_BIA_MSG;
        passedToBia = true;
      } else {
        // SEM closer ativo: a Duda MANTÉM a conversa (invariante honrado — ninguém
        // fica órfão) e a lead NÃO ouve transição nenhuma — o texto segue como se a
        // tag nunca tivesse existido. Se o modelo só emitiu a tag, o `reply` fica
        // vazio e o fallback de bolhas responde com a pergunta neutra de sempre.
        console.warn('[platform-sales-brain] [PASSAR_BIA] emitido mas nenhum closer ativo no WhatsApp — tag descartada, Duda mantém a conversa (nenhuma transição foi dita à lead).');
        await sendTelegramAlertThrottled(
          `pass-bia-failed:${conversationId}`,
          `⚠️ [PASSAR_BIA] emitido SEM closer ativo — Duda mantém a conversa\n` +
          `Conversa: ${conversationId}\n` +
          `Nenhum closer is_active + active_in_whatsapp no product_id ${conversation.product_id ?? 'null'}.\n` +
          `A lead NÃO recebeu bolha de transição (a fala só é dita com closer ativo).\n` +
          `Se isto se repetir, o modelo está emitindo uma tag que o prompt não instrui mais.`,
        );
      }
    }

    // 10b) [ENVIAR_RAIOX] — Raio-X AUTOMÁTICO. Gera o link da demo via demo-start
    //      (público, honeypot+rate-limit) com nome+whatsapp da conversa e entrega
    //      na mesma resposta. Falhou → fallback caloroso + alerta Telegram (a lead
    //      NUNCA fica com promessa sem link e sem ninguém saber).
    // Conversa criada pelo harness de eval (prefixo 'wa:eval-'). Usado para NÃO
    // disparar alerta de ops em cenário de teste — ver o bloco do RAIO-X abaixo.
    const ehConversaDeEval = String(conversation.visitor_id ?? '').startsWith('wa:eval-');

    let sentRaiox = false;
    if (reply.includes(RAIOX_TAG)) {
      reply = reply.split(RAIOX_TAG).join('').replace(/\s+$/, '').trim();
      try {
        const appUrl = Deno.env.get('APP_URL') || 'https://app.nexvybeauty.com.br';
        const demoRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/demo-start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: (conversation.visitor_name ?? '').trim() || 'Meu espaço',
            whatsapp: conversation.visitor_whatsapp ?? conversation.visitor_phone ?? '',
          }),
        });
        const demo = await demoRes.json().catch(() => ({} as Record<string, unknown>));
        if (demoRes.ok && typeof demo?.url === 'string' && demo.url) {
          sentRaiox = true;
          // Curto de propósito: 2 linhas. A explicação do que o link faz já foi
          // dada pela Duda na mesma resposta — repetir aqui gerava 4 bolhas e um
          // textão de 343 chars (o excedente colapsava na última bolha).
          reply = `${reply ? reply + '\n\n' : ''}Aqui está 👉 ${appUrl}${demo.url}\n\nAbre no computador — o QR você lê com o celular 😉`;
        } else {
          console.warn('[platform-sales-brain] [ENVIAR_RAIOX] demo-start falhou:', demoRes.status, JSON.stringify(demo).slice(0, 200));
          // Conversa de EVAL não gera alerta de ops. O rig injeta telefone sem
          // dígitos ('eval-no-send'), o demo-start responde 400 whatsapp_invalido e
          // este alerta dispara: 2 saíram hoje que eram TESTE, não incidente.
          // Alerta que grita em teste treina quem recebe a ignorá-lo — e aí o
          // alerta real chega numa caixa que já aprendeu a não olhar.
          if (!ehConversaDeEval) await sendTelegramAlertThrottled(
            `raiox-failed:${conversationId}`,
            `⚠️ RAIO-X automático FALHOU (demo-start HTTP ${demoRes.status})\nConversa: ${conversationId}\nA Duda prometeu o raio-x e o link não saiu — intervir.`,
          );
          reply = `${reply ? reply + '\n\n' : ''}Vou preparar o seu Raio-X agora e te mando o link aqui em instantes 😉`;
        }
      } catch (raioxErr) {
        console.error('[platform-sales-brain] [ENVIAR_RAIOX] erro:', (raioxErr as Error)?.message);
        // Mesma guarda do ramo acima: eval não gera alerta de ops.
        if (!ehConversaDeEval) await sendTelegramAlertThrottled(
          `raiox-failed:${conversationId}`,
          `⚠️ RAIO-X automático FALHOU (exceção: ${(raioxErr as Error)?.message ?? 'desconhecida'})\nConversa: ${conversationId} — intervir.`,
        );
        reply = `${reply ? reply + '\n\n' : ''}Vou preparar o seu Raio-X agora e te mando o link aqui em instantes 😉`;
      }
    }

    // 11) Escalada/handoff: detecta as tags (mesmo tratamento), remove do texto.
    const needsHandoff = reply.includes(HANDOFF_TAG) || reply.includes(ESCALATE_TAG);
    if (needsHandoff) {
      reply = reply.split(HANDOFF_TAG).join('').split(ESCALATE_TAG).join('').replace(/\s+$/, '').trim();
      // Última fala ao lead SEMPRE calorosa — nunca "você não se encaixa".
      reply = reply
        ? `${reply}\n\n${WARM_HANDOFF_MSG}`
        : WARM_HANDOFF_MSG;
    }

    // GUARDRAILS DE FORMA (pós-processamento, na ordem certa):
    // (a) censura de vocabulário; (b) markdown → sintaxe WhatsApp; (c) 1 pergunta
    // só (preservando link/preço); (d) divisão em bolhas (sem truncar).
    // PR-B: as tags classificadoras saem ANTES de tudo. Se sobrarem, a lead lê
    // "[LEAD_RECUSOU_DEMO]" na bolha — modo de falha óbvio de tag no corpo.
    // O que elas alimentam é o ESTADO (tier 2), nunca a resposta deste turno.
    const tags = extrairTags(reply);
    reply = tags.texto;

    const san = sanitizeReply(reply);
    reply = san.text;
    const sanitized = san.sanitized;
    const markup = normalizeWhatsAppMarkup(reply);
    reply = markup.text;
    const markupNormalized = markup.changed;
    if (markupNormalized) {
      console.warn('[platform-sales-brain] markdown do modelo normalizado p/ WhatsApp (** → *)');
    }
    // Corte na 1ª pergunta só quando NÃO é handoff NEM passagem pra Bia (essas
    // fecham com transição calorosa, sem pergunta — truncar comeria a despedida).
    if (!needsHandoff && !passedToBia && !sentRaiox) reply = keepFirstQuestion(reply);
    let bubbles = splitIntoBubbles(reply);
    if (bubbles.length === 0) {
      bubbles = [needsHandoff ? WARM_HANDOFF_MSG : (passedToBia ? PASS_BIA_MSG : 'Me conta um pouco mais pra eu te ajudar do jeito certo?')];
    }

    // ── ANTI-REPETIÇÃO: MECANISMO, não pedido ────────────────────────────────
    //
    // `botAlreadySpoke` (~linha 1138) já detectava corretamente que a conversa
    // estava em andamento — e o ÚNICO consumidor dele era uma frase do PROMPT
    // ("NUNCA se reapresente, NUNCA repita a saudação inicial"). Isso é um
    // PEDIDO ao modelo, não uma garantia: em 2026-08-03 a Duda reapresentou-se
    // inteira 20s depois da primeira fala, para o PRIMEIRO lead vindo de
    // anúncio pago (conversa bb03004c). Detecção certa, execução zero.
    //
    // Regra deliberadamente conservadora: só suprime repetição do que a PRÓPRIA
    // Duda disse DENTRO da janela que o modelo enxergou (`history`). Se está no
    // contexto dele, não há desculpa para repetir; se caiu fora da janela,
    // repetir é humano e não suprimimos.
    //
    // SEM distância fuzzy, de propósito: derrubar bolha legítima é PIOR que
    // deixar passar uma quase-repetição — a cliente fica sem resposta, que é
    // exatamente o sintoma ("a IA travou") que este defeito produziu.
    const repeatKey = (s: string): string =>
      (s || '')
        .toLowerCase()
        .replace(/[\p{Extended_Pictographic}]/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();

    const jaDito = new Set<string>(
      history
        .filter((m: any) => isOurOutbound(m) && typeof m.content === 'string')
        .map((m: any) => repeatKey(m.content))
        .filter((k: string) => k.length >= 12), // curtas ("ok", "certo") PODEM repetir
    );

    const bubblesAntes = bubbles.length;
    bubbles = bubbles.filter((b: string) => {
      const k = repeatKey(b);
      if (k.length < 12) return true;
      if (jaDito.has(k)) {
        // LOG ALTO de propósito: suprimir em silêncio recria o defeito de hoje
        // — o problema sai do relatório e continua no produto.
        console.error('[platform-sales-brain] BOLHA REPETIDA SUPRIMIDA', {
          conversation_id: conversation.id,
          preview: b.slice(0, 70),
        });
        return false;
      }
      jaDito.add(k); // impede repetição DENTRO do próprio turno também
      return true;
    });

    if (bubbles.length === 0) {
      // Tudo que o modelo produziu já havia sido dito. Ficar calada RECRIA o
      // sintoma original (a cliente vê a própria mensagem como a última da
      // conversa). Seguimos com uma continuação curta — só se ela for inédita.
      const continuacao = 'Me conta um pouco mais pra eu te ajudar do jeito certo?';
      if (!jaDito.has(repeatKey(continuacao))) {
        console.error('[platform-sales-brain] turno INTEIRO era repetição — enviando continuação', {
          conversation_id: conversation.id,
          bolhas_descartadas: bubblesAntes,
        });
        bubbles = [continuacao];
      } else {
        console.error('[platform-sales-brain] turno INTEIRO repetido E continuação já dita — nada enviado', {
          conversation_id: conversation.id,
          bolhas_descartadas: bubblesAntes,
        });
        return json({ skipped: 'all_bubbles_repeated', dropped: bubblesAntes });
      }
    }

    // ─── MECANISMOS OUTBOUND (PR-BDR-12) — SÓ canal Evolution (Camila). ──────
    // A Duda no número oficial NÃO passa por aqui. Motivo medido: 3 conversas
    // seguidas (2026-08-04/05) com link empurrado sem aceite e aglutinado com
    // pergunta — instrução de prompt não segurou nenhuma das 3 vezes.
    // Prompt ensina a falar; código impede de errar.
    if (conversation.channel === 'whatsapp_evolution') {
      const URL_RE = /https?:\/\/\S+/g;
      // PR-B: o aceite é calculado UMA vez por turno, lá em cima, antes do prompt
      // (`leadAceitouAgora`) — e a política de link nasce dele. Recalcular aqui
      // permitiria que o prompt fosse montado com uma resposta e o gate aplicasse
      // outra, no mesmo turno. Uma pergunta, uma resposta.
      const aceitou = !pol.proibirLink;

      const antesGate = bubbles.length;
      const saneadas: string[] = [];
      for (const b of bubbles) {
        const urls = b.match(URL_RE) ?? [];
        if (urls.length === 0) { saneadas.push(b); continue; }
        const semLink = b.replace(URL_RE, '')
          .replace(/(aqui está|aqui esta|tá aqui|ta aqui|segue o link)\s*👉?\s*/gi, '')
          .replace(/👉/g, '').replace(/\s{2,}/g, ' ').trim();
        if (!aceitou) {
          // LINK SEM ACEITE: a oferta sobrevive, o link morre. O modelo pode
          // reoferecer; a URL só sai quando a ÚLTIMA mensagem dela contiver aceite.
          console.error('[platform-sales-brain] LINK BLOQUEADO sem aceite explícito', {
            conversation_id: conversation.id,
            ultima_da_lead: String(triggerInbound?.content ?? '').slice(0, 80),
          });
          if (semLink.length >= 8) saneadas.push(semLink);
          continue;
        }
        // COM aceite: link NUNCA aglutinado — texto (sem URL) vira bolha própria
        // e a URL sai SOZINHA na bolha seguinte. Mais de 1 URL: só a 1ª sai.
        if (semLink.length >= 8) saneadas.push(semLink);
        const primeiraUrl = urls[0] ?? '';
        if (primeiraUrl) saneadas.push(primeiraUrl);
        if (urls.length > 1) {
          console.error('[platform-sales-brain] múltiplas URLs no turno — extras descartadas', {
            conversation_id: conversation.id, descartadas: urls.length - 1,
          });
        }
      }
      bubbles = saneadas;

      // Palavra banida "mágica": cai a SENTENÇA inteira, nunca splice de palavra
      // (splice quebra gramática — caso catalogado no sanitizador da Duda).
      bubbles = bubbles.map((b: string) =>
        /m[áa]gica/i.test(b)
          ? b.split(/(?<=[.!?…])\s+/).filter((s: string) => !/m[áa]gica/i.test(s)).join(' ').trim()
          : b
      ).filter((b: string) => b.length > 0);

      // PR-BDR-14 cinto: o turno estava PROIBIDO de usar o nome (fato injetado)
      // e o modelo usou mesmo assim → remove só as formas de cirurgia SEGURA:
      // prefixo "[Oi ]Nome, " e vírgula-vocativo ", Nome". Nome no meio de
      // frase fica (remover quebraria gramática — regra do splice).
      // A APLICAÇÃO do racionamento de nome SAIU daqui (era o cinto do PR-BDR-14).
      // Agora é uma só, no gate de bolha (_shared/bubble-gate.ts), logo abaixo —
      // testado, e valendo para os DOIS canais em vez de só este.
      // `nomeParaRacionar` continua sendo CALCULADO acima: ele é a fonte que
      // funciona sem estado, e o gate compõe as duas (ver comentário lá).

      if (bubbles.length !== antesGate) {
        console.log(`[platform-sales-brain] mecanismos outbound: ${antesGate} → ${bubbles.length} bolha(s)`);
      }
      if (bubbles.length === 0) {
        console.error('[platform-sales-brain] mecanismos outbound derrubaram TODAS as bolhas — nada enviado', {
          conversation_id: conversation.id,
        });
        return json({ skipped: 'outbound_gate_dropped_all' });
      }
    }

    // 12) Entrega bolha a bolha: persiste ANTES de entregar (a msg existe no CRM
    //     mesmo se a entrega externa falhar), depois casa o wamid, broadcast e
    //     pausa proporcional entre bolhas (só entre bolhas, não após a última).
    const dest = conversation.visitor_whatsapp ?? conversation.visitor_phone ?? '';
    // ─── GATE DE BOLHA: proibirNome e proibirReapresentar viram CÓDIGO ────────
    // Até aqui essas duas flags só existiam em console.log e como fato no prompt —
    // e o eval mediu 3x que prompt não segura comportamento. Rodam para OS DOIS
    // canais (a Camila e a Duda repetem nome e se reapresentam igual).
    //
    // O módulo só faz operação de BORDA (vocativo, fronteira = vírgula) ou derruba
    // a bolha INTEIRA. Nunca costura no meio — que é o splice do 3e2aa3c.
    {
      // DUAS FONTES, UMA APLICAÇÃO. Consolidação do cinto do PR-BDR-14 com a
      // política do PR-B — e a composição é obrigatória, não elegância:
      //
      //   pol.proibirNome    vem do ESTADO (nome_ultimo_uso_seq). Só existe DEPOIS
      //                      que o PR-B roda uma vez. Hoje: 0 conversas com estado.
      //   nomeParaRacionar   vem de LOOKBACK nas últimas 4 mensagens do bot.
      //                      Funciona SEMPRE, inclusive em conversa sem estado.
      //
      // Apagar o cinto e ficar só com o estado teria removido a proteção em 100%
      // das conversas atuais — e nenhum teste unitário pegaria, porque os dois
      // módulos passam isolados. O OR mantém as duas coberturas.
      const g = aplicarGateBolha(bubbles, {
        proibirNome: pol.proibirNome || !!nomeParaRacionar,
        proibirReapresentar: pol.proibirReapresentar,
        primeiroNome: nomeParaRacionar ||
          (String(conversation.visitor_name ?? '').trim().split(/\s+/)[0] ?? ''),
      });
      if (g.vocativosRemovidos > 0 || g.bolhasDerrubadas > 0 || g.violacaoTolerada) {
        console.log('[platform-sales-brain] gate de bolha', {
          conversation_id: conversation.id,
          vocativos_removidos: g.vocativosRemovidos,
          bolhas_derrubadas: g.bolhasDerrubadas,
          // TOLERADA = o gate viu a violação e NÃO pôde agir sem calar a agente.
          // Vai pro log com nome próprio: violação silenciosa é o que a gente
          // vem matando o dia todo.
          violacao_tolerada: g.violacaoTolerada,
        });
      }
      bubbles = g.bubbles;
    }

    const total = bubbles.length;
    let anyDelivered = false;
    let lastDeliveryError: string | null = null;
    // Score/rota do turno ANTERIOR (o que a Duda USOU para conduzir esta resposta).
    // O score deste turno é computado depois, no bloco 13, sobre os fatos novos.
    const currentQual = (lead?.metadata as any)?.qualificacao ?? {};
    const currentScore = typeof currentQual.score_0_100 === 'number' ? currentQual.score_0_100 : null;
    const currentRota = typeof currentQual.rota === 'string' ? currentQual.rota : null;

    // wamid da inbound que disparou este turno — necessário para o "digitando…".
    const inboundWamid: string | null =
      (triggerInbound?.metadata && typeof triggerInbound.metadata === 'object'
        ? ((triggerInbound.metadata as Record<string, any>).wamid ?? null)
        : null);
    // Tempo de LEITURA da mensagem da lead, descontando o que o LLM já demorou
    // (senão a espera é cobrada duas vezes e a lead acha que morremos).
    const inboundLen = String(triggerInbound?.content ?? '').length;
    const readDelayMs = Math.min(
      Math.max(inboundLen * READ_MS_PER_CHAR, READ_FLOOR_MS),
      READ_CAP_MS,
    );
    const tDeliveryStart = Date.now();
    let entregues = 0; // bolhas REALMENTE enviadas — o lote pode ser abortado no meio

    for (let i = 0; i < total; i++) {
      const bubbleText = bubbles[i];

      // ─── RITMO DO CLIENTE (PR-BDR-10) ────────────────────────────────────
      // O lote de bolhas é escrito de uma vez e gotejado por até ~30s. Se a lead
      // falar durante o gotejamento, as bolhas restantes já nasceram VELHAS:
      // respondem a uma pergunta anterior e caem DEPOIS da nova, dando a impressão
      // de que a agente não leu.
      //
      // MEDIDO em 2026-08-05: as 4 bolhas de 01:31:14→01:31:39 tinham o MESMO
      // debounce_waited_ms (uma geração só) e a lead escreveu duas vezes dentro
      // dessa janela. A bolha 3 caiu 1 segundo depois da pergunta dela — não era
      // resposta, era coincidência de relógio.
      //
      // MEDIDO em 2026-08-11: a lead perguntou o produto DURANTE o LLM; a bolha 1
      // (eco Instagram) saiu mesmo assim. Agora a bolha 1 TAMBÉM aborta se chegou
      // inbound nova — o hand-back (agora awaited) responde com o contexto certo.
      // Resposta errada > atraso; silêncio só se hand-back falhar (logado).
      if (coveredInboundSeq != null) {
        const { data: novasDaLead, error: ritmoErr } = await supabase
          .from('platform_crm_messages')
          .select('seq')
          .eq('conversation_id', conversationId)
          .eq('is_deleted', false)
          .eq('direction', 'inbound')
          .eq('sender_type', 'visitor')
          .gt('seq', coveredInboundSeq)
          .limit(1);
        if (ritmoErr) {
          // Não dá pra saber se ela falou → segue o lote, mas DENUNCIA: engolir
          // isso devolveria em silêncio o comportamento que este guarda remove.
          console.warn(
            `[platform-sales-brain] ritmo: falha ao conferir inbound novo em ${conversationId}: ${ritmoErr.message} — lote segue`,
          );
        } else if (novasDaLead && novasDaLead.length > 0) {
          console.log(
            `[platform-sales-brain] ritmo: a lead falou durante o lote em ${conversationId} — abortando na bolha ${i + 1}/${total}; o hand-back responde com o contexto novo`,
          );
          break;
        }
      }

      // RITMO HUMANO: pausa ANTES de cada bolha, com "digitando…" visível.
      // Antes: a pausa vinha DEPOIS do envio e era `min(len*30, 4000)` — teto que
      // saturava em 134 chars, entregando 300 chars em ~6s (≈610 wpm, ~200x humano).
      const pauseMs = i === 0
        ? Math.max(0, readDelayMs - (Date.now() - tDeliveryStart))
        : (conversation.channel === 'whatsapp_evolution'
          ? evoTypingPauseMs(bubbleText)   // PR-BDR-13: ritmo humano, só Camila
          : typingPauseMs(bubbleText));
      if (pauseMs > 0) {
        await sendTypingSignal(supabase, conversation, inboundWamid, dest, pauseMs);
        await sleep(pauseMs);
      }

      // ⚠️ ERRATA do commit do PR-BDR-12 (apontada pela sessão Controladora
      // GO-LIVE em 2026-08-06, verificada linha a linha): aquele commit afirma
      // "mecanismos TODOS escopados a whatsapp_evolution" — FALSO para este.
      // Os DOIS guardas de ritmo (pré-pausa acima e pós-pausa abaixo) são
      // deliberadamente CHANNEL-AGNOSTIC: valem para a Duda no Cloud também,
      // porque bolha velha caindo por cima de mensagem nova é defeito de
      // ENTREGA, não política de canal. Só os mecanismos 1-3 (gate de link,
      // de-aglutinação, palavra banida) têm gate — esses sim são política da Camila.
      // RITMO — checagem PÓS-pausa (PR-BDR-12): a mensagem da lead pode chegar
      // DURANTE o sleep de digitação. MEDIDO 2026-08-05: a piada das 20:34:46
      // caiu no meio da pausa e a bolha 4 aterrissou por cima às 20:34:51 —
      // o guarda pré-pausa não tinha como vê-la. Mesma consulta, segundo portão.
      // (Inclui bolha 1 — mesmo motivo do guarda pré-pausa pós-2026-08-11.)
      if (pauseMs > 0 && coveredInboundSeq != null) {
        const { data: chegouNaPausa, error: pausaErr } = await supabase
          .from('platform_crm_messages')
          .select('seq')
          .eq('conversation_id', conversationId)
          .eq('is_deleted', false)
          .eq('direction', 'inbound')
          .eq('sender_type', 'visitor')
          .gt('seq', coveredInboundSeq)
          .limit(1);
        if (pausaErr) {
          console.warn(
            `[platform-sales-brain] ritmo pós-pausa: checagem falhou em ${conversationId}: ${pausaErr.message} — lote segue`,
          );
        } else if (chegouNaPausa && chegouNaPausa.length > 0) {
          console.log(
            `[platform-sales-brain] ritmo: a lead falou DURANTE a pausa em ${conversationId} — abortando na bolha ${i + 1}/${total}; o hand-back responde`,
          );
          break;
        }
      }

      const baseMeta = {
        channel: conversation.channel === 'whatsapp_evolution' ? 'whatsapp_evolution' : 'whatsapp_cloud',
        agent_id: persona.id,
        score: currentScore,
        rota: currentRota,
        debounce_waited_ms: debounceWaitedMs,
        sanitized,
        markup_normalized: markupNormalized,
        typing_pause_ms: pauseMs,
        bubble_n: i + 1,
        bubble_total: total,
        delivery_status: 'sent',
        // Trilha de auditoria da régua de inatividade (quando foi ela que acionou).
        ...(inactivityMode ? { cadence_stage: inactivityStage, cadence_occurrence: inactivityOccurrence } : {}),
      };

      const { data: message, error: msgError } = await supabase
        .from('platform_crm_messages')
        .insert({
          conversation_id: conversationId,
          direction: 'outbound',
          sender_type: 'bot',
          content: bubbleText,
          content_type: 'text',
          metadata: baseMeta,
        })
        .select('*')
        .single();

      if (msgError || !message) {
        console.error('[platform-sales-brain] insert bolha error:', msgError);
        continue;
      }

      const { wamid, error: deliveryError, connectionId, delivered, evolutionMessageId } = await deliver(
        supabase,
        conversation,
        dest,
        bubbleText,
      );
      if (delivered) anyDelivered = true; else lastDeliveryError = deliveryError;

      const deliveryMeta = delivered
        ? {
            ...baseMeta,
            wamid,
            delivery_status: 'sent',
            ...(connectionId ? { connection_id: connectionId } : {}),
            // Chave de idempotência do platform-evolution-webhook: sem ela o eco
            // fromMe do nosso próprio envio viraria uma segunda linha outbound.
            ...(evolutionMessageId ? { evolution_message_id: evolutionMessageId } : {}),
          }
        : {
            ...baseMeta,
            delivery_status: 'failed',
            delivery_error: deliveryError,
            ...(connectionId ? { connection_id: connectionId } : {}),
          };

      const { data: updated } = await supabase
        .from('platform_crm_messages')
        .update({ metadata: deliveryMeta })
        .eq('id', message.id)
        .select('*')
        .single();
      const finalMessage = updated ?? message;
      if (!delivered) {
        console.error(
          `[platform-sales-brain] bolha NÃO entregue conversation_id=${conversationId} channel=${conversation.channel}:`,
          deliveryError,
        );
      }

      await broadcastPlatformNewMessage(supabase, conversationId, finalMessage);
      entregues++;

      // (a pausa agora acontece ANTES de cada bolha, no topo do loop)
    }
    // Log conta o que SAIU, não o que foi planejado: com o aborto por ritmo do
    // cliente, afirmar `total` aqui seria relatório falso na própria telemetria.
    console.log(
      `[platform-sales-brain] entrega: ${entregues}/${total} bolha(s) em ${Date.now() - tDeliveryStart}ms` +
        (entregues < total ? ' — lote abortado, a lead falou no meio' : ''),
    );

    // Status da conversa: handoff/escalada → fila humana; senão mantém bot ativo.
    // PASSAGEM DUDA→BIA: fixa current_agent_id na Bia (a próxima msg da lead a
    // ativa) — a conversa continua bot_active, NUNCA vira fila humana.
    const convUpdate: Record<string, unknown> = { last_message_at: new Date().toISOString() };
    if (needsHandoff) {
      convUpdate.status = 'waiting_human';
      convUpdate.needs_human = true;
    } else if (passedToBia && biaAgentId) {
      convUpdate.current_agent_id = biaAgentId;
    }
    await supabase
      .from('platform_crm_conversations')
      .update(convUpdate)
      .eq('id', conversationId);

    // 13) MEMÓRIA DE QUALIFICAÇÃO (pós-resposta, non-fatal): 2ª chamada LLM barata
    //     extrai fatos → atualiza o lead (bant_*, temperature, name) + metadata.
    //     Só roda se a conversa tem lead vinculado.
    //     MODO INATIVIDADE pula a extração: não há fala nova da cliente —
    //     não existe fato novo a extrair (só gastaria uma chamada de LLM).
    let qualPersisted = false;
    let newScore: number | null = null;
    if (conversation.lead_id && lead && !inactivityMode) {
      try {
        const transcript = history
          .map((m: any) => `${m.sender_type === 'visitor' ? 'Lead' : 'Duda'}: ${m.content}`)
          .join('\n')
          .slice(-6000);
        const facts = await extractLeadFacts(gatewayBase, apiKey, model, transcript);

        const subVertical = typeof facts.sub_vertical === 'string' ? facts.sub_vertical.trim() || null : null;
        const tempoMeses = toNum(facts.tempo_atendimento_meses);
        const numClientes = toNum(facts.num_clientes);
        const ticket = toNum(facts.ticket_medio);
        const recorrencia = typeof facts.recorrencia === 'string' ? facts.recorrencia.trim() || null : null;
        const nomeLead = typeof facts.nome_lead === 'string' ? facts.nome_lead.trim() || null : null;
        // dor_flags CRUS: união com os já conhecidos (a lead pode revelar dor aos poucos).
        const newDorFlags = Array.isArray(facts.dor_flags)
          ? facts.dor_flags.filter((f: unknown) => typeof f === 'string' && (f as string).trim().length > 0).map((f: string) => f.trim())
          : [];

        // Estado anterior (para detectar mudança de faixa) e merge conservador.
        const prevMeta = (lead.metadata && typeof lead.metadata === 'object') ? lead.metadata as Record<string, any> : {};
        const prevQual = (prevMeta.qualificacao && typeof prevMeta.qualificacao === 'object') ? prevMeta.qualificacao as Record<string, any> : {};
        const prevScore = toNum(prevQual.score_0_100);
        const prevTemp = scoreToTemperature(prevScore);
        const prevDorFlags = Array.isArray(prevQual.dor_flags)
          ? prevQual.dor_flags.filter((f: unknown) => typeof f === 'string') as string[] : [];
        // União case-insensitive das dores (acumula sem duplicar).
        const mergedDorFlags = Array.from(
          new Map([...prevDorFlags, ...newDorFlags].map((f) => [f.toLowerCase(), f])).values(),
        );

        // Merge: só sobrescreve o que a extração descobriu (não apaga o já sabido).
        // Os FATOS CRUS acumulados alimentam o score determinístico logo abaixo.
        const mergedQual: Record<string, any> = {
          ...prevQual,
          ...(subVertical != null ? { sub_vertical: subVertical } : {}),
          ...(tempoMeses != null ? { tempo_atendimento_meses: tempoMeses } : {}),
          ...(numClientes != null ? { num_clientes: numClientes } : {}),
          ...(ticket != null ? { ticket_medio: ticket } : {}),
          ...(recorrencia != null ? { recorrencia } : {}),
          ...(nomeLead != null ? { nome_lead: nomeLead } : {}),
          dor_flags: mergedDorFlags,
          updated_at: new Date().toISOString(),
        };

        // SCORE QCR-V DETERMINÍSTICO (TS) sobre o estado ACUMULADO — não o chute do
        // LLM. Completa PR mesmo quando carteira e ticket vieram em turnos diferentes.
        // Âncora = preço do plano de entrada, lido de public_plans (fonte-única).
        const qcr = computeQcrScore(mergedQual, resolveAnchor(plans));
        mergedQual.score_0_100 = qcr.score;
        mergedQual.score_provisorio = qcr.provisorio;
        mergedQual.rota = qcr.rota;
        mergedQual.pr = qcr.pr;
        mergedQual.r = qcr.r;
        newScore = qcr.score;
        const effScore = newScore;
        const newTemp = scoreToTemperature(effScore);

        // bant_* derivados (conforme briefing): budget = carteira+ticket,
        // need = área+dor, timing = tempo de casa.
        const carteira = mergedQual.num_clientes;
        const tkt = mergedQual.ticket_medio;
        const bantBudget = (carteira != null || tkt != null)
          ? `~${carteira ?? '?'} clientes · ticket ~R$${tkt ?? '?'}`
          : lead.bant_budget ?? null;
        const bantNeed = mergedQual.sub_vertical
          ? `${mergedQual.sub_vertical}${lead.bant_need ? ` · ${lead.bant_need}` : ''}`
          : lead.bant_need ?? null;
        const bantTiming = mergedQual.tempo_atendimento_meses != null
          ? `~${mergedQual.tempo_atendimento_meses} meses de atendimento`
          : lead.bant_timing ?? null;

        // name = nome_lead quando descoberto E o atual for um telefone.
        const currentIsPhone = typeof lead.name === 'string' && /^\+?\d[\d\s()-]{5,}$/.test(lead.name.trim());
        const nextName = (nomeLead && currentIsPhone) ? nomeLead : lead.name;

        const leadUpdate: Record<string, any> = {
          metadata: { ...prevMeta, qualificacao: mergedQual },
        };
        if (bantBudget != null) leadUpdate.bant_budget = bantBudget;
        if (bantNeed != null) leadUpdate.bant_need = bantNeed;
        if (bantTiming != null) leadUpdate.bant_timing = bantTiming;
        if (newTemp != null) leadUpdate.temperature = newTemp;
        if (nextName && nextName !== lead.name) leadUpdate.name = nextName;

        await supabase.from('platform_crm_leads').update(leadUpdate).eq('id', conversation.lead_id);
        qualPersisted = true;

        // Nota de auditoria APENAS quando o score MUDA DE FAIXA. platform_crm_lead_notes
        // exige author_id NOT NULL → auth.users(id): a IA só grava se houver um user de
        // sistema em AI_SYSTEM_AUTHOR_ID; sem ele, o estado já vive em leads.metadata
        // (fonte de verdade) e pulamos a nota sem quebrar (log explícito, nunca silencia).
        const faixaMudou = prevTemp !== newTemp && newTemp != null;
        const systemAuthor = Deno.env.get('AI_SYSTEM_AUTHOR_ID') ?? '';
        if (faixaMudou && systemAuthor) {
          const resumo = `[Qualificação Duda] Score ${effScore}/100${qcr.provisorio ? ' (provisório)' : ''} ` +
            `(${prevTemp ?? 'novo'} → ${newTemp}) · rota ${qcr.rota}${qcr.pr != null ? ` · PR ~R$${qcr.pr}` : ''}. ` +
            `Área: ${mergedQual.sub_vertical ?? '?'} · carteira ~${mergedQual.num_clientes ?? '?'} · ` +
            `ticket ~R$${mergedQual.ticket_medio ?? '?'} · tempo ~${mergedQual.tempo_atendimento_meses ?? '?'}m.`;
          const { error: noteErr } = await supabase.from('platform_crm_lead_notes').insert({
            lead_id: conversation.lead_id,
            author_id: systemAuthor,
            content: resumo,
            role_label: 'Duda (IA)',
          });
          if (noteErr) console.warn('[platform-sales-brain] nota de faixa não gravada (non-fatal):', noteErr.message);
        } else if (faixaMudou && !systemAuthor) {
          console.info('[platform-sales-brain] faixa mudou mas AI_SYSTEM_AUTHOR_ID ausente — estado persistido só em leads.metadata.');
        }
      } catch (e) {
        console.warn('[platform-sales-brain] persistência de qualificação falhou (non-fatal):', String(e).slice(0, 200));
      }
    }

    // ─── PR-B: ESCRITA DO ESTADO ─────────────────────────────────────────────
    // Só chega aqui quem ENTREGOU. Todo evento abaixo é ato do código (tier 1) ou
    // tag explícita do modelo (tier 2). Nada é inferido de prosa — a lei dos tiers
    // é o que impede este estado de mentir.
    //
    // Non-fatal de propósito: a resposta da lead já saiu. Falhar aqui e devolver
    // 500 trocaria uma conversa que deu certo por um erro — o estado se recompõe no
    // turno seguinte, a mensagem entregue não volta.
    if (!anyDelivered && !inactivityMode && handbackDepth < HANDBACK_MAX_DEPTH) {
      const { data: lastBotRows } = await supabase
        .from('platform_crm_messages')
        .select('created_at')
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .eq('sender_type', 'bot')
        .order('created_at', { ascending: false })
        .limit(1);
      const lastBotAt = lastBotRows?.[0]?.created_at ?? '1970-01-01T00:00:00.000Z';
      const { data: orphanRows } = await supabase
        .from('platform_crm_messages')
        .select('seq')
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .eq('direction', 'inbound')
        .eq('sender_type', 'visitor')
        .gt('created_at', lastBotAt)
        .limit(1);
      if (orphanRows && orphanRows.length > 0) {
        forceOrphanWake = true;
        console.error('[platform-sales-brain] ORPHAN_WAKE: entregues=0 com inbound pos-bot', { conversation_id: conversationId });
      }
    }
    if (anyDelivered) try {
      const primeiroNome = String(conversation.visitor_name ?? '').trim().split(/\s+/)[0] ?? '';
      const ev: TurnEvents = {
        seq: seqAtual,
        enviouOutbound: anyDelivered,                                  // tier 1
        enviouLink: sentRaiox || bubbles.some((b) => /https?:\/\//.test(b)), // tier 1
        usouNome: primeiroNome.length >= 3 &&                          // tier 1
          bubbles.some((b) => b.toLowerCase().includes(primeiroNome.toLowerCase())),
        tagOfertaDemo: sentRaiox,                                      // tier 1 (link gerado)
        leadRecusou: tags.recusouDemo,                                 // tier 2 (tag)
        tagsObjecao: tags.objecoes,                                    // tier 2 (tag)
      };

      let novo = reduzir(estadoAtual, ev);
      const { data: gravou } = await supabase
        .from('platform_crm_conversations')
        .update({ conversation_state: novo })
        .eq('id', conversation.id)
        // Trava OTIMISTA: hand-backs concorrentes fazem read-modify-write no MESMO
        // JSONB. Checar na leitura seria GUARDA, não LOCK — os dois leriam v1, os
        // dois gravariam, e demo_ofertas ficaria 1 quando foram 3. Mesmo padrão já
        // provado no brain_claim: UPDATE condicional + RETURNING serializa.
        .or(predicadoTravaOtimista(novo.atualizado_seq ?? 0))
        .select('conversation_state')
        .maybeSingle();

      if (!gravou) {
        // Alguém passou na frente. RELER e REDUZIR de novo — sobrescrever às cegas
        // é exatamente o lost update que a trava existe pra impedir.
        const { data: fresco } = await supabase
          .from('platform_crm_conversations')
          .select('conversation_state')
          .eq('id', conversation.id)
          .maybeSingle();
        novo = reduzir((fresco?.conversation_state ?? null) as ConversationState | null, ev);
        await supabase
          .from('platform_crm_conversations')
          .update({ conversation_state: novo })
          .eq('id', conversation.id)
          .or(predicadoTravaOtimista(novo.atualizado_seq ?? 0));
        console.warn('[platform-sales-brain] estado: trava barrou, releu e reduziu de novo', {
          conversation_id: conversation.id,
          seq: seqAtual,
        });
      }
    } catch (e) {
      console.warn('[platform-sales-brain] persistência do conversation_state falhou (non-fatal):', String(e).slice(0, 200));
    }

    return json({
      success: true,
      handoff: needsHandoff,
      passed_to_bia: passedToBia,
      ...(passedToBia && biaAgentId ? { next_agent_id: biaAgentId } : {}),
      agent_id: persona.id,
      model,
      bubbles: total,
      debounce_waited_ms: debounceWaitedMs,
      sanitized,
      score: newScore,
      qualification_persisted: qualPersisted,
      ...(inactivityMode ? { inactivity: { occurrence: inactivityOccurrence, stage: inactivityStage } } : {}),
      ...(anyDelivered ? {} : { delivery_warning: lastDeliveryError ?? 'entrega falhou' }),
    });
  } catch (error) {
    console.error('[platform-sales-brain] error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Erro desconhecido' },
      500,
    );
  } finally {
    // Soltar o claim é obrigação de TODA saída — sucesso, skip do meio do
    // caminho ou exceção. O TTL é rede de segurança pra morte do isolate, NÃO a
    // via normal: contar com ele deixaria a lead esperando 2 min por engano de
    // código. Erro aqui é logado, nunca propagado — não vale trocar a resposta
    // já pronta por um 500.
    if (releaseClaim) {
      try {
        await releaseClaim();
      } catch (e) {
        console.warn('[platform-sales-brain] release do claim explodiu (TTL cobre):', String(e).slice(0, 200));
      }
    }
    // Só depois de soltar: a invocação filha precisa conseguir tomar a conversa.
    if (handback) {
      try {
        await handback();
      } catch (e) {
        console.warn('[platform-sales-brain] hand-back falhou:', String(e).slice(0, 200));
      }
    }
    if (forceOrphanWake && orphanWakeConversationId) {
      try {
        const base = Deno.env.get('SUPABASE_URL') ?? '';
        const secret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
        const segs = new URL(orphanWakeReqUrl || 'http://local/functions/v1/platform-sales-brain').pathname.split('/').filter(Boolean);
        const iv1 = segs.indexOf('v1');
        const selfFn = (iv1 >= 0 && segs[iv1 + 1]) ? segs[iv1 + 1] : 'platform-sales-brain';
        if (base && secret) {
          const r = await fetch(`${base}/functions/v1/${selfFn}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-brain-secret': secret },
            body: JSON.stringify({
              conversation_id: orphanWakeConversationId,
              handback_depth: orphanWakeHandbackDepth + 1,
              ensure_reply: true,
            }),
          });
          if (!r.ok) console.error('[platform-sales-brain] orphan wake', r.status, (await r.text()).slice(0, 200));
        }
      } catch (e) {
        console.warn('[platform-sales-brain] orphan wake falhou:', String(e).slice(0, 200));
      }
    }
  }
});
