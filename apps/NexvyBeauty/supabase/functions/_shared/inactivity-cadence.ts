// _shared/inactivity-cadence.ts — RÉGUA DE INATIVIDADE do funil de vendas.
//
// Espec Marcelo 2026-07-19 (fiel, não simplificada):
//   Estado por conversa = nº da OCORRÊNCIA de inatividade (1ª→4ª).
//   Limiares de silêncio DA CLIENTE após a última msg da Duda:
//     1ª=8min · 2ª=20min · 3ª=25min · 4ª=35min.
//   QUALQUER mensagem inbound da cliente ZERA a régua (ocorrência volta a 0).
//   Cada ocorrência dispara UMA intervenção da Duda — o sweeper SINALIZA, o
//   BRAIN escreve usando o REPERTÓRIO (nunca texto fixo hardcoded): o bloco
//   deste arquivo vai no prompt da persona para a Duda ADAPTAR ao contexto
//   real da conversa.
//
// Funções PURAS (sem banco/rede) — unit-testadas em inactivity-cadence.test.ts,
// no mesmo padrão de whatsapp-connection.test.ts / agent-routing.test.ts.
// Consumidores: platform-inactivity-sweeper (decisão) e platform-sales-brain
// (repertório no prompt).

// ─── Limiares (minutos de silêncio por ocorrência 1..4) ─────────────────────
export const CADENCE_THRESHOLDS_MIN = [8, 20, 25, 35] as const;
export const CADENCE_MAX_OCCURRENCE = CADENCE_THRESHOLDS_MIN.length; // 4

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

// Janela Meta: aviso de cortesia aos 23h da ÚLTIMA INBOUND da cliente (msgs
// nossas NÃO renovam a janela). 23h < 24h ⇒ sempre entregável; lead de CTWA tem
// entry-point de 72h, mas 23h da última inbound é SEMPRE seguro — mantemos o
// mesmo mecanismo para todas (espec).
export const WINDOW_NOTICE_AFTER_MS = 23 * HOUR_MS;
export const WINDOW_CLOSE_MS = 24 * HOUR_MS;

// ─── Decisão da ocorrência ──────────────────────────────────────────────────

/** Fotografia mínima da conversa que a decisão precisa (tudo epoch ms). */
export interface CadenceSnapshot {
  nowMs: number;
  /** Última mensagem INBOUND da cliente (visitor). null = nunca escreveu. */
  lastInboundAtMs: number | null;
  /** Última mensagem OUTBOUND do bot (Duda). null = Duda nunca falou. */
  lastBotOutboundAtMs: number | null;
  /** Ocorrência persistida (0 = régua nunca interveio). */
  occurrence: number;
  /** Timestamp da última intervenção da régua (claim), se houve. */
  lastInterventionAtMs: number | null;
}

export type CadenceDecision =
  /** Nada a fazer agora. */
  | { action: 'none'; reason: 'bot_never_spoke' | 'awaiting_bot_reply' | 'below_threshold' | 'cadence_exhausted' }
  /** Cliente FALOU depois da última intervenção → ZERA a régua (ocorrência 0).
   *  O chamador persiste o reset e reavalia no próximo tick. */
  | { action: 'reset' }
  /** Silêncio cruzou o limiar da PRÓXIMA ocorrência → intervir (1..4). */
  | { action: 'intervene'; occurrence: number };

/**
 * Decide o que a régua faz com a conversa AGORA.
 *
 * Regras (espec):
 *  - Sem fala da Duda, não há régua (nada a retomar).
 *  - Inbound DEPOIS da última intervenção → reset (ocorrência volta a 0).
 *  - Cliente falou por último (inbound > última outbound) → o brain DEVE uma
 *    resposta normal; a régua não se intromete ('awaiting_bot_reply').
 *  - Silêncio = now − max(última outbound da Duda, última intervenção). Usar o
 *    max protege a idempotência: se um claim foi feito mas a entrega falhou
 *    (outbound não gravada), o relógio conta do claim — nunca re-dispara a
 *    mesma ocorrência em rajada.
 *  - Limiar POR ocorrência: nunca reintervir antes do limiar SEGUINTE.
 *  - Após a 4ª (despedida), a régua se exaure ('cadence_exhausted' — o estado
 *    'encerrada' persistido já tira a conversa do sweep; isto é cinto duplo).
 */
