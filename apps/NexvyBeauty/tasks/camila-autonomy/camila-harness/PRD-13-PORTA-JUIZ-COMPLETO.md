# PRD-13 — Porta + Juiz completo (puxador + fechar bocas + débitos)

**Programa:** Camila Harness Engineering  
**Produto cadeado:** `806b5975-e268-402e-a65c-9e9503271041`  
**Contrato que vence:** `MODEL-PORTA-JUIZ.md`  
**Pré-requisito:** PRD-12 no ar (piloto, tick VPS, Path A morto) + núcleo `porta-juiz.ts` / `harness-package-tick.ts` **no disco** (51 testes locais).  
**Este PRD não autoriza:** deploy, commit/push, DDL, WhatsApp à Andressa fora da janela, mexer CRM tenant, dropar `current_stage_id`.

**Por que existe:** compactação perdeu viradas de decisão. Fonte das leis = falas do Marcelo em ordem (sessões `15bc4fcf` 16–18/09 e `ec4e5488` 18–21/09). **Decisão posterior vence.** Este arquivo é o roteiro para não perder de novo.

---

## 0. DNC — lei (ler antes de qualquer corte)

**Você entendeu o relatório ao contrário. Corrigido aqui.**

| Camada | O que vale | Fonte |
|---|---|---|
| **Lei (decisão)** | DNC/hard **não** impede a Camila para sempre. Sobe flag `needs_new_consent` e **segue** a tabela G5. O cérebro, no primeiro ato, **só** pergunta se ela confirma retomar. Sim → atende. Não / vazio claro → cala. | 20/09 22:38 (`ec4e5488` U166). Mais recente. |
| **Disco (débito)** | `nextStageAfterInboundWake` ainda devolve `do_not_contact` e não sai do lugar (`harness-stage.ts`). Isso é código de **quinta 17**, **não** a lei. | Bug relativo à lei de domingo. |

**Frase única:** a Camila **pode** voltar a falar com quem pediu para parar — **depois** de pedir consentimento de novo. Quem “ganhou” no produto é domingo. Quem ainda “ganhou” no arquivo é quinta. O corte D deste PRD alinha o arquivo à lei.

Não confundir com:

- Hard **durante as 4** → termina as 4, **depois** o cérebro manda Mensagem de Saída + site, funil vermelho (G3). Isso não é “nunca mais atende se ela voltar daqui a um mês”.
- Humano no loop → cérebro off (isso não é DNC).

Rascunho da pergunta (elaborar copy depois, não bloquear construção):

> Você havia pedido para parar o atendimento. Confirma que deseja retomar e saber mais do nosso software?

---

## 1. Problema

O núcleo Porta/Juiz **escreve o bilhete** (`harness_job` no metadata) e **não puxa**. O webhook **ainda empurra** o cérebro sem id. O cérebro **aceita** POST solto. Housekeep/cold **ainda julgam texto**. Stage de DNC **ainda é o de quinta**. Produção **não** tem o corte de domingo.

Sintoma já vivido: Andressa em Em Atendimento, inbound “Como funciona?”, cérebro mudo; segunda 08h ninguém puxa.

Atalho **proibido** (21/09 03:15): tick chama o cérebro no `create` (`onHarnessJob`). Isso é segunda boca.

---

## 2. Resultado (DoD do programa 13)

Pronto **só** quando **todos** os checks da §8 estiverem verdes **e** o GO de deploy tiver sido dado por Marcelo. Sem afrouxar.

| # | Entrega | Sem isto o PRD não acabou |
|---|---|---|
| 1 | Vida do bilhete `held → ready → in_flight → done \| failed` | Tick do minuto seguinte re-puxa o mesmo caso |
| 2 | Puxador no **mesmo** `harness-pilot-tick` | Job é adesivo |
| 3 | Webhook deste produto **só grava** inbound | Segunda boca |
| 4 | Cérebro deste `product_id` recusa sem `harness_job_id` válido | Cadeado de mentira |
| 5 | Ordem: 2 no ar **antes** de 3 e 4 | Andressa muda de novo |
| 6 | Stage DNC alinhado à lei de domingo | Código de quinta fura G5#2 |
| 7 | Juiz de texto saiu do housekeep/cold/tick | Dois juízes |
| 8 | Boca 1 não manda Mensagem de Saída | Boca 1 fala o que não pode |
| 9 | G7: funil/tag **depois** do wamid | Funil mente |
| 10 | Ledger não abre janela que o harness fechou | IA domingo 1h |
| 11 | Deploy só com GO explícito | Disco ≠ produção |

Fora do DoD 13 (outros trilhos, não esquecer): schema-alvo Claude; Kanban arrasta → funil+tag (19/09, sem GO de schema); campanha remarketing TBD; dropar `current_stage_id`.

---

