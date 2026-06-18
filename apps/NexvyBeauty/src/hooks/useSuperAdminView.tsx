// ─── useSuperAdminView — impersonação multi-empresa (porte do Intentus) ──
// Super admin escolhe "Gestão Multi-Empresas" (painel /super-admin) ou
// "Empresa Master" (operar a empresa master) e pode IMPERSONAR qualquer
// empresa. A troca muda o próprio profiles.organization_id via RPC gated
// set_active_organization; a RLS (get_user_organization) propaga sozinha.

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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

export function SuperAdminViewProvider({ children }: { children: ReactNode }) {
  const { isSuperAdmin: isSuperAdminFn, user, refetchProfile } = useAuth();
  const isSuperAdmin = isSuperAdminFn();
  const queryClient = useQueryClient();
  const hasSynced = useRef<string | null>(null);

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
    () => (typeof window === 'undefined' ? null : localStorage.getItem(LS_IMP_ID))
  );
  const [impersonatedOrgName, setImpersonatedOrgName] = useState<string | null>(
    () => (typeof window === 'undefined' ? null : localStorage.getItem(LS_IMP_NAME))
  );

  const isImpersonating = !!impersonatedOrgId && impersonatedOrgId !== masterOrgId;

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem(LS_KEY, mode);
  }, []);

  // Restaura a empresa ativa no banco a partir do localStorage (1x por user)
  useEffect(() => {
    if (!user || !isSuperAdmin || !masterOrgId) return;
    if (hasSynced.current === user.id) return;
    hasSynced.current = user.id;
    const target = impersonatedOrgId && impersonatedOrgId !== masterOrgId ? impersonatedOrgId : masterOrgId;
    (async () => {
      const { error } = await supabase.rpc('set_active_organization', { p_org_id: target });
      if (!error) {
        await refetchProfile();
        queryClient.invalidateQueries();
      }
    })();
  }, [user, isSuperAdmin, masterOrgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const impersonateOrganization = useCallback(async (orgId: string, orgName: string) => {
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
    if (!masterOrgId) return;
    const { error } = await supabase.rpc('set_active_organization', { p_org_id: masterOrgId });
    if (error) throw error;
    setImpersonatedOrgId(null);
    setImpersonatedOrgName(null);
    localStorage.removeItem(LS_IMP_ID);
    localStorage.removeItem(LS_IMP_NAME);
    setViewModeState('gestao');
    localStorage.setItem(LS_KEY, 'gestao');
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
        localStorage.removeItem(LS_IMP_ID);
        localStorage.removeItem(LS_IMP_NAME);
        hasSynced.current = null;
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const showChoiceDialog = isSuperAdmin && viewMode === null;

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
