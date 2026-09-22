## PARECER

O núcleo do contrato v1 está coerente com o board v2: `db → preselected → first contact com 4 bolhas → triagem → pool/service/do_not_contact`. Soft e hard usam o mesmo `soft_exit`, mas terminam em destinos diferentes; o pool laranja permanece inativo; e inbound pode levar ao atendimento.

A campanha de remarketing está suficientemente isolada e marcada como TBD, sem contaminar o fluxo v1.

A documentação, porém, ainda possui ambiguidades pequenas, mas materialmente testáveis. Por isso, a Fase 0 está semanticamente correta, porém não deveria ser encerrada sem um ajuste documental curto.

## APONTAMENTOS

1. **Há conflito entre “sempre completa 4” e os gates durante o pacote.**  
   A invariante determina completar as quatro bolhas inclusive após hard mid-stream ([STATE-MACHINE.md](</Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/STATE-MACHINE.md:43>)), enquanto a precedência coloca `hard_stop`, Voice OFF e kill antes do envio ([STATE-MACHINE.md](</Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/STATE-MACHINE.md:62>)). Falta declarar explicitamente:

   - kill ON ou Voice OFF interrompem imediatamente inclusive pacote em curso;
   - “sempre completa 4” vale enquanto os gates globais continuarem permissivos;
   - hard recebido mid-4 fica como decisão pendente e o estado `hard_stop` é aplicado após a quarta bolha, conforme decisão do founder.

2. **Soft genérico conflita com `closed_lost` em atendimento.**  
   O evento Soft aparece com origem irrestrita e destino laranja, mas “sem interesse em `service`” vai para vermelho ([STATE-MACHINE.md](</Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/STATE-MACHINE.md:36>)). Deve-se restringir soft → laranja à fase anterior a `service`; dentro de atendimento, “sem interesse” → `closed_lost`.

3. **Voice, kill e cohort estão conceitualmente claros, mas falta fechar o momento de avaliação.**  
   Está claro que Voice define se há envio real, kill bloqueia envio e cohort define quem pode receber outbound ([POLICY.md](</Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/POLICY.md:3>)). Para um contrato testável, convém dizer que Voice/kill são reavaliados antes de cada envio e que cohort restringe somente outbound, não respostas inbound.

4. **`pilot_cohort` e `preselected` estão excessivamente equiparados.**  
   O primeiro é elegibilidade; o segundo é estado do funil. Após o disparo, a lead deixa de estar em `preselected`, mas não necessariamente deixa de pertencer ao cohort. Recomenda-se documentá-los como dimensões distintas.

5. **Ruído precisa de uma transição de retorno explícita.**  
   Está definido “espera 24h; sem humano → laranja”, mas falta registrar que uma resposta humana dentro da janela cancela a espera e volta à triagem.

6. **A referência canônica do board está quebrada no workdir.**  
   O README aponta para `evidence/PRD-09/harness-review/board-v2-camila-harness-engineering.jpg` ([README.md](</Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/README.md:4>)), mas esse arquivo não está presente. A imagem anexada permitiu esta validação, porém o artefato canônico deve ser incluído ou a referência corrigida.

7. **Remarketing está corretamente isolado.**  
   Touches, GO, timers, snapshot e `cadence_exhausted` aparecem apenas como TBD/fora de escopo. Isso não bloqueia o restante do contrato.

## CONCLUSÃO

O contrato representa corretamente as decisões fechadas e o board v2. Não há conflito substantivo entre soft/hard mid-stream e “completar 4” como decisão funcional; há, contudo, conflito textual com a precedência dos gates e ambiguidade entre soft pré-atendimento e `closed_lost`.

Status: **APROVADO COM RESSALVAS**

Próximo passo recomendado: fazer uma revisão exclusivamente documental para resolver os itens 1, 2 e 6 e, idealmente, explicitar os itens 3–5; depois repetir o check binário da Fase 0. Nenhuma implementação ou definição da campanha de remarketing é necessária nesta rodada.