-- ─────────────────────────────────────────────────────────────────────────────
-- 20260715_agent_type_backfill.sql — P2 · PR-B · B4
--
-- Backfill do agent_type do roteamento por-tipo (par do patch no
-- platform-sales-brain/index.ts). Faz o roteador rotear por agent_type de fato —
-- o match-por-nome vira só rede de transição.
--
--   Duda 577fc770… : custom → 'sdr'       (casa isSdrAgent por tipo)
--   Nina d925bb6e… : custom → 'retention' (casa isRetentionAgent → MODO RETENÇÃO)
--
-- NÃO tocados (de propósito):
--   Bia  8b684f7e… : já é 'closer' (isCloserAgent já casava por tipo).
--   Lia  927fe936… : fica 'support' — o handoff P10 (onboarding-handoff.ts) busca
--                    agent_type='support'+ilike '%implanta%'. Mudar QUEBRARIA o P10.
--   Nexvy 48aa225c… / Orquestrador d54ea78d… : cosmético; nenhuma função do roteador
--                    casa 'custom'. Ficam como estão (decisão E1: não desativar cascas;
--                    a segurança é a lógica do brain, não a config).
--
-- ⚠️ VALIDAR ANTES DE APLICAR (o eval/query real é a pré-condição do deploy PR-B):
--   select id, name, agent_type, is_active, active_in_whatsapp
--     from public.platform_crm_product_agents
--    where product_id = '806b5975-e268-402e-a65c-9e9503271041'
--    order by created_at;
--   Conferir que os IDs abaixo são Duda e Nina, e que Bia='closer', Lia='support'.
--
-- SEGURO: mesmo SEM esta migration o brain já roteia certo (fallback match-nome:
-- Duda casa 'duda', Nina casa 'nina'/'retenç'). Isto só torna o tipo primário.
-- IS DISTINCT FROM = idempotente (converge ao alvo, no-op se já lá). APLICAR no
-- deploy do PR-B (junto do brain patch), COM GO do Marcelo.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Duda (SDR) — custom → sdr
UPDATE public.platform_crm_product_agents
   SET agent_type = 'sdr', updated_at = now()
 WHERE id = '577fc770-1688-464c-9ff9-46244c9b203b'
   AND agent_type IS DISTINCT FROM 'sdr';

-- Nina (Retenção) — custom → retention
UPDATE public.platform_crm_product_agents
   SET agent_type = 'retention', updated_at = now()
 WHERE id = 'd925bb6e-a506-4644-9995-7a7529113a33'
   AND agent_type IS DISTINCT FROM 'retention';

COMMIT;
