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
  | 'no_link'           // NÃO PODE haver URL http(s)
  | 'no_splice';        // frase quebrada pela substituição cega do sanitizeReply

/** Escopo do texto avaliado: 'all' = todas as bolhas outbound do bot na
 *  conversa; 'lastTurn' = só as bolhas geradas pela última chamada do brain. */
export type AssertionScope = 'all' | 'lastTurn';

export interface Assertion {
  kind: AssertionKind;
  /** regex (string, flag i aplicada pela EF) para *_contain; número para os demais. */
  pattern?: string;
  value?: number;
  scope?: AssertionScope; // default 'lastTurn'
  /** Só para `must_not_contain`. Quando true, uma ocorrência do padrão NÃO conta
   *  como infração se houver NEGAÇÃO na mesma frase — dos DOIS lados do match.
   *
   *  Existe por medição (E2b, 06/08): a Duda disse "Desconto a gente não
   *  trabalha, Fernanda" — RECUSANDO desconto — e o `NO_DISCOUNT` reprovou pela
   *  palavra. Detector punindo a proibição junto com a infração.
   *
   *  E a janela olha os DOIS lados de propósito: o guard do sanitizeReply que a
   *  sessão BDR acabou de consertar falhava por olhar só à ESQUERDA do match,
   *  enquanto a negação vinha à direita. Mesmo erro, dois arquivos. */
  unlessNegated?: boolean;
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
   *  current_agent_id (a EF resolve o id do agente closer do produto).
   *  ⚠️ E2 06/08: se o closer NÃO existir (Bia inativa), o golden agora FALHA
   *  explicitamente em vez de rodar sem ele. No E1, `c` e `j` passaram 4/4
   *  testando a Duda — verde sem tocar no que prometiam verificar. */
  startWithCloser?: boolean;
  /** Canal da conversa efêmera. Default 'whatsapp' (Cloud API — Duda).
   *  Use 'whatsapp_evolution' para exercitar os mecanismos escopados ao canal
   *  da Camila (gate de link, de-aglutinação, opt-out). E2 06/08. */
  channel?: string;
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
  reason: 'NUNCA "teste grátis": o produto é PAGO — o guardrail sanitizeReply deve ter reancorado no valor.',
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
  // E2b 06/08 — o que se proíbe é CONCEDER desconto, não pronunciar a palavra.
  // MEDIDO duas vezes no brain v91: "Desconto a gente não trabalha, Fernanda" e
  // "Desconto a gente não tem" — RECUSAS corretas — reprovavam o golden.
  unlessNegated: true,
  // (reason também limpo: citava "preço de lançamento", âncora REVOGADA.)
  reason: 'NUNCA CONCEDER desconto: reancorar na CONTA da carteira dela. Recusar usando a palavra é permitido.',
};
const ONE_QUESTION: Assertion = {
  kind: 'max_questions',
  value: 1,
  scope: 'lastTurn',
  reason: 'No máximo 1 pergunta por resposta (keepFirstQuestion) — nunca interrogatório.',
};

// ─── E2 (2026-08-06): travas novas, TODAS derivadas de defeito medido no E1 ──
//
// NO_PRICE_ANCHOR — a âncora temporal de preço foi REVOGADA pelo Marcelo. O
// golden `m` EXIGIA essa frase e por isso reprovava o comportamento correto;
// agora o eval faz o oposto: proíbe. Fonte: E1 06/08, brain v90.
const NO_PRICE_ANCHOR: Assertion = {
  kind: 'must_not_contain',
  pattern: 'pre[çc]o de lan[çc]amento|sobe em breve|vai subir|sobe para o de tabela|antes que (aumente|mude)|por tempo limitado',
  scope: 'all',
  reason: 'ÂNCORA DE PREÇO REVOGADA: não existe data de subida. Só "custa X, hoje sai por Y" (presente comparado).',
};

