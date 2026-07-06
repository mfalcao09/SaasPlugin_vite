// goldens.ts — GOLDEN CONVERSATIONS do braço EVALS-V1 (5.6).
//
// A régua binária do "95/100": cada golden é um cenário de lead com mensagens
// de entrada e ASSERTIONS binárias sobre a resposta da Duda/Bia (o brain).
// Sem eval, nenhuma nota se afirma — este arquivo É a nota.
//
// Consumido por: ./index.ts (runner: itera GOLDENS / faz lookup em GOLDENS_BY_ID)
// e ./assertions.ts (importa os tipos Assertion/Golden).
//
// Cada golden roda numa conversa EFÊMERA (prefixo visitor_id 'wa:eval-'): a EF
// injeta os `inbound[]` no CRM, chama o platform-sales-brain e coleta as bolhas
// outbound persistidas. As `assertions` são casadas contra o texto concatenado
// dessas bolhas (a menos que a assertion diga `scope: 'lastTurn'`).
//
// ⚠️ NENHUMA mensagem real é enviada: a conversa efêmera usa telefone SEM
// dígitos (a EF seta visitor_whatsapp='eval-no-send'), então a entrega via
// Cloud API retorna 'no_destination_phone' e o Graph nunca é chamado. As
// bolhas ainda são persistidas em platform_crm_messages (o brain persiste
// ANTES de entregar) — é de lá que lemos a resposta.

// ─── Tipos ──────────────────────────────────────────────────────────────────

/** Um turno de entrada da lead. `waAgoSec` = idade do wa_timestamp (segundos
 *  no passado). Default 35s: derrota o DEBOUNCE (25s) sem cair no
 *  STALE_REDELIVERY (10min), então o brain responde JÁ, sem dormir. Um turno
 *  com waAgoSec < 25 é "fresco" — usado só no golden de debounce/mensagens
 *  picadas para provar a agregação. */
export interface GoldenInbound {
  content: string;
  waAgoSec?: number;
}

/** Tipo de assertion binária. */
export type AssertionKind =
  | 'must_contain'      // regex DEVE casar
  | 'must_not_contain'  // regex NÃO PODE casar
  | 'max_questions'     // nº de '?' no texto ≤ value
  | 'must_link'         // DEVE haver uma URL http(s) (link de checkout)
  | 'no_link';          // NÃO PODE haver URL http(s)

/** Escopo do texto avaliado: 'all' = todas as bolhas outbound do bot na
 *  conversa; 'lastTurn' = só as bolhas geradas pela última chamada do brain. */
export type AssertionScope = 'all' | 'lastTurn';

export interface Assertion {
  kind: AssertionKind;
  /** regex (string, flag i aplicada pela EF) para *_contain; número para os demais. */
  pattern?: string;
  value?: number;
  scope?: AssertionScope; // default 'lastTurn'
  /** por que essa assertion existe — vira a mensagem de falha. */
  reason: string;
}

/** Estado inicial do lead (o que a Duda "já sabe") — injetado em
 *  platform_crm_leads.metadata.qualificacao / bant_* antes de chamar o brain,
 *  para cenários que dependem de memória (ex.: qualificado que já tem score). */
export interface GoldenLeadSeed {
  name?: string;
  sub_vertical?: string;
  tempo_atendimento_meses?: number;
  num_clientes?: number;
  ticket_medio?: number;
  recorrencia?: string;
  score_0_100?: number;
  temperature?: 'hot' | 'warm' | 'cold';
  bant_need?: string;
}

export interface Golden {
  id: string;
  title: string;
  /** Contexto humano do cenário (aparece no relatório). */
  scenario: string;
  /** Turnos da lead, em ordem cronológica. A EF injeta um a um. */
  inbound: GoldenInbound[];
  /** Se a conversa já vem de uma passagem para a Bia: fixa o closer como
   *  current_agent_id (a EF resolve o id do agente closer do produto). */
  startWithCloser?: boolean;
  /** Estado prévio do lead (memória de qualificação). */
  leadSeed?: GoldenLeadSeed;
  assertions: Assertion[];
}

