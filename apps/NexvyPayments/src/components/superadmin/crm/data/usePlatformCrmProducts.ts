// ─────────────────────────────────────────────────────────────────────────────
// usePlatformCrmProducts — hooks COMPARTILHADOS da dimensão PRODUTO (D3 Fase 1a)
// Porte 1:1 de `.vendus-src-reference/src/hooks/useProducts.ts` (+ useProductsStats)
// Tabela: platform_crm_products · Desacoplamento 🔒: zero organization_id/tenant.
// API espelho da fonte: list / get / assigned / create / update / delete / publish.
// Outras ondas (kanban, leads, capture, agents) importam DAQUI.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

const PLATFORM_CRM_KEY = 'platform-crm';

export type PlatformCrmProduct = Tables<'platform_crm_products'>;
export type PlatformCrmProductInsert = TablesInsert<'platform_crm_products'>;
export type PlatformCrmProductUpdate = TablesUpdate<'platform_crm_products'>;
export type PlatformCrmProductStatus = 'draft' | 'review' | 'published';

export function usePlatformCrmProducts() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PlatformCrmProduct[];
    },
    staleTime: 30000,
    gcTime: 60000,
    retry: 1,
    // Se algo falhar, cai para lista vazia em vez de travar a UI (padrão da fonte)
    placeholderData: [] as PlatformCrmProduct[],
  });
}

export function usePlatformCrmProduct(id: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'product', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as PlatformCrmProduct;
    },
    enabled: !!id,
  });
}

/** Produtos atribuídos a um usuário (rep da plataforma) via platform_crm_user_product_assignments. */
export function usePlatformCrmAssignedProducts(userId: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'assigned-products', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_user_product_assignments')
        .select(`
          product_id,
          monthly_goal,
          platform_crm_products (*)
        `)
        .eq('user_id', userId);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    retry: 1,
    placeholderData: [] as any,
  });
}

export function useCreatePlatformCrmProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (product: PlatformCrmProductInsert) => {
      const { data, error } = await supabase
        .from('platform_crm_products')
        .insert(product)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmProduct;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'products'] });
    },
  });
}

export function useUpdatePlatformCrmProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformCrmProductUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmProduct;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'products'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product', data.id] });
    },
  });
}

export function useDeletePlatformCrmProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // TODO(rpc): fonte usa RPC delete_product_safe (nullifica FKs antes).
      // Sem equivalente platform_crm ainda — delete direto; colunas product_id são nullable.
      const { error } = await supabase
        .from('platform_crm_products')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'products'] });
    },
  });
}

/** Atalho de publicação (status draft|review → published). */
export function usePublishPlatformCrmProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('platform_crm_products')
        .update({ status: 'published' satisfies PlatformCrmProductStatus })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmProduct;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'products'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product', data.id] });
    },
  });
}

// ─── Stats por produto (espelho do useProductsStats da fonte) ────────────────
// Fonte usava RPC get_products_stats(_organization_id). Sem RPC platform_crm
// equivalente ainda — agrega client-side a partir das tabelas com product_id.
// TODO(rpc): trocar por RPC `platform_crm_get_products_stats` quando existir (M3).

export interface PlatformCrmProductStats {
  product_id: string;
  total_leads: number;
  sellers_count: number;
  won_count: number;
  won_value: number;
}

export function usePlatformCrmProductsStats() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'products-stats'],
    staleTime: 30_000,
    queryFn: async () => {
      const [leadsRes, assignRes, dealsRes] = await Promise.all([
        supabase.from('platform_crm_leads').select('id, product_id'),
        supabase.from('platform_crm_user_product_assignments').select('user_id, product_id'),
        supabase.from('platform_crm_deals').select('product_id, status, deal_value'),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      if (assignRes.error) throw assignRes.error;
      if (dealsRes.error) throw dealsRes.error;

      const map = new Map<string, PlatformCrmProductStats>();
      const ensure = (productId: string) => {
        let s = map.get(productId);
        if (!s) {
          s = { product_id: productId, total_leads: 0, sellers_count: 0, won_count: 0, won_value: 0 };
          map.set(productId, s);
        }
        return s;
      };

      (leadsRes.data ?? []).forEach((l: { id: string; product_id: string | null }) => {
        if (l.product_id) ensure(l.product_id).total_leads++;
      });

      const sellersByProduct = new Map<string, Set<string>>();
      (assignRes.data ?? []).forEach((a: { user_id: string; product_id: string }) => {
        if (!a.product_id) return;
        if (!sellersByProduct.has(a.product_id)) sellersByProduct.set(a.product_id, new Set());
        sellersByProduct.get(a.product_id)!.add(a.user_id);
      });
      sellersByProduct.forEach((set, productId) => {
        ensure(productId).sellers_count = set.size;
      });

      (dealsRes.data ?? []).forEach((d: { product_id: string | null; status: string | null; deal_value: number | null }) => {
        if (d.product_id && d.status === 'won') {
          const s = ensure(d.product_id);
          s.won_count++;
          s.won_value += Number(d.deal_value ?? 0);
        }
      });

      return map;
    },
  });
}
