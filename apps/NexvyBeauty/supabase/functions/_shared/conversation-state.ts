// _shared/conversation-state.ts — PR-A do PRD-CONVERSATION-STATE-2026-08-06.
//
// MEMÓRIA DE CURTO PRAZO da conversa, mantida FORA do modelo. O cérebro re-deriva
// "o que já fiz aqui" do histórico bruto a cada turno, e erra sob pressão. Este
// módulo guarda os fatos e devolve (a) fatos para injetar no prompt e (b) bloqueios
// para aplicar na saída.
//
// PURO: zero IO, zero Deno.env, zero supabase. Quem persiste é o chamador.
//   deno test --no-check supabase/functions/_shared/conversation-state.test.ts
//
// ── A LEI DOS TIERS (revisão da sessão Controladora GO-LIVE) ─────────────────
// TIER 1  ato do CÓDIGO (zero inferência)   → não falha  → pode virar FATO
// TIER 2  tag explícita do modelo           → SUBCONTA   → fato com controle negativo
// TIER 3  regex sobre prosa                 → MENTE      → PROIBIDO virar fato
//
// Cicatriz que fundamenta: o sanitizeReply da Duda fazia substituição cega sobre a
// saída do modelo e DESTRUÍA 100% das negações — o padrão casa dentro da frase
// negada. Um reducer ingênuo marcaria "ofereceu demo" em "NÃO vou ficar te
// oferecendo demonstração", que é a frase em que a lead RECLAMOU da oferta.
//
// REGRA DE OURO: campo em dúvida OMITE, nunca assume default.
//   estado ausente → o modelo improvisa (ruim)
//   estado errado  → o modelo obedece com convicção (pior)

// ─── Formato persistido (platform_crm_conversations.conversation_state) ──────

export interface ConversationState {
  /** TIER 1 — existe outbound nesta conversa. Mata a reapresentação. */
  apresentou?: boolean;
  /** TIER 1 — marcado no gate que INTERCEPTA a URL; o código sabe que enviou. */
  link_enviado?: boolean;
  /** TIER 1 — busca literal do nome nas próprias bolhas. O nome nós conhecemos. */
  nome_ultimo_uso_seq?: number;
  /** TIER 2 — tag do modelo. Subcontar reoferta 1× a mais; nunca mente. */
  demo_ofertas?: number;
  /** TIER 2 — recusa vem de classifyReply sobre a msg DELA (não sobre a nossa). */
  demo_recusas?: number;
  /** TIER 2 — tags de objeção já tratadas; evita re-reconhecer a mesma 3×. */
  objecoes_vistas?: string[];
  /** Marca d'água: maior `seq` já reduzido. Base da trava otimista. */
  atualizado_seq?: number;
}

/** Eventos do turno — TODOS derivados de ato do código ou tag explícita. */
export interface TurnEvents {
  /** seq da última mensagem coberta por esta redução. */
  seq: number;
  /** TIER 1: houve bolha outbound entregue neste turno. */
  enviouOutbound?: boolean;
  /** TIER 1: o gate de link deixou uma URL passar (quem chama SABE, não infere). */
  enviouLink?: boolean;
  /** TIER 1: o nome apareceu nas bolhas ENTREGUES (busca literal do chamador). */
  usouNome?: boolean;
  /** TIER 2: o modelo emitiu a tag de oferta de demonstração. */
  tagOfertaDemo?: boolean;
  /** TIER 2: veredito de classifyReply sobre a mensagem DA LEAD. */
  leadRecusou?: boolean;
  /** TIER 2: tags de objeção emitidas pelo modelo neste turno. */
  tagsObjecao?: string[];
}

// ─── Estágio: FUNÇÃO PURA, nunca campo armazenado ────────────────────────────
// Se deriva, não diverge. Armazenar estágio criaria uma segunda verdade capaz de
// contradizer os fatos — e o estágio escolhe QUAL fatia de prompt carrega, então
// é o campo de maior raio de explosão (crítica da Controladora, aceita).

export type Estagio = 'abertura' | 'duvidas' | 'fechamento';

