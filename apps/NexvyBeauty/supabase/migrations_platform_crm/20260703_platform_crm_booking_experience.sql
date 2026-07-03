-- D8 (P6) — restaura booking_experience em platform_crm_booking_event_types.
-- Aplicada em prod via MCP apply_migration em 2026-07-03 (projeto fzhlbwhdejumkyqosuvq).
-- 1:1 com a tabela tenant booking_event_types (que ja tem a coluna). A pagina publica
-- PlatformCrmPublicBooking JA ramifica em booking_experience==='conversational', mas a
-- coluna faltava no schema de plataforma -> o ramo conversacional ficava morto.
-- Default 'standard' preserva o comportamento de todos os event types existentes.
ALTER TABLE public.platform_crm_booking_event_types
  ADD COLUMN IF NOT EXISTS booking_experience text DEFAULT 'standard';
