// Housekeep do piloto: silêncio 24h → pool + sync lista Z-API ↔ funil.
import type { OutboundQueueState } from "./outbound-queue.ts";
import { dropLeadPending } from "./outbound-queue.ts";
import { lastHumanInboundAt, isSilence24hDue } from "./harness-silence-24h.ts";
import { housekeepMayMoveToPool, parseHarnessJob } from "./harness-puller.ts";
import {
  planFunnelTagSync,
  type FunnelPaintStage,
} from "./harness-funnel-tag.ts";
import { markLeadFunnelStage } from "./harness-stage-db.ts";
import { paintLeadCurrentStage } from "./harness-ui-stage.ts";
import { phoneVariantsWithPlusBR } from "../phone-e164-variants.ts";
import {
  parseZapiChatTagIds,
  parseZapiTagCatalog,
  zapiAddChatTag,
  zapiGetChat,
  zapiGetTags,
  zapiRemoveChatTag,
  type ZapiConfig,
  type ZapiInstanceCreds,
} from "../zapi-client.ts";

type Sb = {
  from: (t: string) => any;
  rpc?: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

function digitsOf(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function asDate(raw: unknown): Date | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isFinite(d.getTime()) ? d : null;
}

async function closeConversationToFunnel(
  sb: Sb,
  input: {
    instanceId: string;
    phone: string;
    stage: FunnelPaintStage;
  },
): Promise<string | null> {
  const variants = phoneVariantsWithPlusBR(input.phone);
  if (variants.length === 0) return null;
  const { data: convs } = await sb
    .from("platform_crm_conversations")
    .select("id, visitor_phone, visitor_id, metadata")
    .eq("wa_qr_instance_id", input.instanceId);
  const rows = Array.isArray(convs) ? convs : [];
  const suffixes = new Set(
    variants.map((v) => digitsOf(v)).filter((d) => d.length >= 10).map((d) =>
      d.slice(-10)
    ),
  );
  const match = rows.find((c) => {
    const a = digitsOf(c.visitor_phone);
    const b = digitsOf(c.visitor_id);
    return [...suffixes].some((s) => a.endsWith(s) || b.endsWith(s));
  });
  if (!match?.id) return null;
  const hard = input.stage === "do_not_contact";
  const prev = match.metadata && typeof match.metadata === "object"
    ? match.metadata as Record<string, unknown>
    : {};
  await sb.from("platform_crm_conversations").update({
    status: "closed",
    metadata: {
      ...prev,
      do_not_contact: hard,
      remarketing: !hard,
      harness_state: input.stage,
      harness_updated_at: new Date().toISOString(),
    },
  }).eq("id", match.id);
  return String(match.id);
}

async function loadMessageBounds(
  sb: Sb,
  conversationId: string,
): Promise<{
  firstOut: Date | null;
  lastOut: Date | null;
  lastIn: Date | null;
  lastHumanIn: Date | null;
}> {
  const { data } = await sb
    .from("platform_crm_messages")
    .select("direction, created_at, content")
    .eq("conversation_id", conversationId);
  const rows = Array.isArray(data) ? data : [];
  let firstOut: Date | null = null;
  let lastOut: Date | null = null;
  let lastIn: Date | null = null;
  const classified: { direction?: string; createdAt: Date | null; content?: string }[] = [];
  for (const row of rows) {
    const t = asDate(row.created_at);
    const content = String(row.content ?? "");
    classified.push({ direction: String(row.direction ?? ""), createdAt: t, content });
    if (!t) continue;
    if (row.direction === "outbound") {
      if (!firstOut || t < firstOut) firstOut = t;
      if (!lastOut || t > lastOut) lastOut = t;
    } else if (row.direction === "inbound") {
      if (!lastIn || t > lastIn) lastIn = t;
    }
  }
  return {
    firstOut,
    lastOut,
    lastIn,
    lastHumanIn: lastHumanInboundAt(classified),
  };
}

async function loadZapiCreds(
  sb: Sb,
  instanceUuid: string,
): Promise<{ config: ZapiConfig; creds: ZapiInstanceCreds } | null> {
  const { data: settings } = await sb
    .from("platform_settings")
    .select("zapi_base_url, zapi_client_token")
    .limit(1)
    .maybeSingle();
  const { data: inst } = await sb
    .from("platform_crm_wa_qr_instances")
    .select("instance_id, instance_token")
    .eq("id", instanceUuid)
    .maybeSingle();
  const baseUrl = String(settings?.zapi_base_url || "https://api.z-api.io").replace(
    /\/$/,
    "",
  );
  const clientToken = String(settings?.zapi_client_token || "").trim();
  const instanceId = String(inst?.instance_id || "").trim();
  const instanceToken = String(inst?.instance_token || "").trim();
  if (!clientToken || !instanceId || !instanceToken) return null;
  return {
    config: { baseUrl, clientToken },
    creds: { instanceId, instanceToken },
  };
}

async function paintChatTags(
  z: { config: ZapiConfig; creds: ZapiInstanceCreds },
  phone: string,
  add: string[],
  remove: string[],
): Promise<string[]> {
  const notes: string[] = [];
  for (const id of add) {
    const r = await zapiAddChatTag(z.config, z.creds, phone, id);
    notes.push(r.ok ? `tag+${id}` : `tag+fail:${r.message ?? r.status}`);
  }
  for (const id of remove) {
    const r = await zapiRemoveChatTag(z.config, z.creds, phone, id);
    notes.push(r.ok ? `tag-${id}` : `tag-fail:${r.message ?? r.status}`);
  }
  return notes;
}

export async function runHarnessHousekeep(input: {
  sb: Sb;
  productId: string;
  instanceId: string;
  now: Date;
  queue: OutboundQueueState;
}): Promise<{ queue: OutboundQueueState; updates: string[]; changed: boolean }> {
  const updates: string[] = [];
  let queue = input.queue;
  let changed = false;
  const { data: states } = await input.sb
    .from("platform_crm_lead_state")
    .select(
      "lead_id, version, derived_stage, platform_crm_leads!inner(id, phone)",
    )
    .eq("product_id", input.productId)
    .in("derived_stage", [
      "contacted",
      "service",
      "remarketing_pool",
      "do_not_contact",
    ]);
  const rows = Array.isArray(states) ? states : [];

  const z = input.instanceId
    ? await loadZapiCreds(input.sb, input.instanceId)
    : null;
  const catalog = z
    ? parseZapiTagCatalog((await zapiGetTags(z.config, z.creds)).body)
    : [];

  for (const row of rows) {
    const lead = row.platform_crm_leads as { id?: string; phone?: string } | null;
    const leadId = String(row.lead_id ?? lead?.id ?? "");
    const phone = String(lead?.phone ?? "");
    if (!leadId || !phone) continue;
    const stage = String(row.derived_stage ?? "");

    const convHit = await (async () => {
      const variants = phoneVariantsWithPlusBR(phone);
      const { data: convs } = await input.sb
        .from("platform_crm_conversations")
        .select("id, visitor_phone, visitor_id, metadata")
        .eq("wa_qr_instance_id", input.instanceId);
      const suffix = digitsOf(phone).slice(-10);
      const found = (Array.isArray(convs) ? convs : []).find((c) => {
        const a = digitsOf(c.visitor_phone);
        const b = digitsOf(c.visitor_id);
        return (suffix && (a.endsWith(suffix) || b.endsWith(suffix))) ||
          variants.includes(String(c.visitor_phone ?? ""));
      });
      return found?.id
        ? {
          id: String(found.id),
          metadata: found.metadata && typeof found.metadata === "object"
            ? found.metadata as Record<string, unknown>
            : {},
        }
        : null;
    })();
    const convId = convHit?.id ?? null;

    if (stage === "contacted" && convId) {
      const bounds = await loadMessageBounds(input.sb, convId);
      const job = parseHarnessJob(convHit?.metadata?.harness_job);
      const pendingInbound = Boolean(
        job &&
          (job.status === "held" || job.status === "ready" ||
            job.status === "in_flight"),
      ) || Boolean(
        convHit?.metadata &&
          typeof (convHit.metadata as { harness_wake_flags?: { pending_inbound_id?: string } })
              .harness_wake_flags?.pending_inbound_id === "string",
      );
      if (
        housekeepMayMoveToPool({
          pendingInbound,
          jobStatus: job?.status ?? null,
          silence24hDue: isSilence24hDue({
            stage,
            lastOutboundAt: bounds.lastOut,
            lastHumanInboundAt: bounds.lastHumanIn,
            now: input.now,
          }),
        })
      ) {
        const marked = await markLeadFunnelStage(input.sb, {
          leadId,
          productId: input.productId,
          stage: "remarketing_pool",
          expectedVersion: typeof row.version === "number" ? row.version : undefined,
        });
        if (marked.ok) {
          await closeConversationToFunnel(input.sb, {
            instanceId: input.instanceId,
            phone,
            stage: "remarketing_pool",
          });
          queue = dropLeadPending(queue, phone);
          queue = dropLeadPending(queue, leadId);
          changed = true;
          updates.push(`${leadId}->remarketing_pool:silence24h`);
        } else {
          updates.push(`${leadId}:silence_fail:${marked.error}`);
        }
      }
    }

    const { data: again } = await input.sb
      .from("platform_crm_lead_state")
      .select("version, derived_stage")
      .eq("lead_id", leadId)
      .eq("product_id", input.productId)
      .maybeSingle();
    const crmStage = String(again?.derived_stage ?? stage);
    const painted = await paintLeadCurrentStage(input.sb, {
      leadId,
      productId: input.productId,
      derivedStage: crmStage,
    });
    if (!painted.ok) updates.push(`${leadId}:ui_paint:${painted.error}`);

    if (!z || catalog.length === 0) continue;
    const chat = await zapiGetChat(z.config, z.creds, phone);
    const chatTags = parseZapiChatTagIds(chat.body);
    const plan = planFunnelTagSync({
      crmStage,
      chatTagIds: chatTags,
      catalog,
    });
    if (plan.paintAdd.length || plan.paintRemove.length) {
      const paint = await paintChatTags(z, phone, plan.paintAdd, plan.paintRemove);
      updates.push(`${leadId}:paint:${paint.join(",") || "noop"}`);
    }
  }

  return { queue, updates, changed };
}
