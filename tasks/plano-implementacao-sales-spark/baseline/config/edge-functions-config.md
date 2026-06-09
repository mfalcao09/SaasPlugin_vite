# Edge Functions — Inventário e Configuração

`supabase/config.toml` no projeto contém **apenas** `project_id`. Não há overrides de `verify_jwt` por função.
No Supabase Cloud com signing keys, todas as edge functions Lovable são deployadas com
`verify_jwt = false` por padrão; a validação acontece em código quando necessário.

## Tabela completa (152 funções)

Legenda: **JWT** = exige JWT em código · **Webhook** = é endpoint público de webhook · **Cron** = chamada por pg_cron · **Secrets** = env vars utilizadas.

| Função | JWT | Webhook | Cron | Secrets principais |
|---|---|---|---|---|
| admin-agent-alerts | sim | – | – | LOVABLE_API_KEY |
| admin-agent-handle-inbound | sim | – | – | LOVABLE_API_KEY |
| admin-agent-summary | sim | – | – | LOVABLE_API_KEY |
| agent-handoff-greeter | sim | – | – | LOVABLE_API_KEY |
| agent-supervisor | sim | – | – | LOVABLE_API_KEY |
| ai-followup-cron | – | – | **sim** (a cada 5–15 min) | LOVABLE_API_KEY |
| analyze-conversation | sim | – | – | LOVABLE_API_KEY |
| auth-email-hook | – | hook auth supabase | – | LOVABLE_API_KEY, LOVABLE_SEND_URL |
| auto-notifications | sim | – | – | RESEND_API_KEY |
| auto-promote-super-admin | sim | – | – | SUPER_ADMIN_EMAIL, SERVICE_ROLE |
| booking-availability | público | – | – | – |
| booking-dispatcher | – | – | **sim** (`*/5 * * * *`) | – |
| booking-submit | público | – | – | – |
| bootstrap-super-admin | sim | – | – | SUPER_ADMIN_EMAIL, SERVICE_ROLE |
| cadence-api | sim | – | – | – |
| cadence-enroll | sim | – | – | – |
| cadence-on-response | – | DB hook (interno) | – | – |
| cadence-stop | sim | – | – | – |
| cadence-tick | – | – | **sim** (`*/5 * * * *`) | LOVABLE_API_KEY |
| cakto-proxy | sim | – | – | – |
| cakto-recovery-trigger | sim | – | – | – |
| cakto-reprocess-order | sim | – | – | – |
| cakto-webhook | público | **sim** (Cakto) | – | – |
| campaign-ai-insights | sim | – | – | LOVABLE_API_KEY |
| campaign-dispatcher | público | – | **sim** (`* * * * *`) | – |
| campaign-on-response | – | DB hook | – | – |
| campaign-preview | sim | – | – | – |
| campaign-recurring-snapshot | público | – | **sim** (`*/15 * * * *`) | – |
| campaign-start | sim | – | – | – |
| catalog-import-csv | sim | – | – | – |
| catalog-search | sim | – | – | LOVABLE_API_KEY |
| catalog-sync-website | sim | – | – | FIRECRAWL_API_KEY |
| create-organization-admin | sim | – | – | SERVICE_ROLE |
| create-team-member | sim | – | – | SERVICE_ROLE, RESEND_API_KEY |
| daily-report-ai | – | – | **sim** (diário) | LOVABLE_API_KEY, RESEND_API_KEY |
| delete-organization | sim | – | – | SERVICE_ROLE |
| distribute-lead | sim | – | – | – |
| doppus-webhook | público | **sim** (Doppus) | – | – |
| ensure-default-super-admin | sim | – | – | SUPER_ADMIN_EMAIL, SERVICE_ROLE |
| evaluate-conversation | sim | – | – | LOVABLE_API_KEY |
| evolution-proxy | sim | – | – | – |
| evolution-send | sim | – | – | – |
| evolution-webhook | público | **sim** (Evolution) | – | – |
| facebook-leads-webhook | público | **sim** (Facebook) | – | – |
| firecrawl-crawl | sim | – | – | FIRECRAWL_API_KEY |
| firecrawl-map | sim | – | – | FIRECRAWL_API_KEY |
| firecrawl-scrape | sim | – | – | FIRECRAWL_API_KEY |
| form-generate-ai | sim | – | – | LOVABLE_API_KEY |
| form-submit | público | – | – | – |
| funnel-api | sim | – | – | – |
| funnel-chatbot-start | público | – | – | LOVABLE_API_KEY |
| funnel-execute-webhook | – | DB hook (interno) | – | – |
| funnel-generate-ai | sim | – | – | LOVABLE_API_KEY |
| funnel-submit | público | – | – | – |
| generate-agent-ai | sim | – | – | LOVABLE_API_KEY |
| generate-insights | sim | – | – | LOVABLE_API_KEY |
| generate-objections | sim | – | – | LOVABLE_API_KEY |
| google-calendar-auth | sim | – | – | – |
| google-calendar-callback | público | callback OAuth | – | – |
| google-calendar-refresh | sim | – | – | – |
| google-calendar-sync | – | – | **sim** (15 min) | – |
| handle-email-suppression | público | webhook Resend bounces | – | – |
| handle-email-unsubscribe | público | link unsubscribe | – | – |
| handle-objection | sim | – | – | LOVABLE_API_KEY |
| hotmart-sync-orders | sim | – | – | – |
| hotmart-test-credentials | sim | – | – | – |
| hotmart-webhook | público | **sim** (Hotmart) | – | – |
| import-agent-from-document | sim | – | – | LOVABLE_API_KEY |
| manual-outreach | sim | – | – | LOVABLE_API_KEY |
| memory-embedder | – | DB hook (interno) | – | LOVABLE_API_KEY / OPENAI_API_KEY |
| memory-search | sim | – | – | LOVABLE_API_KEY / OPENAI_API_KEY |
| opportunity-scan-cron | – | – | **sim** (diário) | – |
| opportunity-scan-run | sim | – | – | LOVABLE_API_KEY |
| optimize-product-field | sim | – | – | LOVABLE_API_KEY |
| presence-test | sim | – | – | – |
| preview-transactional-email | sim | – | – | – |
| process-email-queue | – | – | **sim** (`*/5 * * * * *`) | SERVICE_ROLE, LOVABLE_SEND_URL |
| process-knowledge-source | sim | – | – | FIRECRAWL_API_KEY, LOVABLE_API_KEY |
| process-media-message | – | DB hook | – | – |
| process-post-sale-scheduled | – | – | **sim** (`*/5 * * * *`) | – |
| process-scheduled-messages | – | – | **sim** (`* * * * *`) | – |
| process-training-material | sim | – | – | LOVABLE_API_KEY |
| prompt-experiment-pick | sim | – | – | – |
| quiz-ai-result | público | – | – | LOVABLE_API_KEY |
| quiz-generate-ai | sim | – | – | LOVABLE_API_KEY |
| sales-copilot | sim | – | – | LOVABLE_API_KEY |
| sankhya-auth | sim | – | – | – |
| sankhya-create-order | sim | – | – | – |
| sankhya-sync-clients | sim | – | – | – |
| sankhya-sync-products | sim | – | – | – |
| save-ai-credential | sim | – | – | – |
| send-booking-confirmation | sim | – | – | RESEND_API_KEY / LOVABLE_SEND_URL |
| send-catalog-item | sim | – | – | – |
| send-invite-email | sim | – | – | RESEND_API_KEY / LOVABLE_SEND_URL |
| send-mass-email | sim | – | – | RESEND_API_KEY |
| send-notification-email | sim | – | – | RESEND_API_KEY |
| send-transactional-email | **sim** (`verify_jwt=true` em comentário) | – | – | RESEND_API_KEY / LOVABLE_SEND_URL |
| set-user-password | sim | – | – | SERVICE_ROLE |
| start-whatsapp-conversation | sim | – | – | – |
| super-admin-manage-user | sim | – | – | SERVICE_ROLE |
| test-integration | sim | – | – | varia |
| transcribe-audio | sim | – | – | ELEVENLABS_API_KEY |
| webchat-api | público | – | – | – |
| webchat-bot | público | – | – | LOVABLE_API_KEY / OPENAI_API_KEY |
| webchat-inbox | sim | – | – | – |
| webhook-receiver | público | **sim** (genérico) | – | – |
| whatsapp-webhook | público | **sim** (genérico) | – | – |

## supabase/config.toml

```toml
project_id = "pfbjfhkhunzrgyzjgiuq"
```

Nenhuma seção `[functions.<name>]` está definida — todos os defaults do Lovable Cloud valem.
Funções marcadas como “público” validam (ou não) o input em código (corpo, HMAC do provider, token de URL, etc.). Replicar idêntico ao destino é apenas deployar o código.
