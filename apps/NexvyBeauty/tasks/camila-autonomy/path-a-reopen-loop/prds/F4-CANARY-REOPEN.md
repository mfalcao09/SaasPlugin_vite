# PRD-10 / F4 — Canário reopen (R2 OFF)

## Objetivo

Provar farewell silencioso, clarificação e reopen reply em **um** número de teste allowlist. R2 automático permanece OFF.

## Entregáveis

1. Allowlist = somente `canary_phone_e164` do manifesto (`5511945760964` / `wa:eval`).
2. `REOPEN_INTENT_V1_MODE=enforce` só nessa allowlist.
3. Roteiro automático:
   - seed soft-closed + flags;
   - inbound farewell → 0 outbound;
   - inbound ambiguous → 1 clarificação;
   - inbound reopen → ≤2 bolhas reply; soft revogado; fila não queued; `cold_not_before=+24h`;
   - inbound hard → dnc_hard; grants cancelados; 0 R2;
   - tick cold imediato → 0 opening.
4. `R2_AUTO_V1_MODE=off` verificado.
5. Pacote evidência B2–B7.

## Loop engineering (autônomo)

### Protocolo do agente
1. Preflight: Z-API connected; release OFF→TEST só se necessário e **sempre** restaurar OFF no finally.
2. Executar `e2e/path_a_f4_canary.py` (único telefone do manifesto).
3. Qualquer assert falho → rollback imediato (kill + flags OFF).
4. Gravar `F4-result.json`.
5. **Proibido** incluir Joice ou leads D2.

### Check binário
PASS se script exit 0 e:
- farewell_outbound=0;
- clarify_bubbles≤1;
- reopen_bubbles∈[1,2];
- queue_queued=false pós-reopen;
- cold_tick_openings=0;
- r2_sends=0;
- finally: release OFF ou kill ativo.

### Evidência
`F4-result.json` + ledger rows redigidos + message counts.

### Rollback
Kill-switch + `REOPEN_INTENT_V1_MODE=off` + cancel grants + OFF.

### Stop / escalate
Outbound para número fora da allowlist → ESCALATE crítico (incidente).
