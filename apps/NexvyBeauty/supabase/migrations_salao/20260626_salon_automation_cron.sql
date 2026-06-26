-- Feature B inc.3 — cron de auto-envio das automações de salão.
-- Segredo do cron (só ele aciona o MODO-ENVIO da edge function) + agendamento diário.
-- O segredo é gerado ALEATORIAMENTE no apply e lido por SUBQUERY no cron → nunca
-- aparece em cron.job (nem neste arquivo). Regras nascem OFF → o cron roda diário
-- mas envia 0 até o salão ligar uma receita na UI (a UI é o gatilho).

create table if not exists public.app_cron_secrets (
  name text primary key,
  secret text not null,
  created_at timestamptz not null default now()
);
alter table public.app_cron_secrets enable row level security; -- sem policies → só postgres/service_role
revoke all on public.app_cron_secrets from anon, authenticated;

insert into public.app_cron_secrets (name, secret)
values ('salon', encode(gen_random_bytes(24), 'hex'))
on conflict (name) do nothing;

-- A edge function verifica o segredo por aqui (SECURITY DEFINER; a tabela não fica exposta).
create or replace function public.verify_salon_cron(p_secret text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from app_cron_secrets where name = 'salon' and secret = p_secret)
$$;
revoke all on function public.verify_salon_cron(text) from public, anon, authenticated;
grant execute on function public.verify_salon_cron(text) to service_role;

-- Cron diário 08:00 BRT (11:00 UTC) → chama a edge em modo-envio (dry_run:false).
select cron.schedule(
  'salon-automation-daily',
  '0 11 * * *',
  $cron$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/salon-automation-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select secret from public.app_cron_secrets where name = 'salon')
    ),
    body := '{"dry_run": false}'::jsonb
  );
  $cron$
);
