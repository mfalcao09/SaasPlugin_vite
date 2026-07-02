import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — config do FORMULÁRIO DE VENDEDORES ("Cadastrar
 * cliente" dos reps da plataforma), desacoplada do tenant.
 *
 * Porte 1:1 de `hooks/useSellerLeadFormConfig.ts` do CRM original, que persistia
 * em `seller_lead_form_config` (1 row JSON por organization_id).
 *
 * Adaptação de schema: `platform_crm_seller_form_config` (migration
 * 20260702_platform_crm_seller_form_config) — 1 row SINGLETON com `fields` jsonb
 * (a plataforma não tem organization_id; o upsert usa onConflict `singleton`,
 * espelhando o onConflict organization_id do original). RLS super_admin-only.
 * Os 9 campos padrão continuam canônicos no client (mapeiam 1:1 para colunas de
 * `platform_crm_leads`: name/temperature/email/phone/company/position/
 * lead_origin/lead_channel/notes) e são mesclados via mergeSellerFormWithDefaults.
 * Casts `as any` no from(): tabela ainda fora do types.ts gerado (regen pendente).
 */

export type PlatformSellerFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'textarea'
  | 'temperature'
  | 'origin_select'
  | 'channel_select'
  | 'number'
  | 'date'
  | 'select';

export interface PlatformSellerFormField {
  key: string;
  label: string;
  type: PlatformSellerFieldType;
  enabled: boolean;
  required: boolean;
  placeholder?: string;
  /** presente para type='select' */
  options?: { label: string; value: string }[];
  /** true para os 9 campos padrão que mapeiam 1:1 em platform_crm_leads.* */
  builtin: boolean;
}

const PLATFORM_CRM_KEY = 'platform-crm';

export const DEFAULT_PLATFORM_SELLER_FIELDS: PlatformSellerFormField[] = [
  { key: 'name', label: 'Nome', type: 'text', enabled: true, required: true, placeholder: 'Nome do lead', builtin: true },
  { key: 'temperature', label: 'Temperatura', type: 'temperature', enabled: true, required: false, builtin: true },
  { key: 'email', label: 'Email', type: 'email', enabled: true, required: false, placeholder: 'email@exemplo.com', builtin: true },
  { key: 'phone', label: 'Telefone', type: 'phone', enabled: true, required: false, placeholder: '(11) 99999-9999', builtin: true },
  { key: 'company', label: 'Empresa', type: 'text', enabled: true, required: false, placeholder: 'Nome da empresa', builtin: true },
  { key: 'position', label: 'Cargo', type: 'text', enabled: true, required: false, placeholder: 'Cargo/Função', builtin: true },
  { key: 'lead_origin', label: 'Origem', type: 'origin_select', enabled: true, required: false, builtin: true },
  { key: 'lead_channel', label: 'Canal', type: 'channel_select', enabled: true, required: false, builtin: true },
  { key: 'notes', label: 'Observações', type: 'textarea', enabled: true, required: false, placeholder: 'Notas iniciais sobre o lead...', builtin: true },
];

/** Mescla os campos persistidos sobre os defaults canônicos (builtins sempre presentes). */
export function mergeSellerFormWithDefaults(
  stored: PlatformSellerFormField[] | null | undefined,
): PlatformSellerFormField[] {
  const list = Array.isArray(stored) ? stored : [];
  const byKey = new Map(list.map((f) => [f.key, f]));
  const merged: PlatformSellerFormField[] = DEFAULT_PLATFORM_SELLER_FIELDS.map((d) => {
    const s = byKey.get(d.key);
    if (!s) return d;
    return {
      ...d,
      label: s.label ?? d.label,
      enabled: s.enabled ?? d.enabled,
      required: s.required ?? d.required,
      placeholder: s.placeholder ?? d.placeholder,
    };
  });
  for (const f of list) {
    if (!DEFAULT_PLATFORM_SELLER_FIELDS.find((d) => d.key === f.key)) {
      merged.push({ ...f, builtin: false });
    }
  }
  return merged;
}

export function usePlatformCrmSellerFormConfig() {
  return useQuery<PlatformSellerFormField[]>({
    queryKey: [PLATFORM_CRM_KEY, 'seller-form-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_seller_form_config' as any)
        .select('fields')
        .maybeSingle();

      if (error) {
        console.error('[usePlatformCrmSellerFormConfig]', error);
        return DEFAULT_PLATFORM_SELLER_FIELDS;
      }

      return mergeSellerFormWithDefaults(
        (data as any)?.fields as PlatformSellerFormField[] | null,
      );
    },
    staleTime: 60_000,
  });
}

export function useSavePlatformCrmSellerFormConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fields: PlatformSellerFormField[]) => {
      // 1:1 com o original: upsert da row única (onConflict singleton no lugar
      // do onConflict organization_id do tenant).
      const { error } = await supabase
        .from('platform_crm_seller_form_config' as any)
        .upsert(
          { singleton: true, fields: fields as any, updated_at: new Date().toISOString() },
          { onConflict: 'singleton' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Formulário do vendedor salvo');
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'seller-form-config'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });
}
