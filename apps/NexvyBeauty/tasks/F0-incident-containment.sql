-- F0.3 opt-out + F0.4 waiting_human (INCIDENT_20260902)
WITH incident_phones AS (
  SELECT unnest(ARRAY[
    '5538988383104','5513992028635','5584981356722','5568999576171','5521971449182'
  ]) AS digits
),
campaign AS (
  SELECT product_id FROM platform_crm_cold_campaigns
  WHERE id = 'b480ed6e-73c8-43ec-addd-9c05c6ac68da'
)
INSERT INTO platform_crm_lead_optout (product_id, telefone, reason, created_at)
SELECT c.product_id, ip.digits, 'INCIDENT_20260902', now()
FROM incident_phones ip CROSS JOIN campaign c
ON CONFLICT (product_id, telefone) DO UPDATE SET reason = EXCLUDED.reason;

UPDATE platform_crm_conversations c
SET status = 'waiting_human', needs_human = true, updated_at = now()
WHERE regexp_replace(coalesce(c.visitor_phone,''), '\D', '', 'g') IN (
  '5538988383104','5513992028635','5584981356722','5568999576171','5521971449182'
);

SELECT 'optout_count' AS k, count(*)::text AS v FROM platform_crm_lead_optout WHERE reason = 'INCIDENT_20260902'
UNION ALL
SELECT 'waiting_human', count(*)::text FROM platform_crm_conversations WHERE status = 'waiting_human'
  AND regexp_replace(coalesce(visitor_phone,''), '\D', '', 'g') IN (
    '5538988383104','5513992028635','5584981356722','5568999576171','5521971449182'
  );
