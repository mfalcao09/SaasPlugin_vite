/**
 * Motor de roteiro da comanda multi-serviço (agendamento público /s/:slug).
 *
 * Lógica PURA (sem I/O) para ser testável: `comanda-roteiro.test.ts` roda os
 * cenários sem banco. A casca HTTP (`salao-availability`) só busca os dados e
 * chama daqui.
 *
 * Três coisas que o motor antigo (1 serviço, STEP=30 fixo) não fazia:
 *
 *  1. BACK-TO-BACK — o item seguinte começa no fim EXATO do anterior. Com grade
 *     rígida de 30min, "Barba 20min + Corte 50min" (70min reais) consumiria 90min
 *     de agenda e perderia opções de horário. O ZapCorte encaixa colado
 *     (14:00–14:40, 14:40–15:20) e é o comportamento correto.
 *  2. PAUSA — o intervalo do profissional (almoço) bloqueia como se fosse
 *     agendamento. Sem isso, comanda longa atravessa o almoço.
 *  3. FRACIONAMENTO — quando não existe bloco corrido para a soma das durações,
 *     mas existem janelas separadas no mesmo dia, devolve o roteiro picado em vez
 *     de "sem horários disponíveis" (que hoje perde a venda).
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Tudo em minutos desde 00:00 do dia, para não arrastar timezone pra dentro. */
export type ServicoComanda = {
  servico_id: string;
  nome: string;
  categoria: string | null;
  duracao_minutos: number;
};

export type Janela = { inicio: number; fim: number };

export type ProfissionalAgenda = {
  id: string;
  nome: string;
  especialidades: string[];
  inicio: number;
  fim: number;
  intervalo?: Janela | null;
  ocupados: Janela[];
};

export type ModoPreferencia = 'unico' | 'preferido' | 'auto';

export type ItemRoteiro = {
  servico_id: string;
  nome: string;
  profissional_id: string;
  profissional_nome: string;
  inicio: number;
  fim: number;
  execution_order: number;
};

export type Roteiro = {
  tipo: 'continuo' | 'sequencial' | 'fracionado';
  itens: ItemRoteiro[];
  inicio: number;
  fim: number;
  espera_minutos: number;
  profissionais_ids: string[];
};

export type MontarParams = {
  servicos: ServicoComanda[];
  profissionais: ProfissionalAgenda[];
  modo: ModoPreferencia;
  profissional_preferido_id?: string | null;
  /** Minuto do dia abaixo do qual não se oferece nada (agora, quando é hoje). */
  minimo?: number;
  passo?: number;
  max_espera_minutos?: number;
  max_roteiros?: number;
};

const PASSO_PADRAO = 30;
const MAX_ESPERA_PADRAO = 180;
const MAX_ROTEIROS_PADRAO = 12;

// ─── Precedência técnica ─────────────────────────────────────────────────────

const FASE_QUIMICA = 10;
const FASE_TRATAMENTO = 20;
const FASE_CORTE = 30;
const FASE_FINALIZACAO = 40;
/** Unhas, sobrancelha, depilação etc. não pertencem ao circuito capilar: vão depois. */
const FASE_INDEPENDENTE = 60;

const PALAVRAS: Array<[number, string[]]> = [
  [FASE_QUIMICA, ['coloracao', 'colorir', 'tintura', 'tonalizante', 'descoloracao', 'descolorir',
    'luzes', 'mechas', 'balayage', 'progressiva', 'alisamento', 'relaxamento', 'permanente',
    'quimica', 'platinado', 'matiz', 'retoque de raiz']],
  [FASE_TRATAMENTO, ['hidratacao', 'reconstrucao', 'nutricao', 'cauterizacao', 'botox',
    'selagem', 'tratamento', 'lavagem', 'cronograma']],
  [FASE_CORTE, ['corte', 'franja', 'repicad', 'pontas']],
  [FASE_FINALIZACAO, ['escova', 'chapinha', 'prancha', 'babyliss', 'penteado', 'finalizacao',
    'modelagem', 'secagem']],
];

