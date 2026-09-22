# PRD-09 — Evals, Master Gate e rollout

## Objetivo

Provar a autonomia sem usar leads reais e liberar produção em coortes
reversíveis somente após `MASTER_PASS`.

## Harness

- Relógio controlado.
- Z-API fake e números controlados.
- Webhooks duplicados e fora de ordem.
- ACK atrasado/ausente.
- Banco indisponível e restart.
- Pagamento sandbox.
- Replay integral do incidente.
- Rubrica comercial e adversarial.

## Observabilidade

Dashboard por coorte e estratégia:

- propostas, autorizações e negações;
- provider accepted/delivered/read/failed;
- respostas e opt-outs;
- checkout e pagamento;
- custo, latência, retries e violações.

Guardrail eliminatório aciona `OFF` e rollback automático.

## Master Gate

Usa somente replay, shadow e números controlados. Todas as provas devem apontar
para o mesmo SHA, migrations e deployment.

## Rollout real

Após `MASTER_PASS` e aprovação explícita:

1. uma lead;
2. cinco leads;
3. vinte leads;
4. `LIVE_LIMITED`;
5. expansão por coortes.

Cada estágio tem janela de observação, critérios de promoção e rollback.

## Check binário

PASS se o relatório reproduzível retornar `GO`, sem waiver, com todos os checks
do `MASTER-GATE.md` verdes e kill-switch provado.

## Rollback

Estado `OFF`, cancelamento de reservations, versão estável da estratégia e
preservação de toda evidência.
