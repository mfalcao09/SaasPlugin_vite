import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { readCachedBrandingSync } from '@/hooks/usePlatformBranding';

const DEFAULT_PUBLIC_APP_URL = 'https://app.vendus.com.br';
const FALLBACK_PUBLIC_APP_URL = 'https://sales-guide-buddy-11.lovable.app';

function normalizeUrl(value?: string | null): string | null {
  const raw = value?.trim().replace(/\/+$/, '');
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    return null;
  }
}

export function isEditorHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  return (
    hostname.endsWith('.lovableproject.com') ||
    hostname.includes('-preview--') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1'
  );
}

// Superfície de GESTÃO da plataforma (super-admin + CRM), isolada do app do
// salão. Ex.: gestao.nexvybeauty.com.br → true. NÃO exclui dev (gestao.localhost
// é testável). É o branch de hostname avaliado ANTES de apex/app.
export function isGestaoHostname(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  return hostname.startsWith('gestao.');
}

// Host do CRM do GRUPO (multiproduto), servido na TLD corporativa nexvy.tech.
// Ex.: gestao.nexvy.tech → true. Distingue-se do gestao.* do produto Beauty
// (gestao.nexvybeauty.com.br → false), que abre no módulo ERP do salão.
// É a MESMA SPA/rota (isGestaoHostname cobre os dois); o que muda por TLD é só o
// MÓDULO default do PlatformShell (Vendas no grupo, ERP no Beauty). Classificação
// de host pura — não conhece IDs de módulo (o mapa host→módulo vive no shell).
export function isGrupoCrmHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  return isGestaoHostname(hostname) && hostname.endsWith('.nexvy.tech');
}

// Domínio de MARKETING (apex/www) vs APP. Apex = NÃO é o subdomínio app.*,
// NÃO é gestao.* e NÃO é dev/preview. Ex.: nexvybeauty.com.br /
// www.nexvybeauty.com.br → true; app.* e gestao.* → false; localhost → false.
export function isApexDomain(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  if (isEditorHost(hostname)) return false;
  return !hostname.startsWith('app.') && !hostname.startsWith('gestao.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Confinamento por host. Cada host serve só o que é dele:
//   app.*    → app do operador (logado)
//   gestao.* → super-admin (logado)
//   apex/www → marketing + páginas públicas do cliente final
// Rota acessada no host errado → redireciona pro host certo (mesmo path).
// Só vale em produção (família nexvybeauty.com.br); dev/preview/localhost = livre.
// ─────────────────────────────────────────────────────────────────────────────

export type HostClass = 'app' | 'gestao' | 'public';

const APEX_BASE = 'nexvybeauty.com.br';

export function isHostConfinementActive(
  hostname = typeof window !== 'undefined' ? window.location.hostname : '',
): boolean {
  if (isEditorHost(hostname)) return false;
  if (hostname.endsWith('.localhost')) return false; // gestao.localhost etc.
  return hostname.endsWith(APEX_BASE);
}

export function currentHostClass(
  hostname = typeof window !== 'undefined' ? window.location.hostname : '',
): HostClass {
  if (hostname.startsWith('gestao.')) return 'gestao';
  if (hostname.startsWith('app.')) return 'app';
  return 'public'; // apex, www
}

function apexOf(hostname: string): string {
  return hostname.replace(/^(app|gestao|www)\./, '');
}

export function hostUrlFor(
  cls: HostClass,
  hostname = typeof window !== 'undefined' ? window.location.hostname : APEX_BASE,
): string {
  const apex = apexOf(hostname);
  if (cls === 'app') return `https://app.${apex}`;
  if (cls === 'gestao') return `https://gestao.${apex}`;
  return `https://${apex}`;
}

// Marketing/legal + superfícies públicas do cliente final → só apex/www.
const PUBLIC_EXACT = new Set(['/vendas', '/termos', '/privacidade', '/unsubscribe']);
// `/agendar/`, `/confirmar/`, `/reagendar/` = booking público do CRM da plataforma
// (Calendly de reunião de venda) — anon fala só com as edges platform-booking-*.
const PUBLIC_PREFIXES = ['/demo', '/s/', '/f/', '/c/', '/q/', '/agendar/', '/confirmar/', '/reagendar/'];
// Gate de autenticação → alcançável em qualquer host (porta de entrada do logado).
const AUTH_EXACT = new Set(['/login', '/reset-password', '/aceitar-convite']);

/** Em qual classe de host a rota PODE responder. 'any' = sem restrição. */
export function requiredHostClass(pathname: string): HostClass | 'any' {
  if (pathname === '/') return 'any';        // raiz: cada host renderiza o seu
  if (AUTH_EXACT.has(pathname)) return 'any'; // login/reset/convite
  if (PUBLIC_EXACT.has(pathname)) return 'public';
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return 'public';
  if (pathname === '/super-admin') return 'gestao';
  // Resto = app do operador (logado): /crm, /admin, /salao/*, /perfil,
  // /configuracoes, /ajuda, /novidades, /install, /docs/*, filhas do cockpit.
  return 'app';
}

export function getPublicAppUrl(configuredUrl?: string | null): string {
  const configured = normalizeUrl(configuredUrl) || normalizeUrl((readCachedBrandingSync() as any)?.public_app_url);

  if (typeof window === 'undefined') {
    return configured || DEFAULT_PUBLIC_APP_URL || FALLBACK_PUBLIC_APP_URL;
  }

  if (!isEditorHost(window.location.hostname)) {
    return window.location.origin;
  }

  return configured || DEFAULT_PUBLIC_APP_URL || FALLBACK_PUBLIC_APP_URL;
}

export function usePublicAppUrl() {
  return useQuery({
    queryKey: ['public-app-url'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('platform_branding_public')
        .select('public_app_url')
        .limit(1)
        .maybeSingle();
      return getPublicAppUrl(data?.public_app_url);
    },
    initialData: getPublicAppUrl(),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}