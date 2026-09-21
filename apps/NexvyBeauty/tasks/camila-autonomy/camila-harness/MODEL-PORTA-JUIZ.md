# Modelo Porta + Juiz — contrato executável

Atualizado: 2026-09-21. Código: `_shared/camila-harness/porta-juiz.ts` + puxador/gates.
PRD-13 A–D: no disco, commit `cb8d0e0`, edge (cold 106 / webhook 55 / brain 175).
Aberto: Check E wamid (após 08h BRT); copy final de consentimento (rascunho só).
Check núcleo: `deno test --no-check supabase/functions/_shared/camila-harness/porta-juiz.test.ts`

Este arquivo é o contrato. Em conflito com PLAN-v1.2 / Codex “cancelar se falou” / `pauseOpenPackage`, **este vence**.

## Duas bocas

| Boca | Quem | Quando | Morre quando |
|---|---|---|---|
| 1 | Tick, texto roteiro, 4 bolhas | Lead em fila de 1º disparo; autorização **no disparo** | Pacote encerrado (4 wamids **ou** 180s desde a 1ª). **Nunca** volta nesta lead |
| 2 | Só o cérebro | Harness pergunta **falou?**; cérebro pergunta **o que é** | Veredito na inbound + sem job |

Fala no meio das 4 **não cancela**. G3: hard no meio → termina 4 → cérebro manda Mensagem de Saída (texto + site).

Kill vale **só** na boca 1. Relógio: um cron (tick). Cadeado de job neste produto; Duda/outros fora.

## G1 — Dívida

**Falou, e o cérebro já respondeu no WhatsApp?**

Resposta = outbound do cérebro com wamid. Não conta bolha 1–4, sistema do inbox, presença. Conta humano no WhatsApp.

## G2 — Veredito por inbound

`pending` | `noise` | `exit` | `attend` | `consent_asked` | `consent_yes` | `consent_no`

Job só se existe inbound `pending`. Evita loop de ruído.

## G4 — Pacote (a + b + c)

- **a** Ritmo ~180s (ticks).
- **b** Todo tick: bolha sem wamid → reenvia (idempotente). **Revisor.**
- **c** Encerra no que vier primeiro: 4 wamids **ou** 180s após a 1ª. Aí para boca 1. Inbound **durante** já está gravada; “falou?” roda depois do fechamento.

## G5 — Acordar o juiz (não classificar texto)

| # | Pergunta | Se trava | Flag |
|---|---|---|---|
| 0 | Deste produto? | para | — |
| 1 | Humano (`human_active` / `waiting_human`)? | não acorda | — |
| 2 | DNC/hard? | **não trava** | `needs_new_consent` |
| 3 | Boca 1 no ar? | espera | inbound já gravada |
| 4 | Inbound sem veredito? | se não, não acorda | ficha: `pending_inbound_id`, `spoke_during_package` |
| 5 | Cérebro já respondeu essa inbound (wamid)? | não acorda | — |
| 6 | Janela deixa reply? | job fica | — |

Remarketing + fala → acorda (reabre `bot_active` como efeito).

## G6 — Juiz = cérebro

`triage.ts` muda de casa: primeiro ato do turno autorizado. Harness não classifica conteúdo. Soft/hard/saída roteirizada = cérebro envia; funil depois do wamid (G7); tag depois do funil.

Ficha do job (não é juiz): `pending_inbound_id`, `needs_new_consent`, `spoke_during_package`, `wake_reason=pending_inbound`.

## G8 — Calar na dúvida

1. Tokens claros de saída → `exit` (uma vez).
2. `needs_new_consent` → **só** pergunta de consentimento até sim/não.
3. Qualquer outra dúvida → `noise`, zero WhatsApp.
4. Atendimento só com sinal claro.

## Plano de fio (produção)

1. **Núcleo:** `porta-juiz.ts` + testes; reactive **não** cancela 4 nem manda saída pelo tick. **Feito.**
2. **Tick G4+G5 + puxador:** `harness-package-tick.ts` + `runPullerPass`. Job no metadata. Sem DDL. **Feito** (disco + edge).
3. Webhook deste produto só grava; `shouldDispatchSalesBrainFromWebhook` = 0 dispatch. **Feito.**
4. Cérebro: `juizPrimeiroAto`; sem `harness_job_id` neste produto = recusa. **Feito.**
5. Juízes velhos desligados neste produto (housekeep/cold/tick). DNC = flag, não cadeado. **Feito.**

Sem DDL até GO de tabela. Check E (wamid Andressa) não substitui o fio — é prova de janela.
