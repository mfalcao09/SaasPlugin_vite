# Plano consolidado v1.2 — Camila Harness Engineering

Atualizado: 2026-09-21 — contrato: **MODEL-PORTA-JUIZ.md**. PRD-13 A–D no git/edge; copy de consentimento canônica no disco; aberto = Check E wamid.

> A explicação curta no chat foi um resumo. **Este plano + STATE-MACHINE + POLICY + GLOSSARY** juntos são o contrato. Abaixo: cobertura explícita do board v2.

## 1. Objetivo

Contrato executável alinhado ao **board v2** + decisões do founder (ressalvas Codex respondidas).

## 2. Mapa board v2 → contrato

| Board v2 (caixa / fase) | No contrato | Status |
|---|---|---|
| LEAD DB | `db` | Coberto |
| Seleção UI / agente | → `preselected` | Coberto |
| LEAD PRÉ-SELECIONADO (amarelo) | `preselected` | Coberto |
| Enviar 1º disparo: 4 bolhas / ~180s | First contact FC-1 | Coberto (+ sempre completa 4; retomada ≤48h) |
| Janelas comercial / estendida | `attendance-window.ts` + `wire-gates` | Coberto (POLICY §6) |
| LEAD CONTATADO (verde) | `contacted` = **1ª bolha** | Coberto |
| Lead respondeu? Não → 24h → remarketing | Silêncio 24h → `remarketing_pool` | Coberto (sem auto disparo) |
| É ruído? | Regra 24h; humano cancela → service | Coberto |
| Soft opt-out? | Triagem soft | Coberto |
| **Mensagem de encerramento soft** (board) | Nome canônico: **Mensagem de Saída** (`soft_exit`) | Coberto (mesmo texto soft e hard; destino muda) |
| Camila assume (brain) | `service` | Coberto (reativo no piloto) |
| LEAD REMARKETING (laranja) | `remarketing_pool` | Coberto como **gaveta**; sem esteira auto |
| Preparar Campanha de Remarketing | GO campanha | **TBD** (fora de construção agora) |
| 1º/2º/3º disparo remarketing + 24h/6d | `rmkt_t1..t3` | **TBD** |
| Hard opt-out → vermelho | `do_not_contact` / hard_stop | Coberto |
| Lead tem interesse? → fechamento / pagamento / onboarding | `closing` → pay → `onboarding` | Coberto em alto nível (detalhe pagamento fino = evolução) |
| Sem interesse no atendimento | Origem 1º disparo → laranja; origem remarketing → vermelho | Coberto (remarketing path TBD) |

### Renomeações de produto (já no glossário)

| Evitar | Usar |
|---|---|
| Mensagem Joice / texto Joice | **Mensagem de Saída** |
| R2 (código Path A) | `soft_exit` / Mensagem de Saída |
| F0–F7 como nome de feature | M0–M4 por módulo |
| Remarketing = esteira automática | Remarketing = **pool** até GO campanha (TBD) |

## 3. Três momentos no tempo

| Momento | O que acontece |
|---|---|
| **A — Agora** | Harness não existe. Voice OFF + Kill ON. Zero WhatsApp. |
| **B — Piloto** | Voice **TEST** + Kill **ON**. Kill só barra **automático**. Disparo **supervisionado** (lista manual) liberado — inclui completar 4 bolhas. Lead fala → Camila **atende**. |
| **C — Maduro** | UI no disparo; Kill fino (**TBD**); campanha remarketing (**TBD**). |

## 4. Invariantes

1. **FC-1:** pacote first-contact completa 4 se silêncio/ruído. Texto claro no meio **para o script**; Camila cita a pergunta mais assertiva e assume (cérebro ligado). Kill **não** aborta pacote **supervisionado** que ainda esteja rodando.  
2. Após as 4: roteia (laranja / vermelho / service) com cita quando couber.  
3. **Mensagem de Saída** = sempre o mesmo texto (educado + site/preview) — soft e hard.  
4. Soft pré-Camila → Mensagem de Saída → **laranja**. Hard → Mensagem de Saída → **vermelho** (reply se lead falar; hard só admin remove).  
5. Sem interesse no atendimento do **1º disparo** → Mensagem de Saída → **laranja**. Do **remarketing** → **vermelho** (path TBD).  
6. Hard mid-4: completa 4 → cita → Mensagem de Saída → vermelho; risco aceito.  
7. Goodbye noop **só após** Mensagem de Saída enviada. “Obrigada + não quero” = soft.  
8. Ruído → 24h; humano cancela → se não ruído → service.  
9. Silêncio 24h pós-4 → laranja sem auto.  
10. Verde (`contacted`) = **primeira bolha** enviada.  
11. Crash: retoma ≤**48h**; bolha de retomada **antes** das faltantes.  
12. Idempotência: mesma bolha nunca 2×.  
13. **Kill** = só automático; supervisionado fora do Kill.  
14. Campanha remarketing + Kill maduro = **TBD**.

## 5. O que o resumo do chat NÃO substitui

Detalhe operacional está em:
- `STATE-MACHINE.md` — eventos e destinos  
- `POLICY.md` — gates / Kill / piloto  
- `GLOSSARY.md` — nomes das fases  
- `CONTRACT-ANSWERS.md` — Q&A  

## 6. Ordem de construção

1. Gates + automático vs supervisionado  
2. First contact (4 bolhas, FC-1, idempotência, retomada)  
3. Triagem  
4. Mensagem de Saída + destinos  
5. Pool laranja  
6. Service reativo  
7. UI/GO  
8. Remarketing campaign — TBD  

## 7. Maturidade

| M | Critério |
|---|---|
| M0 | Contrato v1.2 documentado |
| M1 | Shadow / zero WhatsApp |
| M2 | Piloto: TEST + Kill ON + supervisionado + reativo |
| M3 | UI no disparo |
| M4 | LIVE + Kill maduro TBD |
