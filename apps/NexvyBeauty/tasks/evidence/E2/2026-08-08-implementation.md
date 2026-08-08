# E2 — canário de cobertura das instâncias da plataforma

Data: 2026-08-08
Stage: E2
Resultado: implementação e verificação concluídas; sem deploy.

## Base e commits

- Base atualizada antes da verificação final:
  `9496ecc969fd8a1e286f32fa53f97ca28723af15`.
- Commits E2 após o rebase:
  - `6e080d3928ebc6b52f5641a7e1d48eacbd55a7cf`;
  - `fcbab057ba8c9375e2327fb153f2d7da51229086`;
  - `56ca8f496b15d83a50db29262e54112d1cca4670`;
  - `7a7bd7f5a1840a8a142f1971b3cd2081f66a483b`.

## Escopo implementado

- O canário lê somente `platform_crm_evolution_instances`; não lê nem escreve
  `evolution_instances`.
- Campanhas WhatsApp autorizadas são ligadas ao burner do mesmo produto, com
  respeito à janela agendada, graça de 30 minutos, mute e throttle de 6 horas.
- Campanhas do mesmo burner são consolidadas em um único alerta.
- Falhas de fonte, RPC ou Telegram produzem HTTP 503 e não consolidam um
  silêncio de 6 horas.
- Claims, releases e finalizações são atômicos e preservam outras chaves de
  `metadata`.
- A reconexão de uma instância da plataforma rearma o alerta.
- O cron é idempotente e mantém um único job em `7,37 * * * *`.
- As RPCs públicas novas usam `SECURITY INVOKER`, relações qualificadas e
  `search_path = ''`; execução foi removida de `PUBLIC`, `anon` e
  `authenticated` e concedida somente a `service_role`.
- RPCs de instância não possuem parâmetro nem branch de escopo tenant.

## TDD SQL — RED/GREEN

Foi criado um harness SQL descartável e ignorado pelo Git, executado em um
cluster PostgreSQL 18.4 temporário.

RED antes da correção:

- comando: inicialização via `initdb`/`pg_ctl` e execução do harness com `psql`;
- resultado: `psql` exit `3`;
- falha esperada:
  `RED: RPCs mutáveis ainda são SECURITY DEFINER:
  {pcrm_claim_instance_health_alert,pcrm_finalize_instance_health_alert,
  pcrm_release_instance_health_alert}`.

GREEN após a correção:

- resultado: `psql` exit `0`;
- a migration completa foi aplicada duas vezes no mesmo banco descartável;
- stubs representativos cobriram `cron`, `net` e `vault`, além das tabelas e do
  índice funcional necessários;
- foram verificados privilégios, claim único e stale, release/finalize, rearm,
  preservação de `metadata` e existência de um único job.

## Prova concorrente

Duas sessões disputaram a mesma instância, com a primeira transação mantida
aberta para obrigar concorrência sobre a linha:

- `SESSION_1_CLAIM=true`;
- `SESSION_2_CLAIM=false`;
- comando concluído com exit `0`.

## Comandos e resultados finais

```text
deno test --frozen apps/NexvyBeauty/supabase/functions/_shared/instance-coverage.test.ts
32 passed | 0 failed | exit 0

deno check --no-lock \
  apps/NexvyBeauty/supabase/functions/_shared/instance-coverage.ts \
  apps/NexvyBeauty/supabase/functions/platform-instance-coverage-canary/index.ts
exit 0

deno fmt --check \
  apps/NexvyBeauty/supabase/functions/_shared/instance-coverage.test.ts \
  apps/NexvyBeauty/supabase/functions/_shared/instance-coverage.ts \
  apps/NexvyBeauty/supabase/functions/platform-instance-coverage-canary/index.ts
Checked 3 files | exit 0

git diff --check
exit 0
```

As verificações Deno, SQL e de concorrência foram repetidas após o rebase.

## Fora de produção

- Nenhuma migration foi aplicada em produção.
- Nenhuma Edge Function foi implantada.
- Nenhum Telegram real foi enviado.
- Nenhum push ou pull request foi criado durante esta execução.
- Nenhuma credencial ou valor de segredo foi registrado nesta evidência.
