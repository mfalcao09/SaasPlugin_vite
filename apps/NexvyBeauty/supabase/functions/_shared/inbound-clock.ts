/**
 * PR-D do PRD-CONVERSATION-STATE-2026-08-06 — o RELÓGIO da inbound.
 *
 * Toda mensagem que chega tem DOIS tempos, e eles não são o mesmo:
 *
 *   relógio do MUNDO        `metadata.wa_timestamp` — quando a lead apertou enviar
 *                           (epoch em SEGUNDOS, string, persistido pelo webhook)
 *   relógio de VISIBILIDADE `created_at` — quando a linha ficou legível pra nós
 *
 * Eles divergem, e às vezes MUITO: o áudio transcrito nasce no banco ~12s depois do
 * próprio wa_timestamp, porque a transcrição roda antes do INSERT.
 *
 * O DEFEITO que este módulo existe pra matar (medido em produção 2026-08-06):
 * o debounce ancorava só em wa_timestamp. Para áudio transcrito, `ageMs` já nascia
 * ≥ DEBOUNCE_MS, então `DEBOUNCE_MS - ageMs` dava 0 — o debounce virava NO-OP e a
 * resposta saía instantânea, sem coalescer a rajada. Sem nenhum hand-back envolvido.
 *
 * O mais irônico: o próprio platform-sales-brain já sabia disso. O comentário da
 * marca d'água (index.ts:1513-1519) diz, com todas as letras, que wa_timestamp e
 * created_at "dizem quando a mensagem existiu NO MUNDO, não quando a linha ficou
 * VISÍVEL no banco" e que ordenar visibilidade por relógio do WhatsApp está "errado
 * por construção" — por isso a marca d'água usa `seq`. A marca d'água foi curada;
 * o debounce, 20 linhas acima, ficou com a doença.
 *
 * A REGRA: ancorar no MAIS RECENTE dos dois relógios.
 *   - linha que acabou de ficar visível NUNCA é tratada como velha (mata o defeito);
 *   - quando não há defasagem, wa_timestamp manda e o silêncio real da lead continua
 *     medido como antes (não muda o caminho feliz).
 *
 * NÃO usa `seq` de propósito: `seq` é ORDEM (bigint identity), não TEMPO. Serve pra
 * marca d'água, não pra calcular quantos milissegundos ainda faltam de espera.
 */

/** O mínimo que precisamos de uma linha de platform_crm_messages. */
export interface InboundLike {
  metadata?: unknown;
  created_at?: string | null;
}

/** Epoch(ms) do wa_timestamp da Meta, ou null se ausente/inválido. */
function waEpochMs(m: InboundLike): number | null {
  const meta = (m.metadata && typeof m.metadata === 'object')
    ? m.metadata as Record<string, unknown>
    : {};
  const ts = meta.wa_timestamp;
  // A Meta manda SEGUNDOS. O webhook persiste como string; aceita number por robustez.
  const secs = typeof ts === 'number' ? ts : (typeof ts === 'string' ? Number(ts) : NaN);
  return Number.isFinite(secs) && secs > 0 ? secs * 1000 : null;
}

/** Epoch(ms) do created_at (visibilidade no banco), ou null se ausente/inválido. */
function createdEpochMs(m: InboundLike): number | null {
  if (!m.created_at) return null;
  const ms = new Date(m.created_at).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Instante de referência da inbound, em epoch(ms) — o MAIS RECENTE entre o relógio
 * do mundo e o de visibilidade. Null quando nenhum dos dois é legível (o chamador
 * trata como idade infinita).
 *
 * Ancorar no máximo é deliberadamente CONSERVADOR: na dúvida, a mensagem é tratada
 * como mais NOVA, o que faz esperar MAIS. Errar pra espera é barato (a lead recebe
 * uma resposta coesa alguns segundos depois); errar pra pressa é o defeito que
 * estamos matando (três lotes atropelados em 24s).
 */
export function inboundEpochMs(m: InboundLike | null): number | null {
  if (!m) return null;
  const wa = waEpochMs(m);
  const created = createdEpochMs(m);
  if (wa == null) return created;
  if (created == null) return wa;
  return Math.max(wa, created);
}

/**
 * Quanto ainda falta esperar pra completar a janela de debounce.
 * Extraído junto porque a aritmética é METADE do defeito e merece teste próprio:
 * o sleep começa AGORA e dura o complemento, então acorda em
 * `referencia + janelaMs` — deadline ABSOLUTO. A janela não "encolhe" com o tempo
 * gasto em retry, fila ou entrega de bolhas; só o RESTO dela diminui. Confundir as
 * duas coisas produziu um diagnóstico errado antes deste módulo existir, e o teste
 * `deadline absoluto` abaixo existe pra impedir que alguém "conserte" isso de novo.
 */
export function debounceWaitMs(
  referenciaMs: number | null,
  agoraMs: number,
  janelaMs: number,
): number {
  if (janelaMs <= 0) return 0;
  if (referenciaMs == null) return 0; // sem relógio confiável ⇒ não segura a resposta
  const idadeMs = agoraMs - referenciaMs;
  return Math.max(0, Math.min(janelaMs, janelaMs - idadeMs));
}

/**
 * Debounce DESLIZANTE pra rajada.
 * Medido 2026-08-11: sleep unico nao estendia; rajada virava orfa.
 */
export function slidingDebounceExtraMs(opts: {
  newestRefMs: number | null;
  agoraMs: number;
  janelaMs: number;
  elapsedTotalMs: number;
  maxTotalMs: number;
  extensoesFeitas: number;
  maxExtensoes: number;
}): number {
  const {
    newestRefMs, agoraMs, janelaMs, elapsedTotalMs, maxTotalMs, extensoesFeitas, maxExtensoes,
  } = opts;
  if (janelaMs <= 0) return 0;
  if (extensoesFeitas >= maxExtensoes) return 0;
  if (elapsedTotalMs >= maxTotalMs) return 0;
  const resto = debounceWaitMs(newestRefMs, agoraMs, janelaMs);
  if (resto <= 0) return 0;
  return Math.min(resto, Math.max(0, maxTotalMs - elapsedTotalMs));
}
