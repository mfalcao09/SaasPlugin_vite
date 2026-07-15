-- ============================================================================
-- COLD-OUTREACH-SMOKE-2026-07-15.sql — SMOKE DRY-RUN por dados semeados
--
-- Prova o loop fechado do motor SEM enviar nada (dry_run=true + sem
-- COLD_OUTREACH_ENABLED). Roda em sessão com o Supabase autenticado (o MCP não
-- abriu na sessão de build autônoma). Pré-req: as 2 migrations de schema/seed
-- aplicadas + os 2 edges deployados.
--
-- Semeia leads sintéticos (handle 'smoke_*', telefone FAKE 5599XXXXXXXXX) → NUNCA
-- é número real. Ao final, LIMPA tudo. Idempotente (re-rodar é seguro).
--
-- Alterne entre os passos SQL (aqui) e os curls (nos comentários) — cada curl
-- chama o edge platform-cold-outreach com service_role.
-- ============================================================================

-- ── PASSO 0 — resolve o produto ──────────────────────────────────────────────
-- select id from public.platform_crm_products where slug='nexvybeauty';
-- Guarde como :product (abaixo uso subselect).

-- ── PASSO 1 — semeia 4 leads sintéticos (2 salao_cliente, 1 seed, 1 descarte) ─
-- Cobre: gate passa nos salao_cliente; bloqueia descarte; tier semente-limpa (seed∩qualified).
WITH p AS (SELECT id FROM public.platform_crm_products WHERE slug='nexvybeauty' LIMIT 1),
ext AS (
  INSERT INTO public.platform_crm_lead_extractions (product_id, keywords, source, status)
  SELECT p.id, ARRAY['smoke'], 'instagram', 'completed' FROM p
  RETURNING id, product_id
)
INSERT INTO public.platform_crm_extracted_leads
  (extraction_id, product_id, handle, primeiro_nome, telefone, seguidores, categoria, segment, qualified, phone_is_br, is_seed)
SELECT ext.id, ext.product_id, v.handle, v.nome, v.tel, v.seg_count, v.cat, v.segment, v.qualified, v.br, v.seed
FROM ext, (VALUES
  ('smoke_ana_nails',  'Ana',   '5599111110001', 1200,  'Nail designer',   'salao_cliente',            true,  true,  false),
  ('smoke_bia_brows',  'Bia',   '5599111110002', 90000, 'Sobrancelha/brow', 'salao_cliente',            true,  true,  true),  -- seed (>=50k)
  ('smoke_ig_only',    'Cris',  NULL,            3000,  'Estética',         'acionamento_via_instagram',false, false, false),
  ('smoke_descarte',   'Dani',  '5599111110004', 100,   'Loja',             'descarte',                 false, true,  false)
) AS v(handle, nome, tel, seg_count, cat, segment, qualified, br, seed);

-- ── PASSO 2 — cria a campanha DRY-RUN (WhatsApp) + põe 'active' ───────────────
INSERT INTO public.platform_crm_cold_campaigns (product_id, name, channel, status, sender_name, dry_run)
SELECT id, 'SMOKE cold WA (dry)', 'whatsapp', 'active', 'Duda', true
FROM public.platform_crm_products WHERE slug='nexvybeauty'
RETURNING id;  -- << guarde como :campaign

-- ── PASSO 3 — ENQUEUE (curl) ─────────────────────────────────────────────────
-- Espera: enqueued=2 (só os 2 salao_cliente com telefone), byTier semente_limpa=1, massa=1.
--   SR=$(supabase secret / vault service_role_key)
--   curl -sS -X POST https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/platform-cold-outreach \
--     -H "Authorization: Bearer $SR" -H "Content-Type: application/json" \
--     -d '{"action":"enqueue","campaign_id":"<:campaign>"}'
-- ASSERT:
-- select tier, status, count(*) from public.platform_crm_cold_outreach_queue
--   where campaign_id='<:campaign>' group by 1,2;   -- esperado: (semente_limpa,queued,1),(massa,queued,1)

-- ── PASSO 4 — TICK (curl) várias vezes ───────────────────────────────────────
-- Espera: action='sent_dry' (dry-run simula, NÃO envia); counters.sent_count sobe;
--         next_followup_at agendado; jitter espaça o próximo (scheduled_for futuro).
--   curl -sS -X POST .../platform-cold-outreach -H "Authorization: Bearer $SR" \
--     -d '{"action":"tick","campaign_id":"<:campaign>"}'
-- (rode 2-3x; o 2º pode dar 'skip: outside_window' se fora de 9-18h Seg-Sex, ou 'idle')
-- ASSERT (dentro da janela):
-- select status, count(*) from public.platform_crm_cold_outreach_queue where campaign_id='<:campaign>' group by 1; -- 'sent' aparece
-- select sent_count from public.platform_crm_cold_daily_counters where campaign_id='<:campaign>';                  -- >= 1
-- select event_type, payload->>'dry_run' from public.platform_crm_journey_events
--   where source='cold_outreach' order by occurred_at desc limit 3;                                               -- message_sent, dry_run=true

-- ── PASSO 5 — ON-INBOUND opt-out (curl) ──────────────────────────────────────
-- Simula a lead respondendo "PARE". Espera: intent=opt_out; grava optout; fila -> opted_out.
--   curl -sS -X POST .../platform-cold-outreach -H "Authorization: Bearer $SR" \
--     -d '{"action":"on-inbound","product_id":"<:product>","telefone":"5599111110001","text":"pare de me mandar mensagem"}'
-- ASSERT:
-- select 1 from public.platform_crm_lead_optout where telefone='5599111110001';                    -- 1 linha
-- select status from public.platform_crm_cold_outreach_queue where telefone='5599111110001';       -- opted_out

-- ── PASSO 6 — ON-INBOUND "quero" -> handoff (precisa de conversa) ─────────────
-- Se houver conversa (conversation_id) do lead 5599111110002, testar:
--   -d '{"action":"on-inbound","product_id":"<:product>","conversation_id":"<conv>","telefone":"5599111110002","text":"quero ver o raio-x"}'
-- ASSERT: current_agent_id da conversa == id da Duda (agent_type='sdr'); fila -> handed_off.

-- ── PASSO 7 — STATUS (curl) ──────────────────────────────────────────────────
--   curl -sS -X POST .../platform-cold-outreach -H "Authorization: Bearer $SR" \
--     -d '{"action":"status","campaign_id":"<:campaign>"}'   -- byStatus + counters + health

-- ── LIMPEZA (rodar sempre ao fim) ────────────────────────────────────────────
DELETE FROM public.platform_crm_lead_optout WHERE telefone LIKE '559911111%';
DELETE FROM public.platform_crm_cold_campaigns WHERE name LIKE 'SMOKE cold%';  -- CASCADE limpa queue/counters/health
DELETE FROM public.platform_crm_extracted_leads WHERE handle LIKE 'smoke_%';
DELETE FROM public.platform_crm_lead_extractions WHERE keywords @> ARRAY['smoke'];
-- Fim do smoke.
