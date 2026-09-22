# PRD-14 — Tentativa com fim

**Programa:** Camila Harness Engineering  
**Produto cadeado:** `806b5975-e268-402e-a65c-9e9503271041`  
**Contrato que vence:** este arquivo, em cima do `PRD-13` e do `MODEL-PORTA-JUIZ.md`. Onde os dois discordarem sobre o fim do bilhete, vale o 14.  
**Pré-requisito:** PRD-13 cortes A–D no ar (puxador único, webhook só grava, cérebro exige bilhete).  
**Estado 21/09 17:23 BRT:** diagnóstico provado no disco (`CHECK_PASS`, 11/11). Correção **não** escrita. Andressa **não** autorizada.  
**Ainda não autoriza:** WhatsApp, invoke do cérebro em produção, soltar o bilhete da Andressa, deploy, DDL, commit.

**Em uma frase:** o puxador continua sendo a única boca que chama a Camila, e toda tentativa termina no mesmo minuto, com a resposta guardada.

---

## 0. Glossário (ler antes do resto)

| Palavra | O que é |
|---|---|
| Boca | Quem manda WhatsApp. Boca 1 = as 4 do primeiro contato. Boca 2 = só a Camila, chamada só pelo puxador. |
| Dívida | Ela falou, e ainda não existe WhatsApp da Camila depois dessa fala. |
| Bilhete | A tentativa da vez para uma fala. Não é uma segunda boca. |
| Veredito | A opinião da Camila sobre **aquela** fala: ruído, não, saída, ou “mandei a mensagem”. |
| Não avaliei | A tentativa falhou (ficha ilegível, erro, mensagem barrada, bilhete inválido). Não é opinião sobre a lead. |

---

## 1. Problema

Na segunda 21/09, 08:00 BRT, a Andressa estava em dívida desde “Como funciona?” (19/09 20:53 BRT). O tick vê essa dívida todo minuto. Chamou a Camila **uma** vez e esqueceu a resposta. O resto da manhã não chamou.

Fatos medidos:

| Fato | Prova |
|---|---|
| 08:00:05 BRT o puxador chamou uma vez | JSON do tick `20260921T110011Z`: `puller_invokes=1`. Pedido de 324 bytes = o bilhete dela. |
| A Camila (v176) respondeu HTTP 200 em 1,3s, corpo de 64 bytes | Log de borda, `execution_id` `0cf6cd9c-7e84-4f60-9c39-06a203e78ade`. O corpo **não** foi guardado. |
| 64 bytes, neste código, só coincide com `ficha_missing` / `canonical_state_not_ready` | `JSON.stringify` dos retornos do cérebro. Inferência. Não é texto capturado. |
| A ficha dela, lida 21/09 à tarde pelo mesmo leitor, sai pronta (291 caracteres) | `parseLeadState` + `buildLeadContextFromState` no RPC vivo. O “não” das 08:00 não foi “a linha não existe”. A linha existe desde 20/09. |
| O bilhete ficou `in_flight` e os minutos seguintes chamaram 0 vezes | Metadata da conversa `a485fafd-…`; ticks 08:01+ com `puller_invokes=0`. |
| Não houve WhatsApp nem linha nova no livro de envios | `platform_crm_messages` e `platform_crm_agent_action_ledger`. |

Fatos do código, check `deno run --no-check /tmp/harness-report-check.ts` em 21/09 17:23 BRT, `CHECK_PASS`, exit 0:

1. Sem bilhete, a dívida cria job `job_ready`.
2. Com bilhete já existente, `createJob=false` mesmo com a dívida aberta.
3. O puxador recebe “não avaliei” e grava `in_flight`.
4. O minuto seguinte não puxa de novo.
5. A escolha só pega bilhete `ready`.
6. O cérebro recusa bilhete que no banco ainda está `held` (`harness_job_required`). O puxador grava `in_flight` mesmo assim, porque salva **depois** da chamada.
7. O `fetch` do tick descarta o corpo (`.catch(() => undefined)`).
8. Uma segunda fala dela deixa a flag “já respondi” ligada (`brain_already_replied`).
9. `harness_verdict` é lido 1 vez e escrito 0.
10. O relógio de 10 minutos (`stale_redelivery`) não isenta chamada do puxador.
11. O housekeep não solta bilhete `in_flight` nem dívida aberta.

O nome “ficha não pronta” é o rótulo do leitor quando o estado não veio usável. Não é, por si, a prova de que a ficha está vazia.

---

## 2. O que este PRD não é

