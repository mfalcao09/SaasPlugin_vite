// ─────────────────────────────────────────────────────────────────────────────
// useProductHubStubs — hooks do HUB DO PRODUTO (D3 · P2.A-1: fim dos stubs)
// ----------------------------------------------------------------------------
// As 10 tabelas product-scoped do "cérebro dos agentes" JÁ EXISTEM no banco
// (RLS super_admin). Este arquivo agora PERSISTE de verdade — CRUD real via
// React Query no mesmo padrão dos hooks vivos em crm/data/usePlatformCrm*.ts
// (queryKey PLATFORM_CRM_KEY + invalidation no onSuccess).
//
//   hook → tabela
//   useProductKnowledgeSources / Stats  → platform_crm_product_knowledge_sources
//   useProductMaterials                 → platform_crm_materials
//   useProductTrainingVideos            → platform_crm_product_training_videos
//   useProductObjections                → platform_crm_objections
//   useProductCatalogItems              → platform_crm_product_catalog_items
//   useProductCTAs                      → platform_crm_product_ctas
//   useProductPostSaleEventActions/Logs → platform_crm_post_sale_event_actions(+_logs)
//   useProductEmailTemplates            → platform_crm_email_templates (platform-wide)
//
// TYPES: as 10 gêmeas ainda não estão no types.ts gerado (regen global = churn
// gigante — vira single-line minificado sobre 18k linhas formatadas). Seguimos o
// padrão que o repo JÁ pratica para tabelas fora do types (ver usePlatformPlans →
// public_plans): cast local tipado `(supabase as any).from(...)` + interfaces locais.
//
// AINDA STUB (fica pro P2.A-2 — processamento/embedding/edges): upload de arquivos
// e crawl/transcrição no Cérebro, import CSV e sync de site do Catálogo, gerações
// com IA (objeções). Esses seguem com todoBackend()/useTodoMutation().
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PLATFORM_CRM_KEY = 'platform-crm';

/** Acesso às gêmeas platform_crm_* que ainda não estão no types.ts gerado. */
const db = supabase as any;

/** Aviso padrão para ação cujo backend ainda não foi portado nesta fase (P2.A-2). */
export function todoBackend(feature: string) {
  toast.info(`${feature}: backend ainda não portado nesta fase (P2.A-2).`);
}

/** Mutação inerte: mantém API do react-query (mutate/isPending) sem tocar backend. */
export function useTodoMutation(feature: string) {
  return useMutation({
    mutationFn: async (_payload?: unknown) => {
      todoBackend(feature);
      return null;
    },
  });
}

// ─── Cérebro: fontes de conhecimento ─────────────────────────────────────────
export interface ProductKnowledgeSource {
  id: string;
  product_id: string;
  source_type: 'file' | 'website' | 'youtube' | 'faq' | 'data' | 'training' | 'catalog';
  title: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  is_active: boolean;
  created_at: string;
}

export interface KnowledgeSourceStats {
  file: number;
  website: number;
  youtube: number;
  faq: number;
  data: number;
  training: number;
  catalog: number;
  total: number;
  completed: number;
  processing: number;
  failed: number;
}

const EMPTY_KNOWLEDGE_STATS: KnowledgeSourceStats = {
  file: 0, website: 0, youtube: 0, faq: 0, data: 0, training: 0, catalog: 0,
  total: 0, completed: 0, processing: 0, failed: 0,
};

export function useProductKnowledgeSources(productId?: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'product-knowledge-sources', productId],
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_crm_product_knowledge_sources')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductKnowledgeSource[];
    },
    enabled: !!productId,
  });
}

export function useProductKnowledgeSourceStats(productId?: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'product-knowledge-stats', productId],
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_crm_product_knowledge_sources')
        .select('source_type, processing_status')
        .eq('product_id', productId);
      if (error) throw error;

      const stats: KnowledgeSourceStats = { ...EMPTY_KNOWLEDGE_STATS };
      (data ?? []).forEach((row: { source_type: string; processing_status: string }) => {
        stats.total++;
        if (row.source_type in stats) {
          (stats as any)[row.source_type]++;
        }
        if (row.processing_status === 'completed') stats.completed++;
        else if (row.processing_status === 'processing') stats.processing++;
        else if (row.processing_status === 'failed') stats.failed++;
      });
      return stats;
    },
    enabled: !!productId,
  });
}

