// deno test — prova o canário de cobertura com DADOS SEMEADOS, sem banco.
//   deno test --no-check supabase/functions/_shared/instance-coverage.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  avaliarCobertura,
  avaliarInstancia,
  type InstanciaVigiada,
  textoDoAlerta,
} from "./instance-coverage.ts";

const AGORA = Date.parse("2026-08-07T09:00:00Z");
const H = 3_600_000;

function inst(over: Partial<InstanciaVigiada> = {}): InstanciaVigiada {
  return {
    id: "id-1",
    name: "instancia-exemplo",
    status: "qr_pending",
    last_connected_at: "2026-08-06T23:00:00Z", // 10h atrás
    origem: "plataforma",
    metadata: {},
    ...over,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// O CASO REAL QUE MOTIVOU O MÓDULO
// ═══════════════════════════════════════════════════════════════════════════
Deno.test("CASO REAL — instância da PLATAFORMA caída há horas, sem marca: ACUSA", () => {
  // Configuração idêntica à `prospeccao-ativa-camila` medida em 2026-08-07:
  // lado plataforma, qr_pending, última conexão na véspera, nenhuma marca de
  // alerta — porque nenhum vigia jamais a enxergou.
  const v = avaliarInstancia(inst({ name: "prospeccao-ativa-camila" }), AGORA);
  assertEquals(v.alertar, true);
  assertEquals(v.motivo, "caida_sem_vigilancia");
});

Deno.test("ANTI-NO-OP — o canário vê o que o health-alert NÃO vê", () => {
  // O health-alert lê SÓ `evolution_instances`. No modelo dele, instâncias do
  // lado plataforma simplesmente não existem. Se o canário concordasse com ele
  // em todos os casos, seria decoração cara.
  const soTenant = (i: InstanciaVigiada) => i.origem === "tenant"; // o "modelo" do health-alert
  const camila = inst({ name: "prospeccao-ativa-camila", origem: "plataforma" });

  assertEquals(soTenant(camila), false); // health-alert: nem enxerga
  assertEquals(avaliarInstancia(camila, AGORA).alertar, true); // canário: acusa
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTROLES NEGATIVOS — o que NÃO pode virar alerta
// ═══════════════════════════════════════════════════════════════════════════
Deno.test("no ar não alerta", () => {
  assertEquals(avaliarInstancia(inst({ status: "connected" }), AGORA).motivo, "no_ar");
});

Deno.test("silenciada não alerta, mesmo caída há muito tempo", () => {
  // `health_mute` é decisão humana deliberada (instância de teste aposentada).
  // Vence até a falta de vigilância.
  const v = avaliarInstancia(inst({ metadata: { health_mute: true } }), AGORA);
  assertEquals(v.alertar, false);
  assertEquals(v.motivo, "silenciada");
});

Deno.test("queda RECENTE não alerta — reconexão normal não é incidente", () => {
  const v = avaliarInstancia(
    inst({ last_connected_at: new Date(AGORA - 10 * 60_000).toISOString() }),
    AGORA,
  );
  assertEquals(v.motivo, "queda_recente_aguardando");
});

Deno.test("FRONTEIRA — exatamente no limiar de 30min já acusa", () => {
  const noLimiar = inst({ last_connected_at: new Date(AGORA - 30 * 60_000).toISOString() });
  assertEquals(avaliarInstancia(noLimiar, AGORA).alertar, true);
  const umSegundoAntes = inst({
    last_connected_at: new Date(AGORA - 30 * 60_000 + 1000).toISOString(),
  });
  assertEquals(avaliarInstancia(umSegundoAntes, AGORA).motivo, "queda_recente_aguardando");
});

Deno.test("THROTTLE COMPARTILHADO — se o health-alert já avisou, o canário se cala", () => {
  // Garantia de que os dois não duplicam alerta sobre a MESMA queda, sem que
  // nenhuma função conheça a outra. O contrato vive no DADO.
  const jaAvisado = inst({
    metadata: { health_alert_at: new Date(AGORA - 2 * H).toISOString() },
  });
  assertEquals(avaliarInstancia(jaAvisado, AGORA).motivo, "ja_alertado_recentemente");
});

Deno.test("marca VELHA (>6h) volta a alertar — queda longa não pode virar silêncio eterno", () => {
  const marcaVelha = inst({
    metadata: { health_alert_at: new Date(AGORA - 7 * H).toISOString() },
  });
  assertEquals(avaliarInstancia(marcaVelha, AGORA).alertar, true);
});

Deno.test("sem last_connected_at e caída: ACUSA — nunca conectou é o caso que se quer ver", () => {
  // Tratar ausência como "queda recente" daria carta branca a quem nunca funcionou.
  const v = avaliarInstancia(inst({ last_connected_at: null }), AGORA);
  assertEquals(v.alertar, true);
  assertEquals(v.motivo, "caida_sem_vigilancia");
});

Deno.test("metadata null não quebra e não impede o alerta", () => {
  assertEquals(avaliarInstancia(inst({ metadata: null }), AGORA).alertar, true);
});

Deno.test("data inválida em last_connected_at não vira 'recente'", () => {
  // Date.parse('lixo') é NaN; se NaN passasse pelo teste de recência, uma data
  // corrompida silenciaria o alerta — falha para o lado errado.
  assertEquals(avaliarInstancia(inst({ last_connected_at: "lixo" }), AGORA).alertar, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// LISTA COMPLETA
// ═══════════════════════════════════════════════════════════════════════════
Deno.test("avaliarCobertura separa quem merece alerta, preservando o resto", () => {
  const lista = [
    inst({ id: "a", name: "no-ar", status: "connected", origem: "tenant" }),
    inst({ id: "b", name: "muda-tenant", origem: "tenant" }),
    inst({ id: "c", name: "muda-plataforma", origem: "plataforma" }),
    inst({ id: "d", name: "aposentada", metadata: { health_mute: true } }),
  ];
  const { aAlertar, todos } = avaliarCobertura(lista, AGORA);
  assertEquals(todos.length, 4);
  assertEquals(aAlertar.map((v) => v.instancia.id), ["b", "c"]);
});

Deno.test("o texto NOMEIA o lado — é o que revela o vão a quem lê", () => {
  const t = textoDoAlerta(avaliarInstancia(inst({ name: "prospeccao-ativa-camila" }), AGORA));
  if (!t.includes("platform_crm_evolution_instances")) {
    throw new Error("o alerta precisa dizer de QUAL tabela veio, senão a causa some");
  }
  if (!t.includes("prospeccao-ativa-camila")) throw new Error("faltou o nome da instância");
});

Deno.test("limiares são CONFIGURÁVEIS", () => {
  const caida2h = inst({ last_connected_at: new Date(AGORA - 2 * H).toISOString() });
  // Com exigência de 3h de queda, 2h ainda não acusa.
  assertEquals(avaliarInstancia(caida2h, AGORA, { minutosParaAcusar: 180 }).alertar, false);
  assertEquals(avaliarInstancia(caida2h, AGORA, { minutosParaAcusar: 60 }).alertar, true);
});
