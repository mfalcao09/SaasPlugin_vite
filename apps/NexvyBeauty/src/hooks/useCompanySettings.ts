import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface CompanyAddress {
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export interface CompanySettings {
  id: string;
  name: string;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  address: CompanyAddress | null;
  // Cor da marca do tenant — vive em organizations.settings.primary_color
  // (mesmo lugar que o onboarding grava). NÃO é o tema do app (esse é
  // platform-level, via platform_branding_public).
  primary_color: string | null;
}

export function useCompanySettings() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['company-settings', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CompanySettings | null> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, cnpj, email, phone, logo_url, address, settings')
        .eq('id', orgId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as any;
      return {
        id: row.id,
        name: row.name,
        cnpj: row.cnpj,
        email: row.email,
        phone: row.phone,
        logo_url: row.logo_url,
        address: row.address,
        primary_color: row.settings?.primary_color ?? null,
      };
    },
  });
}

export function useUpdateCompanySettings() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<CompanySettings>) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const patch: Record<string, any> = {
        name: input.name,
        cnpj: input.cnpj,
        email: input.email,
        phone: input.phone,
        logo_url: input.logo_url,
        address: (input.address ?? null) as any,
      };
      // A cor da marca mora em organizations.settings (JSON) — mesmo lugar do
      // onboarding. Read-merge pra não sobrescrever outras chaves de settings.
      if (input.primary_color !== undefined) {
        const { data: org } = await supabase
          .from('organizations')
          .select('settings')
          .eq('id', profile.organization_id)
          .maybeSingle();
        patch.settings = {
          ...(((org as any)?.settings as any) ?? {}),
          primary_color: input.primary_color,
        };
      }
      const { data, error } = await supabase
        .from('organizations')
        .update(patch)
        .eq('id', profile.organization_id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-settings'] });
      toast({ title: 'Dados da empresa salvos' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

export async function uploadCompanyLogo(file: File, orgId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  // Bucket público dedicado: a primeira pasta é o organization_id (usado pelas policies RLS)
  const path = `${orgId}/logo-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('company-logos').upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('company-logos').getPublicUrl(path);
  return data.publicUrl;
}
