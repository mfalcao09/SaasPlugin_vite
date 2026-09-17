# PRD-10 / F2 — Estado durável + kernel deny-safe

## Objetivo

Separar soft/hard no estado, introduzir grants/epochs/`cold_not_before` e ação `reopen_clarification`, com flags ainda OFF em produção geral.

## Entregáveis

1. Migration aditiva (opt-out active/revoked, grants, epochs, cold_not_before) — sem delete de histórico.
2. Backfill conservador + relatório `F2-backfill-report.json` (razão desconhecida → hard/deny).
3. Atualização `pcrm_authorize_and_reserve_agent_action`: matriz Sol §6.
4. Ação `reopen_clarification` (1 bolha, conversa pode permanecer `closed`).
5. Reply reopen: grant uso único, TTL 30 min, keyed por inbound.
6. Testes SQL/harness: concorrência, idempotência, TTL, “reopen não queue”.
7. Flags default `off` documentadas no produto/agente.

## Loop engineering (autônomo)

### Protocolo do agente
1. Escrever migration + testes.
2. Aplicar em ambiente de teste / linked conforme política do repo (sem ampliar tráfego).
3. Rodar `verify_f2_kernel.py` (matriz allow/deny + reopen sem queued).
4. Confirmar produção: `REOPEN_INTENT_V1_MODE=off`, `R2_AUTO_V1_MODE=off`.
5. Gravar `F2-result.json`.

### Check binário
PASS se:
1. migration idempotente (rodar 2× ok);
2. matriz: farewell deny all; ambiguous allow clarification 1×; reopen allow reply only; opening/FU deny no evento;
3. reopen simulado: `cold_suppressed=false`, `cold_not_before` set, queue status ≠ `queued`;
4. hard DNC não limpo;
5. flags OFF na config efetiva.

### Evidência
`F2-result.json`, `F2-backfill-report.json`, saída dos testes kernel.

### Rollback
Flags OFF; sem drop de colunas. Grants canceláveis por script.

### Stop / escalate
Qualquer allow indevido de opening no teste → ESCALATE imediato.