## 3. Invariantes (nunca afrouxar)

1. Um relógio: `harness-pilot-tick` (VPS 1/min). Sem pg_cron novo, sem conductor.
2. Duas bocas: (1) 4 bolhas do 1º disparo; (2) só o cérebro. Boca 1 **nunca** volta neste lead.
3. Fala no meio das 4 **não cancela**. Inbound grava; “falou?” roda **depois** do pacote fechado.
4. Harness pergunta **falou?** Cérebro pergunta **o que é**.
5. G1: dívida some só com outbound do **cérebro** com wamid. Boca 1 / “IA reativada” / eco do chip não contam.
6. G2: veredito por inbound (`pending|noise|exit|attend|consent_*`).
7. G4: a ritmo ~180s; b reenvia bolha **tentada** sem wamid; c fecha em 4 wamids **ou** 180s após a 1ª.
8. G5 tabela 0–6 (abaixo). #2 = flag, **não** trava.
9. G6+G8: `juizPrimeiroAto`. Dúvida → silêncio. Única fala após DNC até sim/não = pergunta de consentimento.
10. G7: funil depois do wamid; tag depois do funil. Funil manda na lista Z-API; tag **não** escreve funil.
11. Kill = só automático. Supervisionado (as 4) não morre no Kill. Kill **não** cala inbound.
12. Janelas: comercial seg–sex 09–18 (só abrir 1ª); estendida seg–sáb 08–22 (continua/reply/saída); domingo+feriado = 0.
13. Contatado = 1ª bolha. Em Atendimento = cérebro assumiu (tela vazia ok).
14. Humano (`human_active` / `waiting_human`) → cérebro off.
15. Sem DDL neste PRD. Job/veredito no metadata até GO de tabela.
16. Sem atalho: ninguém chama o cérebro sem passar pelo puxador **neste produto**, exceto **continuação do mesmo turno** (hand-back / `ensure_reply`) com o **mesmo** `harness_job_id`.

### G5 — acordar (não classificar texto)

| # | Pergunta | Se trava | Flag |
|---|---|---|---|
| 0 | Deste produto? | para | — |
| 1 | Humano? | não acorda | — |
| 2 | DNC/hard? | **não trava** | `needs_new_consent` |
| 3 | Boca 1 no ar? | espera | inbound já gravada |
| 4 | Inbound sem veredito? | se não, não acorda | `pending_inbound_id`, `spoke_during_package` |
| 5 | Cérebro já respondeu essa inbound (wamid)? | não acorda | — |
| 6 | Janela deixa reply? | job fica `held` | — |

---

## 4. O que já está no disco (não refazer)

Não reabrir estes arquivos salvo débito listado na §5.

- `porta-juiz.ts`: `decideActivation`, `reviewFirstContactPackage` (attempted), `juizPrimeiroAto`, `extractWamid`, `isBrainOutboundWamid`
- `harness-package-tick.ts`: cria job, resend só tentada, fecha 4 wamids/180s, Andressa sem boca 1 → job sem resend
- `reactive-enqueue.ts`: `inbound_recorded`, **não** cancela 4, **não** enfileira saída
- Janelas, spacing 42–197s, `canDispatchNow`, roster DB, Path A unscheduled, funil→tag, 24h housekeep (ainda com juiz errado — §5.D)
- Brain já **importa** `juizPrimeiroAto` (local, sem deploy deste corte)

Check local já rodado (não substitui §8):  
`deno test --no-check` porta-juiz + package-tick + prd12-live + wake + gate + stage → 51/51.

---

## 5. Construção — um GO por corte, nesta ordem

Não pular. Não juntar C+D “porque é rápido”. Cada corte tem check próprio. Sem GO de Marcelo, não deploy.

```text
GO BUILD 13-A  → vida do bilhete + puxador (cérebro/webhook ainda abertos)
       check A verde
GO BUILD 13-B  → webhook só grava  +  cérebro recusa sem job   [só depois de A no ar]
       check B verde
GO BUILD 13-C  → boca 1 sem saída; housekeep/cold sem juiz de texto; G7 wamid
       check C verde
GO BUILD 13-D  → DNC stage = lei domingo; ledger não fura janela
       check D verde
GO DEPLOY 13   → functions + tick VPS   [humano, janela, sem Andressa se domingo]
       check E (produção) verde
```

UI/schema (Kanban arrasta, `current_stage_id`) = **não é corte 13**. Trilho Claude + GO separado.

### Corte A — puxador (GO BUILD 13-A)

**Objetivo:** o tick, depois de criar/atualizar bilhetes, **puxa um** `ready` e chama o cérebro com id.

**Fazer**

1. Estender o job no metadata (sem tabela):