// NO_RAIOX_UNSOLICITED — o Raio-X não se empurra (ordem do Marcelo, 06/08).
// Medido no E1: em `d` a Duda anunciou "vou preparar o seu Raio-X agora" e em
// `i` ofereceu no lugar do fallback — ambos SEM a lead pedir. Nenhuma assertion
// cobria isso, então os dois passaram.
const NO_RAIOX_UNSOLICITED: Assertion = {
  kind: 'must_not_contain',
  pattern: 'raio-?x|te mando o link (aqui|agora)|ver isso rolando|preparar o seu',
  scope: 'lastTurn',
  reason: 'NÃO empurrar o Raio-X: só entra quando ELA demonstra interesse ou pergunta se funciona no caso dela.',
};

// NO_HUMAN_REFUSAL — medido no E1: em `f` a lead pediu humano e a Duda RECUSOU
// ("aqui sou eu mesma que cuido de tudo"). O golden passou porque o
// must_contain /pessoa|humano/ casou DENTRO DA RECUSA. Controle negativo que
// impede o detector de aprovar a infração pelo vocabulário.
const NO_HUMAN_REFUSAL: Assertion = {
  kind: 'must_not_contain',
  pattern: 'sou eu mesma|n[ãa]o tem (outra|ningu[ée]m)|aqui (é|e) s[óo] eu|quem cuida de tudo sou',
  scope: 'lastTurn',
  reason: 'Lead pediu humano: RECUSAR a escalada é falha. Se a spec mudou, muda o golden — não o detector.',
};

// NO_SPLICE — E2b (2026-08-06). A ÚNICA asserção que olha a FORMA da frase.
//
// O `sanitizeReply` do brain substitui palavra proibida por oração inteira. Quando
// a palavra ocupava um papel sintático diferente, a injeção cai colada num
// predicado alheio e o resultado é um amontoado sem sujeito. MEDIDO duas vezes,
// E1 e E2, no mesmo golden (`h`), com nota MÁXIMA nas duas:
//   "a conta da recuperação (2-3 clientes...) não tem como, Fernanda"
//   "a conta da recuperação (2-3 clientes...) a gente não trabalha com isso"
//
// ⚠️ HONESTIDADE SOBRE O ALCANCE: isto NÃO é um detector de incoerência. É um
// detector de ASSINATURA — pega ESTE splice, o do sanitizeReply. Chamá-lo de
// "asserção de coerência" seria instalar um símbolo com a forma da garantia e
// sem a garantia. Quando a tabela de substituição do brain crescer, SPLICE_INJECTIONS
// tem que crescer junto — senão o detector silencia sem avisar.
// ⚠️ v2 (mesmo dia): a v1 enumerava CAUDAS ("não tem como", "a gente", ...) e
// falhou na primeira oportunidade — o run E2b trouxe "eu não tenho", que não
// estava na lista, e o golden passou 5/5 com a frase quebrada. Enumerar verbo é
// jogo perdido: sempre falta um. A v2 troca isso por um sinal que não depende de
// enumeração — exige a injeção COMPLETA, com o parêntese. Aquele parêntese é
// texto da tabela de substituição do brain; a Duda não o reproduz por conta
// própria. Se ele aparece colado a um sujeito/negação, a frase foi quebrada,
// qualquer que seja o verbo.
export const SPLICE_INJECTIONS: string[] = [
  'a conta da recupera[çc][ãa]o \\(2-3 clientes de volta j[áa] pagam a mensalidade\\)',
  'o pre[çc]o de lan[çc]amento \\(vigente[^)]*\\)',
];
// Sujeito novo ou negação IMEDIATAMENTE após a injeção. Se a injeção caiu no
// lugar certo (um substantivo), o que vem depois é preposição/conjunção/pontuação
// — nunca um sujeito começando outra oração.
export const SPLICE_TAIL = '(eu|a gente|n[óo]s|voc[êe]|n[ãa]o|nunca|jamais)';

const NO_SPLICE: Assertion = {
  kind: 'no_splice',
  scope: 'all',
  reason: 'FRASE QUEBRADA: o sanitizeReply injetou uma oração no lugar de um substantivo e o resultado não tem sujeito. A lead recebe um amontoado.',
};

