# Hermes Torre — Prospecção Ativa Camila

Pacote do piloto: gestao = hub; Hermes (Telegram) = espelho operacional; send = `platform-cold-outreach`.

## Índice

| Doc | Escopo |
|---|---|
| [ADR-1](./ADR-1-HERMES-ORQUESTRACAO-NAO-CEREBRO.md) | Por que orquestração ≠ cérebro |
| [PRD-0](./PRD-0-INVARIANTES-E-NAO-ESCOPO.md) | Invariantes |
| [PRD-1](./PRD-1-BRIDGE-GESTAO-HERMES.md) | Bridge + `hermes_ops` |
| [PRD-2](./PRD-2-MONTAR-LISTA.md) | Proposta ≤10 |
| [PRD-3](./PRD-3-DRY-RUN.md) | Dry-run |
| [PRD-4](./PRD-4-ARM-E-PILOTO.md) | ARM + lote real |
| [PRD-5](./PRD-5-VIGIA-48H.md) | Vigia |
| [PRD-6](./PRD-6-RUNBOOK-PILOTO.md) | Runbook operador |

## Check global 100%

1. Bridge UI↔Hermes com `correlation_id`
2. Lista ≤10 com `approved_at` humano
3. Dry-run zero wamid
4. ARM + ≤10 envios reais
5. Vigia 48h com alerta
6. Desarme &lt;2 min
