# PRD-10 / F6 — Canário R2

## Objetivo

Enviar R2 real só no número de teste allowlist; provar B1+B2 com delivery e janela 48h iniciada.

## Entregáveis

1. `R2_AUTO_V1_MODE=enforce` na allowlist de teste.
2. Ação kernel própria; máx 2 bolhas; idempotente.
3. Soft opt-out no canary → 1 R2 entregue; closed; soft+cold_suppressed.
4. Hard → 0 R2.
5. Pós-R2 farewell → 0 outbound.
6. B1–B7 e2e na allowlist.

## Loop engineering (autônomo)

### Protocolo do agente
1. Hard gate: F4 e F5 pass.
2. Preflight Z-API; OFF→TEST se preciso; finally OFF.
3. `e2e/path_a_f6_canary_r2.py` só `canary_phone_e164`.
4. Fail → rollback R2 off + kill.
5. `F6-result.json`.

### Check binário
PASS se:
- soft_r2_delivered=1 (≤2 bolhas);
- hard_r2=0;
- farewell_after_r2_outbound=0;
- webhook replay sem duplicata;
- finally OFF/kill.

### Evidência
`F6-result.json` + wamid/delivery status.

### Rollback
`R2_AUTO_V1_MODE=off` (+ kill).

### Stop / escalate
R2 para fora da allowlist → ESCALATE crítico.
