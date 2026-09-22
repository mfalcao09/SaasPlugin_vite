# Path A Reopen Loop — pacote para aprovação

## O que foi montado

| Peça | Caminho |
|------|---------|
| Master PRD | `../PRD-10-PATH-A-REOPEN-MASTER.md` |
| F0–F7 | `prds/F0-CONTRACT.md` … `F7-EXPANSION.md` |
| Manifesto | `LOOP-MANIFEST.json` |
| Runner | `run_path_a_loop.py` |

Policy: Opção B · Q2=48h · Q4=R2 pós-canário · canário só `5511945760964` / `wa:eval`.

## Loop único

```text
1. Você aprova o pacote (texto abaixo)
2. python3 run_path_a_loop.py --approve-packet
3. Agente + runner executam F0→F6 sem supervisão
4. Para em F7_GATE
5. Só com "APROVO F7 PATH-A tier=N" continua expansão
```

## Texto de aprovação (copie)

```
APROVO PRD-10 PATH-A + PRDs F0–F7 + LOOP-MANIFEST + runner.
Autorizo execução autônoma F0→F6 (canário só número de teste do manifesto).
F7 permanece bloqueado até novo GO explícito.
```
