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

## Correções após review independente

O review independente retornou quatro achados Important. Todos foram reproduzidos
antes da correção.

RED:

- `deno test --frozen
  apps/NexvyBeauty/supabase/functions/_shared/instance-coverage.test.ts`:
  exit `1`; os helpers de claim integral e chave de consolidação ainda não
  existiam.
- Após a primeira implementação dos helpers, o caso de consolidação acusou o
  fixture incorreto (a campanha não apontava para o burner); o fixture foi
  corrigido antes de validar o comportamento.
- Harness PostgreSQL 18.4: exit `3` com
  `RED: throttle de cobertura ainda não pertence a
  platform_crm_cold_campaigns`.

GREEN:

- O grupo de campanhas é ordenado por `campaign.id` e adquirido por inteiro.
  Se qualquer claim falha ou retorna `false`, todos os claims já obtidos são
  liberados e não ocorre envio nem finalização da instância.
- Todo veredito com instância existente consolida por `instancia.id`, inclusive
  `instancia_de_outro_produto`.
- `activated_at` posterior ao instante avaliado é não autorizado; o timestamp
  exatamente igual ao instante avaliado é autorizado.
- `coverage_alert_at` passou a pertencer a
  `platform_crm_cold_campaigns`. As RPCs de campanha operam somente por
  `campaign_id` e não criam nem atualizam linhas de
  `platform_crm_cold_instance_health`.
- `deno test --frozen`: 35 passed, 0 failed, exit `0`.
- `deno check --no-lock`: exit `0`.
- Harness PostgreSQL 18.4: migration completa aplicada duas vezes, exit `0`;
  claim/release/finalize, stale claim, ACLs, rearm, cron único e ausência de
  criação/duplicação de health rows verificados.
- Prova concorrente de campanha:
  `SESSION_1_CAMPAIGN_CLAIM=true`,
  `SESSION_2_CAMPAIGN_CLAIM=false`, `HEALTH_ROWS=1` (a única linha era o
  fixture preexistente), exit `0`.

Estas correções também não foram aplicadas nem implantadas em produção.

## Segundo re-review — finalize atômico

Rastreabilidade dos corretivos:

- primeiro conjunto de achados do review:
  `db131b8f1b0dd05470a21db8b246a5fdc7d0e5be`;
- finalize transacional do segundo re-review:
  `e9f2cd1f24c020a8b9877c79b81945d476f09764`.

RED:

- O harness executou a finalização separada de campanha e instância com mismatch
  no CAS da instância.
- Resultado: PostgreSQL 18.4 exit `3` com
  `RED: finalize separado deixou throttle real parcial após mismatch`.

GREEN:

- `pcrm_finalize_campaign_coverage_group` finaliza em uma única transação o array
  completo de campanhas e a instância opcional.
- A RPC usa `SECURITY INVOKER`, `search_path = ''` e relações qualificadas.
- Contagem divergente de campanhas ou instância lança erro. O harness prova que
  o erro ocorrido depois do update das campanhas reverte tudo e conserva somente
  os claims provisórios; também prova sucesso integral com duas campanhas e uma
  instância.
- A RPC órfã de finalize individual de campanha foi removida. A Edge chama
  somente o finalize de grupo após Telegram; o alerta genérico de instância
  mantém seu finalize individual.
- Migration completa aplicada duas vezes em PostgreSQL 18.4: exit `0`.
- Concorrência de claim:
  `SESSION_1_CAMPAIGN_CLAIM=true`,
  `SESSION_2_CAMPAIGN_CLAIM=false`, `HEALTH_ROWS=1` preexistente, exit `0`.
- Deno: 35 passed, 0 failed; check, fmt e diff-check: exit `0`.

O corretivo não foi aplicado nem implantado em produção e não houve push.
