# Task 2 report

Status: implementação e validação pré-rebase concluídas.

## Baseline preservada

- Branch inicial: `feat/bdr-coverage-canary-main` em `4f9cee2`, com os dois
  commits E2 `eafcbf7` e `4f9cee2`.
- Mudanças E2 não commitadas foram preservadas.
- `apps/NexvyBeauty/supabase/.temp/cli-latest` foi restaurado e não aparece no
  diff.

## TDD SQL

- Harness ignorado:
  `apps/NexvyBeauty/supabase/.temp/task-2-harness.sql`.
- RED registrado em PostgreSQL 18.4 antes da correção: `psql` exit `3`, com
  `RED: RPCs mutáveis ainda são SECURITY DEFINER:
  {pcrm_claim_instance_health_alert,pcrm_finalize_instance_health_alert,
  pcrm_release_instance_health_alert}`.
- GREEN após a correção: `psql` exit `0`.
- O harness cria stubs representativos de `cron`, `net` e `vault`, além das
  tabelas e do índice funcional necessários; aplica a migration completa duas
  vezes e prova:
  - `SECURITY INVOKER`, `search_path = ''` e relações qualificadas;
  - ausência de execução por `PUBLIC`, `anon` e `authenticated`, com execução
    concedida a `service_role`;
  - ausência de parâmetro/branch/referência tenant nas RPCs de instância;
  - claim único, stale claim, release e finalize;
  - rearm de instância conectada;
  - preservação de outras chaves de `metadata`;
  - um único job `platform-instance-coverage-canary` em `7,37 * * * *`.
- Prova concorrente viável e executada com duas sessões sobre a mesma linha,
  mantendo a primeira transação aberta: `SESSION_1_CLAIM=true` e
  `SESSION_2_CLAIM=false`, exit `0`.

## Mudanças finais pré-rebase

- RPCs públicas novas usam `SECURITY INVOKER`, `search_path = ''`, relações
  qualificadas e ACL explícita somente para `service_role`.
- RPCs de instância agora operam exclusivamente em
  `platform_crm_evolution_instances`; `p_origin` e branches tenant foram
  removidos, assim como os argumentos correspondentes na Edge Function.
- Claims, releases e finalizações continuam atômicos; falha de Telegram libera
  o claim provisório e qualquer falha do tick retorna HTTP 503.
- Cobertura mantém graça de 30 minutos, mute, throttle de 6 horas, rearm,
  janela agendada e consolidação por burner.
- Cron permanece idempotente e único em `7,37 * * * *`.

## Verificação pré-rebase

- `deno test --frozen apps/NexvyBeauty/supabase/functions/_shared/instance-coverage.test.ts`:
  32 passed, 0 failed, exit `0`.
- `deno check --no-lock apps/NexvyBeauty/supabase/functions/_shared/instance-coverage.ts apps/NexvyBeauty/supabase/functions/platform-instance-coverage-canary/index.ts`:
  exit `0`.
- `deno fmt --check` nos três arquivos Deno alterados: `Checked 3 files`,
  exit `0`.
- `git diff --check`: exit `0`.
- Buscas por `p_origin`, `public.evolution_instances`, `SECURITY DEFINER` e
  `set search_path = public` na Edge/migration: nenhum match.

## Self-review pré-rebase

- SPEC PASS.
- QUALITY APPROVED.
- Nenhum achado bloqueante; nenhuma preocupação aberta nesta etapa.
