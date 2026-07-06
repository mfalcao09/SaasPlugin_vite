// Web Push helper for the PLATFORM CRM (super_admin).
// Decoupled port of _shared/push.ts: table `platform_crm_push_subscriptions`,
// ZERO organization_id, NO user_notification_settings / preference gate.
// v1 policy: broadcast to ALL non-revoked subscriptions (the subscribers are the
// super-admins). Optional `userIds` filter for future targeting.
// Fire-and-forget safe: errors are swallowed and logged.

import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@nexvy.tech";

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("[platform-push] VAPID keys missing — push disabled");
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidReady = true;
  return true;
}

export interface PlatformPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
}

interface SupabaseLike {
  from: (t: string) => any;
}

/**
 * Send a Web Push notification to platform subscriptions.
 * Default: every non-revoked subscription (all subscribed super-admins).
 * If `userIds` is provided and non-empty, restricts to those users.
 * Dead endpoints (404/410) are revoked. Returns a per-run tally.
 */
export async function sendPlatformPush(
  supabase: SupabaseLike,
  payload: PlatformPushPayload,
  userIds?: string[],
): Promise<{ sent: number; failed: number; revoked: number }> {
  const result = { sent: 0, failed: 0, revoked: 0 };
  if (!ensureVapid()) return result;

  try {
    let query = supabase
      .from("platform_crm_push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id")
      .is("revoked_at", null);

    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (ids.length > 0) query = query.in("user_id", ids);

    const { data: subs, error } = await query;
    if (error) {
      console.error("[platform-push] fetch subscriptions failed", error);
      return result;
    }
    if (!subs || subs.length === 0) return result;

    const body = JSON.stringify(payload);

    const tasks = subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
          { TTL: 60 * 60 * 24 },
        );
        result.sent++;
        // best-effort touch last_seen_at
        supabase
          .from("platform_crm_push_subscriptions")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", s.id)
          .then?.(() => {});
      } catch (err: any) {
        result.failed++;
        const status = err?.statusCode || err?.status || 0;
        if (status === 404 || status === 410) {
          // Endpoint dead — revoke it.
          await supabase
            .from("platform_crm_push_subscriptions")
            .update({ revoked_at: new Date().toISOString() })
            .eq("id", s.id);
          result.revoked++;
        } else {
          console.warn(
            `[platform-push] send failed status=${status} sub=${s.id}`,
            err?.message || err,
          );
        }
      }
    });

    await Promise.allSettled(tasks);
    return result;
  } catch (err) {
    console.error("[platform-push] sendPlatformPush exception:", err);
    return result;
  }
}
