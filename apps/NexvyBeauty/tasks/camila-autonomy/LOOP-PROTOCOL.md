# Camila Autônoma — Protocolo do loop

## Estados

`QUEUED → IMPLEMENTING → TESTING → REVIEWING → EVALUATING → CHECKPOINTED → PR_OPEN → CI_GREEN → SHADOW_VERIFIED → COMPLETE`

Falhas seguem para `RETRY`, `ROLLBACK` ou `HARD_STOP`.

## Iteração

1. Ler `loop-state.json`, PRD ativa e último checkpoint.
2. Revalidar baseline e declarar o check binário.
3. Implementar somente a PRD ativa com TDD.
4. Rodar checks locais e de dados.
5. Executar revisões obrigatórias.
6. Corrigir achados sem reduzir o check.
7. Abrir PR empilhada e aguardar CI.
8. Registrar SHA, evidências, deployment e rollback.
9. Marcar COMPLETE e avançar.

## Revisores

- Toda mudança: code reviewer.
- TypeScript: TypeScript reviewer.
- Migration/SQL: database reviewer.
- Send-boundary, auth e PII: security reviewer.
- Jornada/E2E: evaluator independente.

## Retry

- Máximo de três tentativas por check.
- Mesma falha duas vezes exige nova hipótese.
- Três falhas ou ausência de progresso geram `HARD_STOP`.
- O loop nunca altera teste, threshold ou juiz para passar.

## Stops

- Envio real antes do Master Gate.
- Alteração do kernel ou avaliador pelo Learning Controller.
- Provider desconectado.
- Lead, owner ou ficha ausente.
- Divergência entre SHA e deployment.
- Limite de contato violado.
- Retry esgotado.
- Produção ou deployment sem aprovação necessária.

## Retomada

Ler o primeiro check incompleto do último checkpoint. Não repetir etapa
concluída sem evidência de invalidação. O loop é orientado por eventos de
CI/deploy; heartbeat serve apenas para detectar travas.