// ─── Vocabulário proibido (reutilizado em vários goldens) ────────────────────
// Estas frases NUNCA podem aparecer numa resposta de oferta da Duda.
const NO_FREE_TRIAL: Assertion = {
  kind: 'must_not_contain',
  pattern: '\\b(teste|trial|per[ií]odo)\\s+gr[aá]tis\\b|\\bgr[aá]tis\\b',
  scope: 'all',
  reason: 'NUNCA "teste grátis": o Piloto é PAGO com garantia — o guardrail sanitizeReply deve ter reancorado.',
};
const NO_DISQUALIFY: Assertion = {
  kind: 'must_not_contain',
  pattern: 'n[aã]o se (encaixa|qualifica)|n[aã]o (é|e) (pra|para) voc[eê]|voc[eê] n[aã]o (tem|se)',
  scope: 'all',
  reason: 'NUNCA desqualificar a lead ("não se encaixa"): pagou é cliente — a Duda recomenda o plano, nunca rejeita.',
};
const NO_DISCOUNT: Assertion = {
  kind: 'must_not_contain',
  pattern: '\\bdesconto|promo(ç|c)(ã|a)o\\b',
  scope: 'all',
  reason: 'NUNCA desconto: reancorar na garantia, nunca no preço.',
};
const ONE_QUESTION: Assertion = {
  kind: 'max_questions',
  value: 1,
  scope: 'lastTurn',
  reason: 'No máximo 1 pergunta por resposta (keepFirstQuestion) — nunca interrogatório.',
};

// ─── As 12 GOLDEN CONVERSATIONS ──────────────────────────────────────────────