/** CRUD do Cérebro — insere fontes de texto direto (FAQ / Treinamento).
 *  Arquivos/website/youtube (storage + crawl + transcrição) ficam no P2.A-2. */
export interface CreateKnowledgeSourceInput {
  product_id: string;
  source_type: 'file' | 'website' | 'youtube' | 'faq' | 'data' | 'training';
  title: string;
  question?: string | null;
  answer?: string | null;
  raw_content?: string | null;
  extracted_content?: string | null;
  source_url?: string | null;
}

export function useCreateProductKnowledgeSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateKnowledgeSourceInput) => {
      const { data, error } = await db
        .from('platform_crm_product_knowledge_sources')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as ProductKnowledgeSource;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-knowledge-sources', vars.product_id] });
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-knowledge-stats', vars.product_id] });
    },
  });
}

export function useDeleteProductKnowledgeSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; productId?: string }) => {
      const { error } = await db.from('platform_crm_product_knowledge_sources').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-knowledge-sources', vars.productId] });
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-knowledge-stats', vars.productId] });
    },
  });
}

// ─── Materiais de venda ──────────────────────────────────────────────────────
export interface ProductMaterial {
  id: string;
  product_id: string;
  name: string;
  type: 'pdf' | 'video' | 'image' | 'link' | 'banner';
  url: string;
  objective: string | null;
  tags: string[] | null;
  status: string | null;
  created_at?: string;
}

export function useProductMaterials(productId?: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'product-materials', productId],
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_crm_materials')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductMaterial[];
    },
    enabled: !!productId,
  });
}

export interface CreateMaterialInput {
  product_id: string;
  name: string;
  type: 'pdf' | 'video' | 'image' | 'link' | 'banner';
  url: string;
  objective?: string | null;
  tags?: string[];
  status?: string;
}

export function useCreateProductMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMaterialInput) => {
      const { data, error } = await db
        .from('platform_crm_materials')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as ProductMaterial;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-materials', vars.product_id] });
    },
  });
}

export function useDeleteProductMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; productId?: string }) => {
      const { error } = await db.from('platform_crm_materials').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-materials', vars.productId] });
    },
  });
}

// ─── Playbook: vídeo aulas ───────────────────────────────────────────────────
export interface ProductTrainingVideo {
  id: string;
  product_id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  order_index?: number | null;
  is_active?: boolean;
}

export function useProductTrainingVideos(productId?: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'product-training-videos', productId],
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_crm_product_training_videos')
        .select('*')
        .eq('product_id', productId)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductTrainingVideo[];
    },
    enabled: !!productId,
  });
}

export interface CreateTrainingVideoInput {
  product_id: string;
  title: string;
  video_url: string;
  description?: string | null;
  thumbnail_url?: string | null;
}

export function useCreateProductTrainingVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTrainingVideoInput) => {
      const { data, error } = await db
        .from('platform_crm_product_training_videos')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as ProductTrainingVideo;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-training-videos', vars.product_id] });
    },
  });
}

export function useDeleteProductTrainingVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; productId?: string }) => {
      const { error } = await db.from('platform_crm_product_training_videos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-training-videos', vars.productId] });
    },
  });
}

// ─── Objeções (shape da fonte: hooks/useObjections.ts) ───────────────────────
export interface ProductObjection {
  id: string;
  category: 'price' | 'trust' | 'timing' | 'thinking' | 'partner' | 'competitor';
  whatTheySay: string;
  whatTheyMean: string;
  suggestedResponse: string;
  followUpQuestion: string;
  proofMaterialId?: string;
}

const OBJECTION_CATEGORIES = ['price', 'trust', 'timing', 'thinking', 'partner', 'competitor'] as const;

function mapObjectionCategory(category: string): ProductObjection['category'] {
  return OBJECTION_CATEGORIES.includes(category as any)
    ? (category as ProductObjection['category'])
    : 'thinking';
}

