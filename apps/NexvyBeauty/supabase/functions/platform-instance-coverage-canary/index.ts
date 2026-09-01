// ─── platform-instance-coverage-canary ──────────────────────────────────────
//
// VIGIA AS INSTÂNCIAS DA PLATAFORMA. Existe porque, em 2026-08-07, a instância
// `prospeccao-ativa-camila` caiu às 20:18 do dia 06 e ninguém foi avisado — o
// Marcelo descobriu porque perguntou.
//
// Não foi um alerta que falhou: foi um alerta que nunca olhou. O
// `whatsapp-health-alert` lê `evolution_instances` (tenant); a instância da
// prospecção vive em `platform_crm_wa_qr_instances` (plataforma). Duas
// tabelas, e só o lado tenant tinha vigia.
//
// Medido no mesmo dia: SETE edge functions leem a tabela da plataforma para
// trabalhar; ZERO a vigiam.
//
// ── RELAÇÃO COM O whatsapp-health-alert ────────────────────────────────────
// Este canário NÃO substitui nem concorre com aquele: `whatsapp-health-alert`
// continua sozinho no lado tenant; este endpoint cobre somente o lado plataforma.
// A mesma marca (`metadata.health_alert_at`) preserva o contrato operacional.
//
// A decisão de alertar é do módulo PURO `_shared/instance-coverage.ts`
// (35 testes). Aqui só há I/O.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendTelegramAlert } from "../_shared/platform-alerts.ts";
import {
  adquirirClaimsDoGrupo,
  avaliarCampanhaAtivada,
  avaliarCobertura,
  type CampanhaAtivada,
  chaveConsolidacaoCampanha,
  type InstanciaVigiada,
  textoDoAlerta,
  textoDoAlertaCampanhas,
  type VereditoCampanhaAtivada,
} from "../_shared/instance-coverage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/**
 * A tabela que estava sem vigia. O lado tenant fica deliberadamente fora para
 * não concorrer com `whatsapp-health-alert`.
 *
 * `colunas` difere por fonte porque o SCHEMA difere (medido 2026-08-07):
 * `evolution_instances` tem `organization_id`; `platform_crm_wa_qr_instances`
 * NÃO tem (tem `product_id`). Pedir coluna inexistente faz o PostgREST devolver
 * erro — e a fonte inteira sumiria do tick, que é exatamente o silêncio que este
 * canário existe para combater.
 */
const FONTES: Array<
  { tabela: string; origem: InstanciaVigiada["origem"]; colunas: string }
