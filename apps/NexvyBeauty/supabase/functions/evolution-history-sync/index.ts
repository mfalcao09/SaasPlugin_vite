// ============================================================================
// evolution-history-sync — F6: Evolution lê histórico → monta a carteira de
// clientes do salão.
//
// Recebe (SERVER-TO-SERVER, encaminhado pelo evolution-webhook) os chunks de
// histórico que a Evolution API v2 emite quando a instância tem
// syncFullHistory=true:
//   - MESSAGES_SET / messages.set / messaging-history.set → mensagens antigas
//   - CHATS_SET    / chats.set                            → lista de conversas
//   - CONTACTS_SET / contacts.set                         → agenda de contatos
//
// Para cada contato INDIVIDUAL (ignora grupos @g.us, broadcast/status,
// newsletter e JIDs @lid sem telefone real):
//   telefone            = remoteJid → dígitos → normalizePhoneBR (mesma régua
//                         usada pelo evolution-webhook nas conversas)
//   nome                = pushName de mensagem INBOUND ou nome do CONTACTS_SET
//                         (pushName de mensagem fromMe é o nome do PRÓPRIO
//                         salão — nunca usado como nome do contato)
//   ultima_interacao_wa = MAX(messageTimestamp INBOUND); fallback:
//                         conversationTimestamp do CHATS_SET
//
// Escrita: RPC public.upsert_clientes_whatsapp em BATCH (migration
// 20260714_f6_carteira_whatsapp.sql) — advisory lock por organização + match
// por (organization_id, telefone_normalizado). Reprocessar o mesmo chunk NÃO
// duplica clientes.
//
// AUTH: esta function NÃO entra no config.toml com verify_jwt=false — o
// gateway exige JWT válido (default) e, além disso, o handler só aceita
// Bearer == SUPABASE_SERVICE_ROLE_KEY. Só o evolution-webhook (que já valida
// a instância contra o banco) chama aqui.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizePhoneBR } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Mesmos candidatos do evolution-webhook (mantido enxuto — payloads v2).
function extractInstance(payload: any): string {
  const candidates = [
    payload?.instance,
    payload?.instanceName,
    payload?.instanceId,
    typeof payload?.instance === "object" ? payload?.instance?.instanceName : null,
    typeof payload?.instance === "object" ? payload?.instance?.name : null,
    payload?.data?.instance,
    payload?.data?.instanceName,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return "";
}

// JID individual → telefone canônico BR (ou null se não for contato válido).
function jidToPhone(jid: unknown): string | null {
  if (typeof jid !== "string" || !jid) return null;
  const j = jid.trim();
  if (
    j.endsWith("@g.us") ||        // grupos
    j.endsWith("@broadcast") ||   // broadcast e status@broadcast
    j.endsWith("@newsletter") ||  // canais
    j.includes("@lid")            // LID sem telefone real resolvido
  ) {
    return null;
  }
  const raw = j.split("@")[0].split(":")[0].replace(/\D/g, "");
  if (!raw) return null;
  return normalizePhoneBR(raw);
}

// messageTimestamp chega como number (unix s), string numérica ou Long
// serializado ({low, high, unsigned}). Retorna epoch ms ou null.
function tsToMs(v: any): number | null {
  if (v == null) return null;
  let n: number | null = null;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && /^\d+$/.test(v)) n = Number(v);
  else if (typeof v === "object" && typeof v.low === "number") {
    n = v.low + (typeof v.high === "number" ? v.high * 4294967296 : 0);
  }
  if (!n || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  // sanidade: entre 2000-01-01 e agora+1 dia
  if (ms < 946684800000 || ms > Date.now() + 86400000) return null;
  return ms;
}

function pickArray(d: any, key: string): any[] {
  if (Array.isArray(d?.[key])) return d[key];
  if (Array.isArray(d?.[key]?.records)) return d[key].records;
  return [];
}

type Agg = { nome: string | null; ultimaMs: number | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ---- AUTH: somente service role (chamada interna do evolution-webhook) ----
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer || bearer !== serviceKey) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const payload = await req.json().catch(() => ({}));
    const eventName = String(payload?.event || payload?.type || payload?.Event || "");
    const instanceRef = extractInstance(payload);
    if (!instanceRef) {
      return json({ ok: true, ignored: "missing_instance" });
    }

    // ---- Instância → organização (mesmo padrão do evolution-webhook) ----
    const { data: instances } = await supabase
      .from("evolution_instances")
      .select("id, organization_id, name, instance_id, instance_token, phone_number")
      .or(`instance_id.eq.${instanceRef},name.eq.${instanceRef}`);
    let instance = instances?.[0];

    if (!instance) {
      const { data: byMeta } = await supabase
        .from("evolution_instances")
        .select("id, organization_id, name, instance_id, instance_token, phone_number")
        .or(`metadata->>instance_name.eq.${instanceRef},metadata->>instance_uuid.eq.${instanceRef}`);
      instance = byMeta?.[0];
    }

    if (!instance?.organization_id) {
      console.warn("[evolution-history-sync] unknown instance or no org:", instanceRef);
      return json({ ok: true, ignored: "unknown_instance" });
    }

    // Cross-check extra: payloads v2 carregam o apikey da instância. Se ambos
    // os lados têm valor e divergem, o payload não veio da nossa instância.
    const payloadApikey = typeof payload?.apikey === "string" ? payload.apikey.trim() : "";
    const knownToken = String(instance.instance_token || "").trim();
    if (payloadApikey && knownToken && payloadApikey !== knownToken) {
      console.warn("[evolution-history-sync] apikey mismatch for instance:", instanceRef);
      return json({ error: "Forbidden" }, 403);
    }

    // ---- Extrai contatos do chunk ----
    const data = payload?.data ?? payload;
    let messages = pickArray(data, "messages");
    let chats = pickArray(data, "chats");
    let contacts = pickArray(data, "contacts");
    if (!messages.length && !chats.length && !contacts.length && Array.isArray(data)) {
      const ev = eventName.toLowerCase();
      if (ev.includes("contact")) contacts = data;
      else if (ev.includes("chat")) chats = data;
      else messages = data; // messages.set / messaging-history.set
    }

    const instancePhone = normalizePhoneBR(instance.phone_number || "");
    const byPhone = new Map<string, Agg>();

    const add = (phone: string | null, nome: string | null, ultimaMs: number | null) => {
      if (!phone || phone === instancePhone) return; // ignora o próprio salão
      const cleanNome = (nome || "").trim() || null;
      const prev = byPhone.get(phone);
      if (!prev) {
        byPhone.set(phone, { nome: cleanNome, ultimaMs });
        return;
      }
      if (cleanNome && (!prev.nome || cleanNome.length > prev.nome.length)) prev.nome = cleanNome;
      if (ultimaMs && (!prev.ultimaMs || ultimaMs > prev.ultimaMs)) prev.ultimaMs = ultimaMs;
    };

    // MESSAGES_SET: { key: { remoteJid, fromMe, id }, pushName, messageTimestamp }
    for (const m of messages) {
      const key = m?.key || {};
      const phone = jidToPhone(key.remoteJid || m?.remoteJid);
      if (!phone) continue;
      const fromMe = key.fromMe === true;
      // pushName em fromMe é o nome do PRÓPRIO salão — nunca vira nome do contato.
      const nome = !fromMe ? (m?.pushName || null) : null;
      // "última visita" = MAX de timestamp INBOUND (mensagem que o cliente mandou).
      const ultimaMs = !fromMe ? tsToMs(m?.messageTimestamp ?? m?.t) : null;
      add(phone, nome, ultimaMs);
    }

    // CHATS_SET: { id|remoteJid, name?, conversationTimestamp? }
    for (const c of chats) {
      const phone = jidToPhone(c?.id || c?.remoteJid || c?.jid);
      if (!phone) continue;
      const nome = c?.name || c?.pushName || null;
      // fallback de última interação (não distingue direção — melhor que nada)
      const ultimaMs = tsToMs(c?.conversationTimestamp ?? c?.t);
      add(phone, nome, ultimaMs);
    }

    // CONTACTS_SET: { id|remoteJid, name?|pushName?|notify?|verifiedName? }
    for (const c of contacts) {
      const phone = jidToPhone(c?.id || c?.remoteJid || c?.jid);
      if (!phone) continue;
      const nome = c?.name || c?.pushName || c?.notify || c?.verifiedName || null;
      add(phone, nome, null);
    }

    if (byPhone.size === 0) {
      return json({ ok: true, event: eventName, contacts: 0 });
    }

    // ---- Upsert em BATCH via RPC (fatias de 500 pra não estourar payload) ----
    const rows = Array.from(byPhone.entries()).map(([telefone, agg]) => ({
      telefone,
      nome: agg.nome,
      ultima_interacao_wa: agg.ultimaMs ? new Date(agg.ultimaMs).toISOString() : null,
    }));

    let inserted = 0;
    let updated = 0;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { data: result, error } = await supabase.rpc("upsert_clientes_whatsapp", {
        p_organization_id: instance.organization_id,
        p_clientes: slice,
      });
      if (error) {
        console.error("[evolution-history-sync] rpc error:", error.message);
        return json({ ok: false, error: error.message }, 500);
      }
      inserted += Number((result as any)?.inserted ?? 0);
      updated += Number((result as any)?.updated ?? 0);
    }

    console.log(
      `[evolution-history-sync] ✅ ${eventName} instance=${instance.name} org=${instance.organization_id} ` +
      `contacts=${rows.length} inserted=${inserted} updated=${updated}`,
    );
    return json({ ok: true, event: eventName, contacts: rows.length, inserted, updated });
  } catch (err: any) {
    console.error("[evolution-history-sync] error:", err?.message || String(err));
    return json({ error: err?.message || "internal error" }, 500);
  }
});
