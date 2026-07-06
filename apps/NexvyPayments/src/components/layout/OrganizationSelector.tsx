// ─── OrganizationSelector — impersonação na topbar (porte do Intentus) ──
// UI espelhada 1:1 do TenantSelector do Intentus, adaptada para
// organizations. Só renderiza para super admin (montado condicionalmente).
// Fora de impersonação: botão "Acessar Empresa...". Impersonando: badge
// âmbar "Acessando: <nome>" com popover para alternar ou voltar à gestão.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSuperAdminView } from '@/hooks/useSuperAdminView';
import { Building2, Search, ArrowLeftRight, ChevronDown, LayoutDashboard } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface OrgRow { id: string; name: string; status: string | null }

export function OrganizationSelector() {
  const { impersonateOrganization, exitImpersonation, isImpersonating, impersonatedOrgName, isSuperAdmin } = useSuperAdminView();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const navigate = useNavigate();

  const { data: orgs = [] } = useQuery({
    queryKey: ['sa-orgs-selector'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, status')
        .order('name');
      if (error) throw error;
      return (data ?? []) as OrgRow[];
    },
  });

  // defesa em profundidade: só super admin opera o seletor
  if (!isSuperAdmin) return null;

  const filtered = orgs.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));

  const handleSelect = async (org: OrgRow) => {
    setLoading(true);
    try {
      await impersonateOrganization(org.id, org.name);
      setOpen(false);
      setShowSwitcher(false);
      setSearch('');
      navigate('/');
      toast.success(`Acessando: ${org.name}`);
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao acessar empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleExit = async () => {
    setLoading(true);
    try {
      await exitImpersonation();
      navigate('/super-admin');
      toast.success('Voltou para Gestão Multi-Empresas');
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao sair da impersonação');
    } finally {
      setLoading(false);
      setShowSwitcher(false);
    }
  };

  if (isImpersonating) {
    return (
      <Popover open={showSwitcher} onOpenChange={setShowSwitcher}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors cursor-pointer">
            <Building2 className="h-3.5 w-3.5" />
            <span>Acessando: {impersonatedOrgName}</span>
            <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="p-2 border-b space-y-1">
            <button
              onClick={handleExit}
              disabled={loading}
              className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-md hover:bg-accent transition-colors disabled:opacity-50"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <LayoutDashboard className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">Gestão Multi-Empresas</div>
                <div className="text-xs text-muted-foreground">Voltar ao painel administrativo</div>
              </div>
            </button>
          </div>
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Alternar para outra empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-6">
                Nenhuma empresa encontrada.
              </div>
            ) : (
              filtered.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSelect(org)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{org.name}</div>
                  </div>
                  {org.status !== 'active' && (
                    <Badge variant="destructive" className="text-[10px] shrink-0">Inativa</Badge>
                  )}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-muted-foreground">
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Acessar Empresa...
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6">
              Nenhuma empresa encontrada.
            </div>
          ) : (
            filtered.map((org) => (
              <button
                key={org.id}
                onClick={() => handleSelect(org)}
                disabled={loading}
                className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-md hover:bg-accent transition-colors disabled:opacity-50"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{org.name}</div>
                </div>
                {org.status !== 'active' && (
                  <Badge variant="destructive" className="text-[10px] shrink-0">Inativa</Badge>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
