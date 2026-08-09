# PRD-3 — Dry-run

## Contrato

- Campanha criada na UI com defaults seguros (`dry_run=true`)
- Preflight Hermes: Evolution open, N aprovados, campanha id
- `enqueue`+`tick` sem envio real; relatório em ops `request_dry_run_report`

## Check

Relatório dry-run + zero wamid no período.

## Owner

Marcelo (criar campanha) · eng/Hermes (relatório)