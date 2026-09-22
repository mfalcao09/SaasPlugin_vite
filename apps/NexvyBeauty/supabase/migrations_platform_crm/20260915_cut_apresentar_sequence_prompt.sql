-- Corte sequência APRESENTAR (cascata 15s) + prompt operacional opening/FU.
-- Código: APRESENTAR_SEQUENCE_ENABLED=false em apresentar-sequence.ts
-- Prompt live já aplicado em platform_crm_product_agents (Camila).
-- Este arquivo é trilha auditável; re-aplicar prompt via evidence file se necessário.

UPDATE platform_crm_conversations
SET metadata = (metadata - 'apresentar_sequence')
  || jsonb_build_object(
       'apresentar_sequence_cleared_at', now()::text,
       'apresentar_sequence_cleared_reason', 'cut_20260915_kernel_align'
     ),
    updated_at = now()
WHERE metadata->'apresentar_sequence'->>'status' = 'in_progress';
