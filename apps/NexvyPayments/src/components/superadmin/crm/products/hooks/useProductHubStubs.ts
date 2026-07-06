// ─────────────────────────────────────────────────────────────────────────────
// useProductHubStubs — hooks-stub tipados do HUB DO PRODUTO (D3 Fase 1a)
// Subsistemas cuja TABELA/EDGE ainda não existe no backend platform_crm_*.
// Padrão da onda: UI completa 1:1 + botão com TODO — zero dado fake, zero
// chamada a tabela inexistente (mantém tsc e runtime limpos).
//   TODO(table: platform_crm_product_knowledge_sources) — Cérebro (fontes)
//   TODO(table: platform_crm_materials) — Materiais
//   TODO(table: platform_crm_product_training_videos) — Playbook
//   TODO(table: platform_crm_objections) — Objeções
//   TODO(table: platform_crm_product_catalog_items) — Catálogo
//   TODO(table: platform_crm_product_ctas) — CTAs do chat
//   TODO(table: platform_crm_post_sale_event_actions/logs) — Pós-venda
//   TODO(table: platform_crm_email_templates) — templates de e-mail
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

/** Aviso padrão para ação cujo backend ainda não foi portado nesta fase. */
export function todoBackend(feature: string) {
  toast.info(`${feature}: backend ainda não portado nesta fase (D3 Fase 1a).`);
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

// TODO(table: platform_crm_product_knowledge_sources)
export function useProductKnowledgeSources(productId?: string) {
  return useQuery({
    queryKey: ['platform-crm', 'product-knowledge-sources', productId],
    queryFn: async () => [] as ProductKnowledgeSource[],
    enabled: !!productId,
  });
}

export function useProductKnowledgeSourceStats(productId?: string) {
  return useQuery({
    queryKey: ['platform-crm', 'product-knowledge-stats', productId],
    queryFn: async () => EMPTY_KNOWLEDGE_STATS,
    enabled: !!productId,
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

// TODO(table: platform_crm_materials)
export function useProductMaterials(productId?: string) {
  return useQuery({
    queryKey: ['platform-crm', 'product-materials', productId],
    queryFn: async () => [] as ProductMaterial[],
    enabled: !!productId,
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

// TODO(table: platform_crm_product_training_videos)
export function useProductTrainingVideos(productId?: string) {
  return useQuery({
    queryKey: ['platform-crm', 'product-training-videos', productId],
    queryFn: async () => [] as ProductTrainingVideo[],
    enabled: !!productId,
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

// TODO(table: platform_crm_objections)
export function useProductObjections(productId?: string) {
  return useQuery({
    queryKey: ['platform-crm', 'product-objections', productId],
    queryFn: async () => [] as ProductObjection[],
    enabled: !!productId,
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

// TODO(table: platform_crm_product_catalog_items)
export function useProductCatalogItems(productId?: string | null, search?: string) {
  return useQuery({
    queryKey: ['platform-crm', 'product-catalog-items', productId, search],
    queryFn: async () => [] as ProductCatalogItem[],
  });
}

// ─── CTAs inteligentes do chat ───────────────────────────────────────────────
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

// TODO(table: platform_crm_product_ctas)
export function useProductCTAs(productId?: string) {
  return useQuery({
    queryKey: ['platform-crm', 'product-ctas', productId],
    queryFn: async () => [] as ProductCTA[],
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
  add_tag_ids: string[] | null;
  remove_tag_ids: string[] | null;
  send_mode: 'none' | 'flow' | 'message' | null;
  flow_id: string | null;
  inline_message: string | null;
  message_channel: 'whatsapp' | 'email' | null;
  evolution_instance_id: string | null;
  target_stage_id: string | null;
  deal_outcome: 'none' | 'won' | 'lost' | null;
  deal_value_source: 'none' | 'webhook' | 'manual' | null;
  deal_value_manual: number | null;
  assign_sector_id: string | null;
  assign_user_id: string | null;
  agent_id: string | null;
  agent_objective: string | null;
  agent_extra_context: string | null;
  agent_outreach_mode: 'direct' | 'conversational' | null;
  email_template_id: string | null;
  delay_minutes: number | null;
}

export interface PostSaleEventLog {
  id: string;
  event_type: string;
  source: string | null;
  executed_actions: unknown;
  created_at: string;
}

// TODO(table: platform_crm_post_sale_event_actions)
export function useProductPostSaleEventActions(productId?: string) {
  return useQuery({
    queryKey: ['platform-crm', 'post-sale-event-actions', productId],
    queryFn: async () => [] as PostSaleEventAction[],
    enabled: !!productId,
  });
}

// TODO(table: platform_crm_post_sale_event_logs)
export function useProductPostSaleEventLogs(productId?: string, _limit = 15) {
  return useQuery({
    queryKey: ['platform-crm', 'post-sale-event-logs', productId],
    queryFn: async () => [] as PostSaleEventLog[],
    enabled: !!productId,
  });
}

// ─── Templates de e-mail ─────────────────────────────────────────────────────
export interface EmailTemplateRef {
  id: string;
  name: string;
}

// TODO(table: platform_crm_email_templates)
export function useProductEmailTemplates() {
  return useQuery({
    queryKey: ['platform-crm', 'email-templates'],
    queryFn: async () => [] as EmailTemplateRef[],
  });
}
