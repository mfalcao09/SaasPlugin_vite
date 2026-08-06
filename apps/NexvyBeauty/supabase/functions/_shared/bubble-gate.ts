/**
 * GATE DE BOLHA — transforma `proibirNome` e `proibirReapresentar` em CÓDIGO.
 *
 * ── POR QUE ISTO EXISTE ────────────────────────────────────────────────────────
 * O PR-B produziu 4 flags de política. Só `proibirLink` virava gate (e só no canal
 * Evolution). As outras duas iam para `console.log` e para o prompt — e o eval da
 * Controladora mediu TRÊS VEZES que prompt não segura comportamento. Ou seja: os
 * defeitos nº2 (reapresentação, medido 25min depois do início) e nº3 (nome repetido
 * em bolhas seguidas) dependiam da camada que já sabíamos ser frágil.
 *
 * ── POR QUE NÃO ERA SÓ "APLICAR A FLAG" ────────────────────────────────────────
 * Aplicar por código parecia exigir censurar bolha já formada — o splice que o
 * commit 3e2aa3c matou (trocar substantivo por oração NO MEIO da frase produz
 * agramaticalidade, com ou sem guard). Foi por isso que adiei e declarei como
 * escolha deliberada.
 *
 * ── A DISTINÇÃO QUE DESTRAVA: BORDA TEM FRONTEIRA, MEIO NÃO ────────────────────
 * VOCATIVO tem fronteira sintática EXPLÍCITA — a vírgula:
 *     "Andreia, quer ver?"  →  "Quer ver?"          (gramatical)
 *     "Beleza, Andreia!"    →  "Beleza!"            (gramatical)
 * Isso é operação de BORDA. O splice era operação de MEIO, onde não há fronteira
 * nenhuma e o resultado é agramatical por construção.
 *
 * REAPRESENTAÇÃO nem precisa disso: a bolha que se reapresenta é redundante
 * INTEIRA, então ela CAI INTEIRA — o mesmo princípio do sanitizador ("ou sai
 * inteira, ou cai inteira"), agora na unidade BOLHA em vez de SENTENÇA.
 *
 * ── INVARIANTE QUE ESTE MÓDULO GARANTE ─────────────────────────────────────────
 * Toda bolha devolvida ou é BYTE-A-BYTE uma bolha de entrada, ou é uma bolha de
 * entrada com um VOCATIVO removido da borda. Nunca um enxerto. E o gate NUNCA
 * devolve lista vazia quando havia conteúdo: silêncio é pior que redundância.
 */

/**
 * Nome próprio → padrões de vocativo com FRONTEIRA sintática.
 *
 * Os três casos têm fronteira, e é isso que os torna seguros. Nome no MEIO sem
 * vírgula NÃO tem fronteira, e por isso é intocável (teste `NOME NO MEIO`).
 *   inicio         "Andreia, ..."          fronteira à direita
 *   fim            "..., Andreia!"         fronteira à esquerda
 *   entreVirgulas  "Olha, Andreia, isso"   fronteira dos DOIS lados
 *
 * `entreVirgulas` veio do cinto do PR-BDR-14 na consolidação. Sem ele, unificar
 * teria REMOVIDO cobertura que existia — regressão disfarçada de limpeza.
 */
function vocativoRe(nome: string): { inicio: RegExp; fim: RegExp; entreVirgulas: RegExp } {
  const n = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    inicio: new RegExp(`^\\s*(oi|olá|ola|e aí|e ai|opa)?[\\s,]*${n}\\s*[,!:–—-]\\s*`, 'i'),
    fim: new RegExp(`[\\s,]+${n}\\s*([!?.…]*)\\s*$`, 'i'),
    entreVirgulas: new RegExp(`,\\s*${n}\\s*([,!.?…])`, 'gi'),
  };
}

/** Frase de (re)apresentação: a agente dizendo QUEM É ou DE ONDE VEIO. */
const REAPRESENTACAO = new RegExp(
  [
    '\\b(sou|me chamo|aqui (é|e) a?)\\s+\\w+', // "sou a Camila", "me chamo X"
    '\\bfalo\\s+(da|do|de)\\b', // "falo da NexvyBeauty"
    '\\b(sou|trabalho)\\s+(da|do|de)\\s+\\w+', // "sou da NexvyBeauty"
    '\\bpeguei seu contato\\b', // origem do contato
    '\\bvi (seu|o) (perfil|instagram|insta)\\b',
  ].join('|'),
  'i',
);

