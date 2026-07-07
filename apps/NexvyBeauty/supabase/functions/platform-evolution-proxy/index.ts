// platform-evolution-proxy — proxy Evolution Go do CRM de PLATAFORMA (super_admin).
//
// Porte 1:1 do `evolution-proxy` do CRM Vendus, DESACOPLADO do tenant:
//   * Tabela: platform_crm_evolution_instances (SEM organization_id /
//     created_by_super_admin). Operador da plataforma = ilimitado.
//   * Auth: super_admin via authenticatePlatformAgent (Bearer JWT + gate
//     user_roles; service_role atua por actorUserId). Todas as actions exigem
//     super_admin — não há org/admin/manager na plataforma.
//   * Gate de limite por plano REMOVIDO no create_instance_self (era
//     get_organization_effective_limits + contagem por org).
//   * Config Evolution: platform_settings.evolution_go_url +
//     evolution_go_global_api_key (servidor compartilhado evolution.nexvy.tech).
//   * Webhook aponta p/ ${SUPABASE_URL}/functions/v1/platform-evolution-webhook.
//
// Actions portadas (nomes verbatim do original, escopo do painel Conexões):
//   test_connection, create_instance_self, connect_instance, subscribe_webhook,
//   sync_instances, set_default, disconnect_instance, logout_instance,
//   delete_instance, rename_instance_self.
// NÃO portadas: create_instance / assign_instance / *_self de org (dependiam de
//   organization_id — inexistente na plataforma; create vira create_instance_self).

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";

interface EvolutionConfig {
  url: string;
  globalApiKey: string;
}

/**
 * Reads the GLOBAL Evolution Go config from `platform_settings`.
 * Single source of truth — servidor compartilhado da plataforma.
 */
async function getPlatformConfig(supabase: any): Promise<EvolutionConfig | null> {
  const { data } = await supabase
    .from("platform_settings")
    .select("evolution_go_url, evolution_go_global_api_key")
    .limit(1)
    .maybeSingle();

  if (!data?.evolution_go_url || !data?.evolution_go_global_api_key) return null;

  return {
    url: String(data.evolution_go_url).replace(/\/$/, ""),
    globalApiKey: String(data.evolution_go_global_api_key),
  };
}

async function evoFetch(
  config: EvolutionConfig,
  path: string,
  init: RequestInit = {},
  instanceToken?: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: instanceToken || config.globalApiKey,
    ...(init.headers as Record<string, string> ?? {}),
  };
  let res: Response;
  try {
    res = await fetch(`${config.url}${path}`, { ...init, headers });
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      body: null,
      message: `Falha ao conectar em ${config.url}: ${err.message}`,
    };
  }
  const text = await res.text();
  let body: any;
  let isJson = false;
  try {
    body = text ? JSON.parse(text) : null;
    isJson = true;
  } catch {
    body = text;
    isJson = false;
  }
  let message: string | undefined;
  if (!res.ok) {
    if (!isJson && typeof body === "string") {
      message = `Servidor respondeu ${res.status}: ${body.slice(0, 200)}`;
    } else if (isJson && body?.message) {
      message = String(body.message);
    } else if (isJson && body?.error) {
      message = String(body.error);
    }
  }
  return { ok: res.ok, status: res.status, body, message, isJson };
}

function maskKey(k?: string | null): string {
  if (!k) return "(empty)";
  return k.length <= 8 ? "***" : `${k.slice(0, 5)}***${k.slice(-3)}`;
}

function normalizeQrString(value: any): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw.length <= 20) return null;

  const pipeIndex = raw.indexOf("|");
  if (pipeIndex >= 0) {
    const afterPipe = raw.slice(pipeIndex + 1).trim();
    if (afterPipe.length > 20) return afterPipe;
    const beforePipe = raw.slice(0, pipeIndex).trim();
    if (beforePipe.length > 20) return beforePipe;
  }

  return raw;
}

function extractQr(obj: any): string | null {
  if (!obj) return null;
  const normalized = normalizeQrString(obj);
  if (normalized) return normalized;

  const candidates = [
    obj.qrcode, obj.qr, obj.base64, obj.code, obj.QRCode, obj.qr_code,
    obj?.qrcode?.base64, obj?.qrcode?.code,
    obj?.data?.qrcode, obj?.data?.qr, obj?.data?.base64, obj?.data?.QRCode, obj?.data?.code,
    obj?.data?.qrcode?.base64, obj?.data?.qrcode?.code,
    obj?.instance?.qrcode, obj?.instance?.qr,
  ];
  for (const c of candidates) {
    const found = extractQr(c);
    if (found) return found;
  }
  return null;
}

