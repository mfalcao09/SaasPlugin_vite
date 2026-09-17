# PRD-10 / F5 — R2 SHADOW (pós-canário reopen)

## Objetivo

Após F4 verde, gerar plano R2 (texto+site) em shadow sem sender. Hard nunca gera plano.

## Entregáveis

1. Separação soft/hard no detector de opt-out (pré-requisito R2).
2. `R2_AUTO_V1_MODE=shadow`.
3. Planejador R2: ≤2 bolhas, URL allowlist, idempotency `r2-close:{conversation}:{event}:vN`.
4. Hard (`PARE/SAIR`): zero plano.
5. Regra v1: sem R2 repetido em 30d (shadow valida).
6. B1 shadow harness.

## Loop engineering (autônomo)

### Protocolo do agente
1. Confirmar F4 `status=pass` no `loop-state.json` (hard gate).
2. Implementar planner; **não** chamar sender.
3. `verify_f5_r2_shadow.py`.
4. Gravar `F5-result.json`.

### Check binário
PASS se:
1. soft → exatamente 1 plano R2 shadow; sends=0;
2. hard → planos=0;
3. replay → sem duplicata de key;
4. F4 ainda pass no state file.

### Evidência
`F5-result.json` com planos (texto mascarado se preciso) + keys.

### Rollback
`R2_AUTO_V1_MODE=off`.

### Stop / escalate
Tentativa de send em F5 → ESCALATE.