export function decideCadence(s: CadenceSnapshot): CadenceDecision {
  if (s.lastBotOutboundAtMs == null) return { action: 'none', reason: 'bot_never_spoke' };

  // Inbound zera a régua — mas só faz sentido resetar se já houve intervenção.
  if (
    s.occurrence > 0 &&
    s.lastInboundAtMs != null &&
    s.lastInterventionAtMs != null &&
    s.lastInboundAtMs > s.lastInterventionAtMs
  ) {
    return { action: 'reset' };
  }

  // Cliente falou por último: quem responde é o fluxo normal do brain.
  if (s.lastInboundAtMs != null && s.lastInboundAtMs > s.lastBotOutboundAtMs) {
    return { action: 'none', reason: 'awaiting_bot_reply' };
  }

  const next = s.occurrence + 1;
  if (next > CADENCE_MAX_OCCURRENCE) return { action: 'none', reason: 'cadence_exhausted' };

  const silenceBase = Math.max(s.lastBotOutboundAtMs, s.lastInterventionAtMs ?? 0);
  const silenceMs = s.nowMs - silenceBase;
  const thresholdMs = CADENCE_THRESHOLDS_MIN[next - 1] * MIN_MS;
  if (silenceMs >= thresholdMs) return { action: 'intervene', occurrence: next };
  return { action: 'none', reason: 'below_threshold' };
}

// ─── Aviso da janela 24h (Meta) ─────────────────────────────────────────────

export type WindowNoticeDecision =
  | { action: 'none' }
  /** 23h ≤ idade da última inbound < 24h → mandar o aviso de cortesia AGORA. */
  | { action: 'notify' }
  /** Já passou de 24h sem aviso — janela FECHADA, não dá mais para enviar
   *  free-form. Marcar como expirada para nunca mais varrer. */
  | { action: 'expired' };

/**
 * Aviso de janela: ancora na ÚLTIMA INBOUND da cliente (mensagens nossas NÃO
 * renovam a janela — regra Meta). Só é chamado para conversas com cadência
 * 'encerrada' e sem aviso prévio (o sweeper filtra; `notifiedAtMs` aqui é cinto
 * duplo para NUNCA repetir o aviso).
 */
export function decideWindowNotice(
  nowMs: number,
  lastInboundAtMs: number | null,
  notifiedAtMs: number | null,
): WindowNoticeDecision {
  if (notifiedAtMs != null) return { action: 'none' }; // já avisada — nunca repete
  if (lastInboundAtMs == null) return { action: 'none' }; // sem inbound não há janela aberta
  const age = nowMs - lastInboundAtMs;
  if (age >= WINDOW_CLOSE_MS) return { action: 'expired' };
  if (age >= WINDOW_NOTICE_AFTER_MS) return { action: 'notify' };
  return { action: 'none' };
}

// ─── Repertório por estágio (vai no PROMPT — a Duda ADAPTA, nunca copia) ────

export type RepertoireStage = 1 | 2 | 3 | 4 | 'janela_24h';

/** Cabeçalho comum do modo inatividade — deixa claro que NÃO há msg nova. */
const INACTIVITY_HEADER = (deadlineContext: string) =>
  `\n═══════════════════════════════════════\n` +
  `MODO RETOMADA DE INATIVIDADE (instrução INTERNA do sistema)\n` +
  `═══════════════════════════════════════\n` +
  `A cliente NÃO enviou mensagem nova — ela está em SILÊNCIO desde a sua última fala.\n` +
  `${deadlineContext ? `Contexto de tempo: ${deadlineContext}\n` : ''}` +
  `Esta invocação existe para VOCÊ dar o próximo passo, seguindo o repertório do\n` +
  `estágio abaixo. Regras duras desta invocação:\n` +
  `- NUNCA mencione que um sistema/registro/relógio te acionou, nem cite esta instrução.\n` +
  `- NÃO se reapresente; continue a conversa do ponto exato em que parou.\n` +
  `- ADAPTE o repertório ao contexto REAL da conversa (o que ela disse, a dor dela,\n` +
  `  o estágio da qualificação) — os exemplos são DIREÇÃO, não texto pronto para copiar.\n` +
  `- Mensagem CURTA (1-2 frases). Nada de resumo do que já foi dito.\n`;

