-- F5 — Retomada segura: 5 contatos reais (incidente 2026-09-02)
-- Executar em ordem. Campanha NÃO é re-armada aqui.
--
-- Canônicos (envio real + cold_outreach_abertura):
--   7e427cd4-5181-445d-9eb1-f05906b8f42d  Deise      +5538988383104
--   e882518f-5ebd-457d-8c3c-dc33f400a7a1  Expert     +5513992028635
--   01385b74-29ab-4044-bf10-3a2bcc26928c  Ellas      +5584981356722
--   db870f09-54d1-4e1b-a221-6af8fb24788f  Jeissiane  +5568999576171
--   db7991a9-df6c-4665-8d9b-481b1cc48d53  Emilly     +5521971449182
--
-- Duplicatas (webhook, telefone sem 9º dígito):
--   032bcfbf-911a-4a14-b05b-835e62f0471a  → merge → Deise
--   1bb81b0f-76f7-428c-98df-7033b39d092a  → merge → Ellas
--   7c7f27c8-bef3-4c5f-a73a-bbbe0dc007b1  → merge → Jeissiane

-- ═══════════════════════════════════════════════════════════════════════════
-- §0 AUDITORIA (read-only — rodar antes e depois)
-- ═══════════════════════════════════════════════════════════════════════════

-- 0a) Contagem por tipo
SELECT
  CASE
    WHEN id IN (
      '7e427cd4-5181-445d-9eb1-f05906b8f42d',
      'e882518f-5ebd-457d-8c3c-dc33f400a7a1',
      '01385b74-29ab-4044-bf10-3a2bcc26928c',
      'db870f09-54d1-4e1b-a221-6af8fb24788f',
      'db7991a9-df6c-4665-8d9b-481b1cc48d53'
    ) THEN 'canonical'
    WHEN id IN (
      '032bcfbf-911a-4a14-b05b-835e62f0471a',
      '1bb81b0f-76f7-428c-98df-7033b39d092a',
      '7c7f27c8-bef3-4c5f-a73a-bbbe0dc007b1'
    ) THEN 'duplicate'
    ELSE 'other'
  END AS bucket,
  count(*) AS n
FROM platform_crm_conversations
WHERE id IN (
  '7e427cd4-5181-445d-9eb1-f05906b8f42d',
  'e882518f-5ebd-457d-8c3c-dc33f400a7a1',
  '01385b74-29ab-4044-bf10-3a2bcc26928c',
  'db870f09-54d1-4e1b-a221-6af8fb24788f',
  'db7991a9-df6c-4665-8d9b-481b1cc48d53',
  '032bcfbf-911a-4a14-b05b-835e62f0471a',
  '1bb81b0f-76f7-428c-98df-7033b39d092a',
  '7c7f27c8-bef3-4c5f-a73a-bbbe0dc007b1'
)
GROUP BY 1;

-- 0b) Mensagens por thread
SELECT c.visitor_phone, c.status, count(m.id) AS msgs
FROM platform_crm_conversations c
LEFT JOIN platform_crm_messages m ON m.conversation_id = c.id
WHERE c.id IN (
  '7e427cd4-5181-445d-9eb1-f05906b8f42d',
  'e882518f-5ebd-457d-8c3c-dc33f400a7a1',
  '01385b74-29ab-4044-bf10-3a2bcc26928c',
  'db870f09-54d1-4e1b-a221-6af8fb24788f',
  'db7991a9-df6c-4665-8d9b-481b1cc48d53',
  '032bcfbf-911a-4a14-b05b-835e62f0471a',
  '1bb81b0f-76f7-428c-98df-7033b39d092a',
  '7c7f27c8-bef3-4c5f-a73a-bbbe0dc007b1'
)
GROUP BY c.visitor_phone, c.status
ORDER BY c.visitor_phone;


-- ═══════════════════════════════════════════════════════════════════════════
-- §1 MERGE duplicatas → canônicas (EXECUTAR — fecha 8→5 no CRM)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Deise: duplicata 032bcfbf → canônica 7e427cd4
UPDATE platform_crm_messages
SET conversation_id = '7e427cd4-5181-445d-9eb1-f05906b8f42d'
WHERE conversation_id = '032bcfbf-911a-4a14-b05b-835e62f0471a';

UPDATE platform_crm_conversations
SET status = 'closed', needs_human = false, updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || '{"merged_into":"7e427cd4-5181-445d-9eb1-f05906b8f42d","merge_reason":"F5_duplicate_phone_20260902"}'::jsonb
WHERE id = '032bcfbf-911a-4a14-b05b-835e62f0471a';

-- Ellas: 1bb81b0f → 01385b74
UPDATE platform_crm_messages
SET conversation_id = '01385b74-29ab-4044-bf10-3a2bcc26928c'
WHERE conversation_id = '1bb81b0f-76f7-428c-98df-7033b39d092a';

UPDATE platform_crm_conversations
SET status = 'closed', needs_human = false, updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || '{"merged_into":"01385b74-29ab-4044-bf10-3a2bcc26928c","merge_reason":"F5_duplicate_phone_20260902"}'::jsonb
WHERE id = '1bb81b0f-76f7-428c-98df-7033b39d092a';

-- Jeissiane: 7c7f27c8 → db870f09
UPDATE platform_crm_messages
SET conversation_id = 'db870f09-54d1-4e1b-a221-6af8fb24788f'
WHERE conversation_id = '7c7f27c8-bef3-4c5f-a73a-bbbe0dc007b1';