> = [
  {
    tabela: "platform_crm_wa_qr_instances",
    origem: "plataforma",
    colunas:
      "id, name, status, last_connected_at, created_at, metadata, product_id",
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("[coverage-canary] SUPABASE_URL/SERVICE_ROLE ausente");
    return json({ error: "configuracao_invalida" }, 500);
  }

  // O gateway fica com verify_jwt=false porque a service_role pode ser uma chave
  // opaca `sb_secret_`. Por isso a autenticação REAL precisa acontecer aqui e
  // comparar o bearer inteiro; apenas decodificar `role` sem verificar assinatura
  // permitiria que qualquer pessoa forjasse um JWT com role=service_role.
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_ROLE}`) {
    return json({ error: "nao_autorizado" }, 401);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const instancias: InstanciaVigiada[] = [];
  const falhas: string[] = [];
  const { error: errRearm } = await db.rpc(
    "pcrm_rearm_connected_health_alerts",
  );
  if (errRearm) {
    falhas.push(`pcrm_rearm_connected_health_alerts: ${errRearm.message}`);
  }

  for (const f of FONTES) {
    const { data, error } = await db
      .from(f.tabela)
      .select(f.colunas);
    if (error) {
      // Uma fonte ilegível NÃO pode virar "não há instâncias aqui" — esse é
      // exatamente o silêncio que o canário existe para combater. Registra a
      // falha, segue com as outras, e o relatório denuncia a lacuna.
      falhas.push(`${f.tabela}: ${error.message}`);
      console.error(
        "[coverage-canary] FONTE ILEGÍVEL — cobertura INCOMPLETA neste tick",
        {
          tabela: f.tabela,
          erro: error.message,
        },
      );
      continue;
    }
    // Cast explícito: o supabase-js só infere tipos quando `select()` recebe uma
    // string LITERAL. Com `f.colunas` (dinâmica, porque o schema difere por
    // fonte) ele devolve `{ error: true }` e o typecheck quebra em todo acesso.
    const linhas = (data ?? []) as unknown as Record<string, unknown>[];
    for (const r of linhas) {
      instancias.push({
        id: r.id as string,
        name: (r.name as string) ?? "(sem nome)",
        status: (r.status as string) ?? "",
        last_connected_at: (r.last_connected_at as string) ?? null,
        createdAt: (r.created_at as string) ?? null,
        origem: f.origem,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        productId: r.product_id as string | null | undefined,
        // Só a tabela tenant tem esta coluna; do lado plataforma vem undefined,
        // e undefined significa "não pertence a org", não "caso omisso".
        organizationId: r.organization_id as string | null | undefined,
      });
    }
  }

  const agoraMs = Date.now();
  const { aAlertar, todos } = avaliarCobertura(instancias, agoraMs);

  // Uma campanha WhatsApp autorizada depende de UM burner pinado por instance_id.
  // O schema real declara esse elo em platform_crm_cold_campaigns e o motor envia
  // pelo platform_crm_wa_qr_instances. Só avaliamos o elo se essa fonte foi
  // legível; do contrário, "não encontrei" seria um falso "instância ausente".
  // O throttle vive na própria campanha: um estado por campanha, independente de
  // troca de pin, sem interferir nas linhas de saúde usadas pelo motor de envio.
  const vereditosCampanha: VereditoCampanhaAtivada[] = [];
  if (!falhas.some((f) => f.startsWith("platform_crm_wa_qr_instances:"))) {
    const { data: campanhas, error: errCampanhas } = await db
      .from("platform_crm_cold_campaigns")
      .select(
        "id, name, channel, status, activated_at, scheduled_start_at, scheduled_end_at, product_id, instance_id, coverage_alert_at",
      )
      .eq("channel", "whatsapp")
      .in("status", ["active", "warming"])
      .not("activated_at", "is", null);

    if (errCampanhas) {
      falhas.push(`platform_crm_cold_campaigns: ${errCampanhas.message}`);
      console.error(
        "[coverage-canary] CAMPANHAS ILEGÍVEIS — cobertura INCOMPLETA neste tick",
        {
          erro: errCampanhas.message,
        },
      );
    } else {
      for (const r of (campanhas ?? []) as Record<string, unknown>[]) {
        const campanha: CampanhaAtivada = {
          id: r.id as string,
          name: (r.name as string) ?? "(sem nome)",
          channel: (r.channel as string) ?? "",
          status: (r.status as string) ?? "",
          activatedAt: (r.activated_at as string) ?? null,
          scheduledStartAt: (r.scheduled_start_at as string) ?? null,
          scheduledEndAt: (r.scheduled_end_at as string) ?? null,
          productId: r.product_id as string,
          instanceId: (r.instance_id as string) ?? null,
          coverageAlertAt: (r.coverage_alert_at as string) ?? null,
        };
        vereditosCampanha.push(
          avaliarCampanhaAtivada(campanha, instancias, agoraMs),
        );
      }
    }
  }

  const campanhasAAlertar = vereditosCampanha.filter((v) => v.alertar);
  const campanhasAlertadas: typeof campanhasAAlertar = [];
  const idsCobertosPorAlertaDeCampanha = new Set<string>();
  const alertedAt = new Date(agoraMs).toISOString();
  // Claim provisório "envelhece" em 10 min. Depois do Telegram, finalize troca
  // pelo timestamp real (6h). Se release/finalize falhar, não há silêncio de 6h.
  const claimedAt = new Date(agoraMs - 5 * 3_600_000 - 50 * 60_000)
    .toISOString();
  const staleBefore = new Date(agoraMs - 6 * 3_600_000).toISOString();

  const gruposCampanha = new Map<string, VereditoCampanhaAtivada[]>();
  for (const v of campanhasAAlertar) {
    const chave = chaveConsolidacaoCampanha(v);
    const grupo = gruposCampanha.get(chave) ?? [];
    grupo.push(v);
    gruposCampanha.set(chave, grupo);
  }

  const releaseCampaigns = async (grupo: VereditoCampanhaAtivada[]) => {
    for (const v of grupo) {
      const { error } = await db.rpc(
        "pcrm_release_campaign_coverage_alert",
        {
          p_campaign_id: v.campanha.id,
          p_claimed_at: claimedAt,
        },
      );
      if (error) {
        falhas.push(`release campanha ${v.campanha.id}: ${error.message}`);
      }
    }
  };

  // O alerta de campanha é mais específico e substitui o genérico no mesmo tick.
  // O grupo é adquirido por inteiro, em ordem determinística, ANTES de tocar no
  // claim da instância. Claim parcial é integralmente liberado e nunca envia.
  for (const grupo of gruposCampanha.values()) {
    const claimedCampaigns = await adquirirClaimsDoGrupo(
      grupo,
      (v) => v.campanha.id,
      async (v) => {
        const { data, error } = await db.rpc(
          "pcrm_claim_campaign_coverage_alert",
          {
            p_campaign_id: v.campanha.id,
            p_claimed_at: claimedAt,
            p_stale_before: staleBefore,
          },
        );
        if (error) {
          falhas.push(`claim campanha ${v.campanha.id}: ${error.message}`);
          return false;
        }
        return data === true;
      },
      async (v) => {
        await releaseCampaigns([v]);
      },
    );
    if (claimedCampaigns === null) continue;

    const v = claimedCampaigns[0];
    const campanhaComQueda = claimedCampaigns.find((item) =>
      item.motivo === "instancia_dedicada_desconectada"
    );
    const claimDaInstancia = campanhaComQueda?.instancia ?? null;
    if (claimDaInstancia) {
      const { data: instanceClaimed, error: instanceClaimError } = await db.rpc(
        "pcrm_claim_instance_health_alert",
        {
          p_instance_id: claimDaInstancia.id,
          p_claimed_at: claimedAt,
          p_stale_before: staleBefore,
        },
      );
      if (instanceClaimError || instanceClaimed !== true) {
        await releaseCampaigns(claimedCampaigns);
        if (instanceClaimError) {
          falhas.push(
            `claim instância ${claimDaInstancia.id}: ${instanceClaimError.message}`,
          );
        }
        continue;
      }
    }

    const envio = await sendTelegramAlert(
      textoDoAlertaCampanhas(claimedCampaigns),
    );
    if (!envio.ok) {
      await releaseCampaigns(claimedCampaigns);
      if (claimDaInstancia) {
        const { error } = await db.rpc(
          "pcrm_release_instance_health_alert",
          {
            p_instance_id: claimDaInstancia.id,
            p_claimed_at: claimedAt,
          },
        );
        if (error) {
          falhas.push(
            `release instância ${claimDaInstancia.id}: ${error.message}`,
          );
        }
      }
      falhas.push(
        `telegram: campanhas ${
          claimedCampaigns.map((item) => item.campanha.id).join(",")
        } não alertadas`,
      );
      continue;
    }

    const { error: finalizeError } = await db.rpc(
      "pcrm_finalize_campaign_coverage_group",
      {
        p_campaign_ids: claimedCampaigns.map((item) => item.campanha.id),
        p_instance_id: claimDaInstancia?.id ?? null,
        p_claimed_at: claimedAt,
        p_alerted_at: alertedAt,
      },
    );
    if (finalizeError) {
      falhas.push(
        `finalize grupo ${
          claimedCampaigns.map((item) => item.campanha.id)
        }: ${finalizeError.message}`,
      );
    }

    campanhasAlertadas.push(...claimedCampaigns);
    if (v.instancia) idsCobertosPorAlertaDeCampanha.add(v.instancia.id);
  }

  const instanciasAAlertar = aAlertar.filter(
    (v) => !idsCobertosPorAlertaDeCampanha.has(v.instancia.id),
  );
  const instanciasAlertadas: typeof instanciasAAlertar = [];
  for (const v of instanciasAAlertar) {
    const { data: claimed, error: claimError } = await db.rpc(
      "pcrm_claim_instance_health_alert",
      {
        p_instance_id: v.instancia.id,
        p_claimed_at: claimedAt,
        p_stale_before: staleBefore,
      },
    );
    if (claimError) {
      falhas.push(`claim instância ${v.instancia.id}: ${claimError.message}`);
      continue;
    }
    if (claimed !== true) continue;

    const envio = await sendTelegramAlert(textoDoAlerta(v));
    if (!envio.ok) {
      const { error } = await db.rpc(
        "pcrm_release_instance_health_alert",
        {
          p_instance_id: v.instancia.id,
          p_claimed_at: claimedAt,
        },
      );
      if (error) {
        falhas.push(`release instância ${v.instancia.id}: ${error.message}`);
      }
      falhas.push(`telegram: instância ${v.instancia.id} não alertada`);
      continue;
    }

    const { data: finalized, error } = await db.rpc(
      "pcrm_finalize_instance_health_alert",
      {
        p_instance_id: v.instancia.id,
        p_claimed_at: claimedAt,
        p_alerted_at: alertedAt,
      },
    );
    if (error || finalized !== true) {
      falhas.push(
        `finalize instância ${v.instancia.id}: ${
          error?.message ?? "claim não encontrado"
        }`,
      );
    }
    instanciasAlertadas.push(v);
  }

  return json({
    ok: falhas.length === 0,
    // `fontes_ilegiveis` não-vazio significa que este tick NÃO cobriu tudo.
    // Sem esse campo, um relatório de zero alertas seria indistinguível de
    // "não consegui olhar".
    fontes_ilegiveis: falhas,
    instancias: instancias.length,
    alertadas: instanciasAlertadas.length + campanhasAlertadas.length,
    detalhe: [
      ...instanciasAlertadas.map((v) => ({
        tipo: "instancia",
        nome: v.instancia.name,
        lado: v.instancia.origem,
      })),
      ...campanhasAlertadas.map((v) => ({
        tipo: "campanha",
        nome: v.campanha.name,
        motivo: v.motivo,
      })),
    ],
    campanhas_avaliadas: vereditosCampanha.length,
    por_motivo: todos.reduce<Record<string, number>>((acc, v) => {
      acc[v.motivo] = (acc[v.motivo] ?? 0) + 1;
      return acc;
    }, {}),
  }, falhas.length === 0 ? 200 : 503);
});
