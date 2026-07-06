// platform-sales-brain — F2 "O CÉREBRO": motor de resposta automática do
// WhatsApp de VENDAS da PLATAFORMA (número oficial Cloud API). É a peça que faz
// o funil de fundadoras vender sozinho.
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
//      + escassez REAL da view founder_campaign_status.
//   9. Regras fixas: nunca desconto; piloto = Piloto Fundadora PAGO; escassez só
//      a real; humano/reclamação grave → [HANDOFF_HUMANO]; [ESCALAR_HUMANO] SÓ
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
// Debounce: agrega mensagens curtas da lead que chegam em rajada numa só resposta.
const DEBOUNCE_MS = Number(Deno.env.get('AI_BRAIN_DEBOUNCE_MS') ?? '25000');
// Re-entrega velha do Meta: inbound com timestamp mais velho que isto = ignorar
// (bug real: Meta re-entregou msg de 13 min atrás e a Duda se reapresentou).
const STALE_REDELIVERY_MS = 10 * 60 * 1000;
// Guardrails de forma (reclamação real: textão + várias perguntas juntas).
const MAX_BUBBLES = 3;
const MAX_BUBBLE_CHARS = 300;
const BUBBLE_PAUSE_PER_CHAR_MS = 30;
const BUBBLE_PAUSE_CAP_MS = 4000;
// Tags de escalada — o modelo emite no fim.
const HANDOFF_TAG = '[HANDOFF_HUMANO]';   // lead pediu humano / reclamou grave
const ESCALATE_TAG = '[ESCALAR_HUMANO]';  // SÓ pediu-humano/caso sensível — JAMAIS por perfil (venda nunca é rejeitada)
// Passagem interna Duda→Bia: SÓ a Duda (SDR) emite; score ≥70 + intenção. NÃO é
// escalada humana — troca o agente da conversa (current_agent_id) e a Bia (closer)
// assume na PRÓXIMA mensagem da lead. A conversa segue bot_active o tempo todo.
const PASS_BIA_TAG = '[PASSAR_BIA]';
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

/** Links de checkout reais (do banco). É a "maquininha" da Duda: cliente que
 *  DECIDE recebe o link na hora, sem passar por closer. Vazio se não houver. */
function buildCheckoutContext(plans: Array<Record<string, any>>): string {
  if (!plans.length) return '';
  let ctx = `\n## LINKS DE PAGAMENTO (a sua maquininha — mande o link DIRETO quando o cliente DECIDIR contratar)\n`;
  for (const p of plans) {
    ctx += `- ${p.name} (R$${p.price_monthly}): ${p.checkout_url}\n`;
  }
  ctx += `REGRA: cliente que já decidiu ("quero contratar", "como pago", "quero começar") NÃO precisa de demonstração nem de passar pra ninguém — mande o link do plano recomendado, diga que assim que o pagamento cair o acesso é liberado na hora, e fique à disposição. Só passe para a Bia o cliente QUALIFICADO que ainda está EM DÚVIDA/CÉTICO e precisa entender o valor — nunca o que já quer fechar.\n`;
  return ctx;
}

/** É o agente SDR (Duda) — abre/qualifica/recomenda? Base da linha travada. */
function isSdrAgent(a: Record<string, any> | null): boolean {
  if (!a) return false;
  const hay = `${a.agent_type ?? ''} ${a.name ?? ''}`.toLowerCase();
  return hay.includes('sdr') || hay.includes('qualifica') || hay.includes('duda');
}

/** É o agente closer (Bia) — recebe o dossiê e FECHA o piloto? */
function isCloserAgent(a: Record<string, any> | null): boolean {
  if (!a) return false;
  const hay = `${a.agent_type ?? ''} ${a.name ?? ''}`.toLowerCase();
  return hay.includes('closer') || hay.includes('bia');
}

/** Seleciona a persona SDR/qualificação (Duda); senão a primeira ativa (determinístico). */
function pickSdrPersona(agents: Array<Record<string, any>>): Record<string, any> | null {
  if (!agents.length) return null;
  return agents.find(isSdrAgent) ?? agents[0];
}

