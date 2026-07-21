// ─── onboarding-evolution — QR do WhatsApp no wizard de IMPLANTAÇÃO PAGA ──────
//
// POR QUE EXISTE (bug de produção, 20/07/2026 23:20):
// O passo "Conectar seu WhatsApp" do /implantacao/<token> foi copiado do
// GuidedOnboarding, que roda com a dona JÁ LOGADA dentro do app. Ele chama o
// `evolution-proxy`, que exige JWT de usuário (supabase.auth.getUser) e está
// fora do config.toml (gateway verify_jwt=true). Só que no wizard a compradora
// NÃO TEM SESSÃO — ela define a senha no passo 10, no fim. Resultado real em
// produção: POST evolution-proxy → 401, duas vezes, e nenhuma compradora
// atravessa o passo que a própria tela chama de "o coração do seu espaço".
//
// AUTH REAL AQUI = prova de posse do link: token do /implantacao/<token>
// (sha256 → token_hash) + session_token da aba corrente. É o MESMO contrato de
// apply-onboarding/index.ts:109-116 — replicado, não reinventado.
// A service_role NUNCA sai desta função; o front manda só {token, session_token}.
//
// ⚠️ Pública por design: EXIGE o bloco em supabase/config.toml com
// verify_jwt=false. Sem ele, um redeploy religa o JWT e mata o fluxo em
// silêncio — que é exatamente como este bug nasceu.
//
// FRONTEIRAS DELIBERADAS:
//  · NÃO atende demo (mode='demo') — esse caminho é do `demo-evolution`, cujos
//    gates protegem a org paga do demo-reaper.
//  · Expõe SÓ `connect` e `status`. Nada destrutivo: sem delete, sem logout,
//    sem rename, sem assign. Um link vazado não consegue apagar nada.
//  · A org NUNCA vem do body — sempre de onboarding_submissions.organization_id.
//    (É o que impede pedir QR "para a org do vizinho" com um link válido.)

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  configureWebhook,
  evoFetch,
  extractQr,
  getPlatformConfig,
  maskKey,
  orgSlugify,
} from "../_shared/evolution-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const token = String(body?.token ?? "");
    const sessionToken = String(body?.session_token ?? "");

    // ═══════════════ AUTH — espelho de apply-onboarding:109-116 ═══════════════
    if (!token || !sessionToken) return json({ error: "unauthorized" }, 401);

    const { data: row, error: rowErr } = await admin
      .from("onboarding_submissions")
      .select("id, organization_id, session_token, mode, revoked_at, expires_at")
      .eq("token_hash", await sha256Hex(token))
      .maybeSingle();

    if (rowErr) return json({ error: "lookup_failed" }, 500);
    if (!row) return json({ error: "invalid_token" }, 401);
    if (row.revoked_at) return json({ error: "link_revoked" }, 403);
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return json({ error: "expired_token" }, 403);
    }
    if (row.session_token !== sessionToken) return json({ error: "link_already_in_use" }, 403);
    // Demo tem motor próprio (demo-evolution) com gates que protegem a org paga.
    if (row.mode === "demo") return json({ error: "wrong_flow_for_demo" }, 403);
    if (!row.organization_id) return json({ error: "submission_without_org" }, 409);

    const orgId: string = row.organization_id;

    const config = await getPlatformConfig(admin);
    if (!config) return json({ ok: false, error: "Servidor de WhatsApp não configurado." });

    // ───────────────────────────── STATUS ─────────────────────────────────────
    if (action === "status") {
      const { data: cur } = await admin
        .from("evolution_instances")
        .select("id, status, qr_code, phone_number")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!cur) return json({ ok: true, status: "none", instance_id: null, qr_code: null });
      return json({
        ok: true,
        status: cur.status,
        instance_id: cur.id,
        qr_code: cur.qr_code ?? null,
        phone_number: cur.phone_number ?? null,
      });
    }

    if (action !== "connect") return json({ error: "unknown_action" }, 400);

    // ───────────────────── CONNECT (cria se preciso, depois pareia) ───────────
    // Replica create_instance_self (evolution-proxy:430-611) e connect_instance
    // (:712-866), TROCANDO a autorização por-usuário pela prova de posse do link.

    const { data: existing } = await admin
      .from("evolution_instances")
      .select("id, name, instance_id, instance_token, organization_id, metadata")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let inst: any = existing;

    if (!inst) {
      // ---- limites do plano (mesma RPC do proxy) ----
      const { data: limitsData, error: limitsErr } = await admin.rpc(
        "get_organization_effective_limits",
        { p_org_id: orgId },
      );
      if (limitsErr) {
        return json({ ok: false, error: "Falha ao carregar limites do plano: " + limitsErr.message });
      }
      const maxConnections: number = (limitsData as any)?.limits?.max_connections ?? 1;

      const { count: currentCount } = await admin
        .from("evolution_instances")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId);

      if ((currentCount ?? 0) >= maxConnections) {
        return json({
          ok: false,
          error: `Limite de ${maxConnections} conexão(ões) do seu plano atingido.`,
          limit_reached: true,
        });
      }

      // ---- nome: prefixo do slug da org (namespace do Evolution Go é global) ----
      const { data: orgRow } = await admin
        .from("organizations")
        .select("slug, name")
        .eq("id", orgId)
        .maybeSingle();

      const rawName = "principal";
      const orgSlug = orgSlugify(orgRow?.slug || orgRow?.name || "org") || "org";
      const finalName = `${orgSlug}-${rawName}`.slice(0, 50);

      const { data: dup } = await admin
        .from("evolution_instances")
        .select("id")
        .eq("name", finalName)
        .maybeSingle();
      if (dup) {
        return json({ ok: false, error: "Já existe uma conexão com esse nome no servidor." });
      }

      const generatedToken = crypto.randomUUID();
      console.log(
        `[onboarding-evolution] create instanceName="${finalName}" org=${orgId} token=${maskKey(generatedToken)}`,
      );

      // syncFullHistory=true (F6): é o que faz o histórico do aparelho virar a
      // carteira de clientes (MESSAGES_SET/CHATS_SET/CONTACTS_SET → raio-x).
      const createRes = await evoFetch(config, "/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName: finalName,
          integration: "WHATSAPP-BAILEYS",
          token: generatedToken,
          syncFullHistory: true,
        }),
      });

      if (!createRes.ok) {
        return json({
          ok: false,
          error: createRes.message || `Falha ao criar instância (status ${createRes.status})`,
        });
      }

      const created = createRes.body?.instance ?? createRes.body?.data ?? createRes.body ?? {};
      const uuid = created?.instanceId ?? created?.id ?? created?.uuid ?? null;
      const instanceTokenNew =
        (typeof createRes.body?.hash === "string" ? createRes.body.hash : null) ??
        createRes.body?.hash?.apikey ??
        created?.token ?? created?.apikey ?? generatedToken;

      if (!uuid) {
        return json({ ok: false, error: "Servidor criou a instância mas não retornou UUID." });
      }

      const { data: inserted, error: insErr } = await admin
        .from("evolution_instances")
        .insert({
          organization_id: orgId,
          name: finalName,
          instance_id: uuid || finalName,
          instance_token: instanceTokenNew,
          status: "disconnected",
          is_default: (currentCount ?? 0) === 0,
          created_by_super_admin: false,
          metadata: {
            instance_uuid: uuid,
            instance_name: finalName,
            display_name: orgRow?.name || rawName,
            created_via: "onboarding_wizard",
            onboarding_submission_id: row.id,
            remote: createRes.body,
          },
        })
        .select()
        .single();

      if (insErr) return json({ ok: false, error: insErr.message });

      const wh = await configureWebhook(
        config,
        finalName,
        instanceTokenNew,
        `${SUPABASE_URL}/functions/v1/evolution-webhook`,
      );
      await admin
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

      inst = inserted;
    }

    // ---- pareamento (connect_instance:712-866) ----
    const meta: any = inst.metadata || {};
    const instanceName: string | null = inst.name || meta.instance_name || null;
    const instanceToken: string | null = inst.instance_token || meta.instance_token || null;

    if (!instanceName || !instanceToken) {
      return json({ ok: false, error: "Instância sem nome ou token." });
    }

    // (1) já conectada? Nunca forçar logout aqui: invalidaria o ciclo de QR ativo.
    try {
      const info = await evoFetch(
        config,
        `/instance/connectionState/${encodeURIComponent(instanceName)}`,
        { method: "GET" },
        instanceToken,
      );
      const state =
        info?.body?.instance?.state ?? info?.body?.state ?? info?.body?.connectionStatus ?? null;
      if (info.ok && state === "open") {
        await admin
          .from("evolution_instances")
          .update({
            status: "connected",
            qr_code: null,
            qr_code_updated_at: null,
            last_connected_at: new Date().toISOString(),
          })
          .eq("id", inst.id);
        return json({
          ok: true,
          instance_id: inst.id,
          qr_code: null,
          already_connected: true,
          status: "connected",
        });
      }
    } catch (e) {
      console.warn(`[onboarding-evolution] state check failed (continuing): ${e}`);
    }

    await admin
      .from("evolution_instances")
      .update({ status: "qr_pending", qr_code: null, qr_code_updated_at: null })
      .eq("id", inst.id);

    const res = await evoFetch(
      config,
      `/instance/connect/${encodeURIComponent(instanceName)}`,
      { method: "GET" },
      instanceToken,
    );
    if (!res.ok) {
      return json({ ok: false, error: res.message || `Erro ${res.status}` });
    }

    let qrString = extractQr(res.body);

    // O servidor pode levar um instante para gerar o payload de pareamento.
    if (!qrString) {
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const again = await evoFetch(
            config,
            `/instance/connect/${encodeURIComponent(instanceName)}`,
            { method: "GET" },
            instanceToken,
          );
          const found = extractQr(again?.body);
          if (found) {
            qrString = found;
            break;
          }
        } catch (e) {
          console.warn(`[onboarding-evolution] poll connect error: ${e}`);
        }
      }
    }

    if (qrString) {
      await admin
        .from("evolution_instances")
        .update({
          status: "qr_pending",
          qr_code: qrString,
          qr_code_updated_at: new Date().toISOString(),
          webhook_subscribed: true,
        })
        .eq("id", inst.id);
    } else {
      await admin
        .from("evolution_instances")
        .update({ webhook_subscribed: true })
        .eq("id", inst.id);
    }

    return json({
      ok: true,
      instance_id: inst.id,
      qr_code: qrString,
      already_connected: false,
      status: qrString ? "qr_pending" : "disconnected",
    });
  } catch (e: any) {
    console.error("[onboarding-evolution] error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
