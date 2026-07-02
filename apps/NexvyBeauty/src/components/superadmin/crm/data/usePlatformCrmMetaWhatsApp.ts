import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * WhatsApp Oficial (Meta Cloud API) do CRM de PLATAFORMA (super_admin).
 * Porte 1:1 do `useMetaWhatsApp.ts` do CRM Vendus, mas:
 *   • `.from('platform_crm_whatsapp_meta_*')`
 *   • Edges `platform-meta-whatsapp-{connect,draft,test,templates-sync,template-submit,template-ai-generate}`
 *   • SEM organization_id / useAuth — RLS super_admin-only isola os dados.
 */

export type PlatformCrmMetaWAConnection = Tables<'platform_crm_whatsapp_meta_connections'>;
export type PlatformCrmMetaWATemplate = Tables<'platform_crm_whatsapp_meta_templates'>;

export function usePlatformCrmMetaWAConnections() {
  return useQuery({
    queryKey: ['platform-crm-meta-wa-connections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_whatsapp_meta_connections')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PlatformCrmMetaWAConnection[];
    },
  });
}

export function usePlatformCrmMetaWATemplates(connectionId: string | null) {
  return useQuery({
    queryKey: ['platform-crm-meta-wa-templates', connectionId],
    queryFn: async () => {
      if (!connectionId) return [];
      const { data, error } = await supabase
        .from('platform_crm_whatsapp_meta_templates')
        .select('*')
        .eq('connection_id', connectionId)
        .order('name');
      if (error) throw error;
      return (data ?? []) as PlatformCrmMetaWATemplate[];
    },
    enabled: !!connectionId,
  });
}

export function useSavePlatformCrmMetaWAConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase.functions.invoke('platform-meta-whatsapp-connect', { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-crm-meta-wa-connections'] });
      toast.success('Conexão salva');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao salvar'),
  });
}

export function useDraftPlatformCrmMetaWAConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { display_name: string; connection_id?: string }) => {
      const { data, error } = await supabase.functions.invoke('platform-meta-whatsapp-draft', { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as {
        connection_id: string;
        verify_token: string;
        webhook_url: string;
        webhook_subscribed_at: string | null;
        status: string;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-crm-meta-wa-connections'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao iniciar rascunho'),
  });
}

export function useTestPlatformCrmMetaWAConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connection_id: string) => {
      const { data, error } = await supabase.functions.invoke('platform-meta-whatsapp-test', { body: { connection_id } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['platform-crm-meta-wa-connections'] });
      qc.invalidateQueries({ queryKey: ['platform-crm-meta-wa-templates'] });
      if (data?.ok) toast.success('Conexão validada');
      else toast.error(data?.error ?? 'Falha no teste');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha no teste'),
  });
}

export function useSyncPlatformCrmMetaWATemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connection_id: string) => {
      const { data, error } = await supabase.functions.invoke('platform-meta-whatsapp-templates-sync', { body: { connection_id } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['platform-crm-meta-wa-templates'] });
      toast.success(`${data?.count ?? 0} templates sincronizados`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao sincronizar'),
  });
}

export function useSubmitPlatformCrmMetaWATemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { connection_id: string; name: string; language: string; category: string; components: any[] }) => {
      const { data, error } = await supabase.functions.invoke('platform-meta-whatsapp-template-submit', { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-crm-meta-wa-templates'] });
      toast.success('Template enviado para aprovação');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao enviar template'),
  });
}

export function useDeletePlatformCrmMetaWAConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('platform_crm_whatsapp_meta_connections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-crm-meta-wa-connections'] });
      toast.success('Conexão removida');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao remover'),
  });
}

export function useGeneratePlatformCrmMetaWATemplateAI() {
  return useMutation({
    mutationFn: async (payload: {
      connection_id: string;
      objective: string;
      tone?: string;
      category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
      language?: string;
      include_optout_button?: boolean;
      audience_hint?: string;
      org_context?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('platform-meta-whatsapp-template-ai-generate', { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any).template as {
        name: string;
        language: string;
        category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
        components: any[];
        variable_labels: Record<string, string>;
      };
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao gerar com IA'),
  });
}

export function useDeletePlatformCrmMetaWATemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template_id: string) => {
      const { error } = await supabase.from('platform_crm_whatsapp_meta_templates').delete().eq('id', template_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-crm-meta-wa-templates'] });
      toast.success('Template removido');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao remover template'),
  });
}

export function useSetPlatformCrmDefaultReengagementTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { connection_id: string; template_id: string | null }) => {
      const { error } = await supabase
        .from('platform_crm_whatsapp_meta_connections')
        .update({ default_reengagement_template_id: payload.template_id })
        .eq('id', payload.connection_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-crm-meta-wa-connections'] });
      toast.success('Template padrão de reengajamento atualizado');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao definir padrão'),
  });
}