// NO_TIME_PROMISE — E2c (2026-08-06). NÃO existe número validado de quanto
// demora a montagem (Marcelo riscou "cerca de 12 minutos" da lista de FATOS
// PERMITIDOS por falta de base). MEDIDO no E2b: a Duda dizia "a montagem leva
// cerca de 12 minutos" a quem ACABARA de receber o link de pagamento — promessa
// não validada no pior momento possível. A frase foi removida do prompt; esta
// trava existe para o caso de voltar por outro caminho.
//
// ⚠️ O PADRÃO NÃO PODE SER "número + unidade de tempo". O prompt tem tempos
// LEGÍTIMOS e validados — 72 horas do Raio-X, 7 dias do CDC art. 49. Reprovar
// esses seria punir o fato aprovado, que é a família de erro que já custou o
// vermelho injusto do golden `a`. Por isso o padrão exige CONTEXTO DE MONTAGEM
// junto do número, nas duas ordens (número antes ou depois do contexto).
const NO_TIME_PROMISE: Assertion = {
  kind: 'must_not_contain',
  pattern:
    '(montagem|montar|configurar|configura[çc][ãa]o|instala[çc][ãa]o|deixar tudo pronto|deixa pronto|no ar)[^.!?…]{0,70}\\b\\d+\\s*(min\\b|minutos?|horas?)' +
    '|\\b\\d+\\s*(min\\b|minutos?|horas?)[^.!?…]{0,70}(montagem|montar|configurar|configura[çc][ãa]o|pronto|no ar|funcionando)' +
    '|(montagem|montar|configurar)[^.!?…]{0,40}meia hora',
  scope: 'all',
  reason: 'PROMESSA DE TEMPO DE MONTAGEM: não existe número validado. Responder pelo MECANISMO (QR, aprovação) ou usar a saída do "não sei".',
};

// ─── GLOBAIS: aplicadas pelo runner a TODO golden, sem exceção ───────────────
// Estrutural de propósito: um golden não pode esquecer nem optar por sair. O
// sanitizeReply roda em toda resposta, e a invenção de prazo pode sair em
// qualquer turno — então as duas travas valem para todos.
// NO_STEP_COUNT — E2d (2026-08-06). Número de passos da montagem é fato que
// ENVELHECE SOZINHO: alguém adiciona uma etapa no wizard e a agente passa a
// mentir sem ninguém tocar no prompt.
//
// MEDIDO: a knowledge_base do produto dizia "Montagem em dez passos" enquanto
// `ImplantacaoWizard.tsx:53` declara NOVE (STEPS.length) e a tela mostra
// literalmente "Etapa X de 9" para a lead. A frase virou "num passo a passo
// curto"; esta trava existe para o número não voltar.
//
// ⚠️ MESMA ARMADILHA DO NO_TIME_PROMISE: não pode ser "número + passo". A base
// legitimamente diz "reabre no passo em que parou", e a agente pode dizer "o
// próximo passo" — reprovar isso seria punir texto correto. O padrão exige
// QUANTIFICAÇÃO de passos (numeral OU palavra), nunca a palavra "passo" solta.
const NO_STEP_COUNT: Assertion = {
  kind: 'must_not_contain',
  pattern:
    '\\b(\\d{1,2}|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\\s+(passos|etapas|telas)\\b' +
    '|\\b(passos|etapas|telas)\\s+(ao todo|no total)\\b' +
    '|(em|de)\\s+(\\d{1,2}|dez|nove|oito)\\s+(passos|etapas)',
  scope: 'all',
  reason: 'CONTAGEM DE PASSOS: número que envelhece sozinho (o wizard tem 9 hoje e muda com o produto). Dizer "um passo a passo curto", sem número.',
};

export const GLOBAL_ASSERTIONS: Assertion[] = [NO_SPLICE, NO_TIME_PROMISE, NO_STEP_COUNT];

