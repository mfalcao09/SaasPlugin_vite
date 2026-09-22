# Glossário — Camila Harness Engineering (v1.2)

## Nomes

| Legado | Canônico | Significado |
|---|---|---|
| R2 (código) / “mensagem Joice” | **Mensagem de Saída** (`soft_exit`) | Educado + site/preview |
| Mensagem de encerramento soft (board) | **Mensagem de Saída** | Mesmo conceito |
| 2º disparo rmkt | `rmkt_t2` | TBD fora de escopo |
| Path A / F0–F7 | M0–M4 | Maturidade |
| allowlist abstrata | Lista manual / pré-selecionados | Quem o humano autoriza no piloto |
| release / kill | `voice_gate` / `emergency_stop` | Boca / freio do **automático** |

## Kill (definição founder v1.2)

**Objetivo do Kill:** impedir a Camila de falar **sozinha** (disparos automáticos / proativos).  

**Não cobre:** trabalho **supervisionado** (GO humano + lista manual), inclusive completar as 4 bolhas do 1º disparo.  

Semântica pós-harness 100% maduro (`stop_new` / `abort_inflight`): **TBD**.

## Funil

| Caixa | Código | Nota |
|---|---|---|
| DB | `db` | Origem |
| Amarelo | `preselected` | Selecionado; aguarda GO |
| Verde | `contacted` | A partir da **1ª bolha** enviada |
| Em curso | `first_contact_in_progress` | Pacote 4 bolhas (implícito enquanto envia) |
| Laranja | `remarketing_pool` | Elegível; sem esteira automática |
| Azul | `service` | Atendimento reativo |
| Vermelho | `do_not_contact` | Zero proativo; reply se lead falar |

## Mensagem de Saída

Nome de produto. Código: `soft_exit`. Sempre o mesmo texto; o **destino** muda (laranja vs vermelho). Não chamar de “mensagem Joice”.

## Retomada de pacote incompleto

Texto base (`RULES-AUTOMATED-COLD.md`):  
*Oi, {usuário}! Desculpe, acabei não conseguindo te responder dentro da minha janela de atendimento de ontem. Mas vamos retomar por aqui!*  

Parametrizar ontem/anteontem conforme atraso (≤48h). Enviar **antes** das bolhas faltantes.  
Horário: janela **estendida** (seg–sáb 08h–22h BRT), não a comercial.

## Janelas de atendimento

| Nome | Dias | BRT | Uso |
|---|---|---|---|
| **Comercial** | seg–sex | 09h–18h | Só a **1ª** mensagem de uma abertura nova |
| **Estendida** | seg–sáb | 08h–22h | Completar pacote, retomar, responder, Mensagem de Saída |

Domingo e feriado nacional = fechado (zero OUT, zero resposta).  
Código: `attendance-window.ts`. Tabela completa: `POLICY.md` §6.
