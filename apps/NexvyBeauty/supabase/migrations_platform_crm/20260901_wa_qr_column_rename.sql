-- C-hard-3: rename FK columns platform → wa_qr_instance_id.
-- Tenant tables (product_agents, webchat_conversations, …) NÃO entram.
-- Rollback:
--   ALTER TABLE … RENAME COLUMN wa_qr_instance_id TO evolution_instance_id;

ALTER TABLE public.platform_crm_conversations
  RENAME COLUMN evolution_instance_id TO wa_qr_instance_id;

ALTER TABLE public.platform_crm_product_agents
  RENAME COLUMN evolution_instance_id TO wa_qr_instance_id;

ALTER TABLE public.platform_crm_post_sale_event_actions
  RENAME COLUMN evolution_instance_id TO wa_qr_instance_id;

ALTER INDEX IF EXISTS public.idx_platform_crm_conversations_evolution_instance
  RENAME TO idx_platform_crm_conversations_wa_qr_instance;

ALTER TABLE public.platform_crm_conversations
  RENAME CONSTRAINT platform_crm_conversations_evolution_instance_id_fkey
  TO platform_crm_conversations_wa_qr_instance_id_fkey;

ALTER TABLE public.platform_crm_product_agents
  RENAME CONSTRAINT platform_crm_product_agents_evolution_instance_id_fkey
  TO platform_crm_product_agents_wa_qr_instance_id_fkey;
