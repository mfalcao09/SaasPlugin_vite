-- A1 last-mile — decay cron.
-- Sem isto, recompute_lead_scores() nunca roda e leads.score fica congelado
-- (o decay temporal nunca acontece). Agenda o recálculo diário.
-- recompute_lead_scores(NULL) recalcula todas as orgs; é função SQL pura,
-- então o cron chama direto (sem net.http_post / sem JWT).
-- Idempotente: remove qualquer job homônimo antes de (re)agendar.
-- Aplicado live 2026-06-23 via Supabase MCP; este arquivo mata o drift
-- (auditoria CBA×NX, gap #6: versionar em migrations).
select cron.unschedule(jobid) from cron.job where jobname = 'lead-score-decay';
select cron.schedule('lead-score-decay', '0 6 * * *', $$select public.recompute_lead_scores()$$);
