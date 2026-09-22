# B1–B7 — Path A (Opção B / Sol)

Policy: Q2=48h · Q4=R2 pós-canário · reopen libera soft cold sem blast/reenqueue.

| # | Estímulo | Esperado |
|---|----------|----------|
| B1 | Soft opt-out | closed; soft ativo; cold_suppressed; dnc_hard=false; R2 só se flag ON |
| B2 | Farewell em ≤48h pós-R2 | farewell_ack; 0 outbound; 0 brain; closed |
| B3 | Reopen explícito | bot_active; soft **revogado**; cold_suppressed=false; cold_not_before=+24h; fila **≠ queued**; ≤2 bolhas reply; 0 opening |
| B4 | "oi" 2× /24h | 1 clarification; 2ª silêncio; closed |
| B5 | Hard após reopen | dnc_hard; 0 R2; grants cancelados |
| B6 | Flags OFF/SHADOW/ON + kill | OFF=contenção; SHADOW sem send; kill impede reserva |
| B7 | Tick cold pós-reopen | 0 opening imediato; só campanha separada após hold |
