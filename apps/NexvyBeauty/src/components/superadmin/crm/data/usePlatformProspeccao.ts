import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Prospecção (C9 — motor de extração de leads, super_admin, PRODUCT-scoped).
 *
 * Lê o staging da extração e dispara novas extrações via edge:
 *   • platform_crm_lead_extractions   → os jobs (keywords, status, total_found)
 *   • platform_crm_extracted_leads    → os leads classificados por segmento
 *   • leads-extraction-start (edge)   → { extraction_id, run_id } (assíncrono; o
 *                                        webhook do Apify preenche o staging depois)
 *
 * ⚠️ Essas tabelas ainda NÃO estão nos types gerados do supabase — por isso o
 * cast localizado (`as never` no nome da tabela) + interfaces locais. Sem inventar
 * tipos no arquivo gerado.
 */

export type LeadExtractionStatus = 'pending' | 'running' | 'done' | 'error';
export type LeadSegment = 'salao_cliente' | 'afiliado_infoproduto' | 'revisao' | 'descarte';

export interface LeadExtraction {
  id: string;
  product_id: string;
  keywords: string[];
  source: string;
  status: LeadExtractionStatus;
  total_found: number | null;
  last_error: string | null;
  created_at: string;
}

export interface ExtractedLead {
  id: string;
  extraction_id: string;
  handle: string | null;
  name: string | null;
  seguidores: number | null;
  seguindo: number | null;
  posts: number | null;
  telefone: string | null;
  whatsapp_link: string | null;
  email: string | null;
  instagram_url: string | null;
  website: string | null;
  categoria: string | null;
  bio: string | null;
  segment: LeadSegment | null;
  qualified: boolean | null;
  is_seed: boolean | null;
  is_infoproduto: boolean | null;
  is_verified: boolean | null;
  is_private: boolean | null;
  geo_country: string | null;
  bio_lang: string | null;
  filter_verdicts: any | null;
  created_at: string;
}

/** Jobs de extração do produto (mais recentes primeiro). */
export function usePlatformLeadExtractions(productId: string | null) {
  return useQuery({
    queryKey: ['platform-lead-extractions', productId],
    enabled: !!productId,
    // Enquanto houver job 'pending'/'running', revalida (o webhook é assíncrono).
    refetchInterval: (q) => {
      const rows = (q.state.data ?? []) as LeadExtraction[];
      return rows.some((r) => r.status === 'pending' || r.status === 'running') ? 5000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_lead_extractions' as never)
        .select('id, product_id, keywords, source, status, total_found, last_error, created_at')
        .eq('product_id', productId as string)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as LeadExtraction[];
    },
  });
}

export interface LeadFilters {
  segment?: LeadSegment | 'all';
  seedsOnly?: boolean;
  qualifiedOnly?: boolean;
}

/** Leads classificados de UMA extração, com filtros de segmento/semente/qualificado. */
export function usePlatformExtractedLeads(extractionId: string | null, filters: LeadFilters = {}) {
  return useQuery({
    queryKey: ['platform-extracted-leads', extractionId, filters],
    enabled: !!extractionId,
    queryFn: async () => {
      let q = supabase
        .from('platform_crm_extracted_leads' as never)
        .select(
          'id, extraction_id, handle, name, seguidores, seguindo, posts, telefone, whatsapp_link, email, instagram_url, website, categoria, bio, segment, qualified, is_seed, is_infoproduto, is_verified, is_private, geo_country, bio_lang, filter_verdicts, created_at',
        )
        .eq('extraction_id', extractionId as string);
      if (filters.segment && filters.segment !== 'all') q = q.eq('segment', filters.segment);
      if (filters.seedsOnly) q = q.eq('is_seed', true);
      if (filters.qualifiedOnly) q = q.eq('qualified', true);
      const { data, error } = await q.order('seguidores', { ascending: false, nullsFirst: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as ExtractedLead[];
    },
  });
}

/**
 * Reclassificação MANUAL de um lead (override humano do classificador automático).
 * Muda o segmento e/ou marca semente. Ao mover para/de salao_cliente, o `qualified`
 * segue o segmento (só salao_cliente é "qualificado de venda"). RLS super_admin.
 */
export function useReclassifyLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; segment?: LeadSegment; is_seed?: boolean }) => {
      const patch: Record<string, unknown> = {};
      if (args.segment !== undefined) {
        patch.segment = args.segment;
        patch.qualified = args.segment === 'salao_cliente';
      }
      if (args.is_seed !== undefined) patch.is_seed = args.is_seed;
      const { error } = await supabase
        .from('platform_crm_extracted_leads' as never)
        .update(patch as never)
        .eq('id', args.id);
      if (error) throw error;
      return args;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-extracted-leads'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao reclassificar'),
  });
}

/** Dispara uma nova extração (Porta A — keyword search). Assíncrono. */
export function useStartExtraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { product_id: string; keywords: string[]; limit?: number }) => {
      const { data, error } = await supabase.functions.invoke('leads-extraction-start', {
        body: { product_id: args.product_id, keywords: args.keywords, limit: args.limit ?? 30 },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { extraction_id: string; run_id: string };
    },
    onSuccess: (_res, args) => {
      qc.invalidateQueries({ queryKey: ['platform-lead-extractions', args.product_id] });
      toast.success('Extração disparada', {
        description: 'O Apify está buscando os perfis; os leads aparecem aqui em ~1-2 min.',
      });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao disparar a extração'),
  });
}

/**
 * Importa uma lista de @handles colados (Porta A por username). Dispara o
 * profile-scraper do Apify via `leads-import-handles`; o webhook classifica e
 * preenche o staging (mesmo fluxo assíncrono do keyword search). Custo = conta
 * Apify do projeto (~$0,0026/perfil).
 */
export function useImportHandles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { product_id: string; handles: string[] }) => {
      const { data, error } = await supabase.functions.invoke('leads-import-handles', {
        body: { product_id: args.product_id, handles: args.handles },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { extraction_id: string; run_id: string; handles: number };
    },
    onSuccess: (res, args) => {
      qc.invalidateQueries({ queryKey: ['platform-lead-extractions', args.product_id] });
      toast.success(`${res.handles} handles enviados`, {
        description: 'O Apify está detalhando os perfis; os leads aparecem aqui em ~1-2 min.',
      });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao importar handles'),
  });
}
