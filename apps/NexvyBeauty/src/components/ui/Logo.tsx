import { useTheme } from 'next-themes';
import { useQuery } from '@tanstack/react-query';
import logoDark from '@/assets/logo-dark.png';
import logoLight from '@/assets/logo-light.png';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';
import {
  PLATFORM_BRANDING_QUERY_KEY,
  fetchPlatformBranding,
  readCachedBrandingSync,
} from '@/hooks/usePlatformBranding';
import { getActiveBrand } from '@/config/brand';

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Em gestao.* o Logo vira a marca institucional Nexvy. Passe true para
   *  forçar o branding do tenant (ex.: preview de white-label). */
  respectTenantBranding?: boolean;
}

export function Logo({ className, showText = true, size = 'md', respectTenantBranding = false }: LogoProps) {
  const { resolvedTheme } = useTheme();

  // Mesma query canônica de branding — garante consistência entre Sidebar,
  // Login, Header etc. e captura mudanças feitas no Super Admin.
  const { data: settings } = useQuery({
    queryKey: PLATFORM_BRANDING_QUERY_KEY,
    queryFn: fetchPlatformBranding,
    staleTime: 0,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const effective = settings ?? readCachedBrandingSync();
  const hasCustomLogo = !!(effective?.logo_url || effective?.logo_dark_url);

  const logoSrc = useMemo(() => {
    const isDark = resolvedTheme === 'dark' || resolvedTheme === undefined;
    if (isDark) {
      return effective?.logo_dark_url || effective?.logo_url || logoLight;
    }
    return effective?.logo_url || effective?.logo_dark_url || logoDark;
  }, [resolvedTheme, effective]);

  const sizeClasses = {
    sm: 'h-5',
    md: 'h-6',
    lg: 'h-8',
  };
  const textClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
  };

  // gestao.* = plataforma do GRUPO → marca institucional Nexvy (a marca-mãe do
  // ecobrand tem a palavra final; NÃO lê o platform_settings do tenant).
  // respectTenantBranding fura isso (ex.: preview de white-label do tenant).
  if (!respectTenantBranding && getActiveBrand().key === 'nexvy') {
    return (
      <div className={cn('flex items-center', className)}>
        <span className={cn('font-bold text-foreground leading-none', textClasses[size])}>
          Nexvy<span className="text-primary">.</span>
        </span>
      </div>
    );
  }

  // Sem logo custom configurado: renderiza o nome da plataforma como
  // wordmark dinâmico — evita exibir o logo da marca-base (legado) quando
  // platform_settings.logo_url está vazio (caso típico de SaaS cascateado).
  if (!hasCustomLogo) {
    return (
      <div className={cn('flex items-center', className)}>
        <span className={cn('font-bold text-foreground leading-none', textClasses[size])}>
          {effective?.platform_name || 'Plataforma'}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img
        src={logoSrc}
        alt={effective?.platform_name || 'Plataforma'}
        className={cn(sizeClasses[size], 'w-auto')}
      />
    </div>
  );
}
