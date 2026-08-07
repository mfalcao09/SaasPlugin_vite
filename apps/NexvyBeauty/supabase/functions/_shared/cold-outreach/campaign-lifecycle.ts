// _shared/cold-outreach/campaign-lifecycle.ts
//
// CICLO DE VIDA DA CAMPANHA — núcleo PURO (sem banco/rede).
//
//   deno test --no-check supabase/functions/_shared/cold-outreach/campaign-lifecycle.test.ts
//
// ── O DEFEITO QUE ESTE MÓDULO EXISTE PARA CORRIGIR ──────────────────────────
//
// O motor tratava `status` como binário: a query trazia `active|warming` e o
// portão recebia `campaignPaused: status === "paused"` — comparação que NUNCA
// podia ser verdadeira, porque a query já havia removido `paused`. A máquina de
// seis estados declarada no CHECK do banco (draft|warming|active|paused|killed|
// completed) era achatada num booleano morto.
//
// Consequência medida em 2026-08-07: a campanha `TESTE Gate G` estava `active`
// com `dry_run=false`, janela 0h-24h todos os dias e jitter 1-3s. Bastava um lead
// entrar na fila para o cron (`* * * * *`) disparar em menos de um minuto. Ela
// virou `active` por um UPDATE — não houve ato de autorização, porque não existia
// lugar onde registrar um.
//
// ── A INVERSÃO ──────────────────────────────────────────────────────────────
//
// Antes: dispara-se na AUSÊNCIA DE IMPEDIMENTO ("está active, logo pode").
// Agora: dispara-se apenas mediante ATO REGISTRADO (`activated_at`).
//
// `status='active'` sem `activated_at` NÃO dispara. É isso que impede que salvar
// a configuração — ou um UPDATE direto no banco — arme o gatilho. Estado é
// intenção declarada; carimbo é a autorização que a torna executável.
//
// ── POR QUE NÃO EXISTE UM ESTADO `scheduled` ────────────────────────────────
//
// Porque agendamento não é estado, é VIGÊNCIA — eixo ortogonal ao estado. O Meta
// Ads funciona assim: um anúncio ACTIVE com `start_time` no futuro não roda, e
// não há estado SCHEDULED. Modelar como estado exigiria uma transição extra
// (`scheduled → active`) que alguém teria de executar — exatamente o tipo de
// passo implícito que produziu o defeito acima.
//
// Logo, "agendar para o dia X às Y" é: carimbar `activated_at` (eu autorizo) e
// gravar `scheduled_start_at = X às Y` (a partir de quando vale). O operador
// autoriza UMA vez; o relógio decide quando tem efeito.

/** Os seis estados do CHECK de `platform_crm_cold_campaigns.status`. */
export type CampaignStatus =
  | "draft"
  | "warming"
  | "active"
  | "paused"
  | "killed"
  | "completed";

/**
 * Estados a partir dos quais um disparo é CONCEBÍVEL. Não é permissão — é apenas
 * a porta de entrada. `warming` está aqui porque é `active` com teto menor: o
 * ramp real é computado por `first_send_at`, não por este campo.
 */
const ESTADOS_DISPARAVEIS: ReadonlySet<string> = new Set(["active", "warming"]);

/**
 * Estados TERMINAIS: não voltam sozinhos e não devem receber tick.
 * `killed` é terminal por decisão: o anti-ban não se auto-reverte. Reativar exige
 * um humano ler o motivo e carimbar de novo (ver `limparAutorizacaoAoMatar`).
 */
const ESTADOS_TERMINAIS: ReadonlySet<string> = new Set(["killed", "completed"]);

export interface CampanhaLifecycle {
  status: string;
  /** Carimbo do ato de autorização. `null` = ninguém autorizou = não dispara. */
  activatedAt: Date | null;
  /** Início da vigência. `null` = vale desde já. */
  scheduledStartAt: Date | null;
  /** Fim da vigência. `null` = sem prazo. */
  scheduledEndAt: Date | null;
}