export const GOLDENS: Golden[] = [
  // (a) A conversa REAL de 05/07 que falhou. "trabalho com uma amiga / 50
  //     clientes" — a Duda NÃO pode desqualificar; tem que perguntar ticket
  //     e recomendar. Falha original: cortou na 2ª msg por "<80 clientes".
  {
    id: 'a_falha_50_clientes',
    title: 'Zona cinzenta 50 clientes (a falha real de 05/07)',
    scenario:
      'Lead diz que trabalha com uma amiga e tem ~50 clientes. A régua antiga (≥80 clientes) desqualificou na 2ª msg sem perguntar ticket. A Duda DEVE perguntar o ticket (a conta 50×R$X) e jamais desqualificar.',
    inbound: [
      { content: 'oi, vi o anúncio de vocês' },
      { content: 'eu trabalho com uma amiga, a gente tem umas 50 clientes' },
    ],
    assertions: [
      NO_DISQUALIFY,
      NO_FREE_TRIAL,
      ONE_QUESTION,
      {
        kind: 'must_contain',
        pattern: 'quanto|pre[çc]o|cobr|ticket|valor|custa|m[eé]dia|atende|servi[çc]o|área|área|faz|tipo|qual',
        scope: 'lastTurn',
        reason: 'A Duda DEVE progredir a descoberta sem desqualificar — perguntar a área/tipo de serviço (pré-requisito do ticket, já que a lead deu a carteira mas não a área) ou o ticket direto. Ambos são progresso válido.',
      },
      {
        kind: 'no_link',
        scope: 'lastTurn',
        reason: 'Ainda em descoberta (sem ticket) — não manda link de pagamento nem oferta fechada.',
      },
    ],
  },

  // (b) Decidido rápido: "quero contratar, como pago" → a Duda manda o LINK,
  //     não passa pra Bia. Regra 7 (SDR): decidido não precisa de closer.
  {
    id: 'b_decidido_manda_link',
    title: 'Decidido rápido → Duda manda o link (não passa pra Bia)',
    scenario:
      'Lead já qualificada sinaliza decisão explícita ("quero contratar, como pago?"). A Duda fecha ela mesma: manda o link de pagamento do plano recomendado. NUNCA passa pra Bia quem já quer fechar.',
    leadSeed: {
      name: 'Carla',
      sub_vertical: 'cílios',
      tempo_atendimento_meses: 24,
      num_clientes: 120,
      ticket_medio: 200,
      recorrencia: 'alta',
      score_0_100: 85,
      temperature: 'hot',
    },
    inbound: [
      { content: 'gostei muito, quero contratar. como faço pra pagar?' },
    ],
    assertions: [
      {
        kind: 'must_link',
        scope: 'lastTurn',
        reason: 'Decidido recebe o LINK de pagamento na hora (a "maquininha" da Duda).',
      },
      NO_FREE_TRIAL,
      NO_DISCOUNT,
      {
        kind: 'must_not_contain',
        pattern: 'especialista|te (deixo|passo|conecto) com|nossa closer|a bia',
        scope: 'lastTurn',
        reason: 'NUNCA passar pra Bia quem já decidiu — decidido não precisa de closer.',
      },
    ],
  },

  // (c) Qualificado CÉTICO: "tá caro, será que funciona pra mim" → a Duda passa
  //     pra Bia (score alto + hesitante). A tag [PASSAR_BIA] é interna: não
  //     vaza pro cliente, e a última bolha é a transição calorosa.
  {
    id: 'c_qualificado_cetico_passa_bia',
    title: 'Qualificado cético → passa pra Bia',
    scenario:
      'Lead com score alto (qualificada) mas hesitante/cética ("tá caro, será que funciona pra mim?"). Rota: [PASSAR_BIA] — a Bia é a especialista que vende valor pro cético. A tag não pode vazar; a resposta termina com transição calorosa.',
    leadSeed: {
      name: 'Juliana',
      sub_vertical: 'estética',
      tempo_atendimento_meses: 36,
      num_clientes: 90,
      ticket_medio: 250,
      recorrencia: 'média',
      score_0_100: 78,
      temperature: 'hot',
      bant_need: 'clientes sumindo, agenda com buracos',
    },
    inbound: [
      { content: 'sei lá, tá caro isso. será que funciona mesmo pro meu caso?' },
    ],
    assertions: [
      {
        kind: 'must_not_contain',
        pattern: '\\[PASSAR_BIA\\]|\\[ESCALAR_HUMANO\\]|\\[HANDOFF_HUMANO\\]',
        scope: 'all',
        reason: 'As tags de controle NUNCA podem vazar no texto entregue ao cliente.',
      },
      NO_DISCOUNT,
      NO_FREE_TRIAL,
      NO_DISQUALIFY,
    ],
  },

  // (d) Carteira grande / ticket alto (lash 20×R$1500) → Piloto. Carteira
  //     pequena mas ticket altíssimo = qualificadíssima (PR ~R$10.500).
  {
    id: 'd_ticket_alto_piloto',
    title: 'Ticket alto (20×R$1500) → oferta do Piloto',
    scenario:
      'Esteticista: 20 clientes de R$1.500 (protocolo). PR = 20×1500×0,35 = R$10.500 = 48× a mensalidade. Carteira pequena NÃO desqualifica quando o ticket é alto. Rota: oferta do Piloto com a conta personalizada.',
    inbound: [
      { content: 'faço protocolo de estética avançada, R$1500 a sessão' },
      { content: 'minha carteira é pequena, umas 20 clientes só' },
    ],
    assertions: [
      NO_DISQUALIFY,
      NO_FREE_TRIAL,
      ONE_QUESTION,
      {
        kind: 'must_not_contain',
        pattern: 'carteira (maior|pequena demais)|precisa (de|ter) mais clientes',
        scope: 'all',
        reason: 'NUNCA descartar por carteira pequena — 20×R$1500 é a lead mais valiosa do funil.',
      },
    ],
  },

  // (e) Carteira pequena / começando → Essencial com HONESTIDADE, sem "não se
  //     encaixa". Score baixo NÃO vira desqualificação fria — a Duda recomenda
  //     o plano de entrada ou escala humano com calor, nunca joga fora.
  {
    id: 'e_comecando_essencial_honesto',
    title: 'Começando → Essencial honesto (sem "não se encaixa")',
    scenario:
      'Lead começou mês passado, atendeu 8 clientes. Score baixo. A Duda NÃO pode dizer "você não se encaixa" nem empurrar Trial como consolação — recomenda o caminho de entrada com honestidade OU escala humano com transição calorosa.',
    inbound: [
      { content: 'oi! comecei mês passado com sobrancelha' },
      { content: 'atendi umas 8 clientes até agora' },
    ],
    assertions: [
      NO_DISQUALIFY,
      NO_FREE_TRIAL,
      {
        kind: 'must_not_contain',
        pattern: 'que pena|infelizmente voc[eê]|ainda n[aã]o (dá|da|serve)',
        scope: 'all',
        reason: 'NUNCA rebaixamento frio da lead iniciante — tom caloroso, caminho de crescimento.',
      },
    ],
  },

  // (f) Pede humano → [ESCALAR_HUMANO]. A tag vira status waiting_human +
  //     transição calorosa; a tag em si nunca vaza.
  {
    id: 'f_pede_humano_escala',
    title: 'Pede humano → escala com calor',
    scenario:
      'Lead pede explicitamente falar com uma pessoa. Rota: [ESCALAR_HUMANO] (ou [HANDOFF_HUMANO]) — a resposta termina com transição calorosa e a tag nunca vaza no texto.',
    inbound: [
      { content: 'prefiro falar com um atendente de verdade, uma pessoa mesmo' },
    ],
    assertions: [
      {
        kind: 'must_not_contain',
        pattern: '\\[ESCALAR_HUMANO\\]|\\[HANDOFF_HUMANO\\]|\\[PASSAR_BIA\\]',
        scope: 'all',
        reason: 'A tag de escalada NUNCA pode vazar no texto entregue ao cliente.',
      },
      {
        kind: 'must_contain',
        pattern: 'time|equipe|especialista|pessoa|humano|conectar|te (deixo|passo)',
        scope: 'lastTurn',
        reason: 'Ao escalar, a última fala é uma transição calorosa para o time humano.',
      },
    ],
  },

  // (g) Mensagens picadas (debounce): a lead digita 3 fragmentos frescos em
  //     rajada. O brain DEVE agregar numa única resposta (debounce/superseded),
  //     nunca responder 3 vezes. Verificado pela EF: 1 chamada com os
  //     fragmentos frescos → no máx 1 bloco de bolhas de resposta.
  {
    id: 'g_mensagens_picadas_debounce',
    title: 'Mensagens picadas → agrega numa resposta (debounce)',
    scenario:
      'Lead manda "oi" / "trabalho com unha" / "faz uns 2 anos" em rajada (< 25s cada). O debounce agrega: a Duda responde UMA vez, não uma por fragmento. Testa a robustez do DEBOUNCE_MS/superseded.',
    inbound: [
      { content: 'oi', waAgoSec: 3 },
      { content: 'trabalho com unha', waAgoSec: 2 },
      { content: 'faz uns 2 anos que atendo', waAgoSec: 1 },
    ],
    assertions: [
      ONE_QUESTION,
      NO_DISQUALIFY,
      {
        kind: 'must_not_contain',
        pattern: 'oi de novo|como eu disse|repetindo',
        scope: 'lastTurn',
        reason: 'Sem reapresentação nem repetição — o debounce deve ter agregado a rajada.',
      },
    ],
  },

  // (h) Tentativa de desconto → reancora na GARANTIA, nunca dá desconto.
  {
    id: 'h_pede_desconto_reancora_garantia',
    title: 'Pede desconto → reancora na garantia',
    scenario:
      'Lead pede desconto ("tem como fazer um precinho melhor?"). A Duda NUNCA concede desconto — reancora na garantia ("o risco é meu / devolvemos se não recuperar mais que a mensalidade").',
    leadSeed: {
      name: 'Fernanda',
      sub_vertical: 'cílios',
      tempo_atendimento_meses: 18,
      num_clientes: 70,
      ticket_medio: 180,
      recorrencia: 'alta',
      score_0_100: 72,
      temperature: 'hot',
    },
    inbound: [
      { content: 'tem como fazer um precinho melhor? um desconto?' },
    ],
    assertions: [
      NO_DISCOUNT,
      NO_FREE_TRIAL,
      {
        kind: 'must_contain',
        pattern: 'garantia|devolv|risco (é|e) (meu|nosso)|recuperar',
        scope: 'lastTurn',
        reason: 'Diante do pedido de desconto, reancorar explicitamente na garantia.',
      },
    ],
  },

  // (i) Não sabe a carteira → fallback (atendimentos/semana), sem travar.
  {
    id: 'i_nao_sabe_carteira_fallback',
    title: 'Não sabe a carteira → fallback sem travar',
    scenario:
      'Lead nunca contou quantas clientes já atendeu. A Duda NÃO trava ("preciso desse número"): aplica o fallback (atendimentos por semana × tempo) e segue.',
    inbound: [
      { content: 'trabalho com podologia' },
      { content: 'nossa, nunca contei quantas clientes já passaram por mim...' },
    ],
    assertions: [
      ONE_QUESTION,
      NO_DISQUALIFY,
      {
        kind: 'must_not_contain',
        pattern: 'preciso (desse|do) n[uú]mero|sem (isso|esse dado) n[aã]o',
        scope: 'lastTurn',
        reason: 'NUNCA travar a conversa por falta do número — usar o fallback (atendimentos/semana).',
      },
      {
        kind: 'must_contain',
        pattern: 'semana|por dia|quantas.*atende|numa semana|cheia',
        scope: 'lastTurn',
        reason: 'O fallback pergunta atendimentos por semana para estimar a carteira.',
      },
    ],
  },

  // (j) Bia (closer) NÃO se reapresenta. Conversa que já veio da Duda: o closer
  //     continua do dossiê, valida 1 detalhe e conduz ao fechamento.
  {
    id: 'j_bia_nao_reapresenta',
    title: 'Bia assume → não recomeça do zero (continua do dossiê)',
    scenario:
      'Conversa já passada pra Bia (current_agent_id = closer). A lead volta com objeção. A Bia NÃO se apresenta do zero nem reinicia a descoberta — continua do dossiê e conduz ao fechamento.',
    startWithCloser: true,
    leadSeed: {
      name: 'Patrícia',
      sub_vertical: 'cílios',
      tempo_atendimento_meses: 30,
      num_clientes: 100,
      ticket_medio: 220,
      recorrencia: 'alta',
      score_0_100: 80,
      temperature: 'hot',
      bant_need: 'perdeu clientes na pandemia, agenda esvaziou',
    },
    inbound: [
      { content: 'ainda tô na dúvida se vale a pena viu' },
    ],
    assertions: [
      {
        kind: 'must_not_contain',
        pattern: 'oi(,| eu)? sou|meu nome (é|e)|prazer|bem-vinda|seja bem',
        scope: 'lastTurn',
        reason: 'A Bia NUNCA se reapresenta — assume o dossiê da Duda e continua.',
      },
      NO_DISCOUNT,
      NO_FREE_TRIAL,
      NO_DISQUALIFY,
    ],
  },

  // (k) Reclamação grave → [HANDOFF_HUMANO] com calor (não é venda).
  {
    id: 'k_reclamacao_grave_handoff',
    title: 'Reclamação grave → handoff humano',
    scenario:
      'Lead faz reclamação grave (cobrança indevida / ameaça de reclamar no Procon). Rota: [HANDOFF_HUMANO] — a Duda não tenta vender, escala com calor. Tag nunca vaza.',
    inbound: [
      { content: 'vocês me cobraram errado e ninguém resolve! vou reclamar no procon' },
    ],
    assertions: [
      {
        kind: 'must_not_contain',
        pattern: '\\[HANDOFF_HUMANO\\]|\\[ESCALAR_HUMANO\\]|\\[PASSAR_BIA\\]',
        scope: 'all',
        reason: 'A tag de handoff NUNCA pode vazar no texto entregue ao cliente.',
      },
      {
        kind: 'must_not_contain',
        pattern: 'piloto|contrat|assinar|plano|link de pagamento',
        scope: 'lastTurn',
        reason: 'Diante de reclamação grave, a Duda NÃO tenta vender — escala pro humano.',
      },
      {
        kind: 'no_link',
        scope: 'lastTurn',
        reason: 'Reclamação não recebe link de checkout.',
      },
    ],
  },

  // (l) Pergunta o preço de cara → responde o preço real (do banco), sem
  //     inventar e sem parede de texto. Testa a regra "só o que está no
  //     conhecimento" + guardrail de forma (≤1 pergunta, bolhas curtas).
  {
    id: 'l_pergunta_preco_direto',
    title: 'Pergunta preço direto → responde sem inventar, sem parede de texto',
    scenario:
      'Lead pergunta "quanto custa?" logo de cara. A Duda responde com o preço real (do conhecimento do produto), sem inventar valor e sem parede de texto, mantendo a descoberta viva.',
    inbound: [
      { content: 'quanto custa o app de vocês?' },
    ],
    assertions: [
      ONE_QUESTION,
      NO_FREE_TRIAL,
      NO_DISCOUNT,
      {
        kind: 'must_not_contain',
        pattern: 'n[aã]o (sei|posso) (dizer|informar) o pre[çc]o|consulte',
        scope: 'lastTurn',
        reason: 'A Duda tem o preço no conhecimento — não empurra a resposta pra depois.',
      },
    ],
  },
];

/** Índice por id para lookup rápido na EF. */
export const GOLDENS_BY_ID: Record<string, Golden> = Object.fromEntries(
  GOLDENS.map((g) => [g.id, g]),
);
