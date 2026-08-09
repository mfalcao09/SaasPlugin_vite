# PRD-2 — Montar lista piloto

## Contrato

- `propose_list` via bridge (puro em `_shared/hermes-tower/propose-list.ts`)
- Cap ≤10; elegível: tel BR 55, não excluded, segmento salão/IG
- Aprovação humana em Buscas/Base (`approved_at`) — Hermes só propõe

## Check

Proposta done com ≤10 itens; zero `approved_at` escrito pelo bridge.

## Owner

eng + Marcelo (approve)