// Events that the platform-evolution-webhook function handles (v2.3.7 names).
const WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "SEND_MESSAGE",
];

// Evolution API v2.3.7: webhook is configured per-instance via
//   POST /webhook/set/{instanceName}  body { webhook: { enabled, url, events } }
// Instances are addressed by instanceName (the `name` column), NOT the uuid.
async function configureWebhook(
  config: EvolutionConfig,
  instanceName: string,
  instanceToken: string | null | undefined,
  webhookUrl: string,
): Promise<{ ok: boolean; error?: string; status?: number; response?: any }> {
  if (!instanceName) {
    return { ok: false, error: "Nome da instância ausente." };
  }
  if (!instanceToken) {
    return {
      ok: false,
      error:
        "Token da instância ausente. Clique em 'Sincronizar do servidor' para reimportar o token desta instância.",
    };
  }

  console.log(
    `[configureWebhook] name=${instanceName} apikey=${maskKey(instanceToken)} (instance token)`,
  );

  const res = await evoFetch(
    config,
    `/webhook/set/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          events: WEBHOOK_EVENTS,
        },
      }),
    },
    instanceToken,
  );

  console.log(
    `[configureWebhook] name=${instanceName} status=${res.status} ok=${res.ok}`,
    typeof res.body === "string" ? res.body.slice(0, 200) : res.body,
  );

  if (res.ok) {
    return { ok: true, status: res.status, response: res.body };
  }

  return {
    ok: false,
    status: res.status,
    error: res.message || `Falha ao configurar webhook (status ${res.status}).`,
    response: res.body,
  };
}

function parseInstanceFromList(item: any) {
  const name: string = item?.name || item?.instanceName || item?.instance?.instanceName;
  const uuid: string | null = item?.id ?? item?.instanceId ?? item?.instance?.id ?? null;
  const token = item?.token ?? item?.apikey ?? item?.hash?.apikey ?? null;
  const jid: string | null = item?.ownerJid ?? item?.jid ?? item?.owner ?? null;
  const phoneRaw = jid
    ? String(jid).split("@")[0].split(":")[0]
    : (item?.number ?? item?.phoneNumber ?? null);
  const phone = phoneRaw ? String(phoneRaw).replace(/\D/g, "") : null;
  const qrcode = extractQr(item?.qrcode ?? item?.qr ?? item);
  const connected =
    item?.connected === true ||
    item?.connectionStatus === "open" ||
    item?.state === "open" ||
    item?.status === "open" ||
    item?.instance?.state === "open";
  const status = connected
    ? "connected"
    : (qrcode && String(qrcode).length > 10 ? "qr_pending" : "disconnected");
  return { name, uuid, token, phone, qrcode, connected, status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = req.method === "POST" || req.method === "PUT" || req.method === "PATCH"
      ? await req.json().catch(() => ({}))
      : {};

    // ---- Auth: super_admin (todas as actions da plataforma) ----
    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      serviceRoleKey,
      body,
    );
    if (errorResponse) return errorResponse;
    const actorUserId = user!.id;

    const action = body.action || new URL(req.url).searchParams.get("action");

    // ---- TEST_CONNECTION ----
    if (action === "test_connection") {
      const url = String(body.url || "").replace(/\/$/, "");
      const globalApiKey = String(body.globalApiKey || "");
      if (!url || !globalApiKey) {
        return new Response(JSON.stringify({ error: "Missing url or globalApiKey" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cfg = { url, globalApiKey };
      const res = await evoFetch(cfg, "/instance/fetchInstances", { method: "GET" });

      if (res.ok) {
        return new Response(
          JSON.stringify({ ok: true, status: res.status, message: "Conexão estabelecida com sucesso!", data: res.body }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (res.status === 401 || res.status === 403) {
        return new Response(
          JSON.stringify({ ok: false, status: res.status, message: "Servidor acessível, mas a Global API Key foi rejeitada." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ ok: false, status: res.status, message: res.message || `Erro ${res.status} ao conectar.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // For all other actions, load global platform config
    const config = await getPlatformConfig(supabase);
    if (!config) {
      return new Response(
        JSON.stringify({ error: "Servidor Evolution Go ainda não foi configurado pelo administrador da plataforma." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- CREATE INSTANCE (self-service da plataforma; operador = ILIMITADO) ----
    // Porte de create_instance_self SEM gate de plano e SEM prefixo de org.
    if (action === "create_instance_self" || action === "create_instance") {
      const rawName = String(body.name || "").trim().toLowerCase();

      // Sanitiza: somente letras minúsculas, números e hífens; 3-40 chars
      if (!/^[a-z0-9-]{3,40}$/.test(rawName)) {
        return new Response(JSON.stringify({
          error: "Nome inválido. Use apenas letras minúsculas, números e hífens (3 a 40 caracteres).",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const finalName = rawName.slice(0, 50);

      // Verifica se já existe localmente uma instância com esse nome
      const { data: dup } = await supabase
        .from("platform_crm_evolution_instances")
        .select("id")
        .eq("name", finalName)
        .maybeSingle();
      if (dup) {
        return new Response(JSON.stringify({
          error: "Já existe uma conexão com esse nome. Escolha outro.",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Primeira conexão da plataforma vira default.
      const { count: currentCount } = await supabase
        .from("platform_crm_evolution_instances")
        .select("id", { count: "exact", head: true });

      const generatedToken = crypto.randomUUID();
      console.log(`[create_instance_self] -> POST /instance/create instanceName="${finalName}" token=${maskKey(generatedToken)}`);
      const createRes = await evoFetch(config, "/instance/create", {
        method: "POST",
        // v2.3.7: create exige { instanceName, integration, token }.
        body: JSON.stringify({
          instanceName: finalName,
          integration: "WHATSAPP-BAILEYS",
          token: generatedToken,
        }),
      });
      console.log(
        `[create_instance_self] <- status=${createRes.status} ok=${createRes.ok}`,
        typeof createRes.body === "string" ? createRes.body.slice(0, 300) : createRes.body,
      );

      if (!createRes.ok) {
        return new Response(JSON.stringify({
          ok: false,
          error: createRes.message || `Falha ao criar instância (status ${createRes.status})`,
          response: createRes.body,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // v2.3.7 responds: { instance: { instanceId, status, ... }, hash: "<apikey>" }
      const created = createRes.body?.instance ?? createRes.body?.data ?? createRes.body ?? {};
      const uuid = created?.instanceId ?? created?.id ?? created?.uuid ?? null;
      const instanceToken =
        (typeof createRes.body?.hash === "string" ? createRes.body.hash : null) ??
        createRes.body?.hash?.apikey ??
        created?.token ?? created?.apikey ?? generatedToken;

      if (!uuid) {
        return new Response(JSON.stringify({
          ok: false,
          error: "Servidor criou a instância mas não retornou UUID.",
          response: createRes.body,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: inserted, error: insErr } = await supabase
        .from("platform_crm_evolution_instances")
        .insert({
          name: finalName,
          instance_id: uuid || finalName,
          instance_token: instanceToken,
          status: "disconnected",
          is_default: (currentCount ?? 0) === 0,
          metadata: {
            instance_uuid: uuid,
            instance_name: finalName,
            display_name: rawName,
            created_via: "platform_self_service",
            remote: createRes.body,
          },
        })
        .select()
        .single();

      if (insErr) {
        return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Configura webhook (best-effort) — v2.3.7 endereça por instanceName
      const webhookUrl = `${supabaseUrl}/functions/v1/platform-evolution-webhook`;
      const wh = await configureWebhook(config, finalName, instanceToken, webhookUrl);
      await supabase
        .from("platform_crm_evolution_instances")
        .update({
          webhook_subscribed: wh.ok,
          metadata: {
            ...((inserted.metadata as any) || {}),
            webhook_error: wh.ok ? null : wh.error,
            webhook_last_attempt_at: new Date().toISOString(),
          },
        })
        .eq("id", inserted.id);

      return new Response(JSON.stringify({ ok: true, instance: inserted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- RENAME INSTANCE (display_name local; Evolution Go não suporta rename) ----
    if (action === "rename_instance_self") {
      const id = String(body.id || "");
      const rawName = String(body.name || "").trim();
      if (!id || !rawName) {
        return new Response(JSON.stringify({ error: "Parâmetros inválidos." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (rawName.length < 2 || rawName.length > 60) {
        return new Response(JSON.stringify({ error: "Nome deve ter entre 2 e 60 caracteres." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await supabase
        .from("platform_crm_evolution_instances")
        .select("metadata")
        .eq("id", id)
        .maybeSingle();
      if (!inst) {
        return new Response(JSON.stringify({ error: "Instância não encontrada." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newMeta = { ...((inst.metadata as any) || {}), display_name: rawName };
      const { error } = await supabase
        .from("platform_crm_evolution_instances")
        .update({ metadata: newMeta })
        .eq("id", id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- DELETE INSTANCE ----
    if (action === "delete_instance" || action === "delete_instance_self") {
      const id = String(body.id || "");
      const { data: inst } = await supabase
        .from("platform_crm_evolution_instances")
        .select("name, instance_token, metadata")
        .eq("id", id)
        .maybeSingle();
      if (!inst) {
        return new Response(JSON.stringify({ error: "Instância não encontrada." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // v2.3.7: DELETE /instance/delete/{instanceName}
      const instanceName = inst.name || (inst.metadata as any)?.instance_name;
      const instTokenDel = (inst as any).instance_token || (inst.metadata as any)?.instance_token || null;
      if (instanceName) {
        await evoFetch(
          config,
          `/instance/delete/${encodeURIComponent(instanceName)}`,
          { method: "DELETE" },
          instTokenDel || undefined,
        ).catch(() => null);
      }

      const { error } = await supabase.from("platform_crm_evolution_instances").delete().eq("id", id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- CONNECT INSTANCE (returns QR code) ----
    if (action === "connect_instance") {
      const id = String(body.id || "");
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing instance id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: inst, error: instErr } = await supabase
        .from("platform_crm_evolution_instances")
        .select("id, name, instance_id, instance_token, metadata")
        .eq("id", id)
        .maybeSingle();
      if (instErr || !inst) {
        return new Response(JSON.stringify({ error: instErr?.message || "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const meta: any = inst.metadata || {};
      // v2.3.7 addresses instances by instanceName (the `name` column), NOT the uuid.
      const instanceName: string | null = inst.name || meta.instance_name || null;
      const instanceToken = inst.instance_token || meta.instance_token || null;

      if (!instanceName || !instanceToken) {
        return new Response(JSON.stringify({ error: "Instância sem nome ou token. Sincronize do servidor." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // (1) Check current state via GET /instance/connectionState/{name}
      try {
        const info = await evoFetch(
          config,
          `/instance/connectionState/${encodeURIComponent(instanceName)}`,
          { method: "GET" },
          instanceToken,
        );
        const state =
          info?.body?.instance?.state ??
          info?.body?.state ??
          info?.body?.connectionStatus ??
          null;
        if (info.ok && state === "open") {
          await supabase
            .from("platform_crm_evolution_instances")
            .update({
              status: "connected",
              qr_code: null,
              qr_code_updated_at: null,
              last_connected_at: new Date().toISOString(),
            })
            .eq("id", inst.id);
          return new Response(
            JSON.stringify({ ok: true, qr_code: null, already_connected: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (e) {
        console.warn(`[connect_instance] state check failed (continuing): ${e}`);
      }

      // Clear stale QR locally before asking the server for a new one.
      await supabase
        .from("platform_crm_evolution_instances")
        .update({
          status: "qr_pending",
          qr_code: null,
          qr_code_updated_at: null,
        })
        .eq("id", inst.id);

      // Connect — v2.3.7: GET /instance/connect/{name} returns
      //   { pairingCode, code: "2@...", base64: "data:image/png;base64,..." }
      const res = await evoFetch(
        config,
        `/instance/connect/${encodeURIComponent(instanceName)}`,
        { method: "GET" },
        instanceToken,
      );

      if (!res.ok) {
        return new Response(JSON.stringify({ ok: false, error: res.message || `Erro ${res.status}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let qrString = extractQr(res.body);

      // If QR not inline, poll connect again up to ~6s.
      if (!qrString) {
        for (let i = 0; i < 4; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          try {
            const info = await evoFetch(
              config,
              `/instance/connect/${encodeURIComponent(instanceName)}`,
              { method: "GET" },
              instanceToken,
            );
            const found = extractQr(info?.body);
            if (found) {
              qrString = found;
              break;
            }
          } catch (e) {
            console.warn(`[connect_instance] poll connect error: ${e}`);
          }
        }
      }

      if (qrString) {
        await supabase
          .from("platform_crm_evolution_instances")
          .update({
            status: "qr_pending",
            qr_code: qrString,
            qr_code_updated_at: new Date().toISOString(),
            webhook_subscribed: true,
          })
          .eq("id", inst.id);
      } else {
        await supabase
          .from("platform_crm_evolution_instances")
          .update({ webhook_subscribed: true })
          .eq("id", inst.id);
      }

      return new Response(JSON.stringify({ ok: true, qr_code: qrString, response: res.body }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- SYNC INSTANCES (GET /instance/fetchInstances -> upsert por instance_id/name) ----
    if (action === "sync_instances") {
      const res = await evoFetch(config, "/instance/fetchInstances", { method: "GET" });
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: res.message || `Erro ${res.status} ao listar instâncias` }),
          { status: res.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const list: any[] = Array.isArray(res.body)
        ? res.body
        : (res.body?.data ?? res.body?.instances ?? []);

      const webhookUrl = `${supabaseUrl}/functions/v1/platform-evolution-webhook`;
      let imported = 0;
      let updated = 0;
      let webhooksOk = 0;
      let webhooksFailed = 0;
      const results: any[] = [];

      for (const item of list) {
        const parsed = parseInstanceFromList(item);
        if (!parsed.name) continue;

        let webhookRes: { ok: boolean; error?: string; status?: number; response?: any };
        if (!parsed.token) {
          webhookRes = { ok: false, error: "Servidor não retornou token da instância." };
        } else {
          // v2.3.7 addresses by instanceName (parsed.name).
          webhookRes = await configureWebhook(config, parsed.name, parsed.token, webhookUrl);
        }
        if (webhookRes.ok) webhooksOk++; else webhooksFailed++;

        // Match por instance_id (UUID) OU name (plataforma inteira).
        const { data: existing } = await supabase
          .from("platform_crm_evolution_instances")
          .select("id")
          .or(`instance_id.eq.${parsed.uuid || parsed.name},name.eq.${parsed.name}`)
          .maybeSingle();

        const baseRow: any = {
          instance_id: parsed.uuid || parsed.name,
          instance_token: parsed.token,
          phone_number: parsed.phone,
          status: parsed.status,
          qr_code: parsed.connected ? null : parsed.qrcode,
          qr_code_updated_at: !parsed.connected && parsed.qrcode ? new Date().toISOString() : null,
          last_connected_at: parsed.connected ? new Date().toISOString() : null,
          webhook_subscribed: webhookRes.ok,
          metadata: {
            synced_from: "evolution_go",
            instance_uuid: parsed.uuid,
            instance_name: parsed.name,
            remote: item,
            webhook_error: webhookRes.ok ? null : webhookRes.error,
            webhook_last_attempt_at: new Date().toISOString(),
          },
        };

        if (existing) {
          const { error: updErr } = await supabase
            .from("platform_crm_evolution_instances")
            .update(baseRow)
            .eq("id", existing.id);
          if (!updErr) updated++;
          results.push({ name: parsed.name, action: "updated", webhook: webhookRes.ok, error: updErr?.message });
        } else {
          const { error: insErr } = await supabase
            .from("platform_crm_evolution_instances")
            .insert({
              name: parsed.name,
              ...baseRow,
              is_default: false,
            });
          if (!insErr) imported++;
          results.push({ name: parsed.name, action: "imported", webhook: webhookRes.ok, error: insErr?.message });
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          imported,
          updated,
          total: list.length,
          webhooks: { ok: webhooksOk, failed: webhooksFailed },
          results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- SUBSCRIBE WEBHOOK (single instance) ----
    if (action === "subscribe_webhook") {
      const id = String(body.id || "");
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing instance id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: inst, error: instErr } = await supabase
        .from("platform_crm_evolution_instances")
        .select("id, name, instance_id, instance_token, metadata")
        .eq("id", id)
        .maybeSingle();
      if (instErr || !inst) {
        return new Response(JSON.stringify({ error: instErr?.message || "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const webhookUrl = `${supabaseUrl}/functions/v1/platform-evolution-webhook`;
      const meta: any = inst.metadata || {};
      // v2.3.7 addresses by instanceName (the `name` column).
      const instanceName: string | null = inst.name || meta.instance_name || null;
      const instanceToken = inst.instance_token || meta.instance_token || null;

      if (!instanceName || !instanceToken) {
        return new Response(JSON.stringify({ ok: false, error: "Instância sem nome/token. Solicite sincronização." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const webhookRes = await configureWebhook(config, instanceName, instanceToken, webhookUrl);
      await supabase
        .from("platform_crm_evolution_instances")
        .update({
          webhook_subscribed: webhookRes.ok,
          metadata: {
            ...meta,
            webhook_error: webhookRes.ok ? null : webhookRes.error,
            webhook_last_attempt_at: new Date().toISOString(),
          },
        })
        .eq("id", inst.id);

      if (!webhookRes.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: webhookRes.error, status: webhookRes.status }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true, message: "Webhook configurado com sucesso" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- SET DEFAULT ----
    if (action === "set_default") {
      const id = String(body.id || "");
      const { data: inst } = await supabase
        .from("platform_crm_evolution_instances")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sem organization_id: default é global (índice único parcial garante 1).
      await supabase
        .from("platform_crm_evolution_instances")
        .update({ is_default: false })
        .eq("is_default", true);
      const { error } = await supabase
        .from("platform_crm_evolution_instances")
        .update({ is_default: true })
        .eq("id", id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- DISCONNECT INSTANCE (pause session) ----
    // Evolution API v2.3.7 has no "disconnect that keeps pairing" endpoint; the
    // only server-side unlink is DELETE /instance/logout/{instanceName}. We call
    // it and reflect "disconnected" locally. (Reconnect will require a new QR.)
    if (action === "disconnect_instance") {
      const id = String(body.id || "");
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing instance id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: inst, error: instErr } = await supabase
        .from("platform_crm_evolution_instances")
        .select("id, name, instance_id, instance_token, metadata")
        .eq("id", id)
        .maybeSingle();
      if (instErr || !inst) {
        return new Response(JSON.stringify({ error: instErr?.message || "Instance not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const meta: any = inst.metadata || {};
      const instanceName: string | null = inst.name || meta.instance_name || null;
      const instanceToken = inst.instance_token || meta.instance_token || null;
      if (!instanceName || !instanceToken) {
        return new Response(JSON.stringify({ ok: false, error: "Instância sem nome/token. Solicite sincronização." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await evoFetch(
        config,
        `/instance/logout/${encodeURIComponent(instanceName)}`,
        { method: "DELETE" },
        instanceToken,
      );
      console.log(`[disconnect_instance] name=${instanceName} status=${res.status} ok=${res.ok}`);

      await supabase
        .from("platform_crm_evolution_instances")
        .update({
          status: "disconnected",
          qr_code: null,
          qr_code_updated_at: null,
        })
        .eq("id", inst.id);

      if (!res.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: res.message || `Erro ${res.status} ao pausar sessão` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- LOGOUT INSTANCE (remove pairing, requires new QR) ----
    if (action === "logout_instance") {
      const id = String(body.id || "");
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing instance id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: inst, error: instErr } = await supabase
        .from("platform_crm_evolution_instances")
        .select("id, name, instance_id, instance_token, metadata")
        .eq("id", id)
        .maybeSingle();
      if (instErr || !inst) {
        return new Response(JSON.stringify({ error: instErr?.message || "Instance not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const meta: any = inst.metadata || {};
      const instanceName: string | null = inst.name || meta.instance_name || null;
      const instanceToken = inst.instance_token || meta.instance_token || null;
      if (!instanceName || !instanceToken) {
        return new Response(JSON.stringify({ ok: false, error: "Instância sem nome/token. Solicite sincronização." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // v2.3.7: DELETE /instance/logout/{instanceName}
      const res = await evoFetch(
        config,
        `/instance/logout/${encodeURIComponent(instanceName)}`,
        { method: "DELETE" },
        instanceToken,
      );
      console.log(`[logout_instance] name=${instanceName} status=${res.status} ok=${res.ok}`);

      await supabase
        .from("platform_crm_evolution_instances")
        .update({
          status: "disconnected",
          phone_number: null,
          qr_code: null,
          qr_code_updated_at: null,
          last_connected_at: null,
        })
        .eq("id", inst.id);

      if (!res.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: res.message || `Erro ${res.status} ao desvincular` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // actorUserId reservado p/ auditoria futura (evita unused var em lint estrito).
    void actorUserId;

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("platform-evolution-proxy error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
