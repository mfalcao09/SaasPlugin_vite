# PRD-07 — Conductor e cadência segura

## Objetivo

Selecionar a próxima ação comercial sem possuir autoridade de envio e sem
repetir o incidente de insistência.

## Escopo dinâmico

Uma conversa só entra quando:

- pertence a uma coorte ativa e versionada;
- está `bot_active`;
- owner é Camila;
- lead e ficha estão válidos;
- release state permite classificação.

A allowlist hardcoded deixa de ser fonte de verdade.

## Comportamento

- O conductor propõe; o kernel reserva ou nega.
- Inbound humano cancela ações frias pendentes.
- Wakes têm histórico durável e idempotency key.
- Clock é determinístico e suporta restart.
- Cadência pode variar por estratégia apenas dentro do kernel.
- Limites globais, por coorte, canal e lead são mensuráveis.

## Replays obrigatórios

- 89 registros do incidente.
- Cron duplicado e concorrente.
- Fim de semana, feriado e horário da lead.
- Restart entre proposta e reserva.
- Inbound durante geração.
- Provider desconectado.
- Lead removida da coorte.

## Check binário

PASS se nenhum lead fora da coorte receber proposta; toda resposta humana
cancelar cold; replays respeitarem os hard caps; e nenhum wake atingir o
provider sem reservation.

## Rollback

Release state `OFF`, reservations pendentes canceladas e cron mantido apenas
para retornar estado inativo.
