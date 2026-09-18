# State machine — Camila Harness Engineering (v1.2)

Board: **Meu primeiro board v2**. Remarketing campaign = **TBD**.

## Estados

`db` → `preselected` → (1ª bolha) `contacted` + pacote em curso → após 4: `remarketing_pool` | `service` | `do_not_contact` → …

### `do_not_contact` (sub-gavetas)

| Motivo | Nota |
|---|---|
| `hard_stop` | Só admin remove; reply se lead falar ok |
| `closed_lost` | Desinteresse via path remarketing (TBD) |
| `cadence_exhausted` | TBD campanha |

## FC-1 — first contact

1. GO supervisionado (lista manual) inicia pacote.  
2. Completa 4 bolhas se a lead ficar em silêncio ou só ruído. **Texto claro no meio** (pergunta, interesse, opt-out) **para o script** — Camila cita a pergunta mais assertiva e assume (cérebro ligado).  
3. Kill **não aborta** este pacote (é supervisionado, não automático).  
4. Idempotência: nunca a mesma bolha 2×.  
5. Crash/timeout: retoma da próxima faltante em ≤**48h**.  
6. Antes das faltantes: bolha de **retomada** (janela ontem/anteontem).  
7. `contacted` = na **primeira** bolha enviada.

### Após a 4ª bolha

| Condição | Destino |
|---|---|
| Hard | Cita → soft_exit (Mensagem de Saída) → vermelho |
| Soft (pré-service) | Cita → soft_exit → laranja |
| Interesse | Cita → service |
| Silêncio 24h | laranja (sem auto) |
| Ruído | espera 24h; humano → se não ruído → service |

Hard mid-4: completa 4 → depois exit → vermelho (risco aceito: encerra procedimento e para).

## Soft / desinteresse (origem)

| Contexto | Após soft_exit |
|---|---|
| Antes de Camila / pós 1º disparo | Laranja |
| Atendimento originado do **1º disparo** sem interesse | Laranja |
| Atendimento originado de **remarketing** sem interesse | Vermelho (TBD path) |

## Goodbye

Noop **somente** depois de soft_exit já enviado.  
“Obrigada + não quero” fora disso → **soft**, não goodbye.

## Pool laranja

Zero auto. Lead fala → service (quando reativo liberado). Campanha: TBD.

## Diagrama

```
DB → amarelo --[GO humano]--> bolha1 (=verde) … bolha4
         │
         ├─ crash ≤48h → retomada → bolhas faltantes
         │
         └─ pós-4: soft→laranja | hard→vermelho | interesse→service | silêncio→laranja
```