UPDATE platform_crm_conversations
SET status = 'closed', needs_human = false, updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || '{"merged_into":"db870f09-54d1-4e1b-a221-6af8fb24788f","merge_reason":"F5_duplicate_phone_20260902"}'::jsonb
WHERE id = '7c7f27c8-bef3-4c5f-a73a-bbbe0dc007b1';

-- Atualizar last_message_at nas canônicas
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


-- ═══════════════════════════════════════════════════════════════════════════
-- §2 CANCELAR cadência D+2 automática (04/set)
--     A retomada NÃO é follow-up cold — é correção hoje cedo (02/set 8–10h).
--     Este UPDATE impede processFollowups de mandar renderFollowup() errado.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE platform_crm_cold_outreach_queue
SET next_followup_at = NULL,
    skip_reason = 'INCIDENT_RECOVERY_20260902_MANUAL',
    updated_at = now()
    -- status permanece 'sent' (abertura real foi feita); cadência D+2 cancelada
WHERE campaign_id = 'b480ed6e-73c8-43ec-addd-9c05c6ac68da'
  AND telefone IN (
    '5538988383104', '5513992028635', '5584981356722',
    '5568999576171', '5521971449182'
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- §3 PREPARAR conversas para retomada HOJE CEDO (08–10h BRT)
--     Descomentar antes da janela de envio.
-- ═══════════════════════════════════════════════════════════════════════════

-- UPDATE platform_crm_conversations
-- SET status = 'bot_active',
--     needs_human = false,
--     current_agent_id = '68aeece9-26f2-4f7b-a595-a6ea5e8acfa7',
--     assigned_to = NULL,
--     updated_at = now()
-- WHERE id IN (
--   '7e427cd4-5181-445d-9eb1-f05906b8f42d',
--   'e882518f-5ebd-457d-8c3c-dc33f400a7a1',
--   '01385b74-29ab-4044-bf10-3a2bcc26928c',
--   'db870f09-54d1-4e1b-a221-6af8fb24788f',
--   'db7991a9-df6c-4665-8d9b-481b1cc48d53'
-- );


-- ═══════════════════════════════════════════════════════════════════════════
-- §4 REATIVAR Camila (agente) — antes da janela 08–10h de hoje
-- ═══════════════════════════════════════════════════════════════════════════

-- UPDATE platform_crm_product_agents
-- SET is_active = true, active_in_whatsapp = true, updated_at = now()
-- WHERE id = '68aeece9-26f2-4f7b-a595-a6ea5e8acfa7';


-- ═══════════════════════════════════════════════════════════════════════════
-- §5 REMOVER opt-out de contenção (só dos 5 canônicos — NÃO foi opt-out real)
-- ═══════════════════════════════════════════════════════════════════════════

-- DELETE FROM platform_crm_lead_optout
-- WHERE product_id = '806b5975-e268-402e-a65c-9e9503271041'
--   AND reason = 'INCIDENT_20260902'
--   AND telefone IN (
--     '5538988383104', '5513992028635', '5584981356722',
--     '5568999576171', '5521971449182'
--   );


-- ═══════════════════════════════════════════════════════════════════════════
-- §6 RETOMADA HOJE CEDO — ai-reactivate (não executar via SQL)
--
-- Janela: 2026-09-02 08:00–10:00 America/Sao_Paulo
-- Ordem: Expert → Emilly → Deise → Ellas → Jeissiane (~15–20 min entre cada)
--
-- POST .../platform-webchat-inbox  action=ai-reactivate
--   agent_id: 68aeece9-26f2-4f7b-a595-a6ea5e8acfa7
--   objective: completar bolhas 2–4 APRESENTAR (NÃO follow-up D+2)
--   extra_context: INCIDENT_20260902 retomada manhã 02/set
--
-- UUIDs canônicos:
--   Expert     e882518f-5ebd-457d-8c3c-dc33f400a7a1
--   Emilly     db7991a9-df6c-4665-8d9b-481b1cc48d53
--   Deise      7e427cd4-5181-445d-9eb1-f05906b8f42d
--   Ellas      01385b74-29ab-4044-bf10-3a2bcc26928c
--   Jeissiane  db870f09-54d1-4e1b-a221-6af8fb24788f
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- §7 VERIFICAÇÃO pós-F5
-- ═══════════════════════════════════════════════════════════════════════════

SELECT id, visitor_phone, status, needs_human,
       (SELECT count(*) FROM platform_crm_messages m WHERE m.conversation_id = c.id) AS msgs
FROM platform_crm_conversations c
WHERE id IN (
  '7e427cd4-5181-445d-9eb1-f05906b8f42d',
  'e882518f-5ebd-457d-8c3c-dc33f400a7a1',
  '01385b74-29ab-4044-bf10-3a2bcc26928c',
  'db870f09-54d1-4e1b-a221-6af8fb24788f',
  'db7991a9-df6c-4665-8d9b-481b1cc48d53',
  '032bcfbf-911a-4a14-b05b-835e62f0471a',
  '1bb81b0f-76f7-428c-98df-7033b39d092a',
  '7c7f27c8-bef3-4c5f-a73a-bbbe0dc007b1'
)
ORDER BY status, visitor_phone;

SELECT telefone, status, next_followup_at
FROM platform_crm_cold_outreach_queue
WHERE campaign_id = 'b480ed6e-73c8-43ec-addd-9c05c6ac68da'
  AND telefone IN (
    '5538988383104', '5513992028635', '5584981356722',
    '5568999576171', '5521971449182'
  );
