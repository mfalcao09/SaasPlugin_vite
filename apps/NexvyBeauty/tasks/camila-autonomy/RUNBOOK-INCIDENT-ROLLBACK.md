# Camila Autônoma — Runbook de incidente e rollback

## Kill imediato

1. Definir `CAMILA_CONDUCTOR_ENABLED=false`.
2. Pausar campanhas e garantir `dry_run=true`.
3. Confirmar `flag_off`.
4. Cancelar reservations ainda não entregues.
5. Verificar zero provider call após o corte.

## Provider desconectado

- Bloquear novas reservations.
- Não marcar mensagem como enviada.
- Alertar operação com instância e timestamp, sem segredo.
- Só reabrir após `connected=true` e `smartphoneConnected=true`.

## Spam ou limite violado

- Acionar `OFF`.
- Congelar estratégia e coorte.
- Preservar ledger, mensagens e assignments.
- Reproduzir o conjunto em replay antes de qualquer reativação.

## Owner/ficha incorretos

- Negar envio.
- Marcar ação `denied`.
- Corrigir vínculo sem enviar mensagem.
- Reexecutar o context builder e validar proveniência.

## Preço, link, identidade ou opt-out

- Hard stop e rollback da estratégia.
- Não tentar “corrigir” com nova mensagem automática.
- Escalar ao release owner.

## Rollback técnico

- Reativar última estratégia estável em transação.
- Restaurar versão anterior das edges.
- Confirmar deploy parity.
- Manter kernel em `OFF` até o Master Gate parcial voltar a ficar verde.
