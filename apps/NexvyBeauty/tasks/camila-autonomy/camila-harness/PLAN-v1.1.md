# Plano consolidado v1.1 — Camila Harness Engineering

Atualizado: 2026-09-17  
Destino: revalidação Codex → se aprovado, iniciar construção (Tipo A) sob GO.

## 1. Objetivo

Contrato executável do harness alinhado ao **board v2**, decisões do founder e ressalvas Codex (resolvidas por Q&A).

## 2. Runtime hoje vs alvo piloto

| Fase | Proativo (1º disparo / cold) | Reativo (lead falou) |
|---|---|---|
| **HOJE** (pré-implementação) | OFF + Kill — nada | OFF + Kill — nada |
| **Piloto** (após harness + GO) | Só supervisionado: DB→amarelo→GO humano→verde | Camila **atende** (Voice permitindo) |
| **Depois** | UI controla disparo | Atendimento normal |

Piloto ≠ “lista abstrata cohort separada”: a tarefa é **selecionar (amarelo) + disparar supervisionado (verde)**. Se responder → atender.

## 3. Invariantes (não negociáveis)

1. First contact: **sempre completa as 4 bolhas**, inclusive se mid-stream: hard, soft, interesse, ruído, **ou** Voice OFF / kill ON.  
2. Depois das 4: roteia (laranja / vermelho / service) com cita da msg da lead quando couber.  
3. Soft exit = **Mensagem de Saída** (educado + site/preview) — soft e hard.  
4. Soft **antes** de Camila assumir → exit → **laranja**.  
5. Hard (qualquer momento da lógica, após completar 4 se em curso) → exit → **vermelho**; lead pode falar de novo → Camila **pode responder** (sem proativo); hard só admin remove.  
6. Desinteresse **no atendimento originado do 1º disparo** → exit → **laranja** (board).  
7. Desinteresse **no atendimento originado de remarketing** → exit → **vermelho** (board; path remarketing **TBD**).  
8. Goodbye pós-exit → ignorar.  
9. Interesse / não-ruído → service; **citar** msg da lead.  
10. Ruído → espera 24h; msg humana cancela espera → se não ruído → atendimento.  
11. Silêncio 24h após 4 bolhas → laranja, **sem** disparo automático.  
12. Idempotência: mesma bolha **nunca** 2×.  
13. Voice/kill reavaliados **antes de cada bolha**; lista/pré-seleção limita **proativo**, não inbound.  
14. Remarketing campaign touches = **TBD — fora de discussão**.  
15. Até harness existir: permanece OFF+Kill.

## 4. Módulos (construção)

Ordem sugerida após docs aprovados:

1. Gates + idempotência de bolhas  
2. First contact (4 bolhas, sempre completa)  
3. Triagem (hard/soft/ruído/interesse/goodbye)  
4. Mensagem de Saída + destinos laranja/vermelho  
5. Pool laranja (dormant; inbound → service)  
6. Service / reactivate inbound (proativo off no piloto)  
7. UI/GO disparo (piloto humano → depois UI)  
8. *(depois)* Remarketing campaign — TBD  

## 5. Maturidade

| M | Critério |
|---|---|
| M0 | Contrato v1.1 aprovado |
| M1 | Shadow / logs, zero WhatsApp |
| M2 Piloto | Harness existe; GO; proativo supervisionado; reativo on; Voice/kill conforme GO |
| M3 | UI no disparo; ampliação com GO |
| M4 | LIVE conforme produto |

## 6. Corte desta revalidação Codex

Validar **apenas** v1.1 outbound + triagem + soft/hard + pool + atendimento + piloto.  
**Não** aprofundar remarketing campaign.


> **Superseded by PLAN-v1.2.md**
