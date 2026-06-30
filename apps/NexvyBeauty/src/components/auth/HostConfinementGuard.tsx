import { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  isHostConfinementActive,
  currentHostClass,
  requiredHostClass,
  hostUrlFor,
} from '@/lib/publicUrl';

/**
 * Confina cada host ao seu conteúdo:
 *   app.*    = app do operador (logado)
 *   gestao.* = super-admin (logado)
 *   apex/www = marketing + páginas públicas do cliente final
 *
 * Rota acessada no host errado → redireciona (hard, cross-origin) pro host
 * certo, preservando path + query + hash. Não renderiza o conteúdo do host
 * errado enquanto redireciona (evita "flash" do super-admin no apex, etc.).
 * Inerte em dev/preview/localhost (isHostConfinementActive = false).
 */
export function HostConfinementGuard({ children }: { children: ReactNode }) {
  const location = useLocation();

  if (isHostConfinementActive()) {
    const need = requiredHostClass(location.pathname);
    if (need !== 'any' && currentHostClass() !== need) {
      const target = hostUrlFor(need) + location.pathname + location.search + location.hash;
      if (typeof window !== 'undefined') window.location.replace(target);
      return null;
    }
  }

  return <>{children}</>;
}
