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
  createdAt: string | null;
  /** De qual tabela veio — entra no alerta, porque o vão É a origem. */
  origem: "tenant" | "plataforma";
  metadata: Record<string, unknown> | null;
  /** Produto dono da instância de plataforma; ausente no lado tenant. */
  productId?: string | null;
  /**
   * Org dona da instância. OPCIONAL porque só existe de UM lado: medido em
   * 2026-08-07, `evolution_instances` tem `organization_id` e
   * `platform_crm_evolution_instances` NÃO tem (tem `product_id`).
   *
   * Instância de plataforma não pertence a cliente nenhum — logo nunca é demo, e
   * o filtro abaixo não se aplica a ela. Ausência aqui significa "não é de org",
   * não "caso omisso".
   */
  organizationId?: string | null;
}

export interface CoberturaConfig {
  /** Só acusa queda mais velha que isto. Default 30 min. */
  minutosParaAcusar?: number;
  /** Não repete o mesmo aviso antes disto. Default 6h (igual ao health-alert). */
  horasParaRealertar?: number;
  /**
   * Ids de orgs em DEMONSTRAÇÃO (`plan_status='demo'`). Instância dessas orgs não
   * gera alerta.
   *
   * ── POR QUE ISTO EXISTE (apontado pela Controladora, 2026-08-07) ──────────
   * `qr_pending` numa org demo é o estado NORMAL de quem abriu o wizard e ainda
   * não pareou — ou desistiu na etapa 2. Sem este filtro, CADA lead que não
   * conclui vira um "🔴 WhatsApp DESCONECTADO", e no dia em que o anúncio rodar
   * isso vira ruído em massa. O custo não é o incômodo: é treinar a ignorar o
   * canal justamente quando um salão PAGANTE cair de verdade.
   *
   * O `health_alert_at` compartilhado NÃO protege disso: ele evita que duas
   * funções alertem sobre o MESMO incidente, mas se o alerta não deveria
   * existir, dedup só garante que ele saia uma vez em vez de duas.
   *
   * ⚠️ FALHA ABERTA: se a leitura das orgs falhar, passar conjunto VAZIO — todas
   * voltam a ser vigiadas. Um alerta a mais é barato; um salão pago caído em
   * silêncio, não.
   */
  orgsDemo?: ReadonlySet<string>;
}

export interface VereditoInstancia {
  instancia: InstanciaVigiada;
  alertar: boolean;
  /** Motivo estável — serve para log e para teste. */
  motivo:
    | "org_em_demonstracao"
    | "no_ar"
    | "silenciada"
    | "queda_recente_aguardando"
    | "ja_alertado_recentemente"
    | "caida_sem_vigilancia";
}

/** Recorte real de `platform_crm_cold_campaigns` usado pelo canário. */
export interface CampanhaAtivada {
  id: string;
  name: string;
  channel: string;
  status: string;
  activatedAt: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  productId: string;
  /** Pin do burner Evolution dedicado (`platform_crm_evolution_instances.id`). */
  instanceId: string | null;
  /** Throttle persistente do alerta do elo campanha → burner. */
  coverageAlertAt: string | null;
}

export interface VereditoCampanhaAtivada {
  campanha: CampanhaAtivada;
  instancia: InstanciaVigiada | null;
  alertar: boolean;
  motivo:
    | "canal_nao_whatsapp"
    | "campanha_nao_autorizada"
    | "campanha_fora_da_janela"
    | "campanha_ja_alertada_recentemente"
    | "sem_instancia_dedicada"
    | "instancia_dedicada_ausente"
    | "instancia_de_outro_produto"
    | "instancia_dedicada_conectada"
    | "instancia_dedicada_silenciada"
    | "instancia_em_queda_recente"
    | "instancia_ja_alertada_recentemente"
    | "instancia_dedicada_desconectada";
}

/** `connected` é o único estado que significa "no ar". Qualquer outro é queda. */
function estaNoAr(status: string): boolean {
  return status === "connected";
}

function campanhaAlertadaRecentemente(
  campanha: CampanhaAtivada,
  agoraMs: number,
  cfg: CoberturaConfig,
): boolean {
  const marca = campanha.coverageAlertAt
    ? Date.parse(campanha.coverageAlertAt)
    : NaN;
  const horas = cfg.horasParaRealertar ?? 6;
  return !Number.isNaN(marca) && agoraMs - marca < horas * 3_600_000;
}

