# PRD-00 — Programa Camila Autônoma

## Resultado

Transformar a Camila em uma BDR/vendedora autônoma que abre, conduz,
demonstra, fecha e entrega ao onboarding sem intervenção, preservando
consentimento, identidade, verdade comercial e limites de contato.

## Estado inicial medido

- Conductor contido em 2026-09-12 com `CAMILA_CONDUCTOR_ENABLED=false`.
- Campanha `piloto-camila-zapi-20260901` pausada e em dry-run.
- Z-API desconectada.
- Cinco conversas antigas: 0/5 com `client_card`; 1/5 com `lead_id`.
- Código novo local ainda não implantado; duas falhas de `deno check`.
- Suíte local de referência: 197 testes verdes.
- Nenhum lead novo elegível fora da fila antiga.

## Invariantes

1. O modelo e o conductor apenas propõem; o Safety Kernel autoriza.
2. Nenhum envio atinge o provider sem reserva válida no Action Ledger.
3. Toda conversa tem `lead_id`, owner e ficha canônica antes da resposta.
4. Preço e link são validados contra dados atuais do banco.
5. Opt-out, identidade, canal, hard caps e kill-switch não são aprendíveis.
6. Falta de dado, ACK ou telemetria é falha fechada.
7. Nenhum lead real entra antes de `MASTER_PASS`.

## Limites imutáveis iniciais

- Uma abertura e no máximo dois follow-ups.
- Intervalo mínimo de 24 horas.
- Uma ação proativa por lead por dia.
- Duas bolhas por ação.
- Resposta humana encerra a cadência fria.
- Conversa ativa permite uma retomada após 24 horas de silêncio.
- Horário efetivo é a interseção da janela Camila, horário da lead e feriados.

## North star e guardrails

North star: conversão paga por intention-to-treat.

Guardrails eliminatórios: preço/link incorreto, identidade enganosa, opt-out
ignorado, canal/owner incorreto, lead/ficha ausente, excesso de contato,
provider desconectado ou divergência SHA/deploy.

## Entregas

- PRD-01: contenção e baseline.
- PRD-02: CI e deploy parity.
- PRD-03: ficha canônica.
- PRD-04: Safety Kernel e Action Ledger.
- PRD-05: Z-API, ownership e ACK.
- PRD-06: brain comercial.
- PRD-07: conductor seguro.
- PRD-08: aprendizado e auto-promoção.
- PRD-09: avaliações, Master Gate e rollout.

## MASTER_PASS

Todos os checks de `MASTER-GATE.md` devem estar verdes, sem waiver, ligados ao
mesmo commit e deployment. O primeiro lead real só é permitido depois desse
resultado e de aprovação explícita do release owner.