/**
 * ROTEAMENTO POR CONVERSA (linha travada Duda→Bia): se a conversa já aponta um
 * agente ativo do produto em current_agent_id, é ELE quem fala (a Bia continua a
 * venda que a Duda passou). Senão, o SDR (Duda) abre. Retorna a persona escolhida
 * — quem persiste current_agent_id é o handler (precisa do id da Duda + supabase).
 */
function pickPersonaForConversation(
  agents: Array<Record<string, any>>,
  currentAgentId: string | null,
): Record<string, any> | null {
  if (!agents.length) return null;
  if (currentAgentId) {
    const pinned = agents.find((a) => a.id === currentAgentId);
    if (pinned) return pinned; // agente já em curso na conversa (ativo + WhatsApp)
  }
  return pickSdrPersona(agents);
}

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
    oferta_piloto: 'carteira robusta → conduza para o Piloto Fundadora (a conta da recuperação fecha).',
    aprofundar: provisorio
      ? 'FALTAM dados de carteira/ticket → descubra-os naturalmente antes de ofertar; se já sabe e ela está cética, mostre VALOR.'
      : 'lead qualificada mas indecisa/cética → aprofunde o VALOR (garantia, conta personalizada) antes de fechar.',
    essencial: 'carteira pequena/começando → recomende o plano de ENTRADA com a conta honesta e convide pro Piloto quando ela crescer. NUNCA rejeite.',
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
 * Censura de vocabulário: o piloto é PAGO. Se o modelo escorregar em "teste
 * grátis / desconto / promoção" em contexto de oferta, reancoramos na garantia.
 * Retorna { text, sanitized }.
 */
