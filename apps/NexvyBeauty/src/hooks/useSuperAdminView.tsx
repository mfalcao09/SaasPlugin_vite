// ─── useSuperAdminView — impersonação multi-empresa (porte do Intentus) ──
// Super admin escolhe "Gestão da plataforma" (painel /super-admin) ou
// "Empresa Master" (operar a empresa master) e pode IMPERSONAR qualquer
// empresa. A troca muda o próprio profiles.organization_id via RPC gated
// set_active_organization; a RLS (get_user_organization) propaga sozinha.
//
// Em gestao.* a impersonação é PROIBIDA: limpa localStorage + volta à master.
// O seletor "Acessando:" não monta nesse host (ver OrganizationSelector).

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isGestaoHostname } from '@/lib/publicUrl';

type ViewMode = 'gestao' | 'empresa';

interface SuperAdminViewContextType {
  viewMode: ViewMode | null;
  setViewMode: (mode: ViewMode) => void;
  showChoiceDialog: boolean;
  isSuperAdmin: boolean;
  impersonatedOrgId: string | null;
  impersonatedOrgName: string | null;
  impersonateOrganization: (orgId: string, orgName: string) => Promise<void>;
  exitImpersonation: () => Promise<void>;
  isImpersonating: boolean;
  masterOrgId: string | null;
}

const SuperAdminViewContext = createContext<SuperAdminViewContextType>({
  viewMode: null,
  setViewMode: () => {},
  showChoiceDialog: false,
  isSuperAdmin: false,
  impersonatedOrgId: null,
  impersonatedOrgName: null,
  impersonateOrganization: async () => {},
  exitImpersonation: async () => {},
  isImpersonating: false,
  masterOrgId: null,
});

const LS_KEY = 'nx_view_mode';
const LS_IMP_ID = 'nx_imp_org_id';
const LS_IMP_NAME = 'nx_imp_org_name';

function clearImpersonationStorage() {
  localStorage.removeItem(LS_IMP_ID);
  localStorage.removeItem(LS_IMP_NAME);
}