export function normalizar(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Peso da fase de execução. Combo que cita duas fases ("corte + escova") assume a
 * MAIS CEDO que ele participa — assim ele ainda cai depois da química, que é o que
 * importa fisicamente (tinta antes de finalizar).
 */
export function faseDoServico(servico: ServicoComanda): number {
  const alvo = `${normalizar(servico.nome)} ${normalizar(servico.categoria ?? '')}`;
  let fase = FASE_INDEPENDENTE;
  for (const [peso, termos] of PALAVRAS) {
    if (termos.some((t) => alvo.includes(t))) fase = Math.min(fase, peso);
  }
  return fase;
}

/** Ordena pela ordem física do salão; empate mantém a ordem em que o cliente adicionou. */
export function ordenarPorPrecedencia(servicos: ServicoComanda[]): ServicoComanda[] {
  return servicos
    .map((s, i) => ({ s, i, f: faseDoServico(s) }))
    .sort((a, b) => (a.f - b.f) || (a.i - b.i))
    .map((x) => x.s);
}

// ─── Compatibilidade profissional × serviço ──────────────────────────────────

/**
 * `especialidades` é texto livre preenchido pelo salão — casa contra nome OU
 * categoria do serviço, dos dois lados (uma contém a outra). Lista vazia = faz tudo.
 */
export function podeExecutar(prof: ProfissionalAgenda, servico: ServicoComanda): boolean {
  const esp = (prof.especialidades ?? []).map(normalizar).filter(Boolean);
  if (esp.length === 0) return true;
  const alvos = [normalizar(servico.nome), normalizar(servico.categoria ?? '')].filter(Boolean);
  return esp.some((e) => alvos.some((a) => a === e || a.includes(e) || e.includes(a)));
}

/**
 * Fail-open deliberado: se NINGUÉM está marcado como apto a um serviço, o salão
 * preencheu especialidades pela metade. Travar a venda seria pior que alocar um
 * profissional que o cliente depois confirma na tela de revisão.
 */
function aptosPara(servico: ServicoComanda, profs: ProfissionalAgenda[]): ProfissionalAgenda[] {
  const aptos = profs.filter((p) => podeExecutar(p, servico));
  return aptos.length > 0 ? aptos : profs;
}

// ─── Disponibilidade ─────────────────────────────────────────────────────────

function bloqueios(prof: ProfissionalAgenda): Janela[] {
  const lista = [...(prof.ocupados ?? [])];
  if (prof.intervalo && prof.intervalo.fim > prof.intervalo.inicio) lista.push(prof.intervalo);
  return lista;
}

export function estaLivre(prof: ProfissionalAgenda, inicio: number, fim: number): boolean {
  if (inicio < prof.inicio || fim > prof.fim) return false;
  return !bloqueios(prof).some((b) => inicio < b.fim && b.inicio < fim);
}

/** Instantes em que vale a pena tentar: agora, fim de cada bloqueio, e a grade. */
function pontosDeTentativa(prof: ProfissionalAgenda, apartirDe: number, passo: number): number[] {
  const pts = new Set<number>([apartirDe]);
  for (const b of bloqueios(prof)) if (b.fim >= apartirDe) pts.add(b.fim);
  const base = Math.ceil(Math.max(apartirDe, prof.inicio) / passo) * passo;
  for (let t = base; t <= prof.fim; t += passo) pts.add(t);
  return [...pts].filter((t) => t >= apartirDe && t < prof.fim).sort((a, b) => a - b);
}

// ─── Alocação ────────────────────────────────────────────────────────────────

function candidatosPara(
  servico: ServicoComanda,
  profs: ProfissionalAgenda[],
  modo: ModoPreferencia,
  fixado: ProfissionalAgenda | null,
  preferidoId: string | null | undefined,
): ProfissionalAgenda[] {
  if (modo === 'unico' && fixado) return podeExecutar(fixado, servico) ? [fixado] : [];
  const aptos = aptosPara(servico, profs);
  if (modo === 'preferido' && preferidoId) {
    const pref = aptos.filter((p) => p.id === preferidoId);
    const resto = aptos.filter((p) => p.id !== preferidoId);
    return [...pref, ...resto];
  }
  return aptos;
}

/**
 * Encaixa os serviços em sequência a partir de `t0`. Back-to-back por construção:
 * o próximo item tenta começar exatamente no fim do anterior, e só escorrega
 * adiante (gerando espera) se não couber ali.
 */
function alocar(
  servicos: ServicoComanda[],
  profs: ProfissionalAgenda[],
  t0: number,
  modo: ModoPreferencia,
  fixado: ProfissionalAgenda | null,
  preferidoId: string | null | undefined,
  passo: number,
  maxEspera: number,
): Roteiro | null {
  const itens: ItemRoteiro[] = [];
  let cursor = t0;
  let espera = 0;

  for (let i = 0; i < servicos.length; i++) {
    const serv = servicos[i];
    const dur = Math.max(1, serv.duracao_minutos);
    const candidatos = candidatosPara(serv, profs, modo, fixado, preferidoId);
    if (candidatos.length === 0) return null;

    let melhor: { prof: ProfissionalAgenda; inicio: number } | null = null;
    for (const prof of candidatos) {
      for (const t of pontosDeTentativa(prof, cursor, passo)) {
        if (melhor && t >= melhor.inicio) break; // já temos algo mais cedo
        if (estaLivre(prof, t, t + dur)) {
          melhor = { prof, inicio: t };
          break;
        }
      }
      if (melhor && melhor.inicio === cursor) break; // colado: não dá pra melhorar
    }
    if (!melhor) return null;

    // Espera só conta ENTRE itens. O deslocamento até o PRIMEIRO item não é
    // espera do cliente — é só o candidato de início escorregando até a primeira
    // janela livre. Contá-lo inflava a espera (profissional ocupado até 14:40 com
    // candidato às 09:00 virava "340min de espera") e descartava roteiros bons.
    if (i > 0) {
      espera += melhor.inicio - cursor;
      if (espera > maxEspera) return null;
    }

    itens.push({
      servico_id: serv.servico_id,
      nome: serv.nome,
      profissional_id: melhor.prof.id,
      profissional_nome: melhor.prof.nome,
      inicio: melhor.inicio,
      fim: melhor.inicio + dur,
      execution_order: i + 1,
    });
    cursor = melhor.inicio + dur;
  }

  if (itens.length === 0) return null;
  const ids = [...new Set(itens.map((i) => i.profissional_id))];
  return {
    tipo: espera > 0 ? 'fracionado' : ids.length > 1 ? 'sequencial' : 'continuo',
    itens,
    inicio: itens[0].inicio,
    fim: itens[itens.length - 1].fim,
    espera_minutos: espera,
    profissionais_ids: ids,
  };
}

// ─── Entrada pública ─────────────────────────────────────────────────────────

/**
 * Roteiros candidatos do dia, melhores primeiro: sem espera antes de fracionado,
 * menos espera antes de mais espera, mais cedo antes de mais tarde.
 */
export function montarRoteiros(params: MontarParams): Roteiro[] {
  const {
    servicos, profissionais, modo,
    profissional_preferido_id = null,
    minimo = 0,
    passo = PASSO_PADRAO,
    max_espera_minutos = MAX_ESPERA_PADRAO,
    max_roteiros = MAX_ROTEIROS_PADRAO,
  } = params;

  if (!servicos?.length || !profissionais?.length) return [];

  const ordenados = ordenarPorPrecedencia(servicos);
  // Modo "tudo com a mesma pessoa": só quem cobre 100% da comanda entra na disputa.
  // Com preferido informado, é ELE ou ninguém — "tudo com a Camila" não pode cair
  // silenciosamente na Juliana.
  const fixaveis: Array<ProfissionalAgenda | null> = modo === 'unico'
    ? profissionais.filter((p) =>
      (!profissional_preferido_id || p.id === profissional_preferido_id) &&
      ordenados.every((s) => podeExecutar(p, s)))
    : [null];

  const achados = new Map<string, Roteiro>();

  for (const fixado of fixaveis) {
    const universo = fixado ? [fixado] : profissionais;
    const inicios = new Set<number>();
    for (const p of universo) for (const t of pontosDeTentativa(p, minimo, passo)) inicios.add(t);

    for (const t0 of [...inicios].sort((a, b) => a - b)) {
      const r = alocar(ordenados, profissionais, t0, modo, fixado, profissional_preferido_id, passo, max_espera_minutos);
      if (!r) continue;
      const chave = r.itens.map((i) => `${i.servico_id}@${i.inicio}#${i.profissional_id}`).join('|');
      if (!achados.has(chave)) achados.set(chave, r);
    }
  }

  return [...achados.values()]
    .sort((a, b) => (a.espera_minutos - b.espera_minutos) || (a.inicio - b.inicio))
    .slice(0, max_roteiros);
}

// ─── Utilitários de formato (usados pela edge fn e pela UI) ──────────────────

export function minutosParaHora(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function horaParaMinutos(hora: string): number {
  const [h, m] = String(hora).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
