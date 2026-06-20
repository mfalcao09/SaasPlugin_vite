-- ============================================================================
-- Fase 5 — Reconciliador de comissões AGENDADO (pg_cron + pg_net)
-- Backstop automático: chama a Edge Function `cakto-affiliate-reconcile` 6x/dia,
-- recuperando comissões que o webhook em tempo real tenha perdido (idempotente).
--
-- Horários em UTC (servidor UTC; cron.timezone = GMT). Brasil = UTC-3 (sem DST).
--   05:00 BRT = 08:00 UTC | 09:00 = 12:00 | 12:00 = 15:00
--   15:00 BRT = 18:00 UTC | 18:00 = 21:00 | 21:30 = 00:30 (+1 dia)
--
-- Auth = anon key (publishable; satisfaz o verify_jwt do gateway). A função usa
-- service_role internamente. cron.schedule é idempotente (upsert por jobname).
-- Extensões pg_cron + pg_net já habilitadas no projeto.
-- ============================================================================

select cron.schedule('affiliate-reconcile-0500-brt', '0 8 * * *',  $cmd$ select net.http_post(url:='https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-affiliate-reconcile', headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6aGxid2hkZWp1bWt5cW9zdXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MDUwMTEsImV4cCI6MjA5NjI4MTAxMX0.b2XOP2VO4E5yD7N2qtwVxI0T4MPPbuYk9sHdBgMMOBc'), body:='{}'::jsonb); $cmd$);
select cron.schedule('affiliate-reconcile-0900-brt', '0 12 * * *', $cmd$ select net.http_post(url:='https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-affiliate-reconcile', headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6aGxid2hkZWp1bWt5cW9zdXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MDUwMTEsImV4cCI6MjA5NjI4MTAxMX0.b2XOP2VO4E5yD7N2qtwVxI0T4MPPbuYk9sHdBgMMOBc'), body:='{}'::jsonb); $cmd$);
select cron.schedule('affiliate-reconcile-1200-brt', '0 15 * * *', $cmd$ select net.http_post(url:='https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-affiliate-reconcile', headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6aGxid2hkZWp1bWt5cW9zdXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MDUwMTEsImV4cCI6MjA5NjI4MTAxMX0.b2XOP2VO4E5yD7N2qtwVxI0T4MPPbuYk9sHdBgMMOBc'), body:='{}'::jsonb); $cmd$);
select cron.schedule('affiliate-reconcile-1500-brt', '0 18 * * *', $cmd$ select net.http_post(url:='https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-affiliate-reconcile', headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6aGxid2hkZWp1bWt5cW9zdXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MDUwMTEsImV4cCI6MjA5NjI4MTAxMX0.b2XOP2VO4E5yD7N2qtwVxI0T4MPPbuYk9sHdBgMMOBc'), body:='{}'::jsonb); $cmd$);
select cron.schedule('affiliate-reconcile-1800-brt', '0 21 * * *', $cmd$ select net.http_post(url:='https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-affiliate-reconcile', headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6aGxid2hkZWp1bWt5cW9zdXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MDUwMTEsImV4cCI6MjA5NjI4MTAxMX0.b2XOP2VO4E5yD7N2qtwVxI0T4MPPbuYk9sHdBgMMOBc'), body:='{}'::jsonb); $cmd$);
select cron.schedule('affiliate-reconcile-2130-brt', '30 0 * * *', $cmd$ select net.http_post(url:='https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-affiliate-reconcile', headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6aGxid2hkZWp1bWt5cW9zdXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MDUwMTEsImV4cCI6MjA5NjI4MTAxMX0.b2XOP2VO4E5yD7N2qtwVxI0T4MPPbuYk9sHdBgMMOBc'), body:='{}'::jsonb); $cmd$);

-- Para remover (rollback): select cron.unschedule('affiliate-reconcile-0500-brt'); (repetir p/ cada jobname)
