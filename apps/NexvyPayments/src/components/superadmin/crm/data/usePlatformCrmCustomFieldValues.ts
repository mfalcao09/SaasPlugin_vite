import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * CRM de PLATAFORMA (super_admin) — valores DISTINTOS de um campo personalizado
 * (armazenado em `platform_crm_leads.metadata->custom_fields->>fieldKey`).
 * Usado para popular o `datalist` de autocomplete no filtro por campo personalizado.
 *
 * Espelha 1:1 o `useCustomFieldValues` do CRM de tenant, mas SEM organization_id:
 * a RLS super_admin-only já isola os dados de `platform_crm_leads`.
 */

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmCustomFieldValues(fieldKey: string | null) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'custom-field-values', fieldKey],
    enabled: !!fieldKey,
    queryFn: async (): Promise<string[]> => {
      const path = `metadata->custom_fields->>${fieldKey}`;
      const { data, error } = await supabase
        .from('platform_crm_leads')
        .select('metadata')
        .not(path as never, 'is', null)
        .limit(1000);

      if (error) throw error;

      const values = new Set<string>();
      (data ?? []).forEach((row) => {
        const cf = (row.metadata as { custom_fields?: Record<string, unknown> } | null)
          ?.custom_fields;
        const v = cf?.[fieldKey!];
        if (v != null && String(v).trim() !== '') values.add(String(v));
      });

      return [...values].sort((a, b) => a.localeCompare(b));
    },
  });
}
