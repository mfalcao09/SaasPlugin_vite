# PRD-10 / F0 — Contrato e baseline

## Objetivo

Fechar o dicionário e a policy do Caminho A sem tocar runtime. Congelar corpus Joice e baseline da contenção emergencial.

## Entregáveis

1. Glossário versionado: `dnc_hard`, `cold_suppressed`, `soft_opt_out_active`, `remarketing_eligible`, `reopen_epoch`, `reply_grant`, `cold_not_before`, `close_kind`.
2. Policy lock: Q2=48h, Q4=R2 pós-canário, ambiguous=1/24h, reopen libera soft cold sem blast.
3. Corpus dourado JSON em `evidence/PRD-09/path-a-loop/corpus-v1.json` (Joice + adversarial + metamórficos; PII redigida).
4. Baseline emergencial: `evidence/PRD-09/path-a-loop/baseline-emergency.json` (comportamento atual medido).
5. Spec B1–B7 + reason codes em `evidence/PRD-09/path-a-loop/checks-b1-b7.md`.
6. `RULE-OPT-OUT-REMARKETING.md` e LEARNING-CASE Joice atualizados (farewell ≠ reopen).

## Loop engineering (autônomo)

### Protocolo do agente
1. Ler `sol-plan-reopen-path-A.md` + `PHASES-PATH-A-OPTION-B.md`.
2. Gerar/atualizar entregáveis 1–6 sem deploy.
3. Rodar `verify_f0_contract.py`.
4. Gravar `evidence/.../F0-result.json`.
5. Se PASS → avançar F1. Se FAIL → corrigir docs (máx 2 tentativas) ou ESCALATE.

### Check binário (mensurável)
PASS se `verify_f0_contract.py` exit 0 e prova:
- zero ocorrência de “do_not_contact = Camila muda pra sempre” nos docs Path A;
- policy Q2/Q4/Opção B presentes;
- corpus contém casos Joice `Pode deixar` e `Obrigada` → `farewell_ack`;
- B3 espera soft revogado + fila não `queued`.

### Evidência
`F0-result.json`: `{ status, files[], grep_hits, corpus_counts, sha_local }`

### Rollback
Reverter arquivos de docs/evidência da fase. Zero efeito produção.

### Stop / escalate
FAIL após 2 tentativas → `status=escalated`, loop para.
