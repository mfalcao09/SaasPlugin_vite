## PARECER

**M0 ainda não está plenamente pronto para aprovação e construção funcional.** A documentação está bem consolidada e mantém corretamente o runtime atual em **OFF + Kill**, mas restam duas inconsistências críticas no contrato do first contact.

A construção segura de infraestrutura, estado, logs e testes em **shadow mode** pode começar. A implementação que futuramente enviará WhatsApp não deve ser considerada contratualmente fechada até resolver os pontos abaixo.

## APONTAMENTOS

1. **`emergency_stop` não funciona como kill real durante as quatro bolhas**

O contrato determina simultaneamente que:

- o kill é uma emergência;
- ele é reavaliado antes de cada bolha;
- mesmo ativado, as bolhas restantes devem ser enviadas.

Assim, a checagem não controla o envio; serve apenas para observabilidade. Isso contradiz a expectativa operacional de um emergency stop.

É necessário formalizar uma destas alternativas:

- kill interrompe imediatamente o pacote; ou
- existem dois controles distintos:
  - `stop_new_conversations`;
  - `abort_inflight_first_contact`.

Se a decisão do founder permanecer “sempre completar quatro”, o controle não deve ser documentado simplesmente como **Kill absoluto**.

2. **Hard opt-out durante o pacote ainda permite mensagens adicionais**

Um “pare”, “não me mande mensagens” ou equivalente recebido depois da primeira bolha resulta no envio das bolhas restantes, seguido do texto Joice.

Isso cria risco de:

- desrespeitar uma retirada explícita de consentimento;
- gerar denúncia ou bloqueio no WhatsApp;
- tornar a promessa de hard opt-out incompatível com o comportamento real.

A regra tecnicamente mais segura é: **hard opt-out interrompe imediatamente mensagens promocionais**, registra as bolhas não enviadas como canceladas e, no máximo, envia uma única confirmação de opt-out. Caso o founder mantenha a regra atual, ela precisa ser aceita explicitamente como risco de negócio/compliance antes de M0.

3. **Momento da transição para `contacted` está inconsistente**

O glossário diz:

> `contacted`: após 1º disparo supervisionado.

O diagrama coloca `contacted` depois do pacote completo de quatro bolhas. É necessário determinar se “1º disparo” significa:

- o pacote lógico inteiro; ou
- a primeira bolha efetivamente enviada.

Sugestão: criar `first_contact_in_progress` e somente entrar em `contacted` após a quarta bolha ou encerramento excepcional formalizado.

4. **Falta definir a recuperação de pacote incompleto**

Apesar da idempotência estar declarada, não está definido o comportamento após crash, timeout ou reinício entre bolhas:

- retomar da próxima bolha;
- prazo máximo para retomada;
- quando considerar o pacote expirado;
- como registrar bolha reservada, enviada, confirmada ou falhada.

Isso precisa fazer parte do contrato executável para garantir “nunca 2×”.

5. **`goodbye` precisa ser condicionado ao estado**

A precedência `hard → goodbye → soft` pode ignorar uma mensagem ambígua como “obrigada, mas não quero”. O noop de goodbye deve valer **somente após um exit já concluído**. Fora desse estado, hard/soft precisam prevalecer.

6. **OFF + Kill atual está claro e consistente**

Neste ponto, os documentos estão alinhados:

- zero WhatsApp real agora;
- nenhuma conversa nova pode começar;
- inbound também não recebe resposta;
- piloto somente após harness, validação e GO explícito;
- pré-seleção não equivale a autorização de envio.

Também está corretamente separado que o pool laranja não dispara automaticamente.

## CONCLUSÃO

**Não aprovo M0 como contrato final neste estado.** Aprovo o início imediato apenas de:

- estrutura do harness;
- persistência e idempotência;
- máquina de estados;
- logs e auditoria;
- classificadores em shadow;
- testes e simulações;
- gates mantidos em **OFF + Kill**, sem WhatsApp real.

Para liberar M0 e iniciar a construção do comportamento de envio, precisam ser fechados:

1. semântica real do emergency stop;
2. tratamento imediato de hard opt-out durante as quatro bolhas;
3. momento exato de entrada em `contacted`;
4. recuperação idempotente de pacote interrompido;
5. escopo contextual de `goodbye`.

Portanto: **pode iniciar construção técnica em OFF + Kill/shadow, mas M0 ainda não está pronto para aprovação integral nem para qualquer envio real.**