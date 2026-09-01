// ─── Rastreamento de aquisição (canal + plataforma) ────────────────────────
// Captura ref (afiliado/canal) + UTMs + cupom. Cookie 1st-party, last-click,
// janela 60 dias (não eterno). Clique ?ref= incrementa via RPC record_affiliate_click.

import { supabase } from '@/integrations/supabase/client';

const COOKIE = 'nxv_track';
const MAX_AGE = 60 * 60 * 24 * 60; // 60 dias — política pública last-click

export interface Tracking {
  ref?: string;
  coupon?: string;
  click_recorded?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  src?: string;
  sck?: string;
  fbc?: string;
  fbp?: string;
  referrer_url?: string;
  landing_page?: string;
}

const URL_KEYS: (keyof Tracking)[] = [
  'ref', 'coupon', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'src', 'sck',
];

function clickKey(ref: string): string {
  return `nxv_aff_click:${ref.toLowerCase()}`;
}

function sessionHasClick(ref: string): boolean {
  try {
    return sessionStorage.getItem(clickKey(ref)) === '1';
  } catch {
    return false;
  }
}

function readCookie(): Tracking {
  try {
    const m = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`));
    if (!m) return {};
    return JSON.parse(decodeURIComponent(m.split('=').slice(1).join('='))) as Tracking;
  } catch {
    return {};
  }
}

function cookieDomain(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || /^[0-9.]+$/.test(host)) return '';
  return `; domain=.${host.replace(/^(app|www)\./, '')}`;
}

function writeCookie(t: Tracking) {
  try {
    document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(t))}; path=/; max-age=${MAX_AGE}; SameSite=Lax${cookieDomain()}`;
  } catch {
    /* cookies indisponíveis */
  }
}

async function hydrateAffiliateFromRef(ref: string): Promise<void> {
  try {
    if (!sessionHasClick(ref)) {
      sessionStorage.setItem(clickKey(ref), '1');
      await (supabase as any).rpc('record_affiliate_click', { p_ref: ref });
    }
    const { data } = await (supabase as any).rpc('resolve_affiliate_link', { p_ref: ref });
    const row = data as { coupon_code?: string | null } | null;
    const coupon = row?.coupon_code;
    if (coupon) {
      const merged = { ...readCookie(), ref, coupon, click_recorded: '1' };
      writeCookie(merged);
    }
  } catch {
    /* clique/cupom best-effort */
  }
}

export function captureTrackingFromUrl(): Tracking {
  const merged: Tracking = { ...readCookie() };
  const p = new URLSearchParams(window.location.search);

  for (const k of URL_KEYS) {
    const v = p.get(k);
    if (v) (merged as Record<string, string>)[k] = v.slice(0, 200);
  }

  const fbclid = p.get('fbclid');
  if (fbclid) merged.fbc = `fb.1.${Date.now()}.${fbclid}`;
  const fbp = document.cookie.split('; ').find((c) => c.startsWith('_fbp='));
  if (fbp) merged.fbp = fbp.split('=')[1];

  if (!merged.landing_page) merged.landing_page = window.location.href.split('#')[0].slice(0, 500);
  if (!merged.referrer_url && document.referrer) merged.referrer_url = document.referrer.slice(0, 500);

  const refNow = p.get('ref') || merged.ref;
  if (refNow && sessionHasClick(refNow)) merged.click_recorded = '1';
  if (p.get('ref')) void hydrateAffiliateFromRef(p.get('ref')!);

  if (Object.keys(merged).length > 0) writeCookie(merged);
  return merged;
}

export function getTracking(): Tracking {
  return captureTrackingFromUrl();
}
