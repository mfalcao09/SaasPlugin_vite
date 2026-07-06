// ─── SuperAdminViewChoiceDialog — escolha inicial (porte do Intentus) ───
// Super admin escolhe a cada login: "Gestão Multi-Empresas" (painel da
// plataforma) ou "Empresa Master" (operar a empresa master). Substitui o
// antigo DualRoleDialog. UI espelhada 1:1 do Intentus.

import { Crown, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSuperAdminView } from '@/hooks/useSuperAdminView';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function SuperAdminViewChoiceDialog() {
  const { showChoiceDialog, setViewMode } = useSuperAdminView();
  const navigate = useNavigate();

  const choose = (mode: 'gestao' | 'empresa') => {
    setViewMode(mode);
    navigate(mode === 'gestao' ? '/super-admin' : '/');
  };

  return (
    <Dialog open={showChoiceDialog}>
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
            <span className="text-sm font-semibold">Gestão Multi-Empresas</span>
            <span className="text-xs text-muted-foreground text-center">
              Gerenciar a plataforma SaaS
            </span>
          </button>
          <button
            onClick={() => choose('empresa')}
            className="flex flex-col items-center gap-3 rounded-lg border-2 border-muted p-6 transition-all hover:border-primary hover:bg-accent"
          >
            <Building2 className="h-10 w-10 text-primary" />
            <span className="text-sm font-semibold">Empresa Master</span>
            <span className="text-xs text-muted-foreground text-center">
              Operar como empresa master
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
