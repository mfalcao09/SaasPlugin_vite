-- §1 MERGE + §2 cancel D+2 — execução 2026-09-02

BEGIN;

UPDATE platform_crm_messages
SET conversation_id = '7e427cd4-5181-445d-9eb1-f05906b8f42d'
WHERE conversation_id = '032bcfbf-911a-4a14-b05b-835e62f0471a';

UPDATE platform_crm_conversations
SET status = 'closed', needs_human = false, updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || '{"merged_into":"7e427cd4-5181-445d-9eb1-f05906b8f42d","merge_reason":"F5_duplicate_phone_20260902"}'::jsonb
WHERE id = '032bcfbf-911a-4a14-b05b-835e62f0471a';

UPDATE platform_crm_messages
SET conversation_id = '01385b74-29ab-4044-bf10-3a2bcc26928c'
WHERE conversation_id = '1bb81b0f-76f7-428c-98df-7033b39d092a';

UPDATE platform_crm_conversations
SET status = 'closed', needs_human = false, updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || '{"merged_into":"01385b74-29ab-4044-bf10-3a2bcc26928c","merge_reason":"F5_duplicate_phone_20260902"}'::jsonb
WHERE id = '1bb81b0f-76f7-428c-98df-7033b39d092a';

UPDATE platform_crm_messages
SET conversation_id = 'db870f09-54d1-4e1b-a221-6af8fb24788f'
WHERE conversation_id = '7c7f27c8-bef3-4c5f-a73a-bbbe0dc007b1';

UPDATE platform_crm_conversations
SET status = 'closed', needs_human = false, updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || '{"merged_into":"db870f09-54d1-4e1b-a221-6af8fb24788f","merge_reason":"F5_duplicate_phone_20260902"}'::jsonb
WHERE id = '7c7f27c8-bef3-4c5f-a73a-bbbe0dc007b1';

UPDATE platform_crm_conversations c
SET last_message_at = sub.max_at, updated_at = now()
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

COMMIT;

UPDATE platform_crm_cold_outreach_queue
SET next_followup_at = NULL,
    skip_reason = 'INCIDENT_RECOVERY_20260902_MANUAL',
    updated_at = now()
WHERE campaign_id = 'b480ed6e-73c8-43ec-addd-9c05c6ac68da'
  AND telefone IN (
    '5538988383104', '5513992028635', '5584981356722',
    '5568999576171', '5521971449182'
  );
