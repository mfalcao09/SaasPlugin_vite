/**
 * Actions do platform-whatsapp-qr-proxy quando whatsapp_qr_provider=zapi.
 * Mantém o contrato das actions da UI; por baixo chama Z-API.
 */

import {
  extractConnectedPhone,
  extractZapiQr,
  maskSecret,
  zapiDisconnect,
  zapiMe,
  zapiQrImage,
  zapiStatus,
  zapiUpdateEveryWebhooks,
  type ZapiConfig,
  type ZapiInstanceCreds,
} from "./zapi-client.ts";
import {
  buildZapiWebhookUrl,
  zapiCredsFromInstance,
  type PlatformQrProviderConfig,
} from "./platform-qr-provider.ts";

function json(body: unknown, status = 200, corsHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function bindAgents(
  supabase: any,
  agentIds: string[],
  instanceRowId: string,
) {
  if (agentIds.length === 0) return;
  const junctionRows = agentIds.map((agentId) => ({
    product_agent_id: agentId,
    connection_type: "evolution",
    connection_id: instanceRowId,
  }));
  const { error: junctionErr } = await supabase
    .from("platform_crm_agent_connections")
    .insert(junctionRows);
  if (junctionErr) {
    console.error("[zapi create] agent_connections insert error", junctionErr.message);
    return;
  }
  for (const agentId of agentIds) {
    const { data: evoLinks } = await supabase
      .from("platform_crm_agent_connections")
      .select("connection_id")
      .eq("product_agent_id", agentId)
      .eq("connection_type", "evolution")
      .order("created_at", { ascending: true })
      .limit(1);
    const firstEvo = evoLinks?.[0]?.connection_id ?? instanceRowId;
    await supabase
      .from("platform_crm_product_agents")
      .update({ wa_qr_instance_id: firstEvo })
      .eq("id", agentId);
  }
}

export async function handlePlatformZapiProxyAction(opts: {
  action: string;
  body: Record<string, any>;
  supabase: any;
  corsHeaders: HeadersInit;
  qrCfg: PlatformQrProviderConfig;
  supabaseUrl: string;
}): Promise<Response | null> {
  const { action, body, supabase, corsHeaders, qrCfg, supabaseUrl } = opts;
  if (!qrCfg.zapi) {
    return json({
      error: "Z-API não configurada (zapi_client_token ausente em platform_settings/env).",
    }, 400, corsHeaders);
  }
  const zapi: ZapiConfig = qrCfg.zapi;

  // ---- TEST_CONNECTION ----
  if (action === "test_connection") {
    const creds = qrCfg.bootstrap;
    if (!creds) {
      return json({
        ok: false,
        message: "Informe a instância bootstrap Z-API (id+token) nas settings.",
      }, 200, corsHeaders);
    }
    const res = await zapiStatus(zapi, creds);
    return json({
      ok: res.ok,
      status: res.status,
      message: res.ok ? "Conexão Z-API OK" : (res.message || "Falha"),
      data: res.body,
      provider: "zapi",
      instance: maskSecret(creds.instanceId),
    }, 200, corsHeaders);
  }

  // ---- CREATE: vincula a instância bootstrap (teste) — não cria cobrança nova ----
  if (action === "create_instance_self" || action === "create_instance") {
    if (!qrCfg.bootstrap) {
      return json({
        error: "Z-API bootstrap instance_id/token não configurados. Salve em platform_settings.",
      }, 400, corsHeaders);
    }
    const creds = qrCfg.bootstrap;
    const rawName = String(body.name || "").trim().toLowerCase();
    if (!/^[a-z0-9-]{3,40}$/.test(rawName)) {
      return json({
        error: "Nome inválido. Use apenas letras minúsculas, números e hífens (3 a 40 caracteres).",
      }, 400, corsHeaders);
    }
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const productIdRaw = body.product_id == null || body.product_id === ""
      ? null
      : String(body.product_id).trim();
    if (productIdRaw && !uuidRe.test(productIdRaw)) {
      return json({ error: "product_id inválido." }, 400, corsHeaders);
    }
    const productId = productIdRaw;
    const agentIdsRaw = Array.isArray(body.agent_ids) ? body.agent_ids : [];
    const agentIds = [...new Set(
      agentIdsRaw.map((x: unknown) => String(x || "").trim()).filter((id: string) => uuidRe.test(id)),
    )] as string[];

    const { data: dup } = await supabase
      .from("platform_crm_wa_qr_instances")
      .select("id")
      .eq("name", rawName)
      .maybeSingle();
    if (dup) {
      return json({ error: "Já existe uma conexão com esse nome. Escolha outro." }, 400, corsHeaders);
    }

    // Uma linha local por instância Z-API remota (evita duplicar o mesmo burner).
    const { data: existingRemote } = await supabase
      .from("platform_crm_wa_qr_instances")
      .select("id, name")
      .eq("instance_id", creds.instanceId)
      .maybeSingle();
    if (existingRemote) {
      return json({
        error: `Esta instância Z-API já está vinculada como "${existingRemote.name}".`,
      }, 400, corsHeaders);
    }

    const { count: currentCount } = await supabase
      .from("platform_crm_wa_qr_instances")
      .select("id", { count: "exact", head: true });

    const statusRes = await zapiStatus(zapi, creds);
    const alreadyConnected = Boolean(
      statusRes.ok && (statusRes.body as any)?.connected === true,
    );
    let phone: string | null = null;
    if (alreadyConnected) {
      phone = extractConnectedPhone(statusRes.body);
      if (!phone) {
        const me = await zapiMe(zapi, creds);
        phone = extractConnectedPhone(me.body);
      }
    }

    const webhookUrl = buildZapiWebhookUrl(supabaseUrl, creds);
    const wh = await zapiUpdateEveryWebhooks(zapi, creds, webhookUrl, true);
    console.log(
      `[zapi create] webhook ok=${wh.ok} status=${wh.status} iid=${maskSecret(creds.instanceId)}`,
    );

    const row = {
      name: rawName,
      instance_id: creds.instanceId,
      instance_token: creds.instanceToken,
      status: alreadyConnected ? "connected" : "disconnected",
      phone_number: phone,
      is_default: (currentCount ?? 0) === 0,
      webhook_subscribed: wh.ok,
      product_id: productId,
      last_connected_at: alreadyConnected ? new Date().toISOString() : null,
      metadata: {
        provider: "zapi",
        zapi_instance_id: creds.instanceId,
        webhook_error: wh.ok ? null : (wh.message || `status ${wh.status}`),
        webhook_last_attempt_at: new Date().toISOString(),
      },
    };

    const { data: inserted, error: insErr } = await supabase
      .from("platform_crm_wa_qr_instances")
      .insert(row)
      .select("*")
      .single();
    if (insErr) {
      return json({ error: insErr.message }, 500, corsHeaders);
    }
    await bindAgents(supabase, agentIds, inserted.id);
    return json({ ok: true, instance: inserted, provider: "zapi" }, 200, corsHeaders);
  }

  // Helpers for instance-scoped actions
  async function loadInst(id: string) {
    const { data, error } = await supabase
      .from("platform_crm_wa_qr_instances")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return { error: error?.message || "Instance not found" };
    return { inst: data };
  }

  function credsOf(inst: any): ZapiInstanceCreds | null {
    return zapiCredsFromInstance(inst);
  }

  if (action === "connect_instance") {
    const id = String(body.id || "");
    if (!id) return json({ error: "Missing instance id" }, 400, corsHeaders);
    const loaded = await loadInst(id);
    if ("error" in loaded) return json({ error: loaded.error }, 404, corsHeaders);
    const inst = loaded.inst;
    const creds = credsOf(inst);
    if (!creds) return json({ error: "Instância sem credenciais Z-API." }, 400, corsHeaders);

    const st = await zapiStatus(zapi, creds);
    if (st.ok && (st.body as any)?.connected === true) {
      let phone = extractConnectedPhone(st.body);
      if (!phone) {
        const me = await zapiMe(zapi, creds);
        phone = extractConnectedPhone(me.body);
      }
      await supabase.from("platform_crm_wa_qr_instances").update({
        status: "connected",
        qr_code: null,
        qr_code_updated_at: null,
        last_connected_at: new Date().toISOString(),
        ...(phone ? { phone_number: phone } : {}),
      }).eq("id", inst.id);
      return json({
        ok: true,
        qr_code: null,
        already_connected: true,
        phone_number: phone,
        provider: "zapi",
      }, 200, corsHeaders);
    }

    await supabase.from("platform_crm_wa_qr_instances").update({
      status: "qr_pending",
      qr_code: null,
      qr_code_updated_at: null,
    }).eq("id", inst.id);

    const qrRes = await zapiQrImage(zapi, creds);
    const qrString = extractZapiQr(qrRes.body);
    if (qrString) {
      await supabase.from("platform_crm_wa_qr_instances").update({
        status: "qr_pending",
        qr_code: qrString,
        qr_code_updated_at: new Date().toISOString(),
        webhook_subscribed: true,
      }).eq("id", inst.id);
    }
    return json({
      ok: qrRes.ok || !!qrString,
      qr_code: qrString,
      response: qrRes.body,
      provider: "zapi",
      error: qrString ? undefined : (qrRes.message || "QR indisponível"),
    }, 200, corsHeaders);
  }

  if (action === "subscribe_webhook") {
    const id = String(body.id || "");
    if (!id) return json({ error: "Missing instance id" }, 400, corsHeaders);
    const loaded = await loadInst(id);
    if ("error" in loaded) return json({ error: loaded.error }, 404, corsHeaders);
    const creds = credsOf(loaded.inst);
    if (!creds) return json({ error: "Sem credenciais Z-API" }, 400, corsHeaders);
    const webhookUrl = buildZapiWebhookUrl(supabaseUrl, creds);
    const wh = await zapiUpdateEveryWebhooks(zapi, creds, webhookUrl, true);
    await supabase.from("platform_crm_wa_qr_instances").update({
      webhook_subscribed: wh.ok,
      metadata: {
        ...(loaded.inst.metadata || {}),
        provider: "zapi",
        webhook_error: wh.ok ? null : (wh.message || null),
        webhook_last_attempt_at: new Date().toISOString(),
      },
    }).eq("id", loaded.inst.id);
    return json({ ok: wh.ok, error: wh.message, provider: "zapi" }, 200, corsHeaders);
  }

  if (action === "disconnect_instance" || action === "logout_instance") {
    const id = String(body.id || "");
    if (!id) return json({ error: "Missing instance id" }, 400, corsHeaders);
    const loaded = await loadInst(id);
    if ("error" in loaded) return json({ error: loaded.error }, 404, corsHeaders);
    const creds = credsOf(loaded.inst);
    if (creds) await zapiDisconnect(zapi, creds);
    const updates: Record<string, unknown> = {
      status: "disconnected",
      qr_code: null,
      qr_code_updated_at: null,
    };
    if (action === "logout_instance") {
      updates.phone_number = null;
    }
    await supabase.from("platform_crm_wa_qr_instances").update(updates).eq("id", loaded.inst.id);
    return json({ ok: true, provider: "zapi" }, 200, corsHeaders);
  }

  if (action === "delete_instance" || action === "delete_instance_self") {
    const id = String(body.id || "");
    if (!id) return json({ error: "Missing instance id" }, 400, corsHeaders);
    const loaded = await loadInst(id);
    if ("error" in loaded) return json({ error: loaded.error }, 404, corsHeaders);
    const creds = credsOf(loaded.inst);
    // Teste: não cancela assinatura Z-API (evita cobrança/side-effect). Só desconecta + apaga local.
    if (creds) {
      try {
        await zapiDisconnect(zapi, creds);
      } catch { /* ignore */ }
    }
    const { error } = await supabase.from("platform_crm_wa_qr_instances").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500, corsHeaders);
    return json({ ok: true, provider: "zapi" }, 200, corsHeaders);
  }

  if (action === "rename_instance_self") {
    const id = String(body.id || "");
    const rawName = String(body.name || "").trim().toLowerCase();
    if (!id || !/^[a-z0-9-]{3,40}$/.test(rawName)) {
      return json({ error: "id/nome inválidos" }, 400, corsHeaders);
    }
    const { error } = await supabase
      .from("platform_crm_wa_qr_instances")
      .update({ name: rawName })
      .eq("id", id);
    if (error) return json({ error: error.message }, 500, corsHeaders);
    return json({ ok: true, provider: "zapi" }, 200, corsHeaders);
  }

  if (action === "set_default") {
    const id = String(body.id || "");
    if (!id) return json({ error: "Missing instance id" }, 400, corsHeaders);
    await supabase.from("platform_crm_wa_qr_instances").update({ is_default: false }).neq("id", id);
    const { error } = await supabase
      .from("platform_crm_wa_qr_instances")
      .update({ is_default: true })
      .eq("id", id);
    if (error) return json({ error: error.message }, 500, corsHeaders);
    return json({ ok: true, provider: "zapi" }, 200, corsHeaders);
  }

  if (action === "sync_instances") {
    // Sem listagem partner neste teste — devolve o que já está no banco.
    const { data } = await supabase.from("platform_crm_wa_qr_instances").select("id, name, status, instance_id");
    return json({
      ok: true,
      results: (data ?? []).map((r: any) => ({ name: r.name, action: "local", provider: "zapi" })),
      provider: "zapi",
    }, 200, corsHeaders);
  }

  return null; // action não tratada
}
