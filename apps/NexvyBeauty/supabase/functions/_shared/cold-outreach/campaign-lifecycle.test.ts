// deno test — prova o ciclo de vida da campanha com DADOS SEMEADOS, sem banco.
//   deno test --no-check supabase/functions/_shared/cold-outreach/campaign-lifecycle.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  avaliarLifecycle,
  type CampanhaLifecycle,
  lifecycleDaLinha,
  limparAutorizacaoAoMatar,
  paraData,
} from "./campaign-lifecycle.ts";

const AGORA = new Date("2026-08-07T14:00:00Z");
const ONTEM = new Date("2026-08-06T14:00:00Z");
const AMANHA = new Date("2026-08-08T14:00:00Z");

/** Campanha ARMADA e vigente — a linha de base a partir da qual tudo é variação. */
const ARMADA: CampanhaLifecycle = {
  status: "active",
  activatedAt: ONTEM,
  scheduledStartAt: null,
  scheduledEndAt: null,
};

Deno.test("linha de base: active + carimbo + sem vigência = ARMADA", () => {
  const v = avaliarLifecycle(ARMADA, AGORA);
  assertEquals(v.armada, true);
  assertEquals(v.motivo, null);
  assertEquals(v.transicao, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// O CONTROLE NEGATIVO QUE IMPORTA
// ═══════════════════════════════════════════════════════════════════════════
Deno.test("CONTROLE NEGATIVO — active SEM carimbo NÃO dispara, fila cheia ou não", () => {
  // Esta é a configuração EXATA da campanha `TESTE Gate G` medida em 2026-08-07:
  // status active, tudo configurado, nenhum ato de autorização registrado.
  // Antes desta correção ela disparava em menos de um minuto ao receber leads.
  const semCarimbo: CampanhaLifecycle = { ...ARMADA, activatedAt: null };
  const v = avaliarLifecycle(semCarimbo, AGORA);
  assertEquals(v.armada, false);
  assertEquals(v.motivo, "nao_autorizada");
});

Deno.test("ANTI-NO-OP — a regra nova DIFERE da antiga para a campanha real", () => {
  // A regra ANTIGA era, literalmente, `status !== "paused"`. Se a nova concordasse
  // com ela em todos os casos, este módulo seria decoração cara.
  // Prova de que discordam no caso que causou o incidente:
  const regraAntiga = (c: CampanhaLifecycle) => c.status !== "paused";
  const casoReal: CampanhaLifecycle = { ...ARMADA, activatedAt: null };

  assertEquals(regraAntiga(casoReal), true); // antiga: PODE disparar
  assertEquals(avaliarLifecycle(casoReal, AGORA).armada, false); // nova: NÃO pode
});

// ═══════════════════════════════════════════════════════════════════════════
// PRECEDÊNCIA: terminal vence carimbo
// ═══════════════════════════════════════════════════════════════════════════
Deno.test("killed com carimbo válido continua desarmada — terminal vence tudo", () => {
  const v = avaliarLifecycle({ ...ARMADA, status: "killed" }, AGORA);
  assertEquals(v.armada, false);
  assertEquals(v.motivo, "estado_terminal:killed");
});

Deno.test("completed com carimbo válido continua desarmada", () => {
  assertEquals(
    avaliarLifecycle({ ...ARMADA, status: "completed" }, AGORA).motivo,
    "estado_terminal:completed",
  );
});

Deno.test("draft e paused não disparam, mesmo carimbadas", () => {
  assertEquals(avaliarLifecycle({ ...ARMADA, status: "draft" }, AGORA).motivo, "estado_nao_disparavel:draft");
  assertEquals(avaliarLifecycle({ ...ARMADA, status: "paused" }, AGORA).motivo, "estado_nao_disparavel:paused");
});

Deno.test("status desconhecido NÃO dispara — fail-safe se o CHECK crescer sem passar aqui", () => {
  const v = avaliarLifecycle({ ...ARMADA, status: "scheduled" }, AGORA);
  assertEquals(v.armada, false);
  assertEquals(v.motivo, "estado_nao_disparavel:scheduled");
});

Deno.test("warming dispara como active — é o mesmo estado com teto menor", () => {
  assertEquals(avaliarLifecycle({ ...ARMADA, status: "warming" }, AGORA).armada, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// AGENDAMENTO (vigência)
// ═══════════════════════════════════════════════════════════════════════════
Deno.test("agendada para o futuro: autorizada mas AGUARDANDO — não dispara", () => {
  const v = avaliarLifecycle({ ...ARMADA, scheduledStartAt: AMANHA }, AGORA);
  assertEquals(v.armada, false);
  assertEquals(v.motivo, "aguardando_agendamento");
});

Deno.test("FRONTEIRA — no instante EXATO do agendamento já dispara", () => {
  // Quem marca 09:00 espera que 09:00:00.000 conte. Um `>=` aqui atrasaria a
  // campanha em um tick inteiro e pareceria "agendamento não funciona".
  assertEquals(avaliarLifecycle({ ...ARMADA, scheduledStartAt: AGORA }, AGORA).armada, true);
  const umMsDepois = new Date(AGORA.getTime() + 1);
  assertEquals(
    avaliarLifecycle({ ...ARMADA, scheduledStartAt: umMsDepois }, AGORA).motivo,
    "aguardando_agendamento",
  );
});

Deno.test("vigência encerrada: não dispara E pede transição para completed", () => {
  const v = avaliarLifecycle({ ...ARMADA, scheduledEndAt: ONTEM }, AGORA);
  assertEquals(v.armada, false);
  assertEquals(v.motivo, "vigencia_encerrada");
  assertEquals(v.transicao, "completed");
});

Deno.test("FRONTEIRA — fim de vigência é EXCLUSIVO, igual a withinWindow", () => {
  // `endHour` de withinWindow é exclusivo (hour < endHour). Se o fim de vigência
  // fosse inclusivo, o motor teria duas convenções de horário opostas.
  assertEquals(avaliarLifecycle({ ...ARMADA, scheduledEndAt: AGORA }, AGORA).motivo, "vigencia_encerrada");
  const umMsDepois = new Date(AGORA.getTime() + 1);
  assertEquals(avaliarLifecycle({ ...ARMADA, scheduledEndAt: umMsDepois }, AGORA).armada, true);
});

Deno.test("janela de vigência completa: antes NÃO, dentro SIM, depois NÃO", () => {
  const janela = {
    ...ARMADA,
    scheduledStartAt: new Date("2026-08-10T12:00:00Z"),
    scheduledEndAt: new Date("2026-08-12T12:00:00Z"),
  };
  assertEquals(avaliarLifecycle(janela, new Date("2026-08-09T23:59:59Z")).motivo, "aguardando_agendamento");
  assertEquals(avaliarLifecycle(janela, new Date("2026-08-11T00:00:00Z")).armada, true);
  assertEquals(avaliarLifecycle(janela, new Date("2026-08-13T00:00:00Z")).motivo, "vigencia_encerrada");
});

Deno.test("agendamento SEM carimbo não dispara — a falta de autorização vem antes", () => {
  // O motivo relatado tem de ser o mais fundamental. Se dissesse
  // "aguardando_agendamento", o operador esperaria o horário chegar para algo que
  // nunca ia disparar.
  const v = avaliarLifecycle({ ...ARMADA, activatedAt: null, scheduledStartAt: AMANHA }, AGORA);
  assertEquals(v.motivo, "nao_autorizada");
});

Deno.test("carimbo no FUTURO é dado corrompido — não dispara", () => {
  assertEquals(avaliarLifecycle({ ...ARMADA, activatedAt: AMANHA }, AGORA).motivo, "autorizacao_no_futuro");
});

// ═══════════════════════════════════════════════════════════════════════════
// MATAR LIMPA A AUTORIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════
Deno.test("matar limpa o carimbo — reativar exige ato humano novo", () => {
  const patch = limparAutorizacaoAoMatar("undelivered_rate=0.62", AGORA);
  assertEquals(patch.status, "killed");
  assertEquals(patch.activated_at, null);
  assertEquals(patch.activated_by, null);

  // E o efeito composto: devolver o status para active NÃO rearma sozinho.
  const depoisDeMorta: CampanhaLifecycle = {
    status: "active",
    activatedAt: paraData(patch.activated_at),
    scheduledStartAt: null,
    scheduledEndAt: null,
  };
  assertEquals(avaliarLifecycle(depoisDeMorta, AGORA).motivo, "nao_autorizada");
});

// ═══════════════════════════════════════════════════════════════════════════
// LEITURA DA LINHA CRUA
// ═══════════════════════════════════════════════════════════════════════════
Deno.test("lifecycleDaLinha lê ISO do banco; campo ausente vira null", () => {
  const l = lifecycleDaLinha({ status: "active", activated_at: "2026-08-06T14:00:00+00:00" });
  assertEquals(l.status, "active");
  assertEquals(l.activatedAt?.toISOString(), "2026-08-06T14:00:00.000Z");
  assertEquals(l.scheduledStartAt, null);
  assertEquals(l.scheduledEndAt, null);
});

Deno.test("data inválida vira null, e null NÃO autoriza", () => {
  assertEquals(paraData("não é data"), null);
  assertEquals(paraData(null), null);
  assertEquals(paraData(undefined), null);
  // A consequência que importa: lixo no campo não vira permissão.
  const l = lifecycleDaLinha({ status: "active", activated_at: "lixo" });
  assertEquals(avaliarLifecycle(l, AGORA).motivo, "nao_autorizada");
});

Deno.test("linha SEM as colunas novas (pré-migration) não dispara", () => {
  // Defesa temporal: se o código subir antes da migration, o efeito é parar, não
  // vazar. Uma campanha `active` numa tabela sem `activated_at` fica desarmada.
  const l = lifecycleDaLinha({ status: "active" });
  assertEquals(avaliarLifecycle(l, AGORA).motivo, "nao_autorizada");
});
