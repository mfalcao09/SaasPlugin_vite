-- F5 §3 + §4 + §5 — execução 2026-09-02

-- §3 conversas → bot_active + pin Camila
UPDATE platform_crm_conversations
SET status = 'bot_active',
    needs_human = false,
    current_agent_id = '68aeece9-26f2-4f7b-a595-a6ea5e8acfa7',
    assigned_to = NULL,
    updated_at = now()
WHERE id IN (
  '7e427cd4-5181-445d-9eb1-f05906b8f42d',
  'e882518f-5ebd-457d-8c3c-dc33f400a7a1',
  '01385b74-29ab-4044-bf10-3a2bcc26928c',
  'db870f09-54d1-4e1b-a221-6af8fb24788f',
  'db7991a9-df6c-4665-8d9b-481b1cc48d53'
);

-- §4 Camila on
UPDATE platform_crm_product_agents
SET is_active = true,
    active_in_whatsapp = true,
    updated_at = now()
WHERE id = '68aeece9-26f2-4f7b-a595-a6ea5e8acfa7';

-- §5 remove opt-out de contenção
DELETE FROM platform_crm_lead_optout
WHERE product_id = '806b5975-e268-402e-a65c-9e9503271041'
  AND reason = 'INCIDENT_20260902'
  AND telefone IN (
    '5538988383104', '5513992028635', '5584981356722',
    '5568999576171', '5521971449182'
  );

-- verificação
SELECT 'convs_bot_active' AS k, count(*)::text AS v
FROM platform_crm_conversations
WHERE id IN (
  '7e427cd4-5181-445d-9eb1-f05906b8f42d',
  'e882518f-5ebd-457d-8c3c-dc33f400a7a1',
  '01385b74-29ab-4044-bf10-3a2bcc26928c',
  'db870f09-54d1-4e1b-a221-6af8fb24788f',
  'db7991a9-df6c-4665-8d9b-481b1cc48d53'
)
AND status = 'bot_active'
AND current_agent_id = '68aeece9-26f2-4f7b-a595-a6ea5e8acfa7'
AND needs_human = false
UNION ALL
SELECT 'camila_on', CASE WHEN is_active AND active_in_whatsapp THEN '1' ELSE '0' END
FROM platform_crm_product_agents WHERE id = '68aeece9-26f2-4f7b-a595-a6ea5e8acfa7'
UNION ALL
SELECT 'optout_left', count(*)::text
FROM platform_crm_lead_optout WHERE reason = 'INCIDENT_20260902'
UNION ALL
SELECT 'campaign_still_paused', CASE WHEN status = 'paused' AND dry_run THEN '1' ELSE '0' END
FROM platform_crm_cold_campaigns WHERE id = 'b480ed6e-73c8-43ec-addd-9c05c6ac68da';