export function SuperAdminViewProvider({ children }: { children: ReactNode }) {
  const { isSuperAdmin: isSuperAdminFn, user, refetchProfile } = useAuth();
  const isSuperAdmin = isSuperAdminFn();
  const queryClient = useQueryClient();
  const hasSynced = useRef<string | null>(null);
  const gestaoCleared = useRef(false);

  // empresa master desta instalação
  const { data: masterOrgId = null } = useQuery({
    queryKey: ['master-org-id'],
    queryFn: async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('master_organization_id')
        .limit(1)
        .maybeSingle();
      return ((data as { master_organization_id?: string } | null)?.master_organization_id) ?? null;
    },
  });

  const [viewMode, setViewModeState] = useState<ViewMode | null>(() => {
    if (typeof window === 'undefined') return null;
    const s = localStorage.getItem(LS_KEY);
    return s === 'gestao' || s === 'empresa' ? s : null;
  });
  const [impersonatedOrgId, setImpersonatedOrgId] = useState<string | null>(
    () => {
      if (typeof window === 'undefined') return null;
      // gestao.* nunca restaura impersonação do LS (estado travado)
      if (isGestaoHostname()) return null;
      return localStorage.getItem(LS_IMP_ID);
    }
  );
  const [impersonatedOrgName, setImpersonatedOrgName] = useState<string | null>(
    () => {
      if (typeof window === 'undefined') return null;
      if (isGestaoHostname()) return null;
      return localStorage.getItem(LS_IMP_NAME);
    }
  );

  const isImpersonating = !!impersonatedOrgId && impersonatedOrgId !== masterOrgId;

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem(LS_KEY, mode);
  }, []);

  // gestao.*: força saída da impersonação (UI + LS + RPC master).
  // Limpa estado local mesmo se a RPC falhar — destravar a topbar.
  useEffect(() => {
    if (!user || !isSuperAdmin || !isGestaoHostname()) return;
    if (gestaoCleared.current) return;
    gestaoCleared.current = true;

    clearImpersonationStorage();
    setImpersonatedOrgId(null);
    setImpersonatedOrgName(null);
    setViewModeState('gestao');
    localStorage.setItem(LS_KEY, 'gestao');

    (async () => {
      if (!masterOrgId) {
        await refetchProfile();
        queryClient.invalidateQueries();
        return;
      }
      const { error } = await supabase.rpc('set_active_organization', { p_org_id: masterOrgId });
      if (!error) {
        await refetchProfile();
        queryClient.invalidateQueries();
      }
    })();
  }, [user, isSuperAdmin, masterOrgId, refetchProfile, queryClient]);

  // Restaura a empresa ativa no banco a partir do localStorage (1x por user).
  // Nunca em gestao.* — lá o efeito acima manda o perfil de volta à master.
  useEffect(() => {
    if (!user || !isSuperAdmin || !masterOrgId) return;
    if (isGestaoHostname()) return;
    if (hasSynced.current === user.id) return;
    hasSynced.current = user.id;
    const target = impersonatedOrgId && impersonatedOrgId !== masterOrgId ? impersonatedOrgId : masterOrgId;
    (async () => {
      const { error } = await supabase.rpc('set_active_organization', { p_org_id: target });
      if (!error) {
        await refetchProfile();
        queryClient.invalidateQueries();
      } else if (target !== masterOrgId) {
        // Org do LS sumiu ("Empresa inexistente") — limpa e volta à master
        clearImpersonationStorage();
        setImpersonatedOrgId(null);
        setImpersonatedOrgName(null);
        await supabase.rpc('set_active_organization', { p_org_id: masterOrgId });
        await refetchProfile();
        queryClient.invalidateQueries();
      }
    })();
  }, [user, isSuperAdmin, masterOrgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const impersonateOrganization = useCallback(async (orgId: string, orgName: string) => {
    if (isGestaoHostname()) {
      throw new Error('Impersonação não está disponível na gestão. Use o app do salão.');
    }
    const { error } = await supabase.rpc('set_active_organization', { p_org_id: orgId });
    if (error) throw error;
    setImpersonatedOrgId(orgId);
    setImpersonatedOrgName(orgName);
    localStorage.setItem(LS_IMP_ID, orgId);
    localStorage.setItem(LS_IMP_NAME, orgName);
    setViewModeState('empresa');
    localStorage.setItem(LS_KEY, 'empresa');
    await refetchProfile();
    queryClient.invalidateQueries();
  }, [refetchProfile, queryClient]);

  const exitImpersonation = useCallback(async () => {
    // Sempre limpa UI/LS primeiro — evita topbar travada se masterOrgId/RPC falhar
    setImpersonatedOrgId(null);
    setImpersonatedOrgName(null);
    clearImpersonationStorage();
    setViewModeState('gestao');
    localStorage.setItem(LS_KEY, 'gestao');

    if (masterOrgId) {
      const { error } = await supabase.rpc('set_active_organization', { p_org_id: masterOrgId });
      if (error) throw error;
    }
    await refetchProfile();
    queryClient.invalidateQueries();
  }, [masterOrgId, refetchProfile, queryClient]);

  // limpa tudo no logout
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setViewModeState(null);
        setImpersonatedOrgId(null);
        setImpersonatedOrgName(null);
        localStorage.removeItem(LS_KEY);
        clearImpersonationStorage();
        hasSynced.current = null;
        gestaoCleared.current = false;
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Split por hostname: o gestao.* É o modo gestão; o app.*/apex É o modo
  // empresa. A URL decide o viewMode.
  useEffect(() => {
    if (!isSuperAdmin) return;
    const desired: ViewMode = isGestaoHostname() ? 'gestao' : 'empresa';
    if (viewMode !== desired) setViewMode(desired);
  }, [isSuperAdmin, viewMode, setViewMode]);

  const showChoiceDialog = false;

  return (
    <SuperAdminViewContext.Provider value={{
      viewMode, setViewMode, showChoiceDialog, isSuperAdmin,
      impersonatedOrgId, impersonatedOrgName,
      impersonateOrganization, exitImpersonation, isImpersonating, masterOrgId,
    }}>
      {children}
    </SuperAdminViewContext.Provider>
  );
}

export function useSuperAdminView() {
  return useContext(SuperAdminViewContext);
}
