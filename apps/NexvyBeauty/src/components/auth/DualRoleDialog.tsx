// ─── Dialog bloqueante de duplo perfil (porte do Intentus) ─────────
// Super admin que também é admin de empresa (ou tem organização vinculada)
// escolhe a cada login como quer acessar: Gestão da Plataforma ou Empresa.
// viewMode persiste em localStorage ('nx_view_mode') e é limpo no logout
// (useAuth.signOut / onAuthStateChange sem sessão) — re-pergunta a cada login.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export const VIEW_MODE_STORAGE_KEY = 'nx_view_mode';

type ViewMode = 'gestao' | 'empresa';

function loadViewMode(): ViewMode | null {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === 'gestao' || stored === 'empresa') return stored;
  } catch {
    // localStorage indisponível
  }
  return null;
}

export function DualRoleDialog({ orgName }: { orgName?: string | null }) {
  const navigate = useNavigate();
  const { roles, profile, isSuperAdmin } = useAuth();
  const [viewMode, setViewModeState] = useState<ViewMode | null>(() => loadViewMode());

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // localStorage indisponível
    }
  };

  const isDualRole =
    isSuperAdmin() && (roles.includes('admin') || !!profile?.organization_id);

  const open = isDualRole && viewMode === null;

  const choose = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'gestao') {
      navigate('/super-admin');
    }
    // 'empresa' → permanece no hub
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-center">Como deseja acessar o sistema?</DialogTitle>
          <DialogDescription className="text-center">
            Escolha o modo de visualização para esta sessão.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <button
            onClick={() => choose('gestao')}
            className="flex flex-col items-center gap-3 rounded-lg border-2 border-muted p-6 transition-all hover:border-primary hover:bg-accent"
          >
            <Crown className="h-10 w-10 text-amber-500" />
            <span className="text-sm font-semibold">Gestão da Plataforma</span>
            <span className="text-xs text-muted-foreground text-center">
              Gerenciar organizações, planos e billing
            </span>
          </button>
          <button
            onClick={() => choose('empresa')}
            className="flex flex-col items-center gap-3 rounded-lg border-2 border-muted p-6 transition-all hover:border-primary hover:bg-accent"
          >
            <Building2 className="h-10 w-10 text-primary" />
            <span className="text-sm font-semibold">Empresa</span>
            <span className="text-xs text-muted-foreground text-center">
              {orgName ? `Operar como ${orgName}` : 'Operar como sua empresa'}
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
