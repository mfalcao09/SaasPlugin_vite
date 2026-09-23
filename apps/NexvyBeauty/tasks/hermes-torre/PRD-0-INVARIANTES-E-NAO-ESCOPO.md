# PRD-0 — Invariantes e não-escopo

## Invariantes

1. Gestao = hub; Telegram = espelho do mesmo operador.
2. Só lead com `approved_at` dispara.
3. Send exige `dry_run=false` + `COLD_OUTREACH_ENABLED=true` + `activated_at`.
4. Canal verdade = Evolution `open`.
5. Hermes não imprime secrets.
6. Cap piloto ≤10; opt-out = parada.

## Não-escopo

- Substituir `platform-sales-brain`
- Ads/CTWA, Cakto→Lia, Bia closer
- Auto-edição de skills em prod

## Check

Documento lido + ADR-1 linkado no README do pacote.

## Owner

Marcelo (ops) · eng (bridge/UI)