export function derivarEstagio(s: ConversationState | null | undefined): Estagio {
  if (!s?.apresentou) return 'abertura';
  if (s.link_enviado || (s.demo_ofertas ?? 0) > 0) return 'fechamento';
  return 'duvidas';
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

/** Estado vazio: TUDO omitido. Nenhum default vira "fato" por acidente. */
export function estadoVazio(): ConversationState {
  return {};
}

/**
 * Aplica os eventos do turno ao estado. IDEMPOTENTE por `seq`: reduzir o mesmo
 * turno duas vezes (re-entrega, retry do hand-back) não conta duas vezes.
 * Nunca inventa campo: o que não veio em `ev` fica como estava.
 */
export function reduzir(
  atual: ConversationState | null | undefined,
  ev: TurnEvents,
): ConversationState {
  const s: ConversationState = { ...(atual ?? {}) };

  // Guarda de idempotência. `<=` e não `<`: o mesmo seq já foi contabilizado.
  if (typeof s.atualizado_seq === 'number' && ev.seq <= s.atualizado_seq) return s;

  if (ev.enviouOutbound) s.apresentou = true;
  if (ev.enviouLink) s.link_enviado = true;
  if (ev.usouNome) s.nome_ultimo_uso_seq = ev.seq;
  if (ev.tagOfertaDemo) s.demo_ofertas = (s.demo_ofertas ?? 0) + 1;
  if (ev.leadRecusou) s.demo_recusas = (s.demo_recusas ?? 0) + 1;

  if (ev.tagsObjecao?.length) {
    const vistas = new Set(s.objecoes_vistas ?? []);
    for (const t of ev.tagsObjecao) {
      const k = String(t ?? '').trim().toLowerCase();
      if (k) vistas.add(k);
    }
    s.objecoes_vistas = Array.from(vistas);
  }

  s.atualizado_seq = ev.seq;
  return s;
}

// ─── Política: o que o estado AUTORIZA e o que ele PROÍBE ────────────────────

export interface Politica {
  /** Frases-fato para injetar no prompt DEPOIS da persona (recência vence). */
  fatos: string[];
  /** Bloqueios que o chamador aplica sobre as bolhas prontas. */
  proibirOfertaDemo: boolean;
  proibirLink: boolean;
  proibirNome: boolean;
  proibirReapresentar: boolean;
}

export interface PoliticaOpts {
  /** Aceite explícito na ÚLTIMA mensagem da lead (decidido pelo chamador). */
  leadAceitouAgora?: boolean;
  /** seq atual — mede a distância desde o último uso do nome. */
  seqAtual?: number;
  /** Janela de racionamento do nome, em mensagens. */
  janelaNome?: number;
}

/**
 * Traduz estado em autorizações. FUNÇÃO PURA e ÚNICO lugar onde a política vive
 * — os gates que hoje estão espalhados no brain (PR-12, PR-14) são ABSORVIDOS
 * por ela no PR-B, em vez de somados a ela.
 */
export function politica(
  s: ConversationState | null | undefined,
  opts: PoliticaOpts = {},
): Politica {
  const st = s ?? {};
  const fatos: string[] = [];

  // DEMO — defeito nº2 medido: reofertou DEPOIS de "tá chato". Uma recusa basta
  // para travar; só o pedido explícito DELA reabre.
  const recusou = (st.demo_recusas ?? 0) > 0;
  const proibirOfertaDemo = recusou && !opts.leadAceitouAgora;
  if (proibirOfertaDemo) {
    fatos.push(
      'FATO DESTE TURNO: você já ofereceu a demonstração e ela NÃO aceitou. ' +
        'PROIBIDO oferecer de novo — responda o que ela disse e pare. Só volte a oferecer se ELA pedir.',
    );
  }

  // LINK — só com aceite explícito. Sem aceite, a oferta sobrevive, a URL morre.
  const proibirLink = !opts.leadAceitouAgora;

  // NOME — racionamento por distância de seq (absorve o lookback do PR-14).
  const janela = opts.janelaNome ?? 8;
  const proibirNome = typeof st.nome_ultimo_uso_seq === 'number' &&
    typeof opts.seqAtual === 'number' &&
    opts.seqAtual - st.nome_ultimo_uso_seq < janela;
  if (proibirNome) {
    fatos.push(
      'FATO DESTE TURNO: você já usou o nome dela há poucas mensagens. ' +
        'PROIBIDO usar o nome nesta resposta — nenhuma vez.',
    );
  }

  // REAPRESENTAÇÃO — o estado prova que já falou; não recomeça.
  const proibirReapresentar = st.apresentou === true;
  if (proibirReapresentar) {
    fatos.push(
      'FATO DESTE TURNO: você já se apresentou nesta conversa. ' +
        'PROIBIDO se apresentar de novo ou repetir de onde veio o contato — retome do ponto onde parou.',
    );
  }

  // OBJEÇÕES — evita re-reconhecer a mesma objeção a cada lote abortado.
  if (st.objecoes_vistas?.length) {
    fatos.push(
      `FATO DESTE TURNO: você já reconheceu ${st.objecoes_vistas.join(', ')} nesta conversa. ` +
        'NÃO repita o reconhecimento — avance para o mecanismo concreto.',
    );
  }

  return { fatos, proibirOfertaDemo, proibirLink, proibirNome, proibirReapresentar };
}

// ─── Trava otimista (achado de lost update, revisão da Controladora) ─────────
// Três hand-backs concorrentes fazem read-modify-write no MESMO JSONB. Checar
// `atualizado_seq` na leitura é GUARDA, não LOCK — o lote 2 e o 3 leem v1, os dois
// gravam, e `demo_ofertas` fica 1 quando foram 3. O estado passaria a MENTIR
// exatamente na conversa em que ele mais importa: lead engajada falando rápido.
//
// O padrão que resolve já existe e está provado no brain_claim (brain:1449-1452):
// UPDATE condicional com RETURNING serializa sob READ COMMITTED — o Postgres
// reavalia o WHERE na versão nova e só UMA transação leva a linha.
//
// Esta função devolve o PREDICADO; quem executa é o chamador (mantém a pureza):
//   .update({ conversation_state: novo })
//   .eq('id', conversationId)
//   .or(predicadoTravaOtimista(novo.atualizado_seq))
//   .select('conversation_state').maybeSingle()
// Devolveu linha → gravamos. Devolveu nada → alguém passou na frente: RELER e
// REDUZIR DE NOVO (nunca sobrescrever às cegas).

// ⚠️ `->` E NÃO `->>` — a diferença entre a trava funcionar e congelar o estado.
//
// A 1ª versão usava `->>`, que devolve TEXT: o Postgres passava a comparar
// '999' < '1002' caractere a caractere ('9' > '1' ⇒ FALSO). Medido no banco de
// PRODUÇÃO em 2026-08-06:
//     ('{"atualizado_seq":999}'::jsonb->>'atualizado_seq') < '1002'  →  false
//     (mesmo valor)::bigint                                 < 1002   →  true
// E não era defeito só da virada de milhar: '99' < '459' também é false, e
// max(seq) em produção já era 459 — ou seja, o bug era ATUAL, não futuro.
//
// Efeito: o UPDATE nunca casava; o fallback relia e tentava com o MESMO predicado
// quebrado; e o código logava "trava barrou, releu e reduziu de novo" — mensagem
// que AFIRMA uma recuperação que não houve. Estado congelado em silêncio.
//
// A trava tinha a FORMA inteira da garantia (UPDATE condicional + RETURNING +
// fallback) e não garantia nada. Achado da revisão adversarial pré-deploy.
//
// `->` devolve JSONB, e PostgREST compara número JSON numericamente.
export function predicadoTravaOtimista(seq: number): string {
  // Formato PostgREST `.or()`: nulo (primeira escrita) OU marca d'água menor.
  return `conversation_state->atualizado_seq.is.null,conversation_state->atualizado_seq.lt.${seq}`;
}