export interface LifecycleVerdict {
  /** A campanha está ARMADA e vigente agora? Só `true` libera qualquer envio. */
  armada: boolean;
  /** Motivo estável, para log e para o console de operação. */
  motivo: string | null;
  /**
   * Transição que o motor DEVE persistir ao ver este veredito. Hoje só
   * `completed` (vigência vencida). `null` = nada a persistir.
   */
  transicao: "completed" | null;
}

/**
 * Decide se a campanha está armada AGORA.
 *
 * Ordem deliberada — do mais forte para o mais fraco, para que o motivo relatado
 * seja sempre a razão MAIS FUNDAMENTAL, e não a primeira que casou:
 *
 *   1. terminal        — killed/completed vencem qualquer carimbo
 *   2. não-disparável  — draft/paused: intenção declarada de não disparar
 *   3. sem autorização — o coração da correção
 *   4. vigência        — ainda não começou / já venceu
 *
 * Um `status` desconhecido (fora dos seis) NÃO dispara: fail-safe. Se alguém
 * ampliar o CHECK sem passar por aqui, o efeito é a campanha parar, não vazar.
 */
export function avaliarLifecycle(c: CampanhaLifecycle, now: Date): LifecycleVerdict {
  const negar = (motivo: string, transicao: "completed" | null = null): LifecycleVerdict => ({
    armada: false,
    motivo,
    transicao,
  });

  if (ESTADOS_TERMINAIS.has(c.status)) return negar(`estado_terminal:${c.status}`);
  if (!ESTADOS_DISPARAVEIS.has(c.status)) return negar(`estado_nao_disparavel:${c.status}`);

  // ⚠️ O CORAÇÃO DA CORREÇÃO. Estar `active` não é permissão — é intenção. Sem
  // carimbo não há ato, e sem ato não há disparo. Um UPDATE direto no banco (que
  // foi como a campanha TESTE virou active) morre exatamente aqui.
  if (!c.activatedAt) return negar("nao_autorizada");

  // Carimbo no futuro é dado corrompido — relógio errado ou escrita indevida.
  // Não dispara: na dúvida sobre a origem da autorização, não se autoriza.
  if (c.activatedAt.getTime() > now.getTime()) return negar("autorizacao_no_futuro");

  // Vigência. `>` e não `>=`: no instante EXATO do agendamento a campanha já
  // vale — quem marcou 09:00 espera que 09:00:00 conte.
  if (c.scheduledStartAt && c.scheduledStartAt.getTime() > now.getTime()) {
    return negar("aguardando_agendamento");
  }
  // Fim da vigência é EXCLUSIVO: às 18:00 de um agendamento que termina 18:00 já
  // acabou. Mesma convenção de `withinWindow` (hour < endHour) — duas regras de
  // horário no mesmo motor com convenções opostas seriam armadilha garantida.
  if (c.scheduledEndAt && c.scheduledEndAt.getTime() <= now.getTime()) {
    return negar("vigencia_encerrada", "completed");
  }

  return { armada: true, motivo: null, transicao: null };
}

/**
 * Campos a gravar ao MATAR uma campanha (kill-switch ou ato humano).
 *
 * Limpar `activated_at` é o que torna `killed` realmente terminal: mesmo que
 * alguém devolva o status para `active`, a campanha continua desarmada até que um
 * humano carimbe de novo. Sem isso, "reativar" seria um UPDATE de uma palavra — e
 * o kill-switch viraria um aviso, não um freio.
 */
export function limparAutorizacaoAoMatar(motivo: string, agora: Date) {
  return {
    status: "killed" as const,
    paused_reason: motivo,
    activated_at: null,
    activated_by: null,
    updated_at: agora.toISOString(),
  };
}

/** Converte um valor vindo do banco (string ISO | null | undefined) em Date | null. */
export function paraData(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Lê a linha crua de `platform_crm_cold_campaigns` como entrada do ciclo de vida. */
export function lifecycleDaLinha(c: Record<string, unknown>): CampanhaLifecycle {
  return {
    status: String(c.status ?? ""),
    activatedAt: paraData(c.activated_at),
    scheduledStartAt: paraData(c.scheduled_start_at),
    scheduledEndAt: paraData(c.scheduled_end_at),
  };
}