```text
harness_job = {
  id,                    // job:{conversationId}:{inboundId}  (idempotente)
  status,                // held | ready | in_flight | done | failed
  reason,                // job_ready | job_held_window | ...
  flags,                 // WakeFlags
  created_at, claimed_at, done_at,
  inbound_id
}
```

2. Funções puras + testes (TDD):
   - `promoteHeldJobs(now)` — `held` + janela aberta → `ready`
   - `pickNextReadyJob(jobs)` — um por tick
   - `claimJob` → `in_flight` (se já `in_flight`/`done`, no-op)
   - `completeJob` se G5#5 (já tem wamid do cérebro) → `done` sem chamar
3. `runPullerPass` no `harness-pilot-tick` **depois** de `runPackageTickPass`.
4. Invoke: `{ conversation_id, harness_job_id, harness_wake_flags }`.
5. **Não** ligar `onHarnessJob` no create. Remover o gancho do caminho de produto ou deixar morto.
6. Sem sb / dry: puxador no-op (0 WhatsApp).

**Não fazer neste corte:** recusar POST no cérebro; tirar `dispatchSalesBrain` do webhook.

**Check A (binário)**  
`deno test --no-check` em `harness-puller.test.ts` (nome fixo) + package-tick + porta-juiz:

- `held` + domingo → 0 invoke  
- `held` + terça 10h → 1 invoke com `harness_job_id`  
- `ready` duas vezes no mesmo tick → 1 claim  
- já tem wamid do cérebro → `done`, 0 invoke  
- humano → 0 invoke  
- create job **não** chama cérebro  

Pronto A = esses testes verdes. Sem deploy.

### Corte B — fechar as outras bocas (GO BUILD 13-B)

**Pré-requisito:** A **deployado** ou, se Marcelo autorizar teste só local, A verde + deploy A+B no mesmo GO. Padrão seguro: **A no ar primeiro**.

**Fazer**

1. Webhook QR, **só se** `product_id` = cadeado: persistir inbound → `decideActivation` → no máximo escreve/atualiza job. **Zero** `dispatchSalesBrain`.
2. Outros canais (Meta, webchat, Cloud receiver): **não** mudar (não são esta porta).
3. Cérebro: se `conversation.product_id` = cadeado e body sem `harness_job_id` de job `ready`/`in_flight` → skip (`harness_job_required`).
4. Continuação do mesmo turno (`ensure_reply`, hand-back): propaga o **mesmo** id; não cria job novo.
5. Conductor: continua unscheduled. Não rearmar.

**Check B**

- Teste: inbound sintético harness product → mensagem gravada, **0** fetch brain.  
- Teste: POST brain sem job neste product → skip.  
- Teste: POST com job `in_flight` → passa do cadeado (o juiz ainda decide falar ou calar).  
- Teste: outro product_id sem job → comportamento antigo (não quebrar Duda).

Pronto B = testes verdes. Deploy só com GO, **depois** de A vivo.

### Corte C — um juiz, G7 (GO BUILD 13-C)

**Fazer**

1. Housekeep 24h **neste produto**: não chama `triageInbound` para decidir funil de conteúdo. Silêncio 24h sem inbound pendente → laranja. Se há inbound `pending` → não joga no pool (o puxador é dono).
2. Cold `on-inbound` / `suppressBrain`: neste product_id, não classifica texto; no máximo anota inbound.
3. Tick: não enfileira `exit_message` da boca 1. Saída = cérebro após G3.
4. G7: só depois de wamid do ato (saída ou attend) → `derived_stage` + paint tag.
5. Persistência de wamid no send da boca 1 (metadata `harness_mouth: 1` + wamid Z-API) para o revisor G4 não mentir.

**Check C**

- Housekeep com inbound pending → **não** move remarketing.  
- Soft no texto, housekeep → **não** manda saída pelo tick.  
- G7: sem wamid → funil não pinta Em Atendimento/laranja/vermelho.  
- Send boca 1 grava `harness_mouth: 1` (teste com sb fake).

### Corte D — DNC + ledger (GO BUILD 13-D)

**Fazer**

1. `nextStageAfterInboundWake`: DNC **não** prende. Efeito = `needs_new_consent` no metadata da conversa; stage pode ir a `service` se G5 deixar (humano não). Teste: DNC + “como funciona?” → flags.needs_new_consent true, activation `job` (não `stop` por DNC).
2. Ledger / `reserveAgentAction`: reply inbound **deste produto** usa a janela do harness (`harnessAllowsBrainSend`), não Mon–Fri 09–18 próprio nem kill de automático. Domingo continua fechado.
3. Copy da pergunta de consentimento: rascunho ok até Marcelo redigir.

**Check D**

- Teste stage: DNC + inbound → não fica eterno em `do_not_contact` por causa do wake.  
- Teste juiz: DNC+flag + “como funciona?” → `consent_question`, não demo.  
- Teste gate: domingo → 0 reply; sábado 15h → reply permitido; kill não entra nesse portão.

