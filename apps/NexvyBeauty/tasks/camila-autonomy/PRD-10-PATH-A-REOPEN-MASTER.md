# PRD-10 — Caminho A Reopen (Master Loop)

## Resultado

Corrigir a reabertura pós-opt-out da Camila (Caminho A / Opção B) do começo ao fim,
com um **loop único autônomo** que só para em gate humano na expansão (F7) ou em escalação.

Policy fechada:
- Q2 farewell window = **48h**
- Q4 R2 automático = **somente pós-canário de reopen**
- Ambiguous = **1 clarificação / 24h**
- Reopen libera soft cold **sem** blast / sem reenqueue
- Opção B: produção ampla só após F0–F6 verdes + GO F7

## Estado inicial

- Contenção emergencial ativa (closed protegido não reabre / não dispara brain).
- Plano Sol em `evidence/PRD-09/sol-plan-reopen-path-A.md`.
- Fases em `evidence/PRD-09/PHASES-PATH-A-OPTION-B.md`.
- Código do classificador/kernel novo: **ainda não iniciado**.

## Invariantes (programa)

1. Classificar **antes** de mutar status.
2. Soft ≠ hard; hard nunca limpo pelo classificador.
3. Farewell = 0 outbound.
4. Reopen = 1 grant reply (≤2 bolhas), cold elegível só após `cold_not_before`, fila não `queued`.
5. Kernel é autoridade final; fail-closed em conversa protegida.
6. R2 auto nunca sobe antes de F4 verde.
7. Canário autônomo só em **allowlist de teste** (`wa:eval` / número de teste), nunca coorte real D2/Joice.
8. Kill-switch e flags OFF revertem imediatamente.

## Loop único

Manifesto: `path-a-reopen-loop/LOOP-MANIFEST.json`  
Runner: `path-a-reopen-loop/run_path_a_loop.py`  
PRDs: `path-a-reopen-loop/prds/F0` … `F7`

```text
APPROVED?
  → run_path_a_loop.py --from F0 --until F6
      for phase in F0..F6:
        load PRD
        execute deliverables (agent protocol)
        verify binary checks (exit 0)
        write evidence JSON
        on FAIL → rollback phase → ESCALATE (stop)
        on PASS → advance
  → STOP at F7_GATE (aguardando GO Marcelo)
  → só com --approve-f7: ramp controlado
```

## MASTER_PASS (Path A)

`PASS` se e somente se:

1. F0–F6 com `status=pass` no manifesto de evidências.
2. B1–B7 verdes com artefatos JSON (DB/ledger/brain/sender spies ou live allowlist).
3. `REOPEN_INTENT_V1_MODE` e `R2_AUTO_V1_MODE` documentados; produção geral ainda não em % amplo.
4. Rollback ensaiado (kill + flags OFF) com prova de 0 provider call pós-kill no canário.
5. Nenhuma lead real da coorte comercial na allowlist do loop.

`NO-GO` sem waiver. F7 exige texto explícito: `APROVO F7 PATH-A <degrau>`.

## Entregas deste pacote (aprovação)

| Artefato | Função |
|----------|--------|
| Este PRD-10 | Contrato do programa + loop |
| `prds/F0`…`F7` | PRD por fase, DoD mensurável, protocolo autônomo |
| `LOOP-MANIFEST.json` | Máquina de estados executável |
| `run_path_a_loop.py` | Orquestrador local do loop |
| `evidence/PRD-09/PHASES-PATH-A-OPTION-B.md` | Visão humana das fases |

## Aprovação pedida a Marcelo

- [ ] Aprovo o pacote PRD-10 + PRDs F0–F7 + manifesto + runner
- [ ] Aprovo execução autônoma `F0→F6` (canário só número de teste)
- [ ] Entendo que F7 **não** roda sem novo GO explícito

**Não executar o loop até as caixas acima.**
