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