// platform-hermes-bridge — hub gestao ↔ Hermes (torre Camila).
//
// NÃO envia WhatsApp. NÃO chama o sales-brain como conversa.
// Cria/atualiza platform_crm_hermes_ops; processa propose_list no servidor;
// Hermes faz poll (claim/complete) com x-hermes-bridge-secret.
//
// Gate: HERMES_BRIDGE_ENABLED=true (default off).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { proposePilotList, type ProposeCandidate } from "../_shared/hermes-tower/propose-list.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hermes-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

type Action =
  | "create"
  | "list"
  | "poll"
  | "claim"
  | "complete"
  | "fail"
  | "process_propose_list"
  | "preflight_snapshot";

function bridgeEnabled(): boolean {
  return (Deno.env.get("HERMES_BRIDGE_ENABLED") ?? "false").toLowerCase() === "true";
}

function sbService(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function authCaller(req: Request): Promise<{ ok: boolean; mode: "jwt" | "secret" | "none"; userId?: string }> {
  const secret = Deno.env.get("HERMES_BRIDGE_SECRET") ?? "";
  const hdr = req.headers.get("x-hermes-bridge-secret") ?? "";
  if (secret && hdr && hdr === secret) return { ok: true, mode: "secret" };

  const auth = req.headers.get("authorization") ?? "";
  const tk = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!tk) return { ok: false, mode: "none" };

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: `Bearer ${tk}` } } },
  );
  const { data: userData, error } = await sb.auth.getUser();
  if (error || !userData.user) return { ok: false, mode: "none" };

  const svc = sbService();
  const { data: role } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role) return { ok: false, mode: "jwt" };
  return { ok: true, mode: "jwt", userId: userData.user.id };
}

async function processProposeList(sb: SupabaseClient, productId: string, limit: number) {
  const { data, error } = await sb
    .from("platform_crm_extracted_leads")
    .select(
      "id, handle, primeiro_nome, telefone, segment, qualified, seguidores, categoria, approved_at, excluded_at",
    )
    .eq("product_id", productId)
    .is("excluded_at", null)
    .not("telefone", "is", null)
    .limit(500);
  if (error) throw new Error(error.message);
  const candidates = (data ?? []) as ProposeCandidate[];
  return proposePilotList({ candidates, limit });
}

async function preflightSnapshot(sb: SupabaseClient, productId: string) {
  // deno-lint-ignore no-explicit-any
  const countOf = async (extra?: (q: any) => any) => {
    // deno-lint-ignore no-explicit-any
    let q: any = sb
      .from("platform_crm_extracted_leads")
      .select("*", { count: "exact", head: true })
      .eq("product_id", productId);
    if (extra) q = extra(q);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const [total, approved, withPhone] = await Promise.all([
    countOf(),
    countOf((q) => q.not("approved_at", "is", null)),
    countOf((q) => q.not("telefone", "is", null).neq("telefone", "")),
  ]);

  const { data: campaigns } = await sb
    .from("platform_crm_cold_campaigns")
    .select("id, name, status, dry_run, activated_at, channel")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: instances } = await sb
    .from("platform_crm_evolution_instances")
    .select("id, name, status, last_connected_at, phone_number")
    .order("updated_at", { ascending: false })
    .limit(10);

  return {
    product_id: productId,
    leads: { total, approved, with_phone: withPhone },
    campaigns: campaigns ?? [],
    evolution_instances: instances ?? [],
    notes: [
      "canal_verdade=pergunte_Evolution_open",
      "send_exige_dry_run_false_e_COLD_OUTREACH_ENABLED_e_activated_at",
      "hermes_nao_envia_whatsapp",
    ],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!bridgeEnabled()) {
    return json({ error: "hermes_bridge_disabled", hint: "Set HERMES_BRIDGE_ENABLED=true" }, 403);
  }

  const caller = await authCaller(req);
  if (!caller.ok) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = String(body.action ?? "") as Action;
  const sb = sbService();

  try {
    if (action === "create") {
      if (caller.mode !== "jwt") return json({ error: "gestao_jwt_required" }, 403);
      const productId = String(body.product_id ?? "");
      const kind = String(body.kind ?? "");
      if (!productId || !kind) return json({ error: "product_id_and_kind_required" }, 400);
      const { data, error } = await sb
        .from("platform_crm_hermes_ops")
        .insert({
          product_id: productId,
          kind,
          status: "queued",
          source: "gestao",
          payload: (body.payload as Record<string, unknown>) ?? {},
          created_by: caller.userId ?? null,
        })
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ op: data });
    }

    if (action === "list") {
      const productId = String(body.product_id ?? "");
      if (!productId) return json({ error: "product_id_required" }, 400);
      const { data, error } = await sb
        .from("platform_crm_hermes_ops")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(Number(body.limit ?? 30));
      if (error) return json({ error: error.message }, 400);
      return json({ ops: data ?? [] });
    }

    if (action === "poll") {
      if (caller.mode !== "secret") return json({ error: "hermes_secret_required" }, 403);
      const { data, error } = await sb
        .from("platform_crm_hermes_ops")
        .select("*")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(Number(body.limit ?? 5));
      if (error) return json({ error: error.message }, 400);
      return json({ ops: data ?? [] });
    }

    if (action === "claim") {
      if (caller.mode !== "secret") return json({ error: "hermes_secret_required" }, 403);
      const id = String(body.id ?? "");
      if (!id) return json({ error: "id_required" }, 400);
      const { data, error } = await sb
        .from("platform_crm_hermes_ops")
        .update({ status: "claimed", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "queued")
        .select("*")
        .maybeSingle();
      if (error) return json({ error: error.message }, 400);
      if (!data) return json({ error: "not_claimable" }, 409);
      return json({ op: data });
    }

    if (action === "complete" || action === "fail") {
      if (caller.mode !== "secret") return json({ error: "hermes_secret_required" }, 403);
      const id = String(body.id ?? "");
      if (!id) return json({ error: "id_required" }, 400);
      const patch =
        action === "complete"
          ? {
            status: "done",
            result: body.result ?? {},
            error_text: null,
            updated_at: new Date().toISOString(),
          }
          : {
            status: "failed",
            error_text: String(body.error_text ?? "failed"),
            result: body.result ?? null,
            updated_at: new Date().toISOString(),
          };
      const { data, error } = await sb
        .from("platform_crm_hermes_ops")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) return json({ error: error.message }, 400);
      return json({ op: data });
    }

    if (action === "process_propose_list") {
      // Pode ser JWT (UI pede processamento sync) ou secret (Hermes processa claim).
      const productId = String(body.product_id ?? "");
      const limit = Math.min(Number(body.limit ?? 10), 10);
      if (!productId) return json({ error: "product_id_required" }, 400);
      const result = await processProposeList(sb, productId, limit);
      if (body.op_id) {
        await sb
          .from("platform_crm_hermes_ops")
          .update({
            status: "done",
            result,
            updated_at: new Date().toISOString(),
          })
          .eq("id", String(body.op_id));
      }
      return json({ result });
    }

    if (action === "preflight_snapshot") {
      const productId = String(body.product_id ?? "");
      if (!productId) return json({ error: "product_id_required" }, 400);
      const snapshot = await preflightSnapshot(sb, productId);
      if (body.op_id) {
        await sb
          .from("platform_crm_hermes_ops")
          .update({
            status: "done",
            result: snapshot,
            updated_at: new Date().toISOString(),
          })
          .eq("id", String(body.op_id));
      }
      return json({ snapshot });
    }

    return json({ error: `unknown_action:${action}` }, 400);
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