- Não é uma boca nova. A dívida não chama a Camila. Ela só diz se o **mesmo** puxador pode pegar o **mesmo** bilhete de novo. Uma vez por minuto.
- Não é soltar a Andressa no meio do caminho para “ver se fala”.
- Não é tratar “não avaliei” como veredito. Isso viraria o cadeado com outro nome.
- Não reabre o atalho morto em 21/09 03:15: tick chamar a Camila na hora de **criar** o bilhete (`onHarnessJob`).

---

## 3. Entregáveis

Pronto só quando os dois ensaios da §8 passarem no disco **e** o Marcelo der GO de deploy. Sem afrouxar o ensaio para ele passar.

| # | Entregável | Sem isto o PRD não acabou |
|---|---|---|
| 1 | A tentativa termina no mesmo tick: `done` ou `failed`. `in_flight` não sobrevive ao retorno do tick | O minuto seguinte continua mudo |
| 2 | O puxador lê o JSON da Camila. Erro de rede também é `failed`, com motivo | O corpo segue no lixo |
| 3 | Duas gavetas: `not_judged` e `judged` | “Ficha ilegível” vira opinião sobre a lead |
| 4 | `not_judged` não escreve veredito, não fecha a dívida, não fica `in_flight` | Um não errado tranca o dia |
| 5 | `judged` escreve `harness_verdict` naquela inbound. Dívida dela fecha | Ruído e “não” não existem para o tick |
| 6 | Dívida ainda aberta + janela aberta + sem humano → o mesmo bilhete volta a `ready`. O puxador pega um por tick | Segunda boca, ou silêncio eterno |
| 7 | Gravar `in_flight` **antes** da chamada, para o cérebro ver `ready`/`in_flight` e não `held` | A chamada nasce já recusada e o bilhete trava |
| 8 | `in_flight` mais velho que este tick (processo morreu) entra como `failed` | Morte no meio vira cadeado |
| 9 | Segunda fala zera “já respondi” para a inbound nova | A pergunta seguinte não acorda |
| 10 | Chamada do puxador não cai em `stale_redelivery` | Mensagem segurada até 08:00 é jogada fora por idade |
| 11 | Zero WhatsApp neste PRD até um GO separado, depois do §8 verde | Ensaio vira conversa real |

Fora deste PRD: descobrir qual envelope a v176 viu às 08:00; Kanban; DDL; campanha de remarketing; soltar a Andressa.

---

## 4. Métricas

Medidas no ensaio da §8, sem WhatsApp. “Pronto” é todas verdes no mesmo run.

| Métrica | Verde | Vermelho |
|---|---|---|
| Fim da tentativa | 100% das chamadas do ensaio terminam `done` ou `failed` antes do tick voltar | Algum bilhete segue `in_flight` |
| Gaveta errada | `not_judged` → 0 veredito escrito, dívida segue aberta | “Ficha ilegível” fecha a dívida ou grava ruído |
| Mesma boca | No minuto seguinte, dívida aberta → 1 chamada, **mesmo** id de bilhete. Zero chamada fora do puxador | 0 chamadas, ou 2, ou chamada no create |
| Dívida paga | Comprovante de WhatsApp da Camila depois da fala → 0 chamadas no minuto seguinte | Chama de novo quem já foi respondida |
| Fala nova | Inbound nova depois de um comprovante → a flag “já respondi” é falsa para essa inbound | `brain_already_replied` com a fala nova ainda pendente |
| Idade | Chamada com `harness_job_id` e inbound antiga → não retorna `stale_redelivery` | O relógio de 10 minutos cala o puxador |
| Bilhete visível | Cérebro lê status `in_flight` (já gravado), não `held` | Resposta `harness_job_required` com o puxador gravando `in_flight` depois |
| Produção durante o build | 0 mensagem nova para a Andressa, 0 invoke manual do cérebro | Qualquer disparo “para provar” |

Métrica que **não** entra no verde deste PRD: a Andressa receber texto. Isso é GO posterior, com o §8 já verde.

---

## 5. Invariantes (herdadas do 13, não afrouxar)

1. Um relógio: o tick do VPS, 1 por minuto.
2. Duas bocas. Boca 1 não volta neste lead. Boca 2 só via puxador.
3. O harness pergunta “falou e já houve WhatsApp da Camila?”. A Camila pergunta “o que é essa fala?”.
4. Dívida de “ela falou” só fecha com comprovante da Camila **ou** com veredito `judged` naquela inbound.
5. `not_judged` não fecha dívida.
6. Humano no meio (`human_active` / `waiting_human`) → não chama.
7. Janela fechada → `held`. Não chama.
8. Kill continua não sendo desculpa para calar inbound. Este PRD não mexe nessa lei.
9. Sem DDL. Bilhete e veredito seguem no metadata.

---

## 6. Contrato da tentativa

