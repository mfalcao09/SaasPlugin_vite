# Resend — Runbook de Go-Live do e-mail transacional (NexvyBeauty)

> Data: 2026-07-15 · Branch: `feat/resend-email` · Projeto Supabase: `fzhlbwhdejumkyqosuvq`
> Autor da sessão: agente Resend (isolado do brain #68 / cakto / esteira / cold-outreach)

## TL;DR (o que mudou e o que falta)

O pipeline de e-mail (sender + fila pgmq + cron + consumidor + branding NexvyBeauty) **já existia e já estava deployado** (PR #61). O e-mail não saía por **UM** motivo real, agora corrigido:

- **Bug do 403 (corrigido):** o cron autentica com a chave de service-role do vault, que é a chave **nova opaca `sb_secret_…`** (não é JWT). O `process-email-queue` fazia um check `parseJwtClaims(token).role === 'service_role'` que **falha** com a chave nova → **403 a cada minuto** → a fila nunca era consumida (havia 1 e-mail preso há ~7 dias). Agora a auth aceita `sb_secret_` **e** o JWT legado.
- **Gate seguro (novo):** o envio real agora exige um switch EXPLÍCITO. **Default = DRY-RUN** (drena a fila, registra `dry_run` no `email_send_log`, **não envia**). Isso garante que o fix do 403 **não liga envio real sozinho** — mesmo com a `RESEND_API_KEY` já configurada.

⚠️ **Fato verificado na sondagem:** a **`RESEND_API_KEY` JÁ ESTÁ setada em prod** (o dispatcher respondeu `dry_run:false` antes do gate seguro entrar). Ou seja: o "gate na chave" que o briefing assumia como pendente **já foi feito**. O que falta para o go-live é **1 flag** + confirmar DNS.

## ✅ AÇÃO DO MARCELO — checklist de go-live (nesta ordem)

1. **Confirmar o domínio `nexvybeauty.com.br` VERIFICADO na Resend** (dashboard → Domains). Precisa dos 3 registros DNS publicados e verdes:
   - **SPF** (TXT): inclui `include:amazonses.com` / o que a Resend indicar para a região `sa-east-1`.
   - **DKIM** (3x CNAME `resend._domainkey…` ou o conjunto que a Resend gerar).
   - **DMARC** (TXT em `_dmarc.nexvybeauty.com.br`): começar com `v=DMARC1; p=none; rua=mailto:…` e endurecer depois.
   - Sem o domínio verificado, a Resend responde **403 (domain not verified)** → o consumidor manda a mensagem para a **DLQ** (não entrega). Por isso: verificar DNS **antes** de ligar o envio.
2. **Ligar o envio real** setando o secret da edge (a `RESEND_API_KEY` já existe):
   ```bash
   supabase secrets set EMAIL_SEND_ENABLED=true --project-ref fzhlbwhdejumkyqosuvq
   ```
   No minuto seguinte o cron passa a enviar de verdade (dry-run desliga sozinho).
3. **Validar go-live (1 e-mail real de teste):** dispare um e-mail de verdade (ex.: recuperação de senha de um admin, ou uma compra E2E) e confirme:
   ```sql
   select status, recipient_email, template_name, created_at
   from public.email_send_log
   where created_at > now() - interval '10 minutes'
   order by created_at desc;
   ```
   Esperado: `status = 'sent'` (não `dry_run`, não `dlq`, não `failed`).
4. **(Opcional) Limpar a DLQ:** há **1 mensagem** presa há ~7 dias em `transactional_emails_dlq` (era o e-mail que estava travado pelo 403; expirou por TTL de 60min e foi para a DLQ ao rodar o dispatcher). Inspecionar/limpar:
   ```sql
   select * from pgmq.read('transactional_emails_dlq', 30, 10);   -- inspecionar
   select pgmq.purge_queue('transactional_emails_dlq');            -- limpar (se não precisar reprocessar)
   ```

## ⏪ Rollback / desligar o envio (se preciso)

```bash
# Volta para DRY-RUN (não envia; drena e registra 'dry_run'):
supabase secrets unset EMAIL_SEND_ENABLED --project-ref fzhlbwhdejumkyqosuvq
# ou, forçar dry-run mesmo com o flag ligado:
supabase secrets set EMAIL_DRY_RUN=true --project-ref fzhlbwhdejumkyqosuvq
```

## Comportamento do gate (referência)

Envio **real** exige, cumulativamente:
1. `RESEND_API_KEY` presente (**já setada**);
2. `EMAIL_SEND_ENABLED=true` (**pendente** — o switch de go-live);
3. `EMAIL_DRY_RUN` diferente de `true`.

Qualquer condição faltando → **DRY-RUN**: o dispatcher lê a fila, registra cada mensagem como `dry_run` no `email_send_log` e a **remove da fila** (drena p/ não entupir), **sem chamar a Resend**.

> ⚠️ Enquanto estiver em DRY-RUN, **e-mails enfileirados de verdade (auth/pós-compra) são registrados como `dry_run` e NÃO entregues**. Por isso o passo 2 (ligar o flag) deve ser feito no go-live, após o DNS estar verde. Antes desta entrega, esses e-mails também não saíam (o 403 travava tudo) — a diferença é que agora há um switch limpo e o cron não fica quebrando.

## O que foi entregue nesta branch

- `supabase/functions/process-email-queue/index.ts`:
  - **fix do 403**: `isServiceRoleAuth()` aceita `sb_secret_…` (chave nova) + JWT legado `role=service_role`.
  - **gate seguro** `EMAIL_SEND_ENABLED`/`EMAIL_DRY_RUN`/`RESEND_API_KEY` (dry-run por padrão).
  - **Resend como provedor único** (removido o fallback Lovable, que furaria o gate por chave).
  - resposta passa a incluir `dry_run`; comentários stale (email-js) corrigidos.
- `supabase/migrations_platform_crm/20260715_email_send_log_status_dry_run.sql` (aditiva, **já aplicada via MCP**): amplia o CHECK de `email_send_log.status` com `dry_run` e `rate_limited` (este último já era emitido pelo código no path 429, mas não constava no CHECK — quebraria no 1º rate-limit da Resend).
- Deploy: `process-email-queue` **v30** ACTIVE (`--project-ref fzhlbwhdejumkyqosuvq`, `verify_jwt=true`).

## Prova (smoke dry-run, 2026-07-15)

- `deno check --node-modules-dir=none index.ts` → **verde**.
- Semeado e-mail fake em `transactional_emails` (`message_id` sentinela, `queued_at` fresco) → invocado o dispatcher → resposta **`{"processed":1,"dry_run":true}`** → `email_send_log` gravou **`status='dry_run'`** (não `sent`), fila **drenada** (`transactional_emails=0`), **nenhum e-mail enviado** → **cleanup** (linha sentinela removida; resíduo = 0).
- Auth do cron: probe via `net.http_post` com a chave do vault → **HTTP 200** (o 403 acabou).

## Branding (verificado — nada a fazer)

Sender (`send-transactional-email`) e templates já são **NexvyBeauty** / `@nexvybeauty.com.br` (pt-BR). O "Vendus" que aparece no repo é o nome do **CRM portado** (`platform_crm`), não branding de e-mail. Nenhum "Vendus" no pipeline transacional.
