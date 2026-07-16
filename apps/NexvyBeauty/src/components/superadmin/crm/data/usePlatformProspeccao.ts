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
export type LeadSegment = 'salao_cliente' | 'afiliado_infoproduto' | 'revisao' | 'descarte' | 'acionamento_via_instagram';

export interface LeadExtraction {
  id: string;
  product_id: string;
  keywords: string[];
  source: string;
  status: LeadExtractionStatus;
  total_found: number | null;
  last_error: string | null;
  created_at: string;
  // NOTA: a EXTRAÇÃO não é mais a unidade de aprovação (migrou para o LEAD). As
  // colunas approved_at/approved_by da tabela platform_crm_lead_extractions ficaram
  // órfãs (droppable pós-flip) — o front não as lê/escreve mais. Fonte única do
  // portão = platform_crm_extracted_leads.approved_at (ver ExtractedLead abaixo).
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
  excluded_at: string | null;
  created_at: string;
  /** Portão por-LEAD: NULL = "em tratamento"; preenchido = lead aprovado (entra na Base
   *  consolidada após o flip da view). Opcional: a view consolidada não expõe este campo. */
  approved_at?: string | null;
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

// ════════════════════════════════════════════════════════════════════════════
// PORTÃO DE APROVAÇÃO (Prospecção → Base consolidada). Unidade de aprovação = o
// LEAD (não a extração). Aprovar seta approved_at=now()/approved_by=user NO LEAD →
// esse lead passa a entrar na view consolidada (após o flip por-lead da view, passo
// coordenado). Reabrir zera de volta para "em tratamento". Três modos:
//   • por IDs selecionados (checkboxes)              → useSetLeadsApproval
//   • em massa por extração + filtros / base inteira → useSetExtractionLeadsApproval
//   • contadores por-extração (N aprovados · M trat.) → useExtractionApprovalCounts
// Aprovar NUNCA toca a lixeira (excluded_at IS NOT NULL). Sempre invalida as duas
// telas (Buscas + Base consolidada) e os contadores por-extração.
// ════════════════════════════════════════════════════════════════════════════

/** Aprova/reabre um conjunto de leads por ID ("Aprovar/Reabrir selecionados"). */
export function useSetLeadsApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { ids: string[]; approved: boolean; productId: string }) => {
      if (args.ids.length === 0) return { ...args, count: 0 };
      const { data: auth } = await supabase.auth.getUser();
      const patch = args.approved
        ? { approved_at: new Date().toISOString(), approved_by: auth.user?.id ?? null }
        : { approved_at: null, approved_by: null };
      const { error } = await supabase
        .from('platform_crm_extracted_leads' as never)
        .update(patch as never)
        .in('id', args.ids);
      if (error) throw error;
      return { ...args, count: args.ids.length };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['platform-extracted-leads'] });
      qc.invalidateQueries({ queryKey: ['platform-consolidated-leads'] });
      qc.invalidateQueries({ queryKey: ['platform-extraction-approval-counts'] });
      toast.success(res.approved ? `${res.count} lead(s) aprovado(s)` : `${res.count} lead(s) reaberto(s)`, {
        description: res.approved
          ? 'Passam a entrar na Base consolidada (após o flip da view).'
          : 'Voltaram para "em tratamento" e saem da Base consolidada.',
      });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao atualizar aprovação'),
  });
}

/**
 * Aprova/reabre EM MASSA os leads de uma extração. Sem `filters` (ou tudo em 'all')
 * = "aprovar/reabrir a base inteira". Com `filters` = "aprovar todos os filtrados"
 * (mesmos WHEREs da lista: segmento/semente/qualificado). Aprovar SEMPRE exclui a
 * lixeira (excluded_at). É o bulk server-side que evita aprovar 4.006 um-a-um — age
 * em TODAS as linhas que batem o filtro, sem o teto do `.limit` da listagem.
 */