/**
 * Decide, para UMA instância, se cabe alerta agora.
 *
 * Ordem deliberada — do mais forte para o mais fraco, para que o motivo relatado
 * seja o mais fundamental e não o primeiro que casou:
 *
 *   1. org demo       — EXCLUSÃO DE ESCOPO: nem entra no radar
 *   2. no ar          — nada a fazer
 *   3. silenciada     — decisão humana explícita vence o resto
 *   4. queda recente  — evita alarme por reconexão normal
 *   5. já alertado    — throttle compartilhado com o health-alert
 *   6. ACUSA
 *
 * O filtro de demo vem PRIMEIRO, antes até de checar se está no ar, porque não é
 * um julgamento sobre o estado da instância — é dizer que ela não é vigiada. Um
 * `qr_pending` de demo não é incidente pendente; é um lead que não terminou o
 * wizard.
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
  const veredito = (
    alertar: boolean,
    motivo: VereditoInstancia["motivo"],
  ): VereditoInstancia => ({
    instancia: inst,
    alertar,
    motivo,
  });

  // Org em demonstração: fora do radar. Só se aplica a quem TEM org — instância
  // de plataforma (`organizationId` ausente) nunca é demo e segue vigiada.
  // Filtro por `plan_status`, NÃO por prefixo do nome: `demo-` é convenção do
  // wizard e nada impede um tenant de se chamar assim. O plano é o fato.
  if (inst.organizationId && cfg.orgsDemo?.has(inst.organizationId)) {
    return veredito(false, "org_em_demonstracao");
  }

  if (estaNoAr(inst.status)) return veredito(false, "no_ar");

  // Silenciar é ato humano deliberado (ex.: instância de teste aposentada).
  // Vence até a falta de vigilância — quem silenciou sabia o que fazia.
  if (meta.health_mute === true) return veredito(false, "silenciada");

  const minutos = cfg.minutosParaAcusar ?? 30;
  const referencia = inst.last_connected_at ?? inst.createdAt;
  const desdeMs = referencia ? Date.parse(referencia) : NaN;
  if (!Number.isNaN(desdeMs) && agoraMs - desdeMs < minutos * 60_000) {
    return veredito(false, "queda_recente_aguardando");
  }

  // Throttle COMPARTILHADO: se o health-alert já avisou, a marca está aqui e o
  // canário se cala. É o que impede dois avisos para a mesma queda sem que uma
  // função precise conhecer a outra.
  const marca = typeof meta.health_alert_at === "string"
    ? Date.parse(meta.health_alert_at)
    : NaN;
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
 * Confere o elo operacional campanha autorizada → burner Evolution dedicado.
 *
 * Só uma instância de PLATAFORMA pode satisfazer o pin. Isso é importante tanto
 * pelo schema (`instance_id` aponta para o burner platform-side) quanto para não
 * confundir uma instância tenant — inclusive de org demo — que por acaso tenha o
 * mesmo UUID em dados sem FK.
 */
