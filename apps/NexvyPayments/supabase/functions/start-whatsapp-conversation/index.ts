import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Inline de ../_shared/phone.ts::normalizePhoneBR (deploy single-file, sem dep relativa).
// Canonical BR: 55 + DDD(2) + 9 + 8 dígitos = 13 dígitos p/ celular. null se < 8 dígitos.
function normalizePhoneBR(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  let d = String(input).replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 8) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.substring(2);
  if (d.length === 10) {
    const ddd = d.substring(0, 2);
    const rest = d.substring(2);
    if (/^[6-9]/.test(rest)) d = ddd + "9" + rest;
  }
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ ok: false, error: "Unauthorized" }, 401);

    // Org
    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", user.id).single();
    if (!profile?.organization_id) return json({ ok: false, error: "No organization" }, 400);

    const { phone, lead_id, lead_name, initial_message } = await req.json();
    if (!phone) return json({ ok: false, created: false, error: "Telefone é obrigatório" }, 400);

    const normalizedPhone = normalizePhoneBR(phone);
    if (!normalizedPhone) return json({ ok: false, created: false, error: "Telefone inválido" }, 400);

    // ─── ENVIO PRIMEIRO: bloqueia a criação se a mensagem não for entregue ───
    // Antes a conversa era criada e o envio rodava num try/catch que só logava o erro
    // (falso "Conversa criada"). Agora: se há mensagem inicial, ela precisa SAIR antes de
    // gravar qualquer coisa. Se o envio falhar, NADA é criado e o front avisa "não criada".
    if (initial_message) {
      const { data: sendRes, error: sendErr } = await supabase.functions.invoke("evolution-send", {
        body: {
          organization_id: profile.organization_id,
          type: "text",
          to: normalizedPhone,
          payload: { text: initial_message },
        },
      });
      const failed = !!sendErr || (sendRes && (sendRes.error || sendRes.success === false));
      if (failed) {
        // motivo técnico só pra log; usuário recebe mensagem amigável
        let motivo = "";
        if (sendErr) {
          try { const b = await (sendErr as { context?: { json?: () => Promise<unknown> } }).context?.json?.(); motivo = (b as { error?: string })?.error ?? ""; } catch (_) { /* ignore */ }
        } else {
          motivo = (sendRes as { error?: string })?.error ?? "";
        }
        console.error("start-whatsapp-conversation: envio bloqueou criação:", motivo || sendErr);
        return json({
          ok: false,
          created: false,
          error: "Não foi possível enviar a mensagem. Verifique se o seu WhatsApp está conectado e tente novamente.",
        });
      }
    }

    // ─── Envio OK (ou sem mensagem) → reabre conversa existente ou cria nova ───
    const { data: existing } = await supabase
      .from("webchat_conversations")
      .select("id, status")
      .eq("organization_id", profile.organization_id)
      .eq("channel", "whatsapp")
      .eq("visitor_phone_normalized", normalizedPhone)
      .order("status", { ascending: true })
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("webchat_conversations")
        .update({ assigned_user_id: user.id, status: "human_active", closed_at: null })
        .eq("id", existing[0].id);

      if (initial_message) {
        await supabase.from("webchat_messages").insert({
          conversation_id: existing[0].id,
          content: initial_message,
          sender_type: "agent",
        });
      }
      return json({ ok: true, conversation_id: existing[0].id, is_new: false });
    }

    // Widget da org p/ ancorar a conversa
    const { data: widget } = await supabase
      .from("webchat_widgets").select("id")
      .eq("organization_id", profile.organization_id).eq("is_active", true)
      .limit(1).single();

    const conversationData: Record<string, unknown> = {
      organization_id: profile.organization_id,
      visitor_id: crypto.randomUUID(),
      channel: "whatsapp",
      status: "human_active",
      assigned_user_id: user.id,
      visitor_phone: normalizedPhone,
      visitor_name: lead_name || normalizedPhone,
    };
    if (widget?.id) conversationData.widget_id = widget.id;
    if (lead_id) conversationData.lead_id = lead_id;

    let { data: newConv, error: insertError } = await supabase
      .from("webchat_conversations").insert(conversationData).select("id").single();

    if (insertError && (insertError as { code?: string }).code === "23505") {
      // Race com webhook/automação — recupera a conversa que ganhou o INSERT
      const { data: race } = await supabase
        .from("webchat_conversations").select("id")
        .eq("organization_id", profile.organization_id)
        .eq("channel", "whatsapp")
        .eq("visitor_phone_normalized", normalizedPhone)
        .neq("status", "closed").limit(1).maybeSingle();
      if (race?.id) {
        newConv = race as { id: string };
        insertError = null;
        await supabase
          .from("webchat_conversations")
          .update({ assigned_user_id: user.id, status: "human_active" })
          .eq("id", race.id);
      }
    }

    if (insertError) {
      console.error("Error creating conversation:", insertError);
      return json({ ok: false, created: false, error: insertError.message }, 500);
    }

    if (initial_message && newConv?.id) {
      await supabase.from("webchat_messages").insert({
        conversation_id: newConv.id,
        content: initial_message,
        sender_type: "agent",
      });
    }

    return json({ ok: true, conversation_id: newConv!.id, is_new: true });
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, 500);
  }
});