function sanitizeReply(input: string): { text: string; sanitized: boolean } {
  let text = input;
  let sanitized = false;
  const pairs: Array<[RegExp, string]> = [
    // "teste grátis / trial grátis / período grátis" → reancoragem na garantia.
    [/\b(teste|trial|per[ií]odo)\s+gr[aá]tis\b/gi, 'Piloto Fundadora com garantia (o risco é nosso)'],
    [/\bgr[aá]tis\b/gi, 'com garantia de devolução'],
    // desconto / promoção → reancoragem na garantia, nunca no preço.
    [/\b(desconto|descontos)\b/gi, 'a garantia (se não recuperar mais que a mensalidade, devolvemos)'],
    [/\bpromo(?:ç|c)(?:ã|a)o\b/gi, 'a condição de fundadora (preço travado + garantia)'],
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
 * EXATAMENTE UMA pergunta por resposta: se o modelo emitiu >1 '?', mantém só até
 * a primeira interrogação (trunca no fim dessa frase). Melhor perder uma pergunta
 * que sobrecarregar a lead com um formulário.
 */
function keepFirstQuestion(input: string): string {
  const marks = (input.match(/\?/g) || []).length;
  if (marks <= 1) return input.trim();
  const firstQ = input.indexOf('?');
  return input.slice(0, firstQ + 1).trim();
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
  // Corte duro: no máximo MAX_BUBBLES bolhas (o excedente vira a última, aparado).
  if (out.length > MAX_BUBBLES) {
    const head = out.slice(0, MAX_BUBBLES - 1);
    const tail = out.slice(MAX_BUBBLES - 1).join(' ').slice(0, MAX_BUBBLE_CHARS).trim();
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
// do briefing Marcelo 05/07 (5.1). Preço-âncora do banco = 217 (NÃO 197).
const QCRV_PRICE_ANCHOR = 217;

/** Resultado do score determinístico — vira FATO no prompt e estado no lead. */
type QcrRota = 'oferta_piloto' | 'aprofundar' | 'essencial';
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
 *   R                          = PR ÷ 217 (preço-âncora do banco)
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
 * 'oferta_piloto' (carteira robusta, convém o Piloto Fundadora); 40-69 OU
 * provisório → 'aprofundar' (falta dado/valor — a Duda cava mais / a Bia mostra
 * valor); <40 → 'essencial' (carteira pequena/começando → plano de entrada com a
 * conta honesta, convite pro Piloto quando crescer). NUNCA rejeita a venda.
 */
function computeQcrScore(facts: {
  num_clientes?: number | null;
  ticket_medio?: number | null;
  tempo_atendimento_meses?: number | null;
  sub_vertical?: string | null;
  dor_flags?: unknown;
}): QcrScore {
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
    r = pr / QCRV_PRICE_ANCHOR;
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
  // pro 'oferta_piloto' (falta a conta da carteira) — cai em 'aprofundar'.
  let rota: QcrRota;
  if (!provisorio && score >= 70) rota = 'oferta_piloto';
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
      .select('id, channel, status, product_id, lead_id, current_agent_id, visitor_name, visitor_phone, visitor_whatsapp')
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

    // 2) ANTI-RE-ENTREGA VELHA: se a inbound-gatilho tem wa_timestamp real (segundos)
    //    e é mais velha que 10 min, o Meta re-entregou uma msg antiga — não responde
    //    (senão a Duda se reapresenta 13 min depois, bug real de 2026-07-04). Exige a
    //    fonte da Meta: o created_at recente de uma re-entrega enganaria o guard.
    if (triggerInbound) {
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
    let debounceWaitedMs = 0;
    if (triggerInbound && DEBOUNCE_MS > 0) {
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
      persona = pickPersonaForConversation(agentList, conversation.current_agent_id ?? null);
    }

    if (!persona) {
      // Sem persona não há motor — não improvisa uma voz genérica no número oficial.
      console.warn('[platform-sales-brain] sem persona ativa no WhatsApp para product_id:', conversation.product_id);
      return json({ skipped: 'no_active_persona' });
    }

    // Papel do agente que vai falar AGORA (condiciona [PASSAR_BIA] e continuidade).
    const personaIsSdr = isSdrAgent(persona);
    const personaIsCloser = isCloserAgent(persona);

    // PIN INICIAL: se a conversa ainda não tem agente fixado e a Duda vai abrir,
    // grava current_agent_id=duda.id — assim a linha começa ancorada nela.
    if (!conversation.current_agent_id && sdrAgentId && persona.id === sdrAgentId) {
      await supabase
        .from('platform_crm_conversations')
        .update({ current_agent_id: sdrAgentId })
        .eq('id', conversationId);
    }

    // 8) CONHECIMENTO do produto + escassez real da campanha fundadora.
    let product: Record<string, any> | null = null;
    let campaign: Record<string, any> | null = null;
    let plans: Array<Record<string, any>> = [];
    if (conversation.product_id) {
      const [productRes, campaignRes, plansRes] = await Promise.all([
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
        // Planos + LINK DE CHECKOUT reais (a "maquininha" da Duda): quando o
        // cliente DECIDE, ela mesma manda o link — não precisa de closer.
        supabase
          .from('public_plans')
          .select('name, slug, price_monthly, checkout_url')
          .order('price_monthly', { ascending: true }),
      ]);
      product = (productRes.data as Record<string, any> | null) ?? null;
      campaign = (campaignRes.data as Record<string, any> | null) ?? null;
      plans = ((plansRes.data as Array<Record<string, any>>) ?? []).filter((p) => p.checkout_url);
    }

    const knowledgeContext = buildKnowledgeContext(product, campaign) + buildCheckoutContext(plans);
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
      ? `\n═══════════════════════════════════════\nVOCÊ ESTÁ ASSUMINDO UMA CONVERSA (HANDOFF DA DUDA)\n═══════════════════════════════════════\nA Duda te passou o dossiê desta lead — tudo que vocês precisam já está em "O QUE JÁ SABEMOS DA LEAD". NUNCA se apresente do zero nem recomece a descoberta. Valide UM detalhe do que ela já disse ("vi aqui que você trabalha com X há Y, certo?") e conduza direto para a demonstração/fechamento do Piloto Fundadora. Você é a especialista que fecha: apresente a oferta com a conta da recuperação, trate a objeção mais provável e vá pro checkout como próximo passo concreto.\n`
      : '';

    // 9) System prompt: persona + memória + conhecimento + REGRAS FIXAS + FORMA.
    const systemPrompt = `Você é ${persona.name}, atendente de VENDAS por WhatsApp do produto ${productName}.
${persona.primary_objective ? `\nSEU OBJETIVO PRINCIPAL: ${persona.primary_objective}` : ''}
${persona.tone_style ? `\nTOM E ESTILO: ${persona.tone_style}` : ''}
${visitorName ? `\nCLIENTE: ${visitorName}` : ''}
${closerContinuityContext}${persona.additional_prompt ? `\nINSTRUÇÕES ADICIONAIS DA PERSONA:\n${persona.additional_prompt}` : ''}
${qualification ? `\nESQUEMA DE QUALIFICAÇÃO (colete estes dados naturalmente na conversa): ${qualification}` : ''}
${prohibited ? `\nFRASES PROIBIDAS (nunca use):\n${prohibited}` : ''}
${leadMemoryContext}${knowledgeContext}

═══════════════════════════════════════
REGRAS INVIOLÁVEIS DO CÉREBRO
═══════════════════════════════════════
1. NUNCA ofereça desconto. Se pedirem, reancore na garantia ("o risco é meu") — não no preço.
2. "piloto" = Piloto Fundadora — programa PAGO com acompanhamento 1-a-1 e garantia de devolução. NUNCA descreva como "teste gratuito", "trial" ou "demonstração".
3. Escassez SÓ a real (o dado da campanha acima, quando presente). NUNCA invente urgência falsa.
4. Preços e dados do produto: use SOMENTE o que está no conhecimento acima. Se não tiver, diga que confirma e não invente.
5. Você NUNCA rejeita uma venda nem decide que a lead "não está apta" — somos SaaS: pagou, é cliente. Toda conversa caminha para RECOMENDAR o plano certo pra realidade dela (carteira pequena/começando → plano de entrada com a conta honesta e convite pro Piloto quando crescer). NUNCA diga "você não se encaixa"; Trial só se a lead pedir para testar sem compromisso.
6. A tag ${ESCALATE_TAG} é SÓ para: a lead pediu humano, caso sensível ou fora do script (preço custom, parceria, imprensa) — JAMAIS por perfil ou tamanho de carteira. Se o cliente fizer RECLAMAÇÃO GRAVE ou exigir humano, use ${HANDOFF_TAG}.
${personaIsSdr ? `7. CLIENTE DECIDIU → VOCÊ MESMA FECHA (nunca passe adiante quem já quer contratar): se a lead sinaliza DECISÃO ("quero contratar", "como pago", "quero começar", "fechou", "manda o link", aceitou explicitamente), mande o LINK DE PAGAMENTO do plano recomendado (da seção LINKS DE PAGAMENTO acima), diga que assim que o pagamento cair o acesso é liberado na hora, e fique à disposição para dúvidas. NÃO demonstre mais nada, NÃO passe pra Bia — decidido não precisa de closer.
8. PASSAGEM PARA A BIA (só cliente QUALIFICADO e AINDA EM DÚVIDA): use a tag exata ${PASS_BIA_TAG} (sozinha, na última linha) SOMENTE quando o score é ALTO (≥70) MAS a lead está HESITANTE/CÉTICA — tem objeções, quer "pensar", desconfia do resultado, pede pra "entender melhor", ou é claramente exigente e precisa ser convencida do VALOR. A Bia é a especialista que vende valor pra esse cliente difícil. NUNCA use ${PASS_BIA_TAG} para quem já decidiu (esse você fecha com o link) nem para carteira pequena (esse é Essencial, você fecha). NUNCA junte ${PASS_BIA_TAG} com ${ESCALATE_TAG}/${HANDOFF_TAG}.` : `7. VOCÊ É A BIA (closer de VALOR). Recebeu um cliente QUALIFICADO e CÉTICO que a Duda não convenceu sozinha — ele pode pagar mas ainda não quer, é exigente, cobra coerência. Seu trabalho é vender VALOR: conecte a dor concreta dele (carteira parada, cadeira vazia) ao mecanismo, use a garantia como transferência de risco ("o risco é meu"), traga a conta personalizada e a escassez real. NUNCA se reapresente (continue do dossiê). Quando ELE decidir, mande o LINK DE PAGAMENTO do plano na hora — não enrole quem já fechou.`}
${botAlreadySpoke ? '8. Esta conversa JÁ ESTÁ EM ANDAMENTO. CONTINUE do ponto atual. NUNCA se reapresente, NUNCA recomece do zero, NUNCA repita a saudação inicial.' : ''}

═══════════════════════════════════════
COMO RESPONDER (WhatsApp — regras de forma DURAS)
═══════════════════════════════════════
- Responda em pt-BR, tom de conversa de WhatsApp: curto, humano, direto.
- MÁXIMO ~300 caracteres. Sem parede de texto.
- EXATAMENTE UMA pergunta por resposta (ou nenhuma). Nunca faça duas perguntas juntas.
- Sem listas, sem markdown, sem asteriscos. Texto corrido.
- No máximo 1 emoji, e só quando couber.
- Reaja com calor ao que a lead disse antes de perguntar (micro-ack).
- Use o nome do cliente quando souber. Nunca repergunte o que já está em "O QUE JÁ SABEMOS DA LEAD".
- Sempre avance a conversa (qualifique ou proponha próximo passo).`;

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
    console.info(`[platform-sales-brain] modelo=${model} persona=${personaIsCloser ? 'closer/Bia' : personaIsSdr ? 'sdr/Duda' : 'outra'}`);

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
        console.warn('[platform-sales-brain] [PASSAR_BIA] emitido mas nenhum closer (Bia) ativo no WhatsApp — Duda mantém a conversa.');
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
    // (a) censura de vocabulário; (b) 1 pergunta só; (c) divisão em bolhas.
    const san = sanitizeReply(reply);
    reply = san.text;
    const sanitized = san.sanitized;
    // Corte na 1ª pergunta só quando NÃO é handoff NEM passagem pra Bia (essas
    // fecham com transição calorosa, sem pergunta — truncar comeria a despedida).
    if (!needsHandoff && !passedToBia) reply = keepFirstQuestion(reply);
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

    for (let i = 0; i < total; i++) {
      const bubbleText = bubbles[i];
      const baseMeta = {
        channel: 'whatsapp_cloud',
        agent_id: persona.id,
        score: currentScore,
        rota: currentRota,
        debounce_waited_ms: debounceWaitedMs,
        sanitized,
        bubble_n: i + 1,
        bubble_total: total,
        delivery_status: 'sent',
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

      const { wamid, error: deliveryError } = await deliverViaWhatsAppCloud(supabase, dest, bubbleText);
      if (wamid) anyDelivered = true; else lastDeliveryError = deliveryError;

      const deliveryMeta = wamid
        ? { ...baseMeta, wamid, delivery_status: 'sent' }
        : { ...baseMeta, delivery_status: 'failed', delivery_error: deliveryError };

      const { data: updated } = await supabase
        .from('platform_crm_messages')
        .update({ metadata: deliveryMeta })
        .eq('id', message.id)
        .select('*')
        .single();
      const finalMessage = updated ?? message;
      if (!wamid) console.error('[platform-sales-brain] bolha NÃO entregue:', deliveryError);

      await broadcastPlatformNewMessage(supabase, conversationId, finalMessage);

      // Pausa proporcional ao tamanho da PRÓXIMA bolha (ritmo humano), só entre bolhas.
      if (i < total - 1) {
        const next = bubbles[i + 1] ?? '';
        await sleep(Math.min(next.length * BUBBLE_PAUSE_PER_CHAR_MS, BUBBLE_PAUSE_CAP_MS));
      }
    }

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
    let qualPersisted = false;
    let newScore: number | null = null;
    if (conversation.lead_id && lead) {
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
        const qcr = computeQcrScore(mergedQual);
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
