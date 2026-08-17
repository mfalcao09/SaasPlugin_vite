// Stub until `whatsapp_meta_connections` is versioned in migrations_salao + types.
//
// Searched: migrations_salao (no table), src/integrations/supabase/types.ts
// (only `platform_crm_whatsapp_meta_connections`), supabase/**/*.sql (no
// CREATE TABLE). Edge functions still mention the tenant table, but this hook
// has no importers (grep: only this file). Go-live WhatsApp is Evolution QR.
// Do not point this hook at platform_crm_whatsapp_meta_connections.
import { useQuery } from '@tanstack/react-query';

/** Chave única — a mesma que o wizard invalida ao concluir. */
export const META_CONNECTIONS_KEY = ['whatsapp-meta-connections'] as const;

export interface MetaConnection {
  id: string;
  display_name: string;
  phone_number: string | null;
  business_account_name: string | null;
  status: string;
  quality_rating: string | null;
  messaging_limit_tier: string | null;
  created_at: string;
}

export function useMetaConnections() {
  return useQuery({
    queryKey: META_CONNECTIONS_KEY,
    queryFn: async (): Promise<MetaConnection[]> => [],
    enabled: false,
  });
}
