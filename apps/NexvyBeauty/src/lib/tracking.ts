// ─── Rastreamento de aquisição (canal + plataforma) ────────────────────────
// Captura ref (afiliado/canal) + UTMs (plataforma) + fbclid + referrer/landing
// no carregamento da LP e persiste num COOKIE 1st-party (sobrevive ao hop
// LP→checkout e a recargas). Tudo é client e SEM segredo — a fonte de verdade
// é o lead gravado server-side pela Edge Function `capture-lead`.

const COOKIE = 'nxv_track';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

export interface Tracking {
  ref?: string; // canal (afiliado)
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

// chaves lidas direto da querystring
const URL_KEYS: (keyof Tracking)[] = [
  'ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'src', 'sck',
];

function readCookie(): Tracking {
  try {
    const m = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`));
    if (!m) return {};
    return JSON.parse(decodeURIComponent(m.split('=').slice(1).join('='))) as Tracking;
  } catch {
    return {};
  }
}

// Domínio do cookie: compartilha entre apex e subdomínios (app./www.) usando o
// domínio registrável. Em localhost/IP não seta domain (cookie por host).
function cookieDomain(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || /^[0-9.]+$/.test(host)) return '';
  return `; domain=.${host.replace(/^(app|www)\./, '')}`;
}

function writeCookie(t: Tracking) {
  try {
    document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(t))}; path=/; max-age=${MAX_AGE}; SameSite=Lax${cookieDomain()}`;
  } catch {
    /* cookies indisponíveis — segue sem persistir */
  }
}

// Lê params da URL + cookies do Facebook e persiste no cookie 1st-party.
// UTM/ref são "last-touch" (params novos sobrescrevem); landing/referrer são
// "first-touch" (só gravados na 1ª visita). Não sobrescreve com vazio.
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

  if (Object.keys(merged).length > 0) writeCookie(merged);
  return merged;
}

// Retorna o tracking consolidado (cookie + params atuais).
export function getTracking(): Tracking {
  return captureTrackingFromUrl();
}
