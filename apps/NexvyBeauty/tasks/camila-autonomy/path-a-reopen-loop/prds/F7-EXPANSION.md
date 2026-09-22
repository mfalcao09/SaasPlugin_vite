# PRD-10 / F7 — Expansão (gate humano)

## Objetivo

Único ponto de “soltar” da Opção B. Ramp gradual após MASTER_PASS Path A e GO explícito Marcelo.

## Entregáveis

1. Checklist MASTER_PASS Path A verde (F0–F6).
2. Plano de degraus: 1 lead → 5 → 20 → limited (espelha PRD-09, escopo reopen/R2).
3. Cohort controle + relatório por `classifier_version`.
4. Ensaio de rollback sob reserva concorrente **antes** do degrau 1 comercial.
5. Critérios de congelamento: spike ambiguous, deny kernel, opt-out repetido, métrica “deve ser zero”.

## Loop engineering

### Autonomia
**Não autônomo.** Runner para em `F7_GATE` e escreve:
`waiting_for: "APROVO F7 PATH-A <degrau>"`

### Protocolo após GO
1. Validar string de aprovação no state file / CLI `--approve-f7 --tier=1`.
2. Aplicar allowlist comercial do degrau (nunca silenciosa).
3. Janela de observação + `verify_f7_ramp.py`.
4. Promover ou congelar automaticamente por guardrails; expansão além do degrau aprovado exige novo GO.

### Check binário
PASS do degrau N se:
- zero métricas “deve ser zero” violadas;
- kill-switch re-provado;
- evidência do degrau arquivada;
- GO correspondente presente.

### Rollback
Kill + ambos MODE=off + cancel grants + contenção emergencial.

### Stop / escalate
Sem GO → loop permanece parado (sucesso parcial F0–F6). Com violação de guardrail → freeze + ESCALATE.