Estados do bilhete: `held` → `ready` → `in_flight` → `done` | `failed`.  
`failed` + dívida aberta + janela aberta → `ready` de novo, no tick seguinte. Mesmo id `job:{conversa}:{inbound}`.

| Gaveta | Exemplos | Veredito na inbound | Bilhete no fim do tick | Dívida |
|---|---|---|---|---|
| `not_judged` | ficha ilegível, erro de rede, erro do modelo, `stale_redelivery`, `harness_job_required`, HTTP não-2xx | não escreve | `failed` + motivo | aberta |
| `judged` + falou | WhatsApp da Camila com comprovante | `attend` (ou o veredito que ela devolver) | `done` | fecha |
| `judged` + cala | ruído, não, saída já enviada | `noise` / `exit` / `consent_no` | `done` | fecha **nessa** fala |
| Ainda não chamou, janela fechada | — | não escreve | `held` | aberta |

Fala nova dela é outra inbound, outro bilhete, dívida nova. O veredito antigo não cola na fala nova.

Ordem obrigatória dentro do tick:

1. Recalcular a dívida pelas mensagens.
2. Se a dívida daquele bilhete já fechou → `done`, sem chamar.
3. Se a janela fechou → `held`, sem chamar.
4. Gravar `in_flight`.
5. Chamar a Camila. Ler o JSON.
6. Gravar `done` ou `failed` antes de o tick terminar.

---

## 7. Fora de escopo

- Investigar o envelope exato que a v176 leu às 08:00 (trilho à parte; não bloqueia o contrato).
- Chamar a Camila para a Andressa, em produção ou “só desta vez”.
- Nova boca, novo cron, Path A, `onHarnessJob`.
- DDL, funil, tag, Kanban.
- Mudar o texto da Camila, a oferta ou o prompt. Isso já foi o deploy v177 e não é este PRD.

---

## 8. Check binário

Pronto = os dois ensaios abaixo verdes no mesmo comando, sem rede de WhatsApp e sem invoke de produção.

**Ensaio A — não avaliei.**  
Entrada: dívida aberta, janela aberta, Camila devolve `not_judged` (motivo ficha).  
Saída: bilhete `failed` com esse motivo, veredito ausente, e o tick seguinte emite **1** chamada com o **mesmo** id.

**Ensaio B — já respondeu.**  
Entrada: existe comprovante de WhatsApp da Camila depois da fala.  
Saída: bilhete `done`, tick seguinte emite **0** chamadas.

Os dois falham hoje. O check de 21/09 17:23 provou a falha. Implementar é fazer os dois passarem sem apagar os testes que mostram a falha antiga.

Comando alvo, quando houver código (ainda não existe):

```text
deno test --no-check supabase/functions/_shared/camila-harness/prd14-tentativa-com-fim.test.ts
```

Verde = exit 0 e os nomes `ensaio A` e `ensaio B` passando. Qualquer outro verde não substitui este.

---

## 9. Ordem e aprovação

Um corte só. Sem deploy no meio.

1. Testes do §8 vermelhos de propósito, no arquivo novo.  
2. Código mínimo até os dois ficarem verdes.  
3. Parar. Mostrar a saída do comando.  
4. GO de deploy só com pedido explícito do Marcelo, e mesmo assim **sem** soltar a Andressa.  
5. GO da Andressa é outro pedido, depois do deploy. Não está incluído aqui.

Proibido no meio do caminho:

- Chamar a Camila na conversa dela para “destravar”.
- Reset manual do bilhete em produção como se fosse o conserto.
- Ligar `onHarnessJob`.
- Tratar `not_judged` como ruído.
- Commit, push ou deploy sem pedido.

---

## 10. Viradas (não ressuscitar)

| Morto | Vivo neste PRD |
|---|---|
| Tick chama a Camila ao criar o bilhete | Só o puxador chama |
| `in_flight` eterno = “ainda estou nisso” | `in_flight` só durante a chamada; fim = `done` ou `failed` |
| “Ficha não pronta” fecha o caso | `not_judged`: dívida continua |
| Dívida manda **e** o tick chama direto | Dívida manda **quem o puxador pode pegar** |
| Segunda fala herda “já respondi” | Flag vale só para a inbound pendente |
| 10 minutos descartam o que o harness segurou até a janela | Puxador isento de `stale_redelivery` |

---

## 11. Checklist

- [x] Diagnóstico dos 11 furos, `CHECK_PASS` em 21/09 17:23 BRT  
- [x] Ensaio A vermelho, depois verde (21/09, `prd14-tentativa-com-fim.test.ts`)  
- [x] Ensaio B vermelho, depois verde (mesmo comando)  
- [ ] GO de deploy (Marcelo)  
- [ ] GO da Andressa (pedido separado; fora deste PRD)