export interface GateBolhaOpts {
  /** Da política: o nome já foi usado há poucas mensagens. */
  proibirNome: boolean;
  /** Da política: a agente já se apresentou nesta conversa. */
  proibirReapresentar: boolean;
  /** Primeiro nome da lead. Vazio/curto ⇒ regra de nome não se aplica. */
  primeiroNome?: string;
}

export interface GateBolhaResult {
  bubbles: string[];
  /** Quantos vocativos foram removidos da BORDA. */
  vocativosRemovidos: number;
  /** Quantas bolhas caíram INTEIRAS por reapresentação. */
  bolhasDerrubadas: number;
  /** true quando havia violação e o gate NÃO pôde agir sem calar a agente. */
  violacaoTolerada: boolean;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Aplica os bloqueios de nome e reapresentação sobre as bolhas JÁ FORMADAS.
 *
 * Ordem deliberada: derruba reapresentação ANTES de mexer em vocativo. Uma bolha
 * que vai cair inteira não merece edição — editar e depois descartar gastaria a
 * única operação de risco do módulo à toa.
 */
export function aplicarGateBolha(
  bubbles: string[],
  opts: GateBolhaOpts,
): GateBolhaResult {
  const nome = (opts.primeiroNome ?? '').trim();
  // Nome com menos de 3 letras vira regex perigosa demais (casa dentro de palavra).
  const nomeUtil = nome.length >= 3;

  let vocativosRemovidos = 0;
  let bolhasDerrubadas = 0;

  // ── 1) REAPRESENTAÇÃO: a bolha cai INTEIRA ────────────────────────────────
  let restantes = bubbles;
  if (opts.proibirReapresentar) {
    const filtradas = bubbles.filter((b) => !REAPRESENTACAO.test(b));
    // NUNCA calar a agente: se TODAS violam, a redundância é melhor que o silêncio.
    if (filtradas.length > 0 && filtradas.length < bubbles.length) {
      bolhasDerrubadas = bubbles.length - filtradas.length;
      restantes = filtradas;
    }
  }
  const toleradaReapresentacao = opts.proibirReapresentar &&
    bolhasDerrubadas === 0 &&
    bubbles.some((b) => REAPRESENTACAO.test(b));

  // ── 2) NOME: remove só o VOCATIVO, que é BORDA (fronteira = vírgula) ──────
  let saida = restantes;
  if (opts.proibirNome && nomeUtil) {
    const { inicio, fim, entreVirgulas } = vocativoRe(nome);
    saida = restantes.map((b) => {
      let t = b;
      // Entre vírgulas primeiro: é o caso do MEIO com fronteira dupla, e resolvê-lo
      // antes evita que a remoção de borda mude o texto e desalinhe este padrão.
      entreVirgulas.lastIndex = 0; // regex com /g guarda estado entre chamadas
      if (entreVirgulas.test(t)) {
        entreVirgulas.lastIndex = 0;
        t = t.replace(entreVirgulas, '$1');
        vocativosRemovidos++;
      }
      if (inicio.test(t)) {
        t = t.replace(inicio, '');
        // Maiúscula na nova primeira letra: "Andreia, quer ver?" → "Quer ver?"
        t = t.charAt(0).toUpperCase() + t.slice(1);
        vocativosRemovidos++;
      }
      if (fim.test(t)) {
        t = t.replace(fim, '$1');
        vocativosRemovidos++;
      }
      const limpo = t.trim();
      // Se a remoção esvaziou a bolha, ela não era vocativo: era a fala inteira.
      // Devolve a original — perder conteúdo é pior que repetir o nome.
      return limpo.length > 0 ? limpo : b;
    });
  }
  const toleradaNome = opts.proibirNome && nomeUtil &&
    vocativosRemovidos === 0 &&
    restantes.some((b) => new RegExp(`\\b${escapar(nome)}\\b`, 'i').test(b));

  return {
    bubbles: saida,
    vocativosRemovidos,
    bolhasDerrubadas,
    violacaoTolerada: toleradaReapresentacao || toleradaNome,
  };
}