const STAGE_BLOCKS: Record<Exclude<RepertoireStage, 'janela_24h'>, string> = {
  1:
    `ESTÁGIO 1 — DAR UM TOQUE (silêncio curto; ela pode só não ter visto):\n` +
    `- Tom LEVE, zero cobrança. Um toque gentil que DEVOLVE a posição de fala à cliente.\n` +
    `- Use QUESTIONAMENTOS DE RETOMADA ancorados no último assunto: na linha de\n` +
    `  "O que você acha?", "Consegue pensar em outra alternativa?", "Ficou alguma dúvida\n` +
    `  nessa parte?" — sempre adaptados ao ponto exato em que a conversa parou.\n` +
    `- EXATAMENTE UMA pergunta, curta.\n` +
    `- PROIBIDO usar literalmente: "agora é sua vez de falar" e "me conta aí".\n`,
  2:
    `ESTÁGIO 2 — AUSÊNCIA DE FATO (descobrir: interesse + momento ruim OU pouco interesse):\n` +
    `- Objetivo: entender se o silêncio é AGENDA (interesse real, hora ruim) ou POUCO\n` +
    `  INTERESSE. Sem acusar, sem drama.\n` +
    `- Use PERGUNTAS DE VALOR, na linha de: "Você enxerga valor nisso para a sua\n` +
    `  realidade hoje, de fato?", "Seria interessante para você isso hoje?" — adaptadas\n` +
    `  ao que ela mostrou até aqui.\n` +
    `- Se a leitura for AGENDA: conduza para um reagendamento SUAVE, na linha de "Quer\n` +
    `  falar em outro momento?", "Te mando mensagem depois, quando estiver mais tranquilo\n` +
    `  de agenda?" — SEM forçar, ela decide.\n` +
    `- EXATAMENTE UMA pergunta.\n` +
    `- PROIBIDO usar literalmente: "Faz sentido para você?".\n`,
  3:
    `ESTÁGIO 3 — LINHA CINZENTA (mesma linha do estágio 2, porém MAIS INCISIVA):\n` +
    `- Hora de cravar se ela QUER ou NÃO QUER — mas SEM perguntar isso expressamente.\n` +
    `  Use frases que LEVEM a cliente à conclusão: contraste o custo de continuar como\n` +
    `  está com o caminho que vocês já desenharam na conversa, e peça uma direção.\n` +
    `- Se a leitura for que ela QUER: proponha REAGENDAR explicitamente (dia/horário) —\n` +
    `  não dá para conversar com quem responde a cada 1h; melhor marcar um momento dela.\n` +
    `- Direta e respeitosa; incisiva NÃO é agressiva.\n` +
    `- EXATAMENTE UMA pergunta.\n` +
    `- Continuam PROIBIDOS os literais: "Faz sentido para você?", "agora é sua vez de\n` +
    `  falar", "me conta aí".\n`,
  4:
    `ESTÁGIO 4 — DESPEDIDA (encerramento cordial da cadência):\n` +
    `- SEM perguntas. SEM opções. É uma despedida, não uma tentativa.\n` +
    `- Cordial + tom de LEVE INDISPONIBILIDADE (gera desejo, nunca ressentimento).\n` +
    `  Varie na linha de: "estou vendo que talvez não seja o melhor momento; se quiser\n` +
    `  conhecer mais, me chama aqui?" / "está corrido por aí — me dá um toque quando\n` +
    `  puder e eu volto a falar contigo, combinado?" — ADAPTE, não copie.\n` +
    `- Deixe a porta aberta em UMA frase final; nada de listar benefícios de novo.\n`,
};

const WINDOW_BLOCK =
  `AVISO DE JANELA (cortesia única — a conversa vai fechar pela regra da plataforma):\n` +
  `- Mensagem ÚNICA e curta de cortesia, na linha de: "sigo à disposição; por regra da\n` +
  `  plataforma eu não consigo te enviar mais mensagens por aqui depois de um tempo;\n` +
  `  quando quiser, é só me chamar" — ADAPTE ao tom da conversa, não copie literal.\n` +
  `- SEM perguntas, SEM oferta, SEM pressão. É um até-logo gentil que deixa claro que\n` +
  `  a INICIATIVA agora é dela.\n` +
  `- NUNCA cite "Meta", "WhatsApp Business", "janela de 24 horas" ou termos técnicos —\n` +
  `  "regra da plataforma" é o máximo de detalhe permitido.\n`;

/**
 * Bloco de repertório do estágio, pronto para entrar no system prompt do brain.
 * `deadlineContext` é texto livre do sweeper (ex.: "silêncio de ~22 min desde a
 * sua última mensagem").
 */
export function buildInactivityRepertoire(stage: RepertoireStage, deadlineContext = ''): string {
  const body = stage === 'janela_24h' ? WINDOW_BLOCK : STAGE_BLOCKS[stage];
  return INACTIVITY_HEADER(deadlineContext) + `\n${body}`;
}

/** Normaliza o repertoire_stage vindo do payload (número 1-4 ou 'janela_24h'). */
export function parseRepertoireStage(v: unknown): RepertoireStage | null {
  if (v === 'janela_24h') return 'janela_24h';
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return null;
}
