// Edge Function: evolution-proxy (v3)
// Deployed em: project gpxmkximudukbljrvtxj (NexvyOficinas)
// verify_jwt: true (chamado pelo frontend autenticado)
//
// Actions (via ?action=... ou body.action):
// - list           (GET)    — lista instâncias da empresa
// - create         (POST)   — cria instância + registra webhook
// - qrcode         (POST)   — gera QR code
// - status         (POST)   — sincroniza status com Evolution
// - logout         (POST)   — desconecta WhatsApp (mantém instance)
// - restart        (POST)   — reinicia instance
// - set_default    (POST)   — marca como padrão (zera as outras da empresa)
// - delete         (POST)   — remove na Evolution + no DB

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVO_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/$/, "");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ?? EVO_KEY;

async function evoCall(
  path: string,
  method = "GET",
  body?: unknown,
  instanceToken?: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${EVO_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: instanceToken || EVO_KEY,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: eu } = await supabase
      .from("empresa_users").select("empresa_id").eq("user_id", user.id).single();
    const empresaId = eu?.empresa_id;
    if (!empresaId) {
      return new Response(JSON.stringify({ error: "No empresa found for user" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};
    const actionFromBody = (body as { action?: string })?.action;
    const finalAction = action ?? actionFromBody;

    // ── list ──
    if (finalAction === "list" || (!finalAction && req.method === "GET")) {
      const { data: instances } = await supabase
        .from("evolution_instances")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("created_at");
      return new Response(JSON.stringify({ instances }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── create ──
    if (finalAction === "create") {
      const { name } = body as { name: string };
      if (!name) return new Response(JSON.stringify({ error: "name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const instanceName = `oficinas-${empresaId.slice(0, 8)}-${name
        .toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20)}`;

      const evo = await evoCall("/instance/create", "POST", {
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      });
      if (!evo.ok) {
        return new Response(JSON.stringify({ error: "Evolution API error", detail: evo.data }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const evoData = evo.data as Record<string, any>;
      const instanceToken = evoData?.hash?.apikey ?? evoData?.instance?.token ?? "";

      const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook`;
      await evoCall(`/webhook/set/${instanceName}`, "POST", {
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
        headers: { "x-webhook-secret": WEBHOOK_SECRET },
      }, instanceToken || undefined);

      const isDefault = !(await supabase
        .from("evolution_instances").select("id").eq("empresa_id", empresaId).limit(1)
        .then(r => r.data?.length));

      const { data: inst, error: dbErr } = await supabase
        .from("evolution_instances")
        .insert({
          empresa_id: empresaId,
          name,
          instance_id: instanceName,
          instance_token: instanceToken,
          status: "disconnected",
          webhook_subscribed: true,
          is_default: isDefault,
        })
        .select()
        .single();

      if (dbErr) {
        return new Response(JSON.stringify({ error: dbErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ instance: inst }), {
        status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    async function loadInstance(instance_id: string) {
      const { data: inst } = await supabase
        .from("evolution_instances").select("*")
        .eq("id", instance_id).eq("empresa_id", empresaId).single();
      return inst;
    }

    // ── qrcode ──
    if (finalAction === "qrcode") {
      const { instance_id } = body as { instance_id: string };
      const inst = await loadInstance(instance_id);
      if (!inst) return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      const evo = await evoCall(`/instance/connect/${inst.instance_id}`, "GET", undefined, inst.instance_token || undefined);
      if (evo.ok) {
        const qrData = evo.data as Record<string, any>;
        const qr = qrData?.base64 || qrData?.qrcode?.base64 || null;
        if (qr) {
          await supabase.from("evolution_instances").update({
            qr_code: qr,
            qr_code_updated_at: new Date().toISOString(),
            status: "connecting",
          }).eq("id", instance_id);
        }
      }
      return new Response(JSON.stringify({ ok: evo.ok, data: evo.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── status ──
    if (finalAction === "status") {
      const { instance_id } = body as { instance_id: string };
      const inst = await loadInstance(instance_id);
      if (!inst) return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      const evo = await evoCall(`/instance/connectionState/${inst.instance_id}`, "GET", undefined, inst.instance_token || undefined);
      if (evo.ok) {
        const stateData = evo.data as Record<string, any>;
        const state = stateData?.instance?.state;
        const mapped = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
        await supabase.from("evolution_instances")
          .update({ status: mapped, last_connected_at: mapped === "connected" ? new Date().toISOString() : undefined })
          .eq("id", instance_id);
      }
      return new Response(JSON.stringify({ ok: evo.ok, data: evo.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── logout ──
    if (finalAction === "logout") {
      const { instance_id } = body as { instance_id: string };
      const inst = await loadInstance(instance_id);
      if (!inst) return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      const evo = await evoCall(`/instance/logout/${inst.instance_id}`, "DELETE", undefined, inst.instance_token || undefined);
      await supabase.from("evolution_instances")
        .update({ status: "disconnected", qr_code: null })
        .eq("id", instance_id);
      return new Response(JSON.stringify({ ok: evo.ok, data: evo.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── restart ──
    if (finalAction === "restart") {
      const { instance_id } = body as { instance_id: string };
      const inst = await loadInstance(instance_id);
      if (!inst) return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      const evo = await evoCall(`/instance/restart/${inst.instance_id}`, "PUT", undefined, inst.instance_token || undefined);
      return new Response(JSON.stringify({ ok: evo.ok, data: evo.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── set_default (atomicidade: zera as outras da empresa, marca essa) ──
    if (finalAction === "set_default") {
      const { instance_id } = body as { instance_id: string };
      const inst = await loadInstance(instance_id);
      if (!inst) return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      await supabase.from("evolution_instances")
        .update({ is_default: false })
        .eq("empresa_id", empresaId);
      const { data: updated, error: updErr } = await supabase.from("evolution_instances")
        .update({ is_default: true })
        .eq("id", instance_id)
        .select()
        .single();
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, instance: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── delete ──
    if (finalAction === "delete") {
      const { instance_id } = body as { instance_id: string };
      const inst = await loadInstance(instance_id);
      if (!inst) return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      await evoCall(`/instance/delete/${inst.instance_id}`, "DELETE", undefined, inst.instance_token || undefined);
      await supabase.from("evolution_instances").delete().eq("id", instance_id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${finalAction}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[evolution-proxy] exception:", err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