export function useProductObjections(productId?: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'product-objections', productId],
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_crm_objections')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((o: any): ProductObjection => ({
        id: o.id,
        category: mapObjectionCategory(o.category),
        whatTheySay: o.what_they_say,
        whatTheyMean: o.what_they_mean ?? '',
        suggestedResponse: o.suggested_response,
        followUpQuestion: o.follow_up_question ?? '',
        proofMaterialId: o.proof_material_id ?? undefined,
      }));
    },
    enabled: !!productId,
  });
}

export interface CreateObjectionInput {
  product_id: string;
  category: string;
  whatTheySay: string;
  whatTheyMean?: string;
  suggestedResponse: string;
  followUpQuestion?: string;
  proofMaterialId?: string | null;
}

export function useCreateProductObjection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateObjectionInput) => {
      const { data, error } = await db
        .from('platform_crm_objections')
        .insert({
          product_id: input.product_id,
          category: input.category,
          what_they_say: input.whatTheySay,
          what_they_mean: input.whatTheyMean || null,
          suggested_response: input.suggestedResponse,
          follow_up_question: input.followUpQuestion || null,
          proof_material_id: input.proofMaterialId || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-objections', vars.product_id] });
    },
  });
}

export function useDeleteProductObjection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; productId?: string }) => {
      const { error } = await db.from('platform_crm_objections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-objections', vars.productId] });
    },
  });
}

// ─── Catálogo (shape da fonte: hooks/useCatalogItems.ts, sem organization_id) ─
export interface ProductCatalogItem {
  id: string;
  product_id: string | null;
  external_id: string | null;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  url: string | null;
  thumbnail_url: string | null;
  images: string[];
  videos: string[];
  documents: Array<{ url: string; name: string; type?: string }>;
  attributes: Record<string, any>;
  tags: string[];
  source_type: 'manual' | 'firecrawl' | 'webhook' | 'api' | 'csv';
  source_url: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useProductCatalogItems(productId?: string | null, search?: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'product-catalog-items', productId, search],
    queryFn: async () => {
      let q = db
        .from('platform_crm_product_catalog_items')
        .select('*')
        .order('updated_at', { ascending: false });
      if (productId) q = q.eq('product_id', productId);
      if (search && search.trim()) {
        q = q.textSearch('search_vector', search, { config: 'portuguese', type: 'websearch' });
      }
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return (data ?? []) as ProductCatalogItem[];
    },
    // Consistente com as irmãs do hub: sem produto ativo não lista catálogo
    // cross-produto (a coluna é product-scoped).
    enabled: !!productId,
  });
}

export interface CatalogItemPayload {
  product_id: string;
  title: string;
  description?: string | null;
  price?: number | null;
  url?: string | null;
  thumbnail_url?: string | null;
  images?: string[];
  videos?: string[];
  documents?: Array<{ url: string; name: string; type?: string }>;
  attributes?: Record<string, any>;
  tags?: string[];
  is_active?: boolean;
  external_id?: string | null;
  source_type?: 'manual' | 'firecrawl' | 'webhook' | 'api' | 'csv';
}

export function useCreateProductCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CatalogItemPayload) => {
      const { data, error } = await db
        .from('platform_crm_product_catalog_items')
        .insert({ source_type: 'manual', ...input })
        .select()
        .single();
      if (error) throw error;
      return data as ProductCatalogItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-catalog-items'] });
    },
  });
}

export function useUpdateProductCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CatalogItemPayload> & { id: string }) => {
      const { data, error } = await db
        .from('platform_crm_product_catalog_items')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ProductCatalogItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-catalog-items'] });
    },
  });
}

export function useDeleteProductCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('platform_crm_product_catalog_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'product-catalog-items'] });
    },
  });
}

// ─── CTAs inteligentes do chat ───────────────────────────────────────────────
// (leitura religada; sem consumidor de mutação no hub ainda — CTA management UI
//  vem com a onda de Chat/Agentes.)
export interface ProductCTA {
  id: string;
  product_id: string;
  cta_type: 'checkout' | 'whatsapp' | 'calendar' | 'callback' | 'video' | 'custom';
  label: string;
  action_url: string | null;
  whatsapp_number: string | null;
  whatsapp_message: string | null;
  video_url: string | null;
  intent_level: 'high' | 'medium' | 'low';
  trigger_keywords: string[] | null;
  display_order: number | null;
  is_active: boolean;
}

