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
//      + preço de LANÇAMENTO (de-para em LINKS DE PAGAMENTO, do banco).
//   9. Regras fixas: nunca desconto; SEM Piloto Fundadora e SEM garantia de
//      devolução (risco reduzido por PROVA + arrependimento 7d); escassez só a
//      real (preço de lançamento sobe); humano/reclamação grave → [HANDOFF_HUMANO]; [ESCALAR_HUMANO] SÓ
//      p/ pedido de humano/caso sensível — venda NUNCA é rejeitada (diretiva
//      Marcelo 05/07: "pagou é cliente"; score roteia OFERTA, não aceite/rejeite).
//      Só a Duda (SDR): score ≥70 + intenção → [PASSAR_BIA] (passagem interna
//      pro closer, não humana). A Bia recebe o dossiê e conduz ao fechamento.
//  10. LLM: mesmo gateway da casa (AI_API_KEY + AI_GATEWAY_URL).
//  11. GUARDRAILS DE FORMA (pós-processamento): sanitize de vocabulário, corte na
//      1ª pergunta, divisão em até 3 bolhas curtas — cada bolha é entregue via
//      Cloud API com pausa proporcional, persistida (wamid próprio) e broadcast.
//  11b. [PASSAR_BIA] (só Duda): remove a tag, acha o closer (Bia) do produto,
//      seta current_agent_id=bia.id; a ÚLTIMA bolha da Duda vira transição
//      calorosa; NÃO gera resposta da Bia agora — a próxima msg da lead a ativa.
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
// Janela de deduplicação: se o bot acabou de falar (<5s), não responde de novo.
const DEDUP_WINDOW_MS = 5000;
// Debounce: agrega mensagens curtas da lead que chegam em rajada numa só resposta.
// 12s (era 25s): a Nina usa 10s e o ritmo dela foi aprovado; 12s dá margem pra lead
// B2B, que digita frases mais longas. 25s deixava a lead no vácuo tempo demais.
const DEBOUNCE_MS = Number(Deno.env.get('AI_BRAIN_DEBOUNCE_MS') ?? '12000');
// Re-entrega velha do Meta: inbound com timestamp mais velho que isto = ignorar
// (bug real: Meta re-entregou msg de 13 min atrás e a Duda se reapresentou).
const STALE_REDELIVERY_MS = 10 * 60 * 1000;
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
// Passagem interna Duda→Bia: SÓ a Duda (SDR) emite; score ≥70 + intenção. NÃO é
// escalada humana — troca o agente da conversa (current_agent_id) e a Bia (closer)
// assume na PRÓXIMA mensagem da lead. A conversa segue bot_active o tempo todo.
const PASS_BIA_TAG = '[PASSAR_BIA]';
// [ENVIAR_RAIOX] — a Duda DISPARA A ISCA NO AUTOMÁTICO: o handler chama demo-start
// (nome+whatsapp da própria conversa), recebe /implantacao/<token> e entrega o link
// na mesma resposta. Sem humano de plantão (pedido explícito Marcelo 2026-07-19 —
// o prompt já mandava "disparar a isca" sem existir braço para isso).
const RAIOX_TAG = '[ENVIAR_RAIOX]';
// Bolha de transição calorosa que a Duda deixa ao passar para a Bia.
const PASS_BIA_MSG = 'Te deixo com a Bia, nossa especialista — ela já sabe tudo que a gente conversou 💚';
// Mensagem calorosa de transição ao escalar (nunca "você não se encaixa").
const WARM_HANDOFF_MSG = 'Vou te conectar com nosso time pra achar o melhor caminho pra você 💚';

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
 * Monta o bloco de conhecimento do produto — MESMO builder do platform-sales-copilot
 * (ordem deliberada: knowledge_base primeiro, contém o vocabulário obrigatório).
 * A escassez agora é o PREÇO DE LANÇAMENTO (via de-para em LINKS DE PAGAMENTO),
 * não vagas de campanha. Non-fatal: qualquer falha aqui degrada, mas não derruba
 * a resposta.
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
    // De-para do preço de lançamento: quando há preço de TABELA (list_price_monthly)
    // acima do vigente (price_monthly), renderiza "de R$X por R$Y — lançamento".
    const priceLabel = Number(p.list_price_monthly) > Number(p.price_monthly)
      ? `de R$${p.list_price_monthly} por R$${p.price_monthly} — preço de lançamento, sobe em breve`
      : `R$${p.price_monthly}`;
    ctx += `- ${p.name} (${priceLabel}): ${url}\n`;
  }
  ctx += `REGRA: cliente que já decidiu ("quero contratar", "como pago", "quero começar") NÃO precisa de demonstração nem de passar pra ninguém — mande o link do plano recomendado, diga que assim que o pagamento cair o acesso é liberado na hora, e fique à disposição. Só passe para a Bia o cliente QUALIFICADO que ainda está EM DÚVIDA/CÉTICO e precisa entender o valor — nunca o que já quer fechar.\n`;
  return ctx;
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
  `- Quando um plano aparecer como "de R$X por R$Y", X é o preço de TABELA (futuro) e Y é o\n` +
  `  de LANÇAMENTO (vigente — o que a cliente paga hoje): cite Y como o preço e X só como\n` +
  `  referência de que o valor vai subir. Nunca troque os dois.\n` +
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
    aprofundar: provisorio
      ? 'FALTAM dados de carteira/ticket → descubra-os naturalmente antes de ofertar; se já sabe e ela está cética, mostre VALOR.'
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
 * reancoramos no VALOR (a conta da recuperação) e no preço de lançamento — nunca
 * em garantia ou promo. Retorna { text, sanitized }.
 */
