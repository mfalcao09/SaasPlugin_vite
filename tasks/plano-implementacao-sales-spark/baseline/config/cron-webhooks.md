# Cron Jobs e Database Webhooks

Mecanismo único usado: **pg_cron + pg_net**. Não há Supabase Scheduled Functions (UI) nem cron do Lovable.
Não há database webhooks da UI Supabase — todo "webhook de DB" é um trigger PL/pgSQL que chama `net.http_post(...)` ou que enfileira em pgmq processado por `process-email-queue`.

## Extensões obrigatórias
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
```

## Cron Jobs ativos (reconstruir com `cron.schedule(...)`)

| Job | Schedule | Função alvo |
|---|---|---|
| `campaign-dispatcher` | `* * * * *` (1 min) | `POST /functions/v1/campaign-dispatcher` |
| `campaign-recurring-snapshot` | `*/15 * * * *` | `POST /functions/v1/campaign-recurring-snapshot` |
| `ai-followup-cron` | `*/5 * * * *` | `POST /functions/v1/ai-followup-cron` |
| `cadence-tick` | `*/5 * * * *` | `POST /functions/v1/cadence-tick` |
| `booking-dispatcher` | `*/5 * * * *` | `POST /functions/v1/booking-dispatcher` |
| `process-scheduled-messages` | `* * * * *` | `POST /functions/v1/process-scheduled-messages` |
| `process-post-sale-scheduled` | `*/5 * * * *` | `POST /functions/v1/process-post-sale-scheduled` |
| `opportunity-scan-cron` | `0 8 * * *` (diário) | `POST /functions/v1/opportunity-scan-cron` |
| `daily-report-ai` | `0 9 * * *` | `POST /functions/v1/daily-report-ai` |
| `google-calendar-sync` | `*/15 * * * *` | `POST /functions/v1/google-calendar-sync` |
| `process-email-queue` | `*/5 * * * * *` (a cada 5s) | `POST /functions/v1/process-email-queue` |

> A última (`process-email-queue`) é criada automaticamente por `email_domain--setup_email_infra`.
> Use o template padrão abaixo para registrar TODOS os jobs no novo projeto.

### Template idempotente (rodar via supabase--insert no novo projeto)
```sql
DO $$
DECLARE
  v_url text := 'https://<NEW_PROJECT_REF>.supabase.co/functions/v1';
  v_key text := '<NEW_PROJECT_ANON_KEY>';  -- ou service_role para process-email-queue
  v_jobs text[][] := ARRAY[
    ['campaign-dispatcher','* * * * *'],
    ['campaign-recurring-snapshot','*/15 * * * *'],
    ['ai-followup-cron','*/5 * * * *'],
    ['cadence-tick','*/5 * * * *'],
    ['booking-dispatcher','*/5 * * * *'],
    ['process-scheduled-messages','* * * * *'],
    ['process-post-sale-scheduled','*/5 * * * *'],
    ['opportunity-scan-cron','0 8 * * *'],
    ['daily-report-ai','0 9 * * *'],
    ['google-calendar-sync','*/15 * * * *']
  ];
  r text[];
BEGIN
  FOREACH r SLICE 1 IN ARRAY v_jobs LOOP
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = r[1];
    PERFORM cron.schedule(r[1], r[2],
      format($f$ select net.http_post(url:=%L, headers:=%L::jsonb, body:='{}'::jsonb) $f$,
        v_url || '/' || r[1],
        json_build_object('Content-Type','application/json','Authorization','Bearer '||v_key)::text
      )
    );
  END LOOP;
END $$;
```
`process-email-queue` é criado por `email_domain--setup_email_infra`, **não** crie manualmente.

## Database "Webhooks" (triggers que invocam edge functions)

Nenhum trigger no schema `public` chama `net.http_post` diretamente — todas as integrações HTTP partem de:
1. **pg_cron** (lista acima)
2. **Fila pgmq `auth_emails` / `transactional_emails`** drenada por `process-email-queue`
3. **Triggers de validação/normalização** (não fazem HTTP)

Triggers PL/pgSQL relevantes para reproduzir (já estão no dump de schema em `00000000000005_triggers_and_views.sql`):
- `enforce_single_attendant` — atendente único humano vs IA
- `update_ticket_on_new_message`
- `sync_conversation_last_message`
- `sync_active_leads_count`
- `apply_tag_automations`
- `booking_log_status_change`
- `protect_booking_public_updates`
- `handle_new_user` (em `auth.users` — Supabase Auth)
- `ensure_first_user_is_admin` / `ensure_org_owner_is_admin`
- `fill_default_sector`
- `remove_lifecycle_tags_on_event`
- `increment_form_submissions_count`