export function useSetExtractionLeadsApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { extractionId: string; approved: boolean; productId: string; filters?: LeadFilters }) => {
      const { data: auth } = await supabase.auth.getUser();
      const patch = args.approved
        ? { approved_at: new Date().toISOString(), approved_by: auth.user?.id ?? null }
        : { approved_at: null, approved_by: null };
      let q = supabase
        .from('platform_crm_extracted_leads' as never)
        .update(patch as never)
        .eq('extraction_id', args.extractionId);
      // Aprovar nunca toca a lixeira; reabrir pode varrer toda a extração.
      if (args.approved) q = q.is('excluded_at', null);
      const f = args.filters;
      if (f?.segment && f.segment !== 'all') q = q.eq('segment', f.segment);
      if (f?.seedsOnly) q = q.eq('is_seed', true);
      if (f?.qualifiedOnly) q = q.eq('qualified', true);
      const { error } = await q;
      if (error) throw error;
      return args;
    },
    onSuccess: (args) => {
      qc.invalidateQueries({ queryKey: ['platform-extracted-leads'] });
      qc.invalidateQueries({ queryKey: ['platform-consolidated-leads'] });
      qc.invalidateQueries({ queryKey: ['platform-extraction-approval-counts'] });
      toast.success(args.approved ? 'Leads aprovados' : 'Leads reabertos', {
        description: args.approved
          ? 'Os leads correspondentes entram na Base consolidada (após o flip da view).'
          : 'Voltaram para "em tratamento" e saem da Base consolidada.',
      });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao atualizar aprovação em massa'),
  });
}

/** Contadores do portão por-lead de UMA extração (só não-lixeira): total, aprovados, em tratamento. */
export function useExtractionApprovalCounts(extractionId: string | null) {
  return useQuery({
    queryKey: ['platform-extraction-approval-counts', extractionId],
    enabled: !!extractionId,
    queryFn: async () => {
      const { count: total, error: e1 } = await supabase
        .from('platform_crm_extracted_leads' as never)
        .select('id', { count: 'exact', head: true })
        .eq('extraction_id', extractionId as string)
        .is('excluded_at', null);
      if (e1) throw e1;
      const { count: aprovados, error: e2 } = await supabase
        .from('platform_crm_extracted_leads' as never)
        .select('id', { count: 'exact', head: true })
        .eq('extraction_id', extractionId as string)
        .is('excluded_at', null)
        .not('approved_at', 'is', null);
      if (e2) throw e2;
      const t = total ?? 0;
      const a = aprovados ?? 0;
      return { total: t, aprovados: a, emTratamento: t - a };
    },
  });
}

export interface LeadFilters {
  segment?: LeadSegment | 'all';
  seedsOnly?: boolean;
  qualifiedOnly?: boolean;
  excludedOnly?: boolean;
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
          'id, extraction_id, handle, name, seguidores, seguindo, posts, telefone, whatsapp_link, email, instagram_url, website, categoria, bio, segment, qualified, is_seed, is_infoproduto, is_verified, is_private, geo_country, bio_lang, filter_verdicts, excluded_at, created_at, approved_at',
        )
        .eq('extraction_id', extractionId as string);
      // Lixeira: por padrão esconde os excluídos; excludedOnly mostra SÓ eles.
      if (filters.excludedOnly) q = q.not('excluded_at', 'is', null);
      else q = q.is('excluded_at', null);
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

/**
 * "Excluir de vez" (Lixeira, LGPD-safe): marca excluded_at, SANITIZA a PII do lead
 * (nome/telefone/bio/raw → null) e grava o @handle numa suppress-list
 * (platform_crm_lead_excluded) pra o perfil NUNCA mais voltar num scrap.
 */
export function useExcludeLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; handle: string | null; productId: string }) => {
      if (args.handle) {
        await supabase
          .from('platform_crm_lead_excluded' as never)
          .upsert(
            { product_id: args.productId, handle: args.handle } as never,
            { onConflict: 'product_id,handle', ignoreDuplicates: true },
          );
      }
      const { error } = await supabase
        .from('platform_crm_extracted_leads' as never)
        .update({
          excluded_at: new Date().toISOString(),
          name: null,
          primeiro_nome: null,
          telefone: null,
          whatsapp_link: null,
          email: null,
          bio: null,
          raw: null,
        } as never)
        .eq('id', args.id);
      if (error) throw error;
      return args;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-extracted-leads'] });
      toast.success('Excluído da base', { description: 'PII apagada e @ arquivado — não volta em buscas futuras.' });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao excluir'),
  });
}

/** Restaura da Lixeira (des-esconde + tira da suppress-list). A PII sanitizada não volta. */
export function useRestoreLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; handle: string | null; productId: string }) => {
      const { error } = await supabase
        .from('platform_crm_extracted_leads' as never)
        .update({ excluded_at: null } as never)
        .eq('id', args.id);
      if (error) throw error;
      if (args.handle) {
        await supabase
          .from('platform_crm_lead_excluded' as never)
          .delete()
          .eq('product_id', args.productId)
          .eq('handle', args.handle);
      }
      return args;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-extracted-leads'] });
      toast.success('Restaurado');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao restaurar'),
  });
}