### Corte E — publicar (GO DEPLOY 13)

Só depois de A–D verdes no disco.

Ordem de publish: tick/cold host (puxador) → webhook → brain.  
Janela: seg–sáb 08–22 BRT. **Não** no domingo.  
Não mandar WhatsApp manual à Andressa para “testar”.

**Check E (produção — sem isto não afirmar “Andressa segunda ok”)**

1. Conversa Andressa: existe `harness_job` com a inbound de “Como funciona?” (ou inbound pendente vigente).  
2. Dentro da janela, após 1 tick: outbound do **cérebro** com wamid **ou** job `held` se ainda fora da janela.  
3. Webhook de um ping de teste **não** dispara segundo turno sem job.  
4. Domingo: 0 outbound novo.

---

## 6. Passo a passo operacional (anti-perda)

Usar esta lista no chat a cada corte. Não resumir “o resto é detalhe”.

1. Declarar o corte (A/B/C/D/E) e o check da §5.  
2. Ler `MODEL-PORTA-JUIZ.md` + esta §0 (DNC) + invariantes.  
3. Procurar no disco o símbolo (Lei 2) — não recriar `decideActivation`.  
4. TDD do check.  
5. Mínimo de código.  
6. Rodar o check **na hora**. Sem check = “implementei, não verifiquei”.  
7. **Parar.** Pedir GO do próximo. Sem GO: sem deploy, sem corte seguinte.  
8. Se compactar: reler PRD-13 §0 e §5, não a memória.

Proibido no meio do caminho:

- Ligar `onHarnessJob`  
- Recusar job no cérebro **antes** do puxador no ar  
- “Só um invoke” na Andressa para destravar segunda  
- DDL  
- Commit/push/deploy sem pedido  
- Tratar DNC como bloqueio eterno do cérebro  

---

## 7. Viradas (para não ressuscitar lei morta)

| Morto (não implementar) | Vivo (este PRD) | Quando morreu |
|---|---|---|
| Cancelar as 4 se falou | Termina 4 | 20/09 17:33 |
| Triagem + saída no harness/tick | Juiz no cérebro | 20/09 19:19 |
| Hard eterno = Camila nunca mais | `needs_new_consent` + pergunta | 20/09 22:38 |
| Kill explica silêncio da Andressa | Kill ≠ inbound | 20/09 00:43 |
| Tick empurra cérebro no create | Puxador | 21/09 03:15 |
| Vários crons / Path A | Um tick VPS | 18/09 PRD-12 |
| Tag Z-API escreve funil | Funil escreve tag | 18/09 19:39 |
| Contatado = 4ª bolha | Contatado = 1ª | 17/09 + 20/09 01:12 |
| “Mensagem Joice” | Mensagem de Saída | 17/09 22:22 |

---

## 8. Checklist mestre (imprimir)

- [x] A: puxador + estados; testes puller verdes (disco, 2026-09-21)  
- [x] A: `onHarnessJob` fora do caminho de produto  
- [x] GO + deploy A+B+C+D (GO DEPLOY 13, 2026-09-21 ~07:45Z) — cold 106, webhook 55, brain 175 ACTIVE  
- [x] B: webhook 0 dispatch neste produto (disco)  
- [x] B: brain exige job neste produto (disco)  
- [x] B: hand-back leva o mesmo id (disco)  
- [x] C: housekeep/cold sem juiz de texto neste produto (disco)  
- [x] C: tick sem `exit_message` boca 1 (disco)  
- [x] C: G7 após wamid (disco: `g7MayWriteFunnel` + `mouth1OutboundMetadata`)  
- [x] D: stage DNC = flag, não cadeado eterno (disco)  
- [x] D: ledger = janela harness no reply (disco)  
- [x] E: GO deploy feito; job Andressa `held` + 0 outbound novo (fora da janela). **wamid do cérebro = após 08h BRT**  

---

## 9. Trilhos paralelos (não misturar neste PRD)

| Trilho | Dono | Estado |
|---|---|---|
| Schema-alvo CRM gestão | Claude | Sem GO de DDL para este agente |
| Kanban arrasta → `derived_stage` + tag | Front + schema | Decidido 19/09; não construir aqui |
| Ingestão 9747 / Prospectagram | Outra sessão | Fora |
| Campanha remarketing t1–t3 | TBD | Fora |
| Copy final do consentimento | Marcelo | Rascunho no código ok |

---

## 10. Check binário deste arquivo (documentação)

Pronto o **PRD** (não o sistema) = este arquivo existe, §0 afirma consentimento como lei, §5 tem A→E nesta ordem, §7 lista as viradas.

Pronto o **sistema** = §8 toda marcada + check E executado.  
Sem check E: “implementei o puxador, não verifiquei a Andressa”.
