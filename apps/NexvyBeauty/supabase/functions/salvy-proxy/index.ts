import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SALVY_BASE = "https://api.salvy.com.br";

// Motivos aceitos pela Salvy no cancelamento (query param `reason`).
const CANCEL_REASONS = [
  "unnecessary",
  "whatsapp-ban",
  "technical-issues",
  "company-canceled",
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function salvyFetch(
  key: string,
  path: string,
  init: RequestInit = {},
) {
  let res: Response;
  try {
    res = await fetch(`${SALVY_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> ?? {}),
      },
    });
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      body: null,
      message: `Falha ao conectar na Salvy: ${err.message}`,
    };
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  let message: string | undefined;
  if (!res.ok) {
    // Formato de erro Salvy: { code, message, publicDetails }
    message = body?.message
      ? String(body.message)
      : `Salvy respondeu ${res.status}`;
  }
  return { ok: res.ok, status: res.status, body, message };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // Telefonia é recurso da PLATAFORMA (conta Salvy da Nexvy): toda action é
    // super-admin only — não existe caso self-service de tenant aqui.
    const { data: superAdminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!superAdminRow) {
      return json(
        { error: "Apenas o Super Admin da plataforma pode acessar a Telefonia." },
        403,
      );
    }

    const body = req.method === "POST" || req.method === "PUT" || req.method === "PATCH"
      ? await req.json().catch(() => ({}))
      : {};
    const action = body.action || new URL(req.url).searchParams.get("action");

    // A key vive como secret da função (supabase secrets set SALVY_API_KEY=...).
    // Deliberadamente FORA de platform_settings: aquela linha é lida pelo
    // frontend com select('*'), e a key não pode tocar o client (Seção 11.1).
    const salvyKey = Deno.env.get("SALVY_API_KEY");
    if (!salvyKey) {
      return json({
        error:
          "Integração Salvy não configurada. Defina o secret SALVY_API_KEY da função (supabase secrets set).",
      }, 400);
    }

    const audit = async (
      auditAction: string,
      entityId: string | null,
      metadata: Record<string, unknown>,
    ) => {
      // Audit server-side: nem um client com JWT válido escapa do log.
      await supabase.from("platform_audit_logs").insert({
        action: auditAction,
        entity_type: "salvy_number",
        entity_id: entityId,
        metadata,
        actor_id: user.id,
      });
    };

    // ---- LIST NUMBERS (read-only) ----
    if (action === "list_numbers") {
      const res = await salvyFetch(salvyKey, "/api/v2/virtual-phone-accounts");
      if (!res.ok) return json({ error: res.message }, 502);
      return json({ ok: true, numbers: res.body ?? [] });
    }

    // ---- GET NUMBER (read-only) ----
    if (action === "get_number") {
      const id = String(body.id || "");
      if (!id) return json({ error: "id é obrigatório" }, 400);
      const res = await salvyFetch(
        salvyKey,
        `/api/v2/virtual-phone-accounts/${encodeURIComponent(id)}`,
      );
      if (!res.ok) return json({ error: res.message }, res.status === 404 ? 404 : 502);
      return json({ ok: true, number: res.body });
    }

    // ---- LIST SMS / OTP (read-only) ----
    if (action === "list_sms") {
      const id = String(body.id || "");
      if (!id) return json({ error: "id é obrigatório" }, 400);
      const page = Math.max(1, Number(body.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(body.pageSize) || 20));
      const res = await salvyFetch(
        salvyKey,
        `/api/v2/virtual-phone-accounts/${encodeURIComponent(id)}/sms-messages?page=${page}&pageSize=${pageSize}`,
      );
      if (!res.ok) return json({ error: res.message }, 502);
      return json({
        ok: true,
        smsMessages: res.body?.smsMessages ?? [],
        page,
        pageSize,
      });
    }

    // ---- LIST AREA CODES / disponibilidade de DDD (read-only) ----
    if (action === "list_area_codes") {
      const res = await salvyFetch(
        salvyKey,
        "/api/v2/virtual-phone-accounts/area-codes",
      );
      if (!res.ok) return json({ error: res.message }, 502);
      return json({ ok: true, areaCodes: res.body?.areaCodes ?? [] });
    }

    // ---- CREATE NUMBER (💰 BILLABLE — provisiona linha real) ----
    if (action === "create_number") {
      // Trava anti-acidente: o client precisa mandar confirm:true explícito.
      if (body.confirm !== true) {
        return json({
          error:
            "Ação billable: provisionar linha gera cobrança mensal. Reenvie com confirm: true.",
        }, 400);
      }
      const areaCode = Number(body.areaCode);
      if (!Number.isInteger(areaCode) || areaCode < 11 || areaCode > 99) {
        return json({ error: "areaCode (DDD) inválido." }, 400);
      }
      const payload: Record<string, unknown> = { areaCode };
      if (body.name) payload.name = String(body.name).slice(0, 100);
      if (body.costCenter) payload.costCenter = String(body.costCenter).slice(0, 100);

      const res = await salvyFetch(salvyKey, "/api/v2/virtual-phone-accounts", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await audit("telefonia.create_number", res.body?.id ?? null, {
        areaCode,
        name: payload.name ?? null,
        costCenter: payload.costCenter ?? null,
        salvy_status: res.status,
        ok: res.ok,
        phoneNumber: res.body?.phoneNumber ?? null,
      });

      if (!res.ok) return json({ ok: false, error: res.message }, 502);
      return json({ ok: true, number: res.body });
    }

    // ---- CANCEL NUMBER (destrutivo — desliga a linha) ----
    if (action === "cancel_number") {
      if (body.confirm !== true) {
        return json({
          error:
            "Ação destrutiva: cancelar desliga a linha. Reenvie com confirm: true.",
        }, 400);
      }
      const id = String(body.id || "");
      if (!id) return json({ error: "id é obrigatório" }, 400);
      const reason = CANCEL_REASONS.includes(String(body.reason))
        ? String(body.reason)
        : "unnecessary";

      const res = await salvyFetch(
        salvyKey,
        `/api/v2/virtual-phone-accounts/${encodeURIComponent(id)}?reason=${encodeURIComponent(reason)}`,
        { method: "DELETE" },
      );

      await audit("telefonia.cancel_number", id, {
        reason,
        salvy_status: res.status,
        ok: res.ok,
      });

      if (!res.ok) return json({ ok: false, error: res.message }, 502);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("salvy-proxy error:", err);
    return json({ error: err.message }, 500);
  }
});
