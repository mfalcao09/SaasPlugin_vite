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

// Domínio de MARKETING (apex/www) vs APP. Apex = NÃO é o subdomínio app.*,
// NÃO é gestao.* e NÃO é dev/preview. Ex.: nexvybeauty.com.br /
// www.nexvybeauty.com.br → true; app.* e gestao.* → false; localhost → false.
export function isApexDomain(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  if (isEditorHost(hostname)) return false;
  return !hostname.startsWith('app.') && !hostname.startsWith('gestao.');
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