export function avaliarCampanhaAtivada(
  campanha: CampanhaAtivada,
  instancias: InstanciaVigiada[],
  agoraMs: number,
  cfg: CoberturaConfig = {},
): VereditoCampanhaAtivada {
  const veredito = (
    alertar: boolean,
    motivo: VereditoCampanhaAtivada["motivo"],
    instancia: InstanciaVigiada | null = null,
  ): VereditoCampanhaAtivada => ({ campanha, instancia, alertar, motivo });

  if (campanha.channel !== "whatsapp") {
    return veredito(false, "canal_nao_whatsapp");
  }

  const statusAtivo = campanha.status === "active" ||
    campanha.status === "warming";
  const autorizada = campanha.activatedAt !== null &&
    !Number.isNaN(Date.parse(campanha.activatedAt));
  if (!statusAtivo || !autorizada) {
    return veredito(false, "campanha_nao_autorizada");
  }
  const inicio = campanha.scheduledStartAt
    ? Date.parse(campanha.scheduledStartAt)
    : NaN;
  const fim = campanha.scheduledEndAt
    ? Date.parse(campanha.scheduledEndAt)
    : NaN;
  if (
    (!Number.isNaN(inicio) && agoraMs < inicio) ||
    (!Number.isNaN(fim) && agoraMs >= fim)
  ) {
    return veredito(false, "campanha_fora_da_janela");
  }

  if (!campanha.instanceId) {
    if (campanhaAlertadaRecentemente(campanha, agoraMs, cfg)) {
      return veredito(false, "campanha_ja_alertada_recentemente");
    }
    return veredito(true, "sem_instancia_dedicada");
  }

  const instancia =
    instancias.find((i) =>
      i.origem === "plataforma" && i.id === campanha.instanceId
    ) ?? null;
  if (!instancia) {
    if (campanhaAlertadaRecentemente(campanha, agoraMs, cfg)) {
      return veredito(false, "campanha_ja_alertada_recentemente");
    }
    return veredito(true, "instancia_dedicada_ausente");
  }
  if (instancia.productId !== campanha.productId) {
    return veredito(true, "instancia_de_outro_produto", instancia);
  }

  const saude = avaliarInstancia(instancia, agoraMs, cfg);
  switch (saude.motivo) {
    case "no_ar":
      return veredito(false, "instancia_dedicada_conectada", instancia);
    case "silenciada":
      return veredito(false, "instancia_dedicada_silenciada", instancia);
    case "queda_recente_aguardando":
      return veredito(false, "instancia_em_queda_recente", instancia);
    case "ja_alertado_recentemente":
      return veredito(false, "instancia_ja_alertada_recentemente", instancia);
    case "caida_sem_vigilancia":
      if (campanhaAlertadaRecentemente(campanha, agoraMs, cfg)) {
        return veredito(
          false,
          "campanha_ja_alertada_recentemente",
          instancia,
        );
      }
      return veredito(true, "instancia_dedicada_desconectada", instancia);
    case "org_em_demonstracao":
      // Inalcançável para origem plataforma; mantém o comportamento fail-open se
      // o modelo de dados mudar sem atualizar este contrato.
      return veredito(true, "instancia_dedicada_desconectada", instancia);
  }
}

/**
 * Texto do alerta. Nomeia a ORIGEM de propósito: saber que a instância caída vem
 * do lado `plataforma` é o que revela o vão de cobertura para quem lê — sem isso,
 * o alerta parece só mais um "WhatsApp caiu" e a causa estrutural fica invisível.
 */
export function textoDoAlerta(v: VereditoInstancia): string {
  const i = v.instancia;
  const desde = i.last_connected_at
    ? `desde ${
      new Date(i.last_connected_at).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
    }`
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

/** Alerta específico do elo campanha → instância, para tornar o impacto visível. */
export function textoDoAlertaCampanha(v: VereditoCampanhaAtivada): string {
  const c = v.campanha;
  if (v.motivo === "sem_instancia_dedicada") {
    return (
      `🔴 CAMPANHA ATIVADA sem instância dedicada\n` +
      `Campanha: ${c.name}\n` +
      `Ação: fixe um burner Evolution antes do próximo disparo.`
    );
  }
  if (v.motivo === "instancia_dedicada_ausente") {
    return (
      `🔴 CAMPANHA ATIVADA aponta para instância ausente\n` +
      `Campanha: ${c.name}\n` +
      `Instance ID: ${c.instanceId}\n` +
      `Ação: corrija o pin ou recrie a instância dedicada.`
    );
  }
  if (v.motivo === "instancia_de_outro_produto") {
    return (
      `🔴 CAMPANHA ATIVADA aponta para burner de outro produto\n` +
      `Campanha: ${c.name}\n` +
      `Instância: ${v.instancia?.name ?? c.instanceId}\n` +
      `Ação: fixe uma instância pertencente ao mesmo produto da campanha.`
    );
  }

  const i = v.instancia;
  return (
    `🔴 CAMPANHA ATIVADA com instância dedicada desconectada\n` +
    `Campanha: ${c.name}\n` +
    `Instância: ${i?.name ?? c.instanceId ?? "(ausente)"}\n` +
    `Status: ${i?.status ?? "ausente"}\n` +
    `Enquanto isso: a campanha está autorizada, mas não consegue enviar.`
  );
}

/** Consolida campanhas que dependem do mesmo burner em um único Telegram. */
export function textoDoAlertaCampanhas(
  vereditos: VereditoCampanhaAtivada[],
): string {
  if (vereditos.length === 0) return "";
  if (vereditos.length === 1) return textoDoAlertaCampanha(vereditos[0]);
  const nomes = vereditos.map((v) => `• ${v.campanha.name}`).join("\n");
  return (
    `${textoDoAlertaCampanha(vereditos[0])}\n\n` +
    `Campanhas afetadas (${vereditos.length}):\n${nomes}`
  );
}
