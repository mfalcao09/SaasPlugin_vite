# Task 2 — canário de cobertura das instâncias da plataforma

Finalizar e publicar o E2 sobre `origin/main` após o merge da PR #152.

## Escopo

- Preservar o canário apenas para `platform_crm_evolution_instances`; não ler nem escrever `evolution_instances`.
- Cobrir instâncias desconectadas e o elo campanha WhatsApp autorizada → burner do mesmo produto.
- Respeitar janela agendada, graça de 30 minutos, mute e throttle de 6 horas.
- Consolidar campanhas do mesmo burner em um único alerta.
- Em falha de fonte, RPC ou Telegram, retornar 503 e não silenciar o próximo alerta.
- Claims, releases e finalizações devem ser atômicos e preservar outras chaves de `metadata`.
- Rearmar o alerta quando a instância de plataforma reconectar.
- Cron idempotente e único em `7,37 * * * *`.

## Segurança SQL

- As RPCs novas em schema público devem usar `SECURITY INVOKER`, chamadas exclusivamente por `service_role`.
- Revogar execução de `PUBLIC`, `anon` e `authenticated`; conceder somente a `service_role`.
- Não manter branch/parâmetro que permita às RPCs escrever na tabela tenant.
- Usar relações qualificadas e `search_path` seguro.

## Provas

- TDD para qualquer correção nova.
- Testes puros e type-check verdes.
- Migration validada em PostgreSQL/Supabase descartável com pré-requisitos representativos, incluindo concorrência/idempotência de claim, release/finalize, rearm e job único.
- `deno fmt --check`, `git diff --check` e ausência de `.temp/cli-latest` no diff.
- Rebase sobre `origin/main`, review independente SPEC PASS / QUALITY APPROVED, push e PR.

## Fora do escopo

- Aplicar migration em produção.
- Deploy da Edge Function.
- Invocar Telegram real.
- Restaurar ou parear número da Camila.