export function useProductCTAs(productId?: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'product-ctas', productId],
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_crm_product_ctas')
        .select('*')
        .eq('product_id', productId)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProductCTA[];
    },
    enabled: !!productId,
  });
}

// ─── Pós-venda (shape da fonte: hooks/usePostSaleEventActions.ts) ────────────
export const POST_SALE_EVENT_TYPES = [
  { value: 'compra_aprovada', label: 'Compra Aprovada', description: 'Pagamento confirmado, entregar acesso' },
  { value: 'pix_gerado', label: 'PIX Gerado', description: 'Lembrar e converter PIX pendente' },
  { value: 'boleto_gerado', label: 'Boleto Gerado', description: 'Lembrar do boleto antes do vencimento' },
  { value: 'carrinho_abandonado', label: 'Carrinho Abandonado', description: 'Recuperar checkout não finalizado' },
  { value: 'reembolso', label: 'Reembolso / Estorno', description: 'Lidar com cancelamento e tentativa de retenção' },
  { value: 'chargeback', label: 'Chargeback', description: 'Disputa de pagamento iniciada' },
  { value: 'assinatura_cancelada', label: 'Assinatura Cancelada', description: 'Recuperar assinante perdido' },
] as const;

export interface PostSaleEventAction {
  id: string;
  product_id: string;
  event_type: string;
  is_active: boolean;
  // NOT NULL DEFAULT no banco — o default só vale na OMISSÃO, não em null
  // explícito; tipo alinhado à realidade pra o tsc barrar um null futuro.
  add_tag_ids: string[];
  remove_tag_ids: string[];
  send_mode: 'none' | 'flow' | 'message';
  flow_id: string | null;
  inline_message: string | null;
  message_channel: 'whatsapp' | 'email';
  evolution_instance_id: string | null;
  target_stage_id: string | null;
  deal_outcome: 'none' | 'won' | 'lost';
  deal_value_source: 'none' | 'webhook' | 'manual';
  deal_value_manual: number | null;
  assign_sector_id: string | null;
  assign_user_id: string | null;
  agent_id: string | null;
  agent_objective: string | null;
  agent_extra_context: string | null;
  agent_outreach_mode: 'direct' | 'conversational';
  email_template_id: string | null;
  delay_minutes: number;
}

export interface PostSaleEventLog {
  id: string;
  event_type: string;
  source: string | null;
  executed_actions: unknown;
  created_at: string;
}

export function useProductPostSaleEventActions(productId?: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'post-sale-event-actions', productId],
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_crm_post_sale_event_actions')
        .select('*')
        .eq('product_id', productId)
        .order('event_type', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PostSaleEventAction[];
    },
    enabled: !!productId,
  });
}

export function useProductPostSaleEventLogs(productId?: string, limit = 15) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'post-sale-event-logs', productId, limit],
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_crm_post_sale_event_logs')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PostSaleEventLog[];
    },
    enabled: !!productId,
  });
}

/** Upsert de ação pós-venda: update por id (existente) ou insert (novo).
 *  UNIQUE(product_id, event_type) garante 1 regra por evento. */
export type PostSaleEventActionInput = Omit<PostSaleEventAction, 'id'> & { id?: string };

export function useUpsertProductPostSaleEventAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PostSaleEventActionInput) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await db
          .from('platform_crm_post_sale_event_actions')
          .update(rest)
          .eq('id', id);
        if (error) throw error;
        return id;
      }
      const { id: _omit, ...insertData } = input;
      const { data, error } = await db
        .from('platform_crm_post_sale_event_actions')
        .insert(insertData)
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'post-sale-event-actions', vars.product_id] });
      toast.success('Ação salva');
    },
    onError: (e: any) => toast.error('Erro ao salvar: ' + e.message),
  });
}

export function useDeleteProductPostSaleEventAction(productId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('platform_crm_post_sale_event_actions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'post-sale-event-actions', productId] });
      toast.success('Ação removida');
    },
    onError: (e: any) => toast.error('Erro ao remover: ' + e.message),
  });
}

// ─── Templates de e-mail (platform-wide — sem product_id) ────────────────────
export interface EmailTemplateRef {
  id: string;
  name: string;
}

export function useProductEmailTemplates() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'email-templates'],
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_crm_email_templates')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmailTemplateRef[];
    },
  });
}
