# PRD-6 — Runbook piloto

1. Aplicar migration `20260809_hermes_torre_ops.sql`
2. Deploy edge `platform-hermes-bridge` + secrets `HERMES_BRIDGE_ENABLED`, `HERMES_BRIDGE_SECRET`
3. Deploy front com item **Torre Hermes**
4. VPS: skills instaladas; gateway Telegram pareado
5. Torre → proposta lista → aprovar ≤10 na Base
6. Criar campanha dry-run → preflight → dry-run report verde
7. **GO Marcelo:** flags + ARM
8. Vigiar 48h; desarme se kill_recommend
9. Relatório final + retrospectiva

## Rollback

Desarmar campanha; `COLD_OUTREACH_ENABLED=false`; `HERMES_BRIDGE_ENABLED=false`.