/**
 * Preenche o WhatsApp MANUALMENTE (ex.: o telefone estava numa imagem do perfil).
 * Normaliza pra E.164 BR, monta o wa.me, e promove o lead a salao_cliente/qualified
 * (override humano — o Marcelo confirmou que é um lead de venda).
 */
export function useSetLeadPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; telefone: string }) => {
      let digits = args.telefone.replace(/\D/g, '');
      if (!digits) throw new Error('Telefone vazio');
      if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) digits = '55' + digits;
      const { error } = await supabase
        .from('platform_crm_extracted_leads' as never)
        .update({
          telefone: digits,
          whatsapp_link: `https://wa.me/${digits}`,
          phone_is_br: true,
          segment: 'salao_cliente',
          qualified: true,
        } as never)
        .eq('id', args.id);
      if (error) throw error;
      return args;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-extracted-leads'] });
      toast.success('WhatsApp salvo', { description: 'Lead promovido a qualificado (espaço-cliente).' });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao salvar telefone'),
  });
}

// ════════════════════════════════════════════════════════════════════════════
// BASE CONSOLIDADA (Prospecção Ativa) — dedup-por-@handle-com-merge + ações GLOBAIS.
//
// A tela "Buscas" (PlatformProspeccaoManager) age por `id` numa extração de cada
// vez (hooks acima, INTOCADOS). A "Base consolidada" lê a VIEW
// `platform_crm_consolidated_leads` (1 linha por handle, merge por COALESCE) e age
// por HANDLE em TODAS as origens. Os hooks abaixo são IRMÃOS dos por-id: mesmo
// payload/normalização, só troca o WHERE (id → product_id+handle) e a query key
// invalidada passa a incluir a view (mantém as duas telas em sincronia).
//
// ⚠️ handle-match por `.eq('handle', handleKey)` (igualdade exata), NÃO `ilike`:
// handles do Instagram contêm `_`/`.`, que o LIKE/ILIKE trata como curinga (bug).
// Fatos verificados: 0 handles nulos e 100% já em lowercase → `handle_key` (=
// lower(handle)) casa exatamente com o `handle` armazenado. Seguro e sem curinga.
// ════════════════════════════════════════════════════════════════════════════

/** Linha da view consolidada: ExtractedLead + metadados de merge por handle. */
export interface ConsolidatedLead extends ExtractedLead {
  product_id: string;
  handle_key: string;
  is_excluded: boolean;
  origin_count: number;
  extraction_ids: string[];
}

export interface ConsolidatedFilters {
  extractionId?: string | 'all';
  segment?: LeadSegment | 'all';
  withPhone?: 'with' | 'without' | 'all';
  seedsOnly?: boolean;
  qualifiedOnly?: boolean;
  excludedOnly?: boolean;
}

/**
 * Lê a VIEW consolidada (super_admin, product-scoped). 1 linha por (product_id,
 * handle) com campos mesclados de todas as extrações. `security_invoker=on` na view
 * garante a RLS super_admin_only da tabela base para o caller.
 */
export function usePlatformConsolidatedLeads(productId: string | null, filters: ConsolidatedFilters = {}) {
  return useQuery({
    queryKey: ['platform-consolidated-leads', productId, filters],
    enabled: !!productId,
    queryFn: async () => {
      let q = supabase
        .from('platform_crm_consolidated_leads' as never)
        .select('*')
        .eq('product_id', productId as string);
      // Lixeira: por padrão esconde o que foi excluído em QUALQUER origem.
      if (filters.excludedOnly) q = q.eq('is_excluded', true);
      else q = q.eq('is_excluded', false);
      if (filters.segment && filters.segment !== 'all') q = q.eq('segment', filters.segment); // preserva acionamento_via_instagram
      if (filters.extractionId && filters.extractionId !== 'all') q = q.contains('extraction_ids', [filters.extractionId]); // filtro por origem
      if (filters.withPhone === 'with') q = q.not('telefone', 'is', null);
      if (filters.withPhone === 'without') q = q.is('telefone', null);
      if (filters.seedsOnly) q = q.eq('is_seed', true);
      if (filters.qualifiedOnly) q = q.eq('qualified', true);
      // Base ÚNICA: o teto tem de cobrir TODA a base consolidada (F2), senão as
      // ações globais só alcançam os top-N por seguidores. Hoje ~4k handles; 10k dá
      // folga de crescimento. Se um dia passar disso, migrar para paginação real.
      const { data, error } = await q.order('seguidores', { ascending: false, nullsFirst: false }).limit(10000);
      if (error) throw error;
      return (data ?? []) as unknown as ConsolidatedLead[];
    },
  });
}

