# PRD-04 — Safety Kernel e Action Ledger

## Objetivo

Criar uma única fronteira determinística de autorização, reserva e
idempotência para qualquer mensagem da Camila.

## Action Ledger

Cada ação registra:

- idempotency key;
- produto, lead, conversa, owner e canal;
- coorte, experimento e versão de estratégia;
- tipo de ação e conteúdo hash;
- snapshot da política;
- autorização ou motivo de negação;
- estados `proposed`, `reserved`, `accepted`, `delivered`, `failed`,
  `cancelled` e `denied`;
- timestamps e tentativa.

## Safety Kernel

A RPC transacional `authorize_and_reserve` bloqueia por lead e valida:

- release state;
- opt-out e consentimento;
- lead, owner e ficha;
- provider saudável;
- janela e feriados;
- idempotência e repetição;
- limites globais e por lead;
- estratégia dentro do schema permitido.

## Limites

- Uma abertura e dois follow-ups.
- Mínimo 24 horas entre ações proativas.
- Uma ação proativa por lead/dia.
- Até duas bolhas por ação.
- Qualquer inbound humano cancela cold pendente.
- Uma retomada após 24 horas em conversa ativa.

## Casos obrigatórios

- “posso cancelar?” não é opt-out.
- “não me mande mais mensagens” é opt-out imediato.
- Telemetria, ACK, owner ou ficha desconhecidos produzem `deny`.
- Retry e cron duplicado reutilizam a mesma reservation.

## Check binário

PASS se 100 chamadas concorrentes não ultrapassarem limites; o replay do
incidente gerar no máximo três ações por lead; nenhuma chamada ao provider
ocorrer sem reservation; e o kill-switch bloquear novas reservas.

## Rollback

Release state `OFF`, cancelamento de reservations pendentes e preservação do
ledger append-only.
