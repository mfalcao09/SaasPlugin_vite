// _shared/instance-coverage.ts
//
// CANÁRIO DE COBERTURA — núcleo PURO (sem banco/rede).
//
//   deno test --no-check supabase/functions/_shared/instance-coverage.test.ts
//
// ── O DEFEITO QUE ESTE MÓDULO EXISTE PARA CORRIGIR ──────────────────────────
//
// Em 2026-08-07 a instância `prospeccao-ativa-camila` caiu às 20:18 do dia 06 e
// NINGUÉM foi avisado. O Marcelo descobriu porque perguntou.
//
// A causa não foi um alerta que falhou — foi um alerta que nunca olhou.
// `whatsapp-health-alert` lê `evolution_instances` (lado tenant). A instância da
// prospecção vive em `platform_crm_evolution_instances` (lado plataforma). São
// duas tabelas, e o vigia conhecia uma.
//
// Medido no mesmo dia: SETE edge functions leem `platform_crm_evolution_instances`
// para trabalhar (send, proxy, webhook, check-number, start-conversation,
// sales-brain, post-sale). ZERO a vigiam. Uma tabela com sete consumidores e
// nenhum guarda.
//
// ── POR QUE UM CANÁRIO, E NÃO SÓ "ARRUMAR O OUTRO ALERTA" ──────────────────
//
// Arrumar o health-alert resolve ESTA tabela. Não impede a próxima: existem 86
// pares de tabelas espelhadas `X` ↔ `platform_crm_X` neste banco, e nada obriga
// um consumidor a declarar qual lado ele cobre. O vão se repete em silêncio.
//
// Este módulo inverte a pergunta. Em vez de "as instâncias que eu conheço estão
// no ar?", ele pergunta **"existe alguma instância que ninguém está olhando?"**.
// A primeira pergunta é cega para o que não enumera; a segunda enxerga o vão.
//
// ── COMO ELE NÃO VIRA RUÍDO ────────────────────────────────────────────────
//
// Compartilha a MESMA marca de throttle do health-alert (`metadata.health_alert_at`)
// e o MESMO silenciador (`metadata.health_mute`). Não é coincidência de nomes: é
// para que os dois nunca alertem sobre a mesma queda. Se o health-alert já avisou,
// a marca está lá e o canário se cala — sem precisar saber que o health-alert
// existe. Um contrato no DADO, não um acoplamento entre funções.

/** Uma instância, vinda de QUALQUER das duas tabelas. */
export interface InstanciaVigiada {
  id: string;
  name: string;
  status: string;
  last_connected_at: string | null;
  /** De qual tabela veio — entra no alerta, porque o vão É a origem. */
  origem: "tenant" | "plataforma";
  metadata: Record<string, unknown> | null;
}

export interface CoberturaConfig {
  /** Só acusa queda mais velha que isto. Default 30 min. */
  minutosParaAcusar?: number;
  /** Não repete o mesmo aviso antes disto. Default 6h (igual ao health-alert). */
  horasParaRealertar?: number;
}

export interface VereditoInstancia {
  instancia: InstanciaVigiada;
  alertar: boolean;
  /** Motivo estável — serve para log e para teste. */
  motivo:
    | "no_ar"
    | "silenciada"
    | "queda_recente_aguardando"
    | "ja_alertado_recentemente"
    | "caida_sem_vigilancia";
}

/** `connected` é o único estado que significa "no ar". Qualquer outro é queda. */
function estaNoAr(status: string): boolean {
  return status === "connected";
}

/**
 * Decide, para UMA instância, se cabe alerta agora.
 *
 * Ordem deliberada — do mais forte para o mais fraco, para que o motivo relatado
 * seja o mais fundamental e não o primeiro que casou:
 *
 *   1. no ar          — nada a fazer
 *   2. silenciada     — decisão humana explícita vence tudo
 *   3. queda recente  — evita alarme por reconexão normal
 *   4. já alertado    — throttle compartilhado com o health-alert
 *   5. ACUSA
 *
 * `last_connected_at` ausente NÃO impede o alerta: instância que nunca conectou e
 * está fora do ar é exatamente o caso que se quer ver. Tratar ausência como
 * "recente" seria dar carta branca a quem nunca funcionou.
 */
export function avaliarInstancia(
  inst: InstanciaVigiada,
  agoraMs: number,
  cfg: CoberturaConfig = {},
): VereditoInstancia {
  const meta = inst.metadata ?? {};
  const veredito = (alertar: boolean, motivo: VereditoInstancia["motivo"]): VereditoInstancia => ({
    instancia: inst,
    alertar,
    motivo,
  });

  if (estaNoAr(inst.status)) return veredito(false, "no_ar");

  // Silenciar é ato humano deliberado (ex.: instância de teste aposentada).
  // Vence até a falta de vigilância — quem silenciou sabia o que fazia.
  if (meta.health_mute === true) return veredito(false, "silenciada");

  const minutos = cfg.minutosParaAcusar ?? 30;
  const desdeMs = inst.last_connected_at ? Date.parse(inst.last_connected_at) : NaN;
  if (!Number.isNaN(desdeMs) && agoraMs - desdeMs < minutos * 60_000) {
    return veredito(false, "queda_recente_aguardando");
  }

  // Throttle COMPARTILHADO: se o health-alert já avisou, a marca está aqui e o
  // canário se cala. É o que impede dois avisos para a mesma queda sem que uma
  // função precise conhecer a outra.
  const marca = typeof meta.health_alert_at === "string" ? Date.parse(meta.health_alert_at) : NaN;
  const horas = cfg.horasParaRealertar ?? 6;
  if (!Number.isNaN(marca) && agoraMs - marca < horas * 3_600_000) {
    return veredito(false, "ja_alertado_recentemente");
  }

  return veredito(true, "caida_sem_vigilancia");
}

/** Aplica `avaliarInstancia` na lista inteira e separa quem merece alerta. */
export function avaliarCobertura(
  instancias: InstanciaVigiada[],
  agoraMs: number,
  cfg: CoberturaConfig = {},
): { aAlertar: VereditoInstancia[]; todos: VereditoInstancia[] } {
  const todos = instancias.map((i) => avaliarInstancia(i, agoraMs, cfg));
  return { aAlertar: todos.filter((v) => v.alertar), todos };
}

/**
 * Texto do alerta. Nomeia a ORIGEM de propósito: saber que a instância caída vem
 * do lado `plataforma` é o que revela o vão de cobertura para quem lê — sem isso,
 * o alerta parece só mais um "WhatsApp caiu" e a causa estrutural fica invisível.
 */
export function textoDoAlerta(v: VereditoInstancia): string {
  const i = v.instancia;
  const desde = i.last_connected_at
    ? `desde ${new Date(i.last_connected_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
    : "sem registro de última conexão";
  const lado = i.origem === "plataforma"
    ? "PLATAFORMA (platform_crm_evolution_instances)"
    : "tenant (evolution_instances)";
  return (
    `🔴 WhatsApp DESCONECTADO — detectado pelo canário de cobertura\n` +
    `Instância: ${i.name}\n` +
    `Status: ${i.status}\n` +
    `Lado: ${lado}\n` +
    `Fora do ar ${desde}\n\n` +
    `Enquanto isso: mensagem não entra e automação não sai.\n` +
    `Reconectar em Conexões → ler o QR.`
  );
}
