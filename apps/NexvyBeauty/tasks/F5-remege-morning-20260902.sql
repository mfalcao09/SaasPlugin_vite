-- F5 re-merge morning messages from duplicate threads → canons
-- 2026-09-02 — NO WhatsApp sends, NO campaign unpause
-- Camila: 68aeece9-26f2-4f7b-a595-a6ea5e8acfa7
-- Product: 806b5975-e268-402e-a65c-9e9503271041

BEGIN;

-- ─── 1) Move messages dup → canon ───────────────────────────────────────────

-- Deise: 032bcfbf → 7e427cd4
UPDATE platform_crm_messages
SET conversation_id = '7e427cd4-5181-445d-9eb1-f05906b8f42d'
WHERE conversation_id = '032bcfbf-911a-4a14-b05b-835e62f0471a';

-- Ellas: 1bb81b0f → 01385b74
UPDATE platform_crm_messages
SET conversation_id = '01385b74-29ab-4044-bf10-3a2bcc26928c'
WHERE conversation_id = '1bb81b0f-76f7-428c-98df-7033b39d092a';

-- Jeissiane: 7c7f27c8 → db870f09
UPDATE platform_crm_messages
SET conversation_id = 'db870f09-54d1-4e1b-a221-6af8fb24788f'
WHERE conversation_id = '7c7f27c8-bef3-4c5f-a73a-bbbe0dc007b1';

-- ─── 2) Close duplicates + merge metadata ───────────────────────────────────

UPDATE platform_crm_conversations
SET status = 'closed',
    needs_human = false,
    current_agent_id = NULL,
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'merged_into', '7e427cd4-5181-445d-9eb1-f05906b8f42d',
      'merge_reason', 'F5_remege_morning_20260902',
      'merged_at', now()
    )
WHERE id = '032bcfbf-911a-4a14-b05b-835e62f0471a';

UPDATE platform_crm_conversations
SET status = 'closed',
    needs_human = false,
    current_agent_id = NULL,
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'merged_into', '01385b74-29ab-4044-bf10-3a2bcc26928c',
      'merge_reason', 'F5_remege_morning_20260902',
      'merged_at', now()
    )
WHERE id = '1bb81b0f-76f7-428c-98df-7033b39d092a';

UPDATE platform_crm_conversations
SET status = 'closed',
    needs_human = false,
    current_agent_id = NULL,
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'merged_into', 'db870f09-54d1-4e1b-a221-6af8fb24788f',
      'merge_reason', 'F5_remege_morning_20260902',
      'merged_at', now()
    )
WHERE id = '7c7f27c8-bef3-4c5f-a73a-bbbe0dc007b1';

-- ─── 3) Refresh last_message_at on the 3 canons that received messages ──────

UPDATE platform_crm_conversations c
SET last_message_at = sub.max_at,
    updated_at = now()
FROM (
  SELECT conversation_id, max(created_at) AS max_at
  FROM platform_crm_messages
  WHERE conversation_id IN (
    '7e427cd4-5181-445d-9eb1-f05906b8f42d',
    '01385b74-29ab-4044-bf10-3a2bcc26928c',
    'db870f09-54d1-4e1b-a221-6af8fb24788f'
  )
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id;

-- ─── 4) Pin Camila on 5 canons ──────────────────────────────────────────────

UPDATE platform_crm_conversations
SET status = 'bot_active',
    needs_human = false,
    current_agent_id = '68aeece9-26f2-4f7b-a595-a6ea5e8acfa7',
    updated_at = now()
WHERE id IN (
  '7e427cd4-5181-445d-9eb1-f05906b8f42d',  -- Deise
  '01385b74-29ab-4044-bf10-3a2bcc26928c',  -- Ellas
  'db870f09-54d1-4e1b-a221-6af8fb24788f',  -- Jeissiane
  'e882518f-5ebd-457d-8c3c-dc33f400a7a1',  -- Expert
  'db7991a9-df6c-4665-8d9b-481b1cc48d53'   -- Emilly
);

COMMIT;