/** Invalida AS DUAS telas (Buscas + Base consolidada) após uma ação global. */
function invalidateBothLeadViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['platform-consolidated-leads'] });
  qc.invalidateQueries({ queryKey: ['platform-extracted-leads'] });
}

/** Reclassificação GLOBAL por handle (todas as origens). Irmão de useReclassifyLead. */
export function useReclassifyLeadByHandle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { productId: string; handle: string; segment?: LeadSegment; is_seed?: boolean }) => {
      const patch: Record<string, unknown> = {};
      if (args.segment !== undefined) {
        patch.segment = args.segment;
        patch.qualified = args.segment === 'salao_cliente';
      }
      if (args.is_seed !== undefined) patch.is_seed = args.is_seed;
      const { error } = await supabase
        .from('platform_crm_extracted_leads' as never)
        .update(patch as never)
        .eq('product_id', args.productId)
        .eq('handle', args.handle);
      if (error) throw error;
      return args;
    },
    onSuccess: () => invalidateBothLeadViews(qc),
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao reclassificar'),
  });
}

/** WhatsApp manual GLOBAL por handle (promove a qualificado em todas as origens). Irmão de useSetLeadPhone. */
export function useSetLeadPhoneByHandle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { productId: string; handle: string; telefone: string }) => {
      let digits = args.telefone.replace(/\D/g, '');
      if (!digits) throw new Error('Telefone vazio');
      if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) digits = '55' + digits;
      const { error } = await supabase
        .from('platform_crm_extracted_leads' as never)
        .update({
          telefone: digits,
          whatsapp_link: `https://wa.me/${digits}`,
          phone_is_br: true,
          segment: 'salao_cliente',
          qualified: true,
        } as never)
        .eq('product_id', args.productId)
        .eq('handle', args.handle);
      if (error) throw error;
      return args;
    },
    onSuccess: () => {
      invalidateBothLeadViews(qc);
      toast.success('WhatsApp salvo', { description: 'Lead promovido a qualificado (espaço-cliente) em todas as origens.' });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao salvar telefone'),
  });
}

/** Excluir de vez GLOBAL por handle: suppress-list (já global) + sanitiza PII em todas as origens. Irmão de useExcludeLead. */
export function useExcludeLeadByHandle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { productId: string; handle: string }) => {
      await supabase
        .from('platform_crm_lead_excluded' as never)
        .upsert(
          { product_id: args.productId, handle: args.handle } as never,
          { onConflict: 'product_id,handle', ignoreDuplicates: true },
        );
      const { error } = await supabase
        .from('platform_crm_extracted_leads' as never)
        .update({
          excluded_at: new Date().toISOString(),
          name: null,
          primeiro_nome: null,
          telefone: null,
          whatsapp_link: null,
          email: null,
          bio: null,
          raw: null,
        } as never)
        .eq('product_id', args.productId)
        .eq('handle', args.handle);
      if (error) throw error;
      return args;
    },
    onSuccess: () => {
      invalidateBothLeadViews(qc);
      toast.success('Excluído da base', { description: 'PII apagada e @ arquivado em todas as origens — não volta em buscas futuras.' });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao excluir'),
  });
}

/** Restaura da Lixeira GLOBAL por handle (des-esconde em todas as origens + tira da suppress-list). Irmão de useRestoreLead. */
export function useRestoreLeadByHandle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { productId: string; handle: string }) => {
      const { error } = await supabase
        .from('platform_crm_extracted_leads' as never)
        .update({ excluded_at: null } as never)
        .eq('product_id', args.productId)
        .eq('handle', args.handle);
      if (error) throw error;
      await supabase
        .from('platform_crm_lead_excluded' as never)
        .delete()
        .eq('product_id', args.productId)
        .eq('handle', args.handle);
      return args;
    },
    onSuccess: () => {
      invalidateBothLeadViews(qc);
      toast.success('Restaurado');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao restaurar'),
  });
}
