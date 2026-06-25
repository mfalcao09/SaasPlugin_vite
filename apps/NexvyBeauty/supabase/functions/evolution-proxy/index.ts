import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EvolutionConfig {
  url: string;
  globalApiKey: string;
}

/**
 * Reads the GLOBAL Evolution Go config from `platform_settings`.
 * This is the single source of truth — no longer per-organization.
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
  instanceToken?: string
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

  // Evolution Go may return "data:image/png;base64,...|2@raw-pairing".
  // The QR must encode only the raw pairing string; storing the combined value
  // creates a QR that looks valid visually but WhatsApp rejects it.
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

// Events that the evolution-webhook function actually handles (v2.3.7 names).
// Keep in sync with evolution-webhook/index.ts normalizePayload().
const WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
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
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    // Check super admin role
    const { data: superAdminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    const isSuperAdmin = !!superAdminRow;

    const body = req.method === "POST" || req.method === "PUT" || req.method === "PATCH"
      ? await req.json().catch(() => ({}))
      : {};
    const action = body.action || new URL(req.url).searchParams.get("action");

    const requireSuperAdmin = () => {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Apenas o Super Admin da plataforma pode executar essa ação." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return null;
    };

    // ---- TEST_CONNECTION (super admin) ----
    if (action === "test_connection") {
      const denied = requireSuperAdmin();
      if (denied) return denied;
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
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (res.status === 401 || res.status === 403) {
        return new Response(
          JSON.stringify({ ok: false, status: res.status, message: "Servidor acessível, mas a Global API Key foi rejeitada." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ ok: false, status: res.status, message: res.message || `Erro ${res.status} ao conectar.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For all other actions, load global platform config
    const config = await getPlatformConfig(supabase);
    if (!config) {
      return new Response(
        JSON.stringify({ error: "Servidor Evolution Go ainda não foi configurado pelo administrador da plataforma." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- CREATE INSTANCE (super admin only) ----
    if (action === "create_instance") {
      const denied = requireSuperAdmin();
      if (denied) return denied;
      const name = String(body.name || "").trim();
      const targetOrgId = String(body.organization_id || "").trim();
      if (!name || !targetOrgId) {
        return new Response(JSON.stringify({ error: "Missing name or organization_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Evolution API v2.3.7 requires { instanceName, integration, token }.
      // We generate a token as a fallback; the server returns the real instance
      // apikey in `body.hash` (top-level string).
      const generatedToken = crypto.randomUUID();
      console.log(`[create_instance] -> POST /instance/create instanceName="${name}" org=${targetOrgId} token=${maskKey(generatedToken)}`);
      const createRes = await evoFetch(config, "/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName: name,
          integration: "WHATSAPP-BAILEYS",
          token: generatedToken,
        }),
      });
      console.log(
        `[create_instance] <- status=${createRes.status} ok=${createRes.ok}`,
        typeof createRes.body === "string" ? createRes.body.slice(0, 300) : createRes.body,
      );
      if (!createRes.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: createRes.message || `Falha ao criar instância (status ${createRes.status})`, response: createRes.body }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Evolution API v2.3.7 responds: { instance: { instanceId, status, ... }, hash: "<apikey>" }
      const created = createRes.body?.instance ?? createRes.body?.data ?? createRes.body ?? {};
      const uuid = created?.instanceId ?? created?.id ?? created?.uuid ?? null;
      const instanceToken =
        (typeof createRes.body?.hash === "string" ? createRes.body.hash : null) ??
        createRes.body?.hash?.apikey ??
        created?.token ?? created?.apikey ?? generatedToken;
      console.log(`[create_instance] parsed uuid=${uuid} token=${maskKey(instanceToken)}`);

      if (!uuid) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Servidor criou a instância mas não retornou UUID. Verifique a versão do Evolution API.",
            response: createRes.body,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Persist in DB linked to the chosen organization
      const { data: inserted, error: insErr } = await supabase
        .from("evolution_instances")
        .insert({
          organization_id: targetOrgId,
          name,
          instance_id: uuid || name,
          instance_token: instanceToken,
          status: "disconnected",
          is_default: false,
          created_by_super_admin: true,
          metadata: {
            instance_uuid: uuid,
            instance_name: name,
            created_via: "super_admin",
            remote: createRes.body,
          },
        })
        .select()
        .single();

      if (insErr) {
        return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Best-effort: configure webhook now (v2.3.7 addresses by instanceName)
      if (instanceToken) {
        const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
        const wh = await configureWebhook(config, name, instanceToken, webhookUrl);
        await supabase
          .from("evolution_instances")
          .update({
            webhook_subscribed: wh.ok,
            metadata: {
              ...((inserted.metadata as any) || {}),
              webhook_error: wh.ok ? null : wh.error,
              webhook_last_attempt_at: new Date().toISOString(),
            },
          })
          .eq("id", inserted.id);
      }

      return new Response(JSON.stringify({ ok: true, instance: inserted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- CREATE INSTANCE SELF-SERVICE (admin/manager da org) ----
    // Cliente cria instância para a própria empresa, respeitando o limite do plano.
    if (action === "create_instance_self") {
      // Authorization: precisa ser admin ou manager da organização
      if (!profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Usuário sem empresa vinculada." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: hasAdmin } = await supabase.rpc("has_role", {
        _user_id: user.id, _role: "admin",
      });
      const { data: hasManager } = await supabase.rpc("has_role", {
        _user_id: user.id, _role: "manager",
      });
      if (!isSuperAdmin && !hasAdmin && !hasManager) {
        return new Response(JSON.stringify({ error: "Apenas administradores ou gerentes podem criar conexões." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const orgId = profile.organization_id;
      const rawName = String(body.name || "").trim().toLowerCase();

      // Sanitiza: somente letras minúsculas, números e hífens; 3-40 chars
      if (!/^[a-z0-9-]{3,40}$/.test(rawName)) {
        return new Response(JSON.stringify({
          error: "Nome inválido. Use apenas letras minúsculas, números e hífens (3 a 40 caracteres).",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Verifica limites efetivos
      const { data: limitsData, error: limitsErr } = await supabase.rpc("get_organization_effective_limits", {
        p_org_id: orgId,
      });
      if (limitsErr) {
        return new Response(JSON.stringify({ error: "Falha ao carregar limites do plano: " + limitsErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const maxConnections: number = (limitsData as any)?.limits?.max_connections ?? 1;

      const { count: currentCount } = await supabase
        .from("evolution_instances")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId);

      if ((currentCount ?? 0) >= maxConnections) {
        return new Response(JSON.stringify({
          ok: false,
          error: `Limite de ${maxConnections} conexão(ões) do seu plano atingido. Faça upgrade para criar mais.`,
          limit_reached: true,
          current: currentCount,
          limit: maxConnections,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Busca slug da org para prefixar nome (evita colisão global no Evolution Go)
      const { data: orgRow } = await supabase
        .from("organizations")
        .select("slug, name")
        .eq("id", orgId)
        .maybeSingle();
      const orgSlug = (orgRow?.slug || (orgRow?.name || "org")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 20)) || "org";
      const finalName = `${orgSlug}-${rawName}`.slice(0, 50);

      // Verifica se já existe localmente uma instância com esse nome
      const { data: dup } = await supabase
        .from("evolution_instances")
        .select("id")
        .eq("name", finalName)
        .maybeSingle();
      if (dup) {
        return new Response(JSON.stringify({
          error: "Já existe uma conexão com esse nome. Escolha outro.",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const generatedToken = crypto.randomUUID();
      console.log(`[create_instance_self] -> POST /instance/create instanceName="${finalName}" org=${orgId} token=${maskKey(generatedToken)}`);
      const createRes = await evoFetch(config, "/instance/create", {
        method: "POST",
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

      // v2.3.7: { instance: { instanceId, status }, hash: "<apikey>" }
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
        .from("evolution_instances")
        .insert({
          organization_id: orgId,
          name: finalName,
          instance_id: uuid || finalName,
          instance_token: instanceToken,
          status: "disconnected",
          is_default: (currentCount ?? 0) === 0, // primeira da empresa = padrão
          created_by_super_admin: false,
          metadata: {
            instance_uuid: uuid,
            instance_name: finalName,
            // Nome de exibição = nome do salão (org). 1ª instância = só o nome do salão;
            // adicionais ganham o sufixo técnico pra não colidir na UI.
            display_name: (currentCount ?? 0) === 0
              ? (orgRow?.name || rawName)
              : `${orgRow?.name || orgSlug} · ${rawName}`,
            created_via: "self_service",
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
      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
      const wh = await configureWebhook(config, finalName, instanceToken, webhookUrl);
      await supabase
        .from("evolution_instances")
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

    // ---- RENAME INSTANCE (org admin/manager OR super admin) ----
    // Apenas atualiza o display_name local (Evolution Go não suporta rename).
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
        .from("evolution_instances")
        .select("organization_id, metadata")
        .eq("id", id)
        .maybeSingle();
      if (!inst) {
        return new Response(JSON.stringify({ error: "Instância não encontrada." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Sem permissão." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newMeta = { ...((inst.metadata as any) || {}), display_name: rawName };
      const { error } = await supabase
        .from("evolution_instances")
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

    // ---- DELETE INSTANCE SELF (org admin/manager) ----
    // Mesma lógica de delete_instance, mas escopada à organização do usuário.
    if (action === "delete_instance_self") {
      if (!profile?.organization_id && !isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Usuário sem empresa vinculada." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      const { data: hasManager } = await supabase.rpc("has_role", { _user_id: user.id, _role: "manager" });
      if (!isSuperAdmin && !hasAdmin && !hasManager) {
        return new Response(JSON.stringify({ error: "Apenas administradores ou gerentes podem excluir conexões." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const id = String(body.id || "");
      const { data: inst } = await supabase
        .from("evolution_instances")
        .select("organization_id, name, instance_token, metadata")
        .eq("id", id)
        .maybeSingle();
      if (!inst) {
        return new Response(JSON.stringify({ error: "Instância não encontrada." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Sem permissão." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

      const { error } = await supabase.from("evolution_instances").delete().eq("id", id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- CONNECT INSTANCE (returns QR code) — admin/manager of the org OR super admin ----
    if (action === "connect_instance") {
      const id = String(body.id || "");
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing instance id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: inst, error: instErr } = await supabase
        .from("evolution_instances")
        .select("id, name, instance_id, instance_token, organization_id, metadata")
        .eq("id", id)
        .maybeSingle();
      if (instErr || !inst) {
        return new Response(JSON.stringify({ error: instErr?.message || "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Authorization: must belong to org OR be super_admin
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const meta: any = inst.metadata || {};
      // v2.3.7 addresses instances by instanceName (the `name` column), NOT the uuid.
      const instanceName: string | null = inst.name || meta.instance_name || null;
      const instanceToken = inst.instance_token || meta.instance_token || null;

      if (!instanceName || !instanceToken) {
        return new Response(JSON.stringify({ error: "Instância sem nome ou token. Solicite ao Super Admin para sincronizar do servidor." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Strategy:
      // 1) Check current connection state via GET /instance/connectionState/{name}.
      //    - state "open" => already connected, just sync DB and return.
      // 2) Otherwise GET /instance/connect/{name} to fetch the QR (base64 + code).
      // Never force logout here: it invalidates the active QR/session cycle and
      // makes the panel show a QR that WhatsApp no longer accepts.

      // (1) Check current state
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
            .from("evolution_instances")
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
        .from("evolution_instances")
        .update({
          status: "qr_pending",
          qr_code: null,
          qr_code_updated_at: null,
        })
        .eq("id", inst.id);

      // Connect — v2.3.7: GET /instance/connect/{name} returns
      //   { pairingCode, code: "2@...", base64: "data:image/png;base64,..." }
      // We prefer base64 (image) and fall back to the raw pairing `code` string.
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

      // If QR not inline, poll connect again up to ~6s — the server may need a
      // moment to generate the pairing payload after the first call.
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
          .from("evolution_instances")
          .update({
            status: "qr_pending",
            qr_code: qrString,
            qr_code_updated_at: new Date().toISOString(),
            webhook_subscribed: true,
          })
          .eq("id", inst.id);
      } else {
        await supabase
          .from("evolution_instances")
          .update({ webhook_subscribed: true })
          .eq("id", inst.id);
      }

      return new Response(JSON.stringify({ ok: true, qr_code: qrString, response: res.body }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- SYNC INSTANCES (super admin only) ----
    // Optionally pass organization_id to restrict assignment of new ones
    if (action === "sync_instances") {
      const denied = requireSuperAdmin();
      if (denied) return denied;
      const targetOrgId = String(body.organization_id || "").trim() || null;

      const res = await evoFetch(config, "/instance/fetchInstances", { method: "GET" });
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: res.message || `Erro ${res.status} ao listar instâncias` }),
          { status: res.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const list: any[] = Array.isArray(res.body)
        ? res.body
        : (res.body?.data ?? res.body?.instances ?? []);

      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
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

        // Match by name across ALL orgs (super admin scope)
        const { data: existing } = await supabase
          .from("evolution_instances")
          .select("id, organization_id")
          .eq("name", parsed.name)
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
            .from("evolution_instances")
            .update(baseRow)
            .eq("id", existing.id);
          if (!updErr) updated++;
          results.push({ name: parsed.name, action: "updated", webhook: webhookRes.ok, error: updErr?.message });
        } else {
          // Insert as orphan (no organization) — super admin can attach later via assign_instance
          const { error: insErr } = await supabase
            .from("evolution_instances")
            .insert({
              organization_id: targetOrgId, // may be null
              name: parsed.name,
              ...baseRow,
              is_default: false,
              created_by_super_admin: true,
            });
          if (!insErr) imported++;
          results.push({
            name: parsed.name,
            action: targetOrgId ? "imported" : "imported_orphan",
            webhook: webhookRes.ok,
            error: insErr?.message,
          });
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
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- ASSIGN INSTANCE TO ORGANIZATION (super admin only) ----
    if (action === "assign_instance") {
      const denied = requireSuperAdmin();
      if (denied) return denied;
      const id = String(body.id || "");
      const orgId = body.organization_id ? String(body.organization_id) : null;
      if (!id) {
        return new Response(JSON.stringify({ error: "id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (orgId) {
        const { data: org } = await supabase
          .from("organizations")
          .select("id")
          .eq("id", orgId)
          .maybeSingle();
        if (!org) {
          return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      const { error: updErr } = await supabase
        .from("evolution_instances")
        .update({ organization_id: orgId, is_default: false })
        .eq("id", id);
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- SUBSCRIBE WEBHOOK (single instance) — super admin OR org admin ----
    if (action === "subscribe_webhook") {
      const id = String(body.id || "");
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing instance id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: inst, error: instErr } = await supabase
        .from("evolution_instances")
        .select("id, name, instance_id, instance_token, organization_id, metadata")
        .eq("id", id)
        .maybeSingle();
      if (instErr || !inst) {
        return new Response(JSON.stringify({ error: instErr?.message || "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
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
        .from("evolution_instances")
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
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true, message: "Webhook configurado com sucesso" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- DELETE INSTANCE (super admin only) ----
    if (action === "delete_instance") {
      const denied = requireSuperAdmin();
      if (denied) return denied;
      const id = String(body.id || "");

      // Try to delete on the Evolution server too (best-effort).
      // v2.3.7: DELETE /instance/delete/{instanceName}
      const { data: inst } = await supabase
        .from("evolution_instances")
        .select("name, instance_token, metadata")
        .eq("id", id)
        .maybeSingle();
      const instanceName = inst?.name || (inst?.metadata as any)?.instance_name;
      const instTokenDel = (inst as any)?.instance_token || (inst?.metadata as any)?.instance_token || null;
      if (instanceName) {
        await evoFetch(
          config,
          `/instance/delete/${encodeURIComponent(instanceName)}`,
          { method: "DELETE" },
          instTokenDel || undefined,
        ).catch(() => null);
      }

      const { error } = await supabase.from("evolution_instances").delete().eq("id", id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- SET DEFAULT (admin/manager of the org OR super admin) ----
    if (action === "set_default") {
      const id = String(body.id || "");
      const { data: inst } = await supabase
        .from("evolution_instances")
        .select("organization_id")
        .eq("id", id)
        .maybeSingle();
      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("evolution_instances")
        .update({ is_default: false })
        .eq("organization_id", inst.organization_id)
        .eq("is_default", true);
      const { error } = await supabase
        .from("evolution_instances")
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

    // ---- DISCONNECT INSTANCE (pause session) — admin/manager OR super admin ----
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
        .from("evolution_instances")
        .select("id, name, instance_id, instance_token, organization_id, metadata")
        .eq("id", id)
        .maybeSingle();
      if (instErr || !inst) {
        return new Response(JSON.stringify({ error: instErr?.message || "Instance not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

      // Even if Evolution returns non-2xx (e.g. already disconnected), reflect locally
      await supabase
        .from("evolution_instances")
        .update({
          status: "disconnected",
          qr_code: null,
          qr_code_updated_at: null,
        })
        .eq("id", inst.id);

      if (!res.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: res.message || `Erro ${res.status} ao pausar sessão` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- LOGOUT INSTANCE (remove pairing, requires new QR) — admin/manager OR super admin ----
    // Calls DELETE /instance/logout — fully unlinks the WhatsApp account from the instance.
    // The number disappears from "Aparelhos conectados" and a NEW QR is required to pair again
    // (same or different number).
    if (action === "logout_instance") {
      const id = String(body.id || "");
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing instance id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: inst, error: instErr } = await supabase
        .from("evolution_instances")
        .select("id, name, instance_id, instance_token, organization_id, metadata")
        .eq("id", id)
        .maybeSingle();
      if (instErr || !inst) {
        return new Response(JSON.stringify({ error: instErr?.message || "Instance not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

      // Always clear local pairing data — even if Evolution complained, the user wants it unlinked
      await supabase
        .from("evolution_instances")
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
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("evolution-proxy error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
