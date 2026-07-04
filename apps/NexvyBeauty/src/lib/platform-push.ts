// Web Push client helper for the PLATFORM CRM (super_admin, gestao.*).
// Decoupled port of the Vendus `lib/push.ts`: reads the VAPID public key from
// VITE_VAPID_PUBLIC_KEY, talks to the `platform-push-*` edges, and checks the
// `platform_crm_push_subscriptions` table (RLS super_admin-only).

import { supabase } from "@/integrations/supabase/client";

// Public VAPID key — safe to expose (equivalent to an RSA public key).
// Baked into the bundle from .env.production at build time.
export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string) || "";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

export function isIOS(): boolean {
  return detectPlatform() === "ios";
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return buffer;
}

export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js");
  } catch (e) {
    console.error("[platform-push] SW register failed", e);
    return null;
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration();
  if (!reg) return null;
  return await reg.pushManager.getSubscription();
}

export async function isCurrentSubscriptionRegistered(): Promise<boolean> {
  const sub = await getCurrentSubscription();
  if (!sub) return false;

  const { data, error } = await supabase
    .from("platform_crm_push_subscriptions")
    .select("id")
    .eq("endpoint", sub.endpoint)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    console.warn("[platform-push] backend subscription status check failed", error);
    return false;
  }

  return !!data?.id;
}

export async function subscribeUser(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "no_vapid_key" };

  // iOS only allows push when installed as a standalone PWA.
  if (isIOS() && !isStandalone()) {
    return { ok: false, reason: "ios_needs_install" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const reg = await getRegistration();
  if (!reg) return { ok: false, reason: "no_sw" };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (e: any) {
      console.error("[platform-push] subscribe failed", e);
      return { ok: false, reason: e?.message || "subscribe_failed" };
    }
  }

  const json = sub.toJSON();
  const { error } = await supabase.functions.invoke("platform-push-subscribe", {
    body: {
      endpoint: json.endpoint,
      keys: json.keys,
      user_agent: navigator.userAgent,
      platform: detectPlatform(),
      is_standalone: isStandalone(),
    },
  });
  if (error) {
    console.error("[platform-push] backend register failed", error);
    return { ok: false, reason: error.message || "backend_failed" };
  }
  return { ok: true };
}

export async function unsubscribeUser(): Promise<boolean> {
  const sub = await getCurrentSubscription();
  if (!sub) return true;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch (e) {
    console.warn("[platform-push] browser unsubscribe failed", e);
  }
  try {
    await supabase.functions.invoke("platform-push-unsubscribe", { body: { endpoint } });
  } catch (e) {
    console.warn("[platform-push] backend unsubscribe failed", e);
  }
  return true;
}
