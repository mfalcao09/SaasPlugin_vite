# Pacote de revisão — Camila Harness Engineering

**Pedido:** Codex revisa o board (imagem anexa) + o plano do Cursor abaixo.
**Saída pedida:** PARECER · APONTAMENTOS · CONCLUSÃO (aprovado / aprovado com ressalvas / rejeitar redesign).
**Escopo:** decisão de arquitetura/renomeação. NÃO implementar código. NÃO mutar prod.

---

## Contexto atual (runtime, Lei1 recente)

- Programa legado interno: Path A / F0–F7 / “R2” / allowlist F7 tier2.
- Voice gate: `release_state=OFF` + `kill_switch=true` (Camila não fala).
- Pilot cohort Path A: 5 números (tier2); políticas reopen/soft-exit armadas no cercadinho, boca fechada.
- Regra de produto do founder: soft-fechada = inativa (zero cold); ao reativar com interesse = **inbound normal** (brain), **não** reclassificar como frio / não reenqueue cold.

---

## Board do founder (imagem anexa)

Programa: **Camila - Harness Engineering**

Colunas/estados:
1. LEAD DB — não tratados/não contatados; seleção via UI ou agente (Cursor/Codex/Claude)
2. LEAD PRÉ-SELECIONADO — escolhido, ainda sem contato → **primeiro disparo** = 4 bolhas / janela 180s → vira CONTATADO
3. LEAD CONTATADO — respondeu?
   - Não → espera 24h → REMARKETING
   - Sim → é ruído (automática)? Se sim, espera 24h por resposta real
   - Resposta real → soft opt-out? Se sim → **mensagem de encerramento soft** → REMARKETING
   - Se não soft → **Camila assume (brain atendimento)**
4. LEAD REMARKETING — 1º / 2º / 3º disparo de remarketing; hard opt-out possível; entre touches: 24h (+ se não respondeu, +6 dias); após 3º sem resposta → NÃO CONTATAR
5. Atendimento → interesse? Não → hard/não contatar; Sim → conduzir fechamento → link pagamento → assinatura → **Onboarding**
6. Terminal vermelho: leads para não contatar mais (hard opt-out)

---

## Insight crítico do Cursor (colisão de nomes)

No código Path A, **“R2”** = polite exit (1 msg + site no soft opt-out) ≈ **“Mensagem de encerramento soft”** do board.

No board, **“2º disparo de remarketing”** = segundo touch da cadência remarketing.

**São coisas diferentes.** Por isso o rename é obrigatório: a palavra R2 no harness atual é anti-profissional e semanticamente errada em relação ao board.

---

## Proposta Cursor — rename + reestruturação

### Nome do programa
**Camila — Harness Engineering** (`camila-harness`)

### Vocabulário
| Legado | Novo |
|---|---|
| Soft opt-out | Soft pause |
| Hard opt-out | Hard stop |
| R2 (código Path A) | Soft exit (`soft_exit`) |
| 1º/2º/3º disparo remarketing | Remarketing touch 1/2/3 (`rmkt_t1`…`t3`) |
| Farewell “pode deixar” | Goodbye ack |
| Reopen intent | Reactivate → Inbound resume |
| cold_not_before | `no_proactive_until` |
| cold_suppressed | `proactive_blocked` |
| Allowlist F7 | Pilot cohort S/M/L (1/5/20) |
| release + kill | Voice gate + Emergency stop |
| F0–F7 | Maturity M0–M4 **por módulo**, não nome de feature |

### Módulos do harness (espelham o board)
1. `01-selection` — DB → pré-selecionado  
2. `02-first-contact` — 4 bolhas / 180s  
3. `03-response-triage` — respondeu? ruído? soft? interesse?  
4. `04-soft-exit` — msg encerramento soft (+ site)  
5. `05-remarketing-cadence` — touches 1–3 (24h + 6d)  
6. `06-reactivate-inbound` — ela volta → brain; **proibido** cold/reenqueue  
7. `07-service-close` — atendimento → fechamento → onboarding  
8. `08-hard-stop` — terminal  

### Invariantes
1. Soft pause → soft exit → REMARKETING; zero first-contact/brain até reativar.  
2. Reactivate/interesse → SERVICE (inbound only); proibido reenqueue cold.  
3. Hard stop → sem outbound automático.  
4. Goodbye ack pós soft-exit → 0 outbound.  
5. Rename via alias; sem big-bang de comportamento.

### Maturidade (substitui F0–F7 como “produto”)
M0 Contract → M1 Shadow → M2 Pilot → M3 Limited → M4 Live **por módulo**.

Estado traduzido hoje: soft-exit + reactivate em espírito M2 Pilot M (5), Voice OFF; cadência remarketing 1–3 automática = visão do board, WHEN ainda TBD no runtime.

### Cutover
C1 glossário+mapa → C2 alias runtime flags → C3 rename hard no repo.

### Flags (proposta)
`REOPEN_INTENT_V1_*` → `CAMILA_REACTIVATE_*`  
`R2_AUTO_V1_*` → `CAMILA_SOFT_EXIT_*`  
Allowlist → `CAMILA_PILOT_COHORT`

---

## Perguntas explícitas ao Codex

1. O board está internamente consistente? Onde há ambiguidade (ex.: soft exit vs entrada em remarketing; ruído; hard após 3º silence)?
2. A separação Soft exit ≠ Remarketing touch 2 está correta e deve ser lei do glossário?
3. A regra “reativar = inbound only, nunca frio” está bem modelada nos módulos 04–06?
4. Falta algum estado/módulo no redesign vs board (ex.: wait 24h pós-ruído, link pagamento)?
5. Risco de lock-in do rename C1→C2→C3?
6. Parecer final: aprovar redesign como contrato de harness? Com quais ressalvas obrigatórias antes de docs/código?

---

## Formato de resposta obrigatório

```
## PARECER
(1 parágrafo)

## APONTAMENTOS
- ...

## CONCLUSÃO
Status: APROVADO | APROVADO COM RESSALVAS | REJEITAR
Próximo passo recomendado: ...
```