function sanitizeReply(input: string): { text: string; sanitized: boolean } {
  let text = input;
  let sanitized = false;
  const pairs: Array<[RegExp, string]> = [
    // "teste grátis / trial grátis / período grátis" → reancoragem no VALOR (produto pago).
    [/\b(teste|trial|per[ií]odo)\s+gr[aá]tis\b/gi, 'um produto pago — o valor se paga recuperando 2-3 clientes (o time confirma condições)'],
    [/\bgr[aá]tis\b/gi, 'um produto pago (o valor se paga recuperando 2-3 clientes)'],
    // desconto / promoção → reancoragem no VALOR e no preço de lançamento, nunca em garantia/promo.
    [/\b(desconto|descontos)\b/gi, 'a conta da recuperação (2-3 clientes de volta já pagam a mensalidade) e o preço de lançamento, que sobe em breve'],
    [/\bpromo(?:ç|c)(?:ã|a)o\b/gi, 'o preço de lançamento (vigente, sobe em breve)'],
  ];
  for (const [re, rep] of pairs) {
    if (re.test(text)) {
      sanitized = true;
      text = text.replace(re, rep);
    }
  }
  return { text, sanitized };
}

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

  try {
    const body = await req.json().catch(() => ({}));
    const conversationId: string | null = body?.conversation_id ?? null;
    if (!conversationId) return json({ error: 'conversation_id is required' }, 400);

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

    // 1) Conversa — só age em WhatsApp com bot ativo.
    const { data: conversation, error: convError } = await supabase
      .from('platform_crm_conversations')
      // meta_connection_id é OBRIGATÓRIO no select: é ele que diz por qual
      // número responder (a conexão que RECEBEU a mensagem da lead).
      .select('id, channel, status, product_id, lead_id, current_agent_id, visitor_name, visitor_phone, visitor_whatsapp, meta_connection_id')
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

    // Helper: carrega as msgs vivas (desc), com metadata (pro wa_timestamp).
    const loadMessages = async (): Promise<Array<Record<string, any>>> => {
      const { data } = await supabase
        .from('platform_crm_messages')
        .select('content, sender_type, direction, is_deleted, created_at, metadata')
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(30);
      return (data as Array<Record<string, any>>) || [];
    };
    const lastInboundOf = (msgs: Array<Record<string, any>>) =>
      msgs.find((m) => m.direction === 'inbound' && m.sender_type === 'visitor') ?? null;
    // wa_timestamp da Meta = string Unix epoch em SEGUNDOS (persistido pelo webhook).
    // Fallback: created_at. Retorna epoch em ms ou null.
    const inboundEpochMs = (m: Record<string, any> | null): number | null => {
      if (!m) return null;
      const meta = (m.metadata && typeof m.metadata === 'object') ? m.metadata as Record<string, any> : {};
      const ts = meta.wa_timestamp;
      const secs = typeof ts === 'number' ? ts : (typeof ts === 'string' ? Number(ts) : NaN);
      if (Number.isFinite(secs) && secs > 0) return secs * 1000;
      const created = m.created_at ? new Date(m.created_at).getTime() : NaN;
      return Number.isFinite(created) ? created : null;
    };

    let historyDesc = await loadMessages();
    const triggerInbound = lastInboundOf(historyDesc);

    // MODO INATIVIDADE — corrida sweep→brain: se a cliente respondeu entre a
    // decisão do sweeper e esta execução, a retomada é OBSOLETA (o fluxo normal
    // do webhook responde a inbound nova). Também não há o que retomar se a
    // Duda nunca falou nesta conversa.
    if (inactivityMode) {
      const newest = historyDesc[0] ?? null;
      if (newest && newest.direction === 'inbound' && newest.sender_type === 'visitor') {
        return json({ skipped: 'client_replied' });
      }
      const botSpoke = historyDesc.some(
        (m: any) => m.direction === 'outbound' && m.sender_type === 'bot',
      );
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

    // 3) DEBOUNCE / AGREGAÇÃO: a lead digita aos poucos. Se a inbound-gatilho é
    //    mais nova que DEBOUNCE_MS, esperamos o resto da rajada e RECARREGAMOS.
    //    Se surgiu uma inbound MAIS NOVA, esta invocação é obsoleta — a da msg
    //    mais nova responde por todas ⇒ EXIT silencioso ('superseded').
    //    (Modo inatividade pula o debounce: não há rajada — não há msg nova.)
    let debounceWaitedMs = 0;
    if (triggerInbound && DEBOUNCE_MS > 0 && !inactivityMode) {
      const triggerMs = inboundEpochMs(triggerInbound);
      const ageMs = triggerMs != null ? Date.now() - triggerMs : Number.POSITIVE_INFINITY;
      if (ageMs < DEBOUNCE_MS) {
        debounceWaitedMs = DEBOUNCE_MS - ageMs;
        await sleep(debounceWaitedMs);
        historyDesc = await loadMessages();
        const freshInbound = lastInboundOf(historyDesc);
        const freshMs = inboundEpochMs(freshInbound);
        // Se a última inbound agora é outra/mais nova, quem responde é ela.
        if (
          freshInbound &&
          triggerMs != null &&
          freshMs != null &&
          (freshMs > triggerMs ||
            (freshInbound.content !== triggerInbound.content && freshMs >= triggerMs))
        ) {
          return json({ skipped: 'superseded' });
        }
      }
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
    // Já existe fala do bot? Então CONTINUA — proíbe reapresentação.
    const botAlreadySpoke = historyDesc.some(
      (m: any) => m.direction === 'outbound' && m.sender_type === 'bot',
    );

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
          'id, name, agent_type, primary_objective, tone_style, additional_prompt, prohibited_phrases, qualification_schema, is_active, active_in_whatsapp, product_id',
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

    // 8) CONHECIMENTO do produto + planos/preços (a escassez é o preço de lançamento).
    let product: Record<string, any> | null = null;
    let plans: Array<Record<string, any>> = [];
    if (conversation.product_id) {
      const [productRes, plansRes] = await Promise.all([
        supabase
          .from('platform_crm_products')
          .select(
            'name, description, pitch_2min, icp, objections, guarantee, discount_policy, plans, pricing, knowledge_base',
          )
          .eq('id', conversation.product_id)
          .maybeSingle(),
        // Planos + LINK DE CHECKOUT reais (a "maquininha" da Duda): quando o
        // cliente DECIDE, ela mesma manda o link — não precisa de closer.
        // list_price_monthly = preço de tabela (de-para do lançamento em LINKS DE PAGAMENTO).
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

    // knowledgeContext = conhecimento do produto + LINKS DE PAGAMENTO (banco) +,
    // quando há preço, a REGRA DE PREÇO INVIOLÁVEL logo após a seção de links.
    // ?src=<slug> de atribuição: quem fala AGORA (persona) leva o crédito da venda.
    // persona já é não-nula aqui (guard acima); fallback 'duda' se o nome vier vazio.
    // MODO IMPLANTAÇÃO / RETENÇÃO: SEM links de pagamento nem regra de preço — a
    // cliente já comprou; instruções de "mande o link" corromperiam o papel de CS
    // (Lia) ou de retenção (Nina). Com onboardingActive=false E retentionActive=
    // false (todo fluxo de venda), a expressão é IDÊNTICA à atual.
    const knowledgeContext = buildKnowledgeContext(product)
      + ((onboardingActive || retentionActive) ? '' : buildCheckoutContext(plans, persona.name ?? 'duda')
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

    // 9) System prompt: persona + memória + conhecimento + REGRAS FIXAS + FORMA.
    //     No modo RETENÇÃO a Nina NÃO é "de vendas" — dizer isso contradiria as
    //     regras dela; o papel vira Sucesso/Suporte/Retenção.
    const systemPrompt = `Você é ${persona.name}, ${retentionActive ? 'do time de Sucesso, Suporte e Retenção' : 'atendente de VENDAS'} por WhatsApp do produto ${productName}.
${persona.primary_objective ? `\nSEU OBJETIVO PRINCIPAL: ${persona.primary_objective}` : ''}
${persona.tone_style ? `\nTOM E ESTILO: ${persona.tone_style}` : ''}
${visitorName ? `\nCLIENTE: ${visitorName}` : ''}
${closerContinuityContext}${persona.additional_prompt ? `\nINSTRUÇÕES ADICIONAIS DA PERSONA:\n${persona.additional_prompt}` : ''}
${qualification ? `\nESQUEMA DE QUALIFICAÇÃO (colete estes dados naturalmente na conversa): ${qualification}` : ''}
${prohibited ? `\nFRASES PROIBIDAS (nunca use):\n${prohibited}` : ''}
${leadMemoryContext}${knowledgeContext}${onboardingPhaseContext}${inboundAdContext}${inactivityContext}

═══════════════════════════════════════
REGRAS INVIOLÁVEIS DO CÉREBRO
═══════════════════════════════════════
1. NUNCA ofereça desconto. Se pedirem, reancore no VALOR (a conta da recuperação: 2-3 clientes de volta já pagam a mensalidade) e no preço de LANÇAMENTO (vigente, sobe em breve) — nunca em garantia nem desconto.
2. NÃO existe "Piloto Fundadora" nem garantia de devolução por resultado. A redução de risco é honesta: PROVA (o raio-x, feito pela própria cliente na hora — ver bloco A DEMONSTRAÇÃO) + direito de arrependimento de 7 dias do checkout (lei). NUNCA prometa "devolvo se não recuperar", "risco é meu/nosso" ou "painel-juiz". O produto é PAGO — nunca o descreva como "teste gratuito" ou "trial".
3. Escassez SÓ a real: o preço de LANÇAMENTO (vigente) sobe para o de tabela em breve — está em LINKS DE PAGAMENTO. NUNCA invente urgência (vagas, relógio).
4. Preços e dados do produto: use SOMENTE o que está no conhecimento acima. Se não tiver, diga que confirma e não invente.
5. Você NUNCA rejeita uma venda nem decide que a lead "não está apta" — somos SaaS: pagou, é cliente. Toda conversa caminha para RECOMENDAR o plano certo pra realidade dela (carteira pequena/começando → plano de entrada com a conta honesta). NUNCA diga "você não se encaixa"; Trial só se a lead pedir para testar sem compromisso.
6. A tag ${ESCALATE_TAG} é SÓ para: a lead pediu humano, caso sensível ou fora do script (preço custom, parceria, imprensa) — JAMAIS por perfil ou tamanho de carteira. Se o cliente fizer RECLAMAÇÃO GRAVE ou exigir humano, use ${HANDOFF_TAG}.
${retentionActive ? RETENTION_RULE_BLOCK : onboardingActive ? ONBOARDING_RULE_BLOCK : personaIsSdr ? `7. CLIENTE DECIDIU → VOCÊ MESMA FECHA (nunca passe adiante quem já quer contratar): se a lead sinaliza DECISÃO ("quero contratar", "como pago", "quero começar", "fechou", "manda o link", aceitou explicitamente), a SUA RESPOSTA DEVE CONTER A URL do link do plano recomendado — cole o https://… exato da seção LINKS DE PAGAMENTO acima (é PROIBIDO responder "como pago"/"quero contratar" SEM a URL, ou perguntar "quer começar?"/"quer que eu te ajude?" a quem JÁ decidiu — ele já quer, mande o link). Diga que assim que o pagamento cair o acesso é liberado na hora, e fique à disposição para dúvidas. NÃO demonstre mais nada, NÃO passe pra Bia — decidido não precisa de closer.
8. PASSAGEM PARA A BIA (só cliente QUALIFICADO e AINDA EM DÚVIDA): use a tag exata ${PASS_BIA_TAG} (sozinha, na última linha) SOMENTE quando o score é ALTO (≥70) MAS a lead está HESITANTE/CÉTICA — tem objeções, quer "pensar", desconfia do resultado, pede pra "entender melhor", ou é claramente exigente e precisa ser convencida do VALOR. A Bia é a especialista que vende valor pra esse cliente difícil. NUNCA use ${PASS_BIA_TAG} para quem já decidiu (esse você fecha com o link) nem para carteira pequena (esse é Essencial, você fecha). NUNCA junte ${PASS_BIA_TAG} com ${ESCALATE_TAG}/${HANDOFF_TAG}.` : `7. VOCÊ É A BIA (closer de VALOR). Recebeu um cliente QUALIFICADO e CÉTICO que a Duda não convenceu sozinha — ele pode pagar mas ainda não quer, é exigente, cobra coerência. Seu trabalho é vender VALOR: conecte a dor concreta dele (carteira parada, cadeira vazia) ao mecanismo, reduza o risco com PROVA (demonstração na carteira dele) e a conta personalizada — NUNCA com garantia de devolução — e use a urgência honesta do preço de lançamento (sobe em breve). NUNCA se reapresente (continue do dossiê). Quando ELE decidir, mande o LINK DE PAGAMENTO do plano na hora — não enrole quem já fechou.`}
${botAlreadySpoke ? '8. Esta conversa JÁ ESTÁ EM ANDAMENTO. CONTINUE do ponto atual. NUNCA se reapresente, NUNCA recomece do zero, NUNCA repita a saudação inicial.' : ''}
${(!onboardingActive && !retentionActive) ? DEMO_RULE_BLOCK : ''}
${(!onboardingActive && !retentionActive && personaIsSdr) ? QUALIFICACAO_RULE_BLOCK : ''}

═══════════════════════════════════════
COMO RESPONDER (WhatsApp — regras de forma DURAS)
═══════════════════════════════════════
- Responda em pt-BR, tom de conversa de WhatsApp: curto, humano, direto.
- CADA MENSAGEM = UMA IDEIA, em 1-2 linhas (~120 caracteres). PESSOAS NÃO DIGITAM
  TEXTÃO no WhatsApp. Parede de texto é o sinal nº1 de robô e a lead percebe na hora.
- SE precisar de duas ideias, separe por LINHA EM BRANCO. Cada parágrafo vira uma
  mensagem SEPARADA no WhatsApp. **MÁXIMO 2 PARÁGRAFOS. NUNCA 3.** Uma resposta sua
  são 1 ou 2 mensagens — três seguidas já é monólogo, e ninguém conversa assim.
- Prefira SEMPRE a versão mais curta. Se dá pra dizer em 8 palavras, não use 20.
  Corte adjetivo, corte preâmbulo, corte repetição. Frase curta soa humana.
- EXATAMENTE UMA pergunta por resposta (ou nenhuma). Nunca faça duas perguntas juntas.
- NUNCA use ** ou __ ou # ou listas com hífen: o WhatsApp NÃO renderiza isso e o
  asterisco aparece CRU na tela da cliente. Para dar ênfase use *um asterisco só*.
- No máximo 1 emoji, e só quando couber.
- Reaja com calor ao que a lead disse antes de perguntar (micro-ack).
- Use o nome do cliente quando souber. Nunca repergunte o que já está em "O QUE JÁ SABEMOS DA LEAD".
- Sempre avance a conversa (qualifique ou proponha próximo passo).

ANTES DE ENVIAR, revise (obrigatório):
1) Cabe em 2-3 linhas por mensagem?  2) Tem só UMA pergunta?
3) Tem asterisco duplo ou lista? (se sim, tire)  4) As duas ideias estão separadas por linha em branco?

❌ ERRADO (parede de texto, markdown, 2 perguntas):
"Que ótimo! O plano **Essencial** vai organizar sua agenda, otimizar atendimentos e ainda usar IA pra trazer de volta clientes sumidos, e olha, com seu ticket você recupera 2 ou 3 e já paga o mês. Quer que eu te mande o link? Ou prefere entender melhor antes?"

✅ CERTO (uma ideia por mensagem, separadas por linha em branco, uma pergunta):
"Com ticket de R$89 e 200 clientes na base, bastam 2 ou 3 voltarem pra pagar o mês inteiro.

O Essencial faz exatamente isso: acha quem sumiu e chama de volta sozinho.

Quer que eu te mostre no seu número?"`;

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
    const model = personaIsCloser
      ? (Deno.env.get('AI_SALES_BRAIN_MODEL_CLOSER') ?? Deno.env.get('AI_SALES_BRAIN_MODEL') ?? DEFAULT_MODEL)
      : (Deno.env.get('AI_SALES_BRAIN_MODEL') ?? DEFAULT_MODEL);
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
      // Remove a tag do texto (não vaza pro cliente) e sela a transição calorosa.
      reply = reply.split(PASS_BIA_TAG).join('').replace(/\s+$/, '').trim();
      reply = reply ? `${reply}\n\n${PASS_BIA_MSG}` : PASS_BIA_MSG;
      // Só consideramos a passagem efetiva se achamos a Bia; senão a Duda segue
      // (log explícito, nunca engole a intenção nem trava a conversa).
      if (biaAgentId) {
        passedToBia = true;
      } else {
        // HANDOFF FALHO Duda→Bia: a Duda MANTÉM a conversa (invariante honrado —
        // ninguém fica órfão), mas a lead ouviu "te deixo com a Bia" e a Bia não
        // existe. Isso não pode mais acontecer em silêncio.
        console.warn('[platform-sales-brain] [PASSAR_BIA] emitido mas nenhum closer (Bia) ativo no WhatsApp — Duda mantém a conversa.');
        await sendTelegramAlertThrottled(
          `pass-bia-failed:${conversationId}`,
          `⚠️ HANDOFF Duda→Bia FALHOU — Duda mantém a conversa\n` +
          `Conversa: ${conversationId}\n` +
          `Nenhum closer (Bia) is_active + active_in_whatsapp no product_id ${conversation.product_id ?? 'null'}.\n` +
          `A lead JÁ recebeu a bolha de transição ("te deixo com a Bia") — quem responder será a Duda.`,
        );
      }
    }

    // 10b) [ENVIAR_RAIOX] — Raio-X AUTOMÁTICO. Gera o link da demo via demo-start
    //      (público, honeypot+rate-limit) com nome+whatsapp da conversa e entrega
    //      na mesma resposta. Falhou → fallback caloroso + alerta Telegram (a lead
    //      NUNCA fica com promessa sem link e sem ninguém saber).
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
          await sendTelegramAlertThrottled(
            `raiox-failed:${conversationId}`,
            `⚠️ RAIO-X automático FALHOU (demo-start HTTP ${demoRes.status})\nConversa: ${conversationId}\nA Duda prometeu o raio-x e o link não saiu — intervir.`,
          );
          reply = `${reply ? reply + '\n\n' : ''}Vou preparar o seu Raio-X agora e te mando o link aqui em instantes 😉`;
        }
      } catch (raioxErr) {
        console.error('[platform-sales-brain] [ENVIAR_RAIOX] erro:', (raioxErr as Error)?.message);
        await sendTelegramAlertThrottled(
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

    // 12) Entrega bolha a bolha: persiste ANTES de entregar (a msg existe no CRM
    //     mesmo se a entrega externa falhar), depois casa o wamid, broadcast e
    //     pausa proporcional entre bolhas (só entre bolhas, não após a última).
    const dest = conversation.visitor_whatsapp ?? conversation.visitor_phone ?? '';
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

    for (let i = 0; i < total; i++) {
      const bubbleText = bubbles[i];

      // RITMO HUMANO: pausa ANTES de cada bolha, com "digitando…" visível.
      // Antes: a pausa vinha DEPOIS do envio e era `min(len*30, 4000)` — teto que
      // saturava em 134 chars, entregando 300 chars em ~6s (≈610 wpm, ~200x humano).
      const pauseMs = i === 0
        ? Math.max(0, readDelayMs - (Date.now() - tDeliveryStart))
        : typingPauseMs(bubbleText);
      if (pauseMs > 0) {
        await sendTypingIndicator(supabase, conversation, inboundWamid);
        await sleep(pauseMs);
      }

      const baseMeta = {
        channel: 'whatsapp_cloud',
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

      const { wamid, error: deliveryError, connectionId } = await deliverViaWhatsAppCloud(
        supabase,
        conversation,
        dest,
        bubbleText,
      );
      if (wamid) anyDelivered = true; else lastDeliveryError = deliveryError;

      const deliveryMeta = wamid
        ? { ...baseMeta, wamid, delivery_status: 'sent', ...(connectionId ? { connection_id: connectionId } : {}) }
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
      if (!wamid) console.error('[platform-sales-brain] bolha NÃO entregue:', deliveryError);

      await broadcastPlatformNewMessage(supabase, conversationId, finalMessage);

      // (a pausa agora acontece ANTES de cada bolha, no topo do loop)
    }
    console.log(`[platform-sales-brain] entrega: ${total} bolha(s) em ${Date.now() - tDeliveryStart}ms`);

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
  }
});