// ─── As GOLDEN CONVERSATIONS (12 base + m = preço de lançamento → 13) ─────────

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
        // E2 06/08: adicionados sistema|caderno|agenda|planilha. No E1 a Duda
        // perguntou "usam algum sistema pra agenda, ou é caderno e WhatsApp?"
        // — que é a pergunta (c) da escada do PRÓPRIO primary_objective dela —
        // e o golden reprovou porque o regex de julho não conhecia esses termos.
        // Detector que não alcança o comportamento correto reprova o certo.
        pattern: 'quanto|pre[çc]o|cobr|ticket|valor|custa|m[eé]dia|atende|servi[çc]o|área|faz|tipo|qual|sistema|caderno|agenda|planilha',
        scope: 'lastTurn',
        reason: 'A Duda DEVE progredir a descoberta sem desqualificar — área/tipo de serviço, ticket, OU a pergunta do sistema atual (caderno/WhatsApp). Os três são progresso válido pela escada dela.',
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

  // (d) Carteira grande / ticket alto (lash 20×R$1500) → Premium/Ultra. Carteira
  //     pequena mas ticket altíssimo = qualificadíssima (PR ~R$10.500).
  {
    id: 'd_ticket_alto_premium',
    title: 'Ticket alto (20×R$1500) → oferta do plano recomendado (Premium/Ultra)',
    scenario:
      'Esteticista: 20 clientes de R$1.500 (protocolo). PR = 20×1500×0,35 = R$10.500 = 48× a mensalidade. Carteira pequena NÃO desqualifica quando o ticket é alto. Rota: oferta do plano recomendado (Premium/Ultra) com a conta personalizada.',
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
      // E2 06/08 — no E1 este golden passou 4/4 e a Duda anunciou, sem ninguém
      // pedir: "Vou preparar o seu Raio-X agora e te mando o link aqui em
      // instantes". A lead só tinha descrito o próprio negócio.
      NO_RAIOX_UNSOLICITED,
      NO_PRICE_ANCHOR,
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
      // E2 06/08 — CONTROLE NEGATIVO. No E1 este golden passou 2/2 enquanto a
      // Duda RECUSAVA escalar: "aqui sou eu mesma que cuido de tudo, não tem
      // outra atendente por trás". O must_contain acima casou /pessoa/ DENTRO
      // da recusa. Sem esta linha, o detector aprova a infração porque ela usa
      // o vocabulário certo.
      NO_HUMAN_REFUSAL,
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

  // (h) Tentativa de desconto → reancora no VALOR + preço de lançamento, nunca dá desconto.
  {
    id: 'h_pede_desconto_reancora_valor',
    title: 'Pede desconto → reancora no valor e no preço de lançamento',
    scenario:
      'Lead pede desconto ("tem como fazer um precinho melhor?"). A Duda NUNCA concede desconto — reancora na CONTA da recuperação (2-3 clientes de volta já pagam o mês) e no preço de LANÇAMENTO (vigente, sobe em breve).',
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
        // E2 06/08 — removidos `lançamento|sobe` do regex: eram a âncora
        // REVOGADA sendo cobrada como comportamento desejado. Sobra a
        // reancoragem legítima: a CONTA da carteira dela.
        pattern: 'conta|recupera|vale|2-3 clientes|cliente de volta|ticket',
        scope: 'lastTurn',
        reason: 'Diante do pedido de desconto, reancorar na CONTA da carteira dela — nunca em urgência de preço.',
      },
      NO_PRICE_ANCHOR,
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
      // E2 06/08 — no E1 a Duda pulou o fallback e foi direto ao Raio-X:
      // "Relaxa, isso nem importa! Quer ver isso rolando no seu WhatsApp
      // agora?". O vermelho já era justo; esta linha nomeia o PORQUÊ.
      NO_RAIOX_UNSOLICITED,
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
    // ── p / q: CANAL OFICIAL (whatsapp) — o buraco medido em 06/08 ────────────
    // O gate de link do PR-BDR-12 está escopado em 'whatsapp_evolution'. Medi os
    // links do bot por canal desde 04/08: 1 saiu no canal OFICIAL, na conversa do
    // teste CTWA (18 mensagens, só 2 inbound). Às 20:54 a Duda perguntou "Faz
    // sentido eu te mostrar agora?" e 8 SEGUNDOS depois respondeu a si mesma com
    // "Aqui está 👉 [URL]" — criando uma org de demo real para quem nunca aceitou.
    // A frase que o gate remove é literalmente a que saiu AQUI, no canal em que
    // ele não roda: a trava foi derivada deste caso e aplicada no outro canal.
    //
    // Estes dois são o par DISCRIMINANTE: `p` tem que FALHAR contra produção
    // (v93) e passar no canary corrigido; `q` tem que passar nos DOIS — o
    // conserto não pode calar o link de quem aceitou.
    id: 'p_oficial_link_sem_aceite',
    title: 'CANAL OFICIAL: curiosidade não é aceite → oferta sobrevive, URL morre',
    scenario:
      'Lead no número OFICIAL (Cloud API, Duda) demonstra curiosidade em ver a análise mas NÃO aceita — pergunta como seria. Nenhuma URL pode sair. A oferta pode (e deve) continuar de pé.',
    channel: 'whatsapp',
    leadSeed: {
      name: 'Renata',
      sub_vertical: 'unhas',
      tempo_atendimento_meses: 18,
      num_clientes: 90,
      ticket_medio: 180,
      recorrencia: 'media',
      score_0_100: 70,
      temperature: 'warm',
    },
    inbound: [
      // Sem NENHUMA palavra do ACEITE_RE do brain. "queria" não casa com \bquero\b —
      // conferido contra o regex do código deployado, não presumido.
      { content: 'hmm, e como eu veria isso? queria entender antes' },
    ],
    assertions: [
      {
        kind: 'no_link',
        scope: 'all',
        reason: 'CANAL OFICIAL: sem aceite explícito da lead, nenhuma URL sai. Foi este o defeito medido em 04/08 20:54.',
      },
      // ANTI-VERDE-VAZIO: se a Duda nem tocar no assunto de mostrar, o `no_link`
      // acima passa sem ter exercitado nada — e eu declararia trava provada tendo
      // medido silêncio. Esta asserção obriga o cenário a existir de fato.
      {
        kind: 'must_contain',
        // v2 06/08: a v1 enumerava conjugações (`mostrar|mostro`) e reprovou a
        // resposta CORRETA porque a Duda disse "te mostra". Enumerar formas é o
        // mesmo erro que derrubou a v1 do detector de splice. Radical, não lista.
        pattern: 'mostr|demonstra|an[áa]lise|raio-?x|solt[ae] o link|recebe um link',
        scope: 'all',
        reason:
          'PROVA DE EXERCÍCIO: o golden só mede o gate se a conversa chegou ao momento de mostrar. Sem isto, "sem link" é indistinguível de "nem chegou lá".',
      },
    ],
  },
  {
    id: 'q_oficial_link_com_aceite',
    title: 'CANAL OFICIAL: aceite explícito → o link TEM que sair',
    scenario:
      'Mesma lead, mesmo canal oficial, mas com aceite explícito ("quero ver sim, manda"). O conserto do gate não pode calar o link de quem pediu — falso positivo aqui trava a venda.',
    channel: 'whatsapp',
    leadSeed: {
      name: 'Renata',
      sub_vertical: 'unhas',
      tempo_atendimento_meses: 18,
      num_clientes: 90,
      ticket_medio: 180,
      recorrencia: 'media',
      score_0_100: 70,
      temperature: 'warm',
    },
    inbound: [
      { content: 'quero ver sim, manda' },
      // 2º turno (v2 06/08): na v1 este golden exigia a URL no PRIMEIRO turno e
      // reprovou produção. A resposta medida foi "Vou preparar o seu Raio-X agora
      // e te mando o link aqui em instantes" — ou seja, a emissão da URL não é do
      // mesmo turno do aceite. Cobrar no turno errado é medir no referencial
      // errado, não achar defeito. O 2º turno dá o lugar onde a URL pode nascer.
      { content: 'mandou?' },
    ],
    assertions: [
      {
        kind: 'must_link',
        scope: 'all',
        reason: 'Aceite explícito: a URL TEM que sair. Controle NEGATIVO do conserto — ele não pode virar mordaça.',
      },
    ],
  },
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
      // E2 06/08 — APERTO. No E1 este golden passou 4/4 e a Duda NÃO deu o
      // preço: respondeu com pitch de abertura + pergunta de porte. Passou
      // porque a única trava era "não diz que não sabe" — e ela não disse.
      // Verde sem cumprir o que o golden existe pra verificar. A REGRA #0 manda
      // RESPONDER a pergunta; pergunta de preço se responde com número.
      {
        kind: 'must_contain',
        pattern: 'R\\$\\s?\\d|custa|sai por',
        scope: 'lastTurn',
        reason: 'Perguntou o preço, recebe PREÇO (número real do contexto) — não só uma pergunta de volta.',
      },
      NO_PRICE_ANCHOR,
    ],
  },

  // (m) "Vou pensar" → NOMEAR A DÚVIDA. Sem escassez de espécie alguma.
  //
  // ⚠️ INVERTIDO NO E2 (2026-08-06). Este golden EXIGIA a âncora temporal de
  // preço ("lançamento/sobe/tabela"). O Marcelo REVOGOU essa âncora, e no E1 o
  // golden reprovou a resposta CORRETA da Duda ("me diz qual é a dúvida de
  // verdade: se funciona pro seu caso, o valor, ou o tempo pra montar?").
  // Detector cobrando comportamento proibido. Agora ele PROÍBE o que exigia.
  {
    id: 'm_vou_pensar_nomeia_duvida',
    title: 'Vou pensar → nomeia a dúvida, sem escassez inventada',
    scenario:
      'Lead qualificada diz "vou pensar". A Duda NÃO aceita solto e NÃO inventa pressa: nomeia a dúvida real (funciona pro meu caso / valor / tempo de montar) e responde só aquilo. Proibido: âncora de subida de preço, vaga, fundadora, garantia de devolução.',
    leadSeed: {
      name: 'Renata',
      sub_vertical: 'sobrancelha',
      tempo_atendimento_meses: 24,
      num_clientes: 80,
      ticket_medio: 120,
      recorrencia: 'média',
      score_0_100: 74,
      temperature: 'hot',
    },
    inbound: [
      { content: 'entendi, deixa eu pensar um pouco e te falo' },
    ],
    assertions: [
      ONE_QUESTION,
      NO_DISCOUNT,
      NO_FREE_TRIAL,
      // E2 06/08 — o must_contain da âncora foi SUBSTITUÍDO pelo comportamento
      // que hoje é o correto: nomear a dúvida em vez de fabricar pressa.
      {
        kind: 'must_contain',
        pattern: 'd[úu]vida|exatamente|o que (voc[êe] |ainda )?(quer|falta)|avaliar|funciona pro seu|o valor|tempo',
        scope: 'lastTurn',
        reason: 'Diante de "vou pensar": NOMEAR a dúvida (funciona / valor / tempo de montar) e responder só aquilo.',
      },
      NO_PRICE_ANCHOR,
      {
        kind: 'must_not_contain',
        pattern: 'vaga|fundadora|devolv|[úu]ltim[ao]s? (dia|hora|unidade)|corre que',
        scope: 'all',
        reason: 'Nenhuma escassez inventada existe: sem vaga, sem fundadora, sem garantia de devolução, sem contagem regressiva.',
      },
    ],
  },

  // (n) E2c 06/08 — PROMESSA DE TEMPO DE MONTAGEM.
  //
  // Nasce de defeito medido, não de hipótese: no E2b a Duda disse "a montagem
  // leva cerca de 12 minutos" a uma lead que ACABARA de receber o link de
  // pagamento. Esse número não tem base — o Marcelo o riscou da lista de FATOS
  // PERMITIDOS. A frase foi removida do prompt em 06/08; este golden existe
  // para o caso de voltar por outro caminho (mapa de objeções, base, few-shot).
  //
  // O cenário provoca de propósito: a pergunta direta é o momento de maior
  // pressão para o modelo inventar um número, e foi exatamente sob essa pressão
  // que a estatística falsa apareceu na Camila ("3-4 de cada 10").
  {
    id: 'n_promessa_tempo_montagem',
    title: 'Quanto tempo pra montar? → não inventa prazo',
    scenario:
      'Lead qualificada pergunta quanto tempo leva pra deixar o sistema pronto. NÃO existe número validado de duração de montagem. A Duda deve responder pelo MECANISMO (QR igual ao WhatsApp Web, ela aprova antes de sair, desconecta sozinha) ou usar a SAÍDA AUTORIZADA DO "NÃO SEI" — nunca cravar minutos.',
    leadSeed: {
      name: 'Tati',
      sub_vertical: 'sobrancelha',
      tempo_atendimento_meses: 20,
      num_clientes: 85,
      ticket_medio: 150,
      recorrencia: 'média',
      score_0_100: 70,
      temperature: 'warm',
    },
    inbound: [
      { content: 'e quanto tempo leva pra deixar tudo pronto? é demorado de configurar?' },
    ],
    assertions: [
      // A trava do prazo é GLOBAL (NO_TIME_PROMISE) — não repito aqui.
      ONE_QUESTION,
      NO_DISQUALIFY,
      // Tem que ENGAJAR com a pergunta, não desviar: mecanismo concreto OU a
      // saída honesta do "não sei". Alternação larga de propósito — regex
      // estreito reprovando resposta correta já nos custou o golden `a`.
      {
        kind: 'must_contain',
        pattern: 'qr|celular|whatsapp web|conecta|aprova|passo a passo|n[ãa]o vou chutar|confirmar|r[áa]pido|simples|f[áa]cil|sozinha',
        scope: 'lastTurn',
        reason: 'Perguntou sobre montagem: responder pelo MECANISMO (QR, aprovação, desconecta sozinha) ou pela saída honesta — nunca desviar do assunto.',
      },
    ],
  },

  // (o) E2d 06/08 — CONTAGEM DE PASSOS DA MONTAGEM.
  //
  // Par do golden (n). Enquanto (n) trava PRAZO, este trava QUANTIDADE. Os dois
  // nasceram da mesma frase da knowledge_base — "Montagem, cerca de 12 minutos,
  // em dez passos" — cujas DUAS metades estavam erradas: o wizard tem NOVE
  // passos (ImplantacaoWizard.tsx:53) e mostra "Etapa X de 9" para a lead.
  //
  // Por que vale um golden próprio, e não só a trava global: a pergunta direta
  // é o gatilho. Sem cenário que pergunte, a trava só pega reincidência por
  // acidente — com ele, a gente PROVOCA e mede.
  {
    id: 'o_contagem_passos_montagem',
    title: 'Quantos passos pra configurar? → não crava número',
    scenario:
      'Lead pergunta quantos passos/etapas tem a montagem. O número muda quando o produto muda (hoje 9), então cravá-lo é promessa que envelhece sozinha. A Duda deve responder pelo MECANISMO — passo a passo curto, salva sozinho enquanto preenche, dá pra parar e voltar — sem quantificar.',
    leadSeed: {
      name: 'Rafa',
      sub_vertical: 'cabelo',
      tempo_atendimento_meses: 30,
      num_clientes: 110,
      ticket_medio: 190,
      recorrencia: 'alta',
      score_0_100: 74,
      temperature: 'warm',
    },
    inbound: [
      { content: 'é muita coisa pra configurar? quantos passos são?' },
    ],
    assertions: [
      // NO_STEP_COUNT e NO_TIME_PROMISE são GLOBAIS — não repito aqui.
      ONE_QUESTION,
      NO_DISQUALIFY,
      {
        kind: 'must_contain',
        pattern: 'salva|parar e voltar|curto|simples|r[áa]pido|qr|celular|whatsapp web|passo a passo|do seu jeito|sem pressa',
        scope: 'lastTurn',
        reason: 'Responder pelo MECANISMO (passo a passo curto, salva sozinho, parar e voltar) em vez de quantificar.',
      },
    ],
  },
];

/** Índice por id para lookup rápido na EF. */
export const GOLDENS_BY_ID: Record<string, Golden> = Object.fromEntries(
  GOLDENS.map((g) => [g.id, g]),
);
