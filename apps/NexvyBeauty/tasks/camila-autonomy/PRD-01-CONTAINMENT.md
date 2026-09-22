# PRD-01 — Contenção e baseline

## Objetivo

Interromper qualquer ação proativa da Camila antes das correções, sem apagar
dados do incidente e sem depender da campanha fria.

## Mudança operacional

- `CAMILA_CONDUCTOR_ENABLED=false` no projeto Supabase.
- Campanha Camila permanece `paused + dry_run=true`.
- Cron permanece instalado para provar que o edge retorna `flag_off`.

## Evidência 2026-09-12

- Snapshot: `2026-09-12T19:22:39.536607Z`.
- Outbounds acumulados nas cinco conversas: 131.
- Último outbound: `2026-09-11T20:08:36.628735Z`.
- Estado Z-API no banco: `disconnected`.
- Invocação controlada do conductor: `{"skipped":"flag_off"}`.
- Cinco execuções bem-sucedidas do cron após o snapshot.
- Outbounds novos após o snapshot: 0.
- Campanha permaneceu segura: `paused + dry_run=true`.

## Check binário

PASS se:

1. invocação do conductor retorna `skipped=flag_off`;
2. pelo menos duas execuções do cron ocorrem após o corte;
3. nenhum outbound novo aparece;
4. todas as campanhas Camila seguem pausadas e em dry-run.

Resultado: PASS em 2026-09-12.

## Rollback

Não reativar nesta frente. A única reativação permitida está no PRD-09, após
`MASTER_PASS` e aprovação explícita.
