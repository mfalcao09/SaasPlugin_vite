# PRD-1 — Bridge gestao ↔ Hermes

## Contrato

- Tabela `platform_crm_hermes_ops`
- Edge `platform-hermes-bridge` (flag `HERMES_BRIDGE_ENABLED`)
- Auth: JWT super_admin (gestao) ou `x-hermes-bridge-secret` (Hermes poll)
- Actions: create, list, poll, claim, complete, fail, process_propose_list, preflight_snapshot
- UI: Prospecção → **Torre Hermes**

## Check binário

Clique na UI cria op → (com flag on) status `done` com `correlation_id` → listagem na timeline.

## Rollback

`HERMES_BRIDGE_ENABLED=false`; painel mostra erro controlado.

## Owner

eng