# Caminho A — plano de harness para reabertura inteligente pós-opt-out

**Escopo:** plano de implementação e validação; nenhum código de produto deve ser implementado a partir deste documento sem um GO separado.  
**Base lida:** `sol-request-path-A.md`, `codex-plan-reopen-path-A.md`, `_shared/wa-qr-conversation-reopen.ts`, `_shared/cold-outreach/opt-out.ts`, `platform-whatsapp-qr-webhook`, `platform-cold-outreach` e `20260916_authorize_do_not_contact.sql`.  
**Não inclui:** commit, deploy, ativação de campanha ou envio real.

## Recomendações executivas — Q2 e Q4

| Questão | Recomendação fechada | Por quê | Critério para rever |
|---|---|---|---|
| **Q2 — janela farewell pós-R2** | **48 horas** | 24h é curta para a resposta assíncrona normal de WhatsApp; 7d dá peso excessivo ao contexto antigo. Em 48h, mensagens curtas/polidas recebem bias de `farewell_ack`, mas qualquer sinal explícito de retomada vence o bias. | Rever apenas com matriz rotulada do canário: falso-reopen > 2% favorece ampliar; falso-farewell > 2% favorece reduzir ou melhorar as regras, não ampliar automaticamente. |
| **Q4 — R2 automático** | **Pós-canário de reopen; não na Fase 4** | O classificador/reopen muda autorização e estado; R2 muda outbound. Acoplar os dois impede atribuir incidentes e amplia o raio de falha. Primeiro provar reabertura sem R2 automático; depois colocar R2 em shadow e canário próprios. | Promover R2 somente quando B1–B7 passarem, o canário de reopen tiver zero outbound indevido e a separação `soft_opt_out`/`dnc_hard` estiver aplicada. |

### Decisões já fechadas e incorporadas

1. `ambiguous` gera **uma clarificação determinística**, no máximo uma por 24h; sem `reopen_intent`, a conversa continua `closed`.
2. `reopen_intent` **revoga/relaxa a supressão cold soft** e pode tornar a lead elegível para cold novamente. Isso **não** enfileira, agenda ou envia opening/follow-up no evento de reabertura.
3. Este documento é somente plano.

---

## 1. Parecer sobre o plano local

O plano local acerta a direção — classificação explícita, separação de estados, caps e rollback —, mas não é seguro o bastante para implementação sem estas correções:

1. **Contradição com a decisão #3.** O topo reconhece que reopen libera cold, porém o modelo de estado e B3/B5 ainda dizem que o opt-out permanece e cold continua morto. Este plano torna a revogação soft explícita, auditável e sem reenqueue automático.
2. **O classificador chega tarde na ordem proposta.** Hoje `ensureConversation` reabre antes de o inbound ser persistido e antes de `notifyColdOutreachInbound`. Colocar lógica nova dentro desse mutador perpetua o risco “muda status, depois descobre que não devia”. É preciso primeiro resolver a conversa sem mutá-la, classificar e só então aplicar uma transição idempotente.
3. **Booleano `reopen_allowed_reply` fica stale.** Um `true` sem vínculo ao inbound pode autorizar respostas futuras por acidente. A autorização deve ser ligada ao `inbound_message_id`/epoch, ter consumo único e expiração.
4. **`remarketing`, opt-out e DNC estão semanticamente misturados.** No código atual, `do_not_contact=true`, `remarketing=true` e qualquer linha em `platform_crm_lead_optout` bloqueiam tudo. `remarketing` deve ser segmentação; `cold_suppressed` deve governar cold; `dnc_hard` deve governar a proibição dura.
5. **O detector atual não distingue soft de hard.** `não tenho interesse` e `PARE/SAIR` caem no mesmo `opt_out`. R2 com site não deve ser disparado para um hard opt-out. A separação precisa existir antes de automatizar R2.
6. **A clarificação não cabe no kernel atual.** `reply` exige `bot_active`; a decisão fechada exige uma clarificação mantendo `closed`. Reabrir só para enviar a pergunta quebraria o próprio contrato. É necessária uma ação restrita própria (`reopen_clarification`) ou autorização equivalente.
7. **Falta atomicidade entre superfícies.** Metadata da conversa, linha de opt-out e fila são atualizadas em chamadas separadas/best-effort. Uma falha parcial pode deixar `bot_active` com supressão ativa, ou o inverso. A transição deve ser transacional ou reconciliável por um único evento durável.
8. **O fail-open atual é inadequado para conversa protegida.** Se `on-inbound` falha, o webhook hoje pode despachar o brain. Para uma conversa `closed` por opt-out, erro de classificação/estado deve ser fail-closed: persistir inbound, não enviar e alertar.
9. **A prioridade textual está incompleta.** “reopen antes de farewell” é correto para “obrigada, quero ver”, mas negação/conflito deve vencer: “não quero ver”, “quero sair” e “obrigada, pare” são opt-out, não reopen.
10. **Faltam prova de causalidade e idempotência.** Caps genéricos não impedem dois deliveries do mesmo webhook de consumir duas autorizações. Cada decisão e ação deve carregar `inbound_message_id`, `classification_version` e idempotency key estável.

---

## 2. Contrato de segurança e invariantes

Estas propriedades devem valer em unit, integração, replay e canário:

1. Todo inbound autenticado e não duplicado é persistido antes de qualquer outbound; falha posterior não apaga a mensagem.
2. Conversa `closed` protegida nunca muda para `bot_active` por mero recebimento.
3. Somente `reopen_intent` explícito pode reabrir uma conversa fechada por opt-out soft.
4. `farewell_ack` não muda estado, não chama brain e produz zero outbound.
5. `ambiguous` mantém `closed` e pode produzir exatamente uma bolha de clarificação determinística por janela móvel de 24h; repetição gera silêncio.
6. `opt_out_again` mantém/volta a `closed`, cancela pendências, não chama brain e não envia R2 se for hard opt-out.
7. `dnc_hard=true` nunca é removido por classificador. Sua reversão exige fluxo administrativo/consentimento explícito fora deste caminho.
8. Em `reopen_intent` soft, a supressão ativa é revogada de forma auditável; nenhum registro histórico é apagado.
9. Reabrir não altera fila para `queued`, não cria `scheduled_for`, não dispara tick e não chama sender de opening/follow-up.
10. No mesmo inbound de reopen, somente ação `reply` pode ser autorizada; `opening`, `opening_part`, `followup` e `resume` são negadas.
11. Toda autorização de reply/clarificação é vinculada a um inbound, consumível uma vez e expira.
12. Kernel é autoridade final: brain, prompt ou webhook não podem ultrapassar caps, release state, kill switch ou DNC.
13. Reentrega concorrente do mesmo webhook não duplica classificação, transição, clarificação, reply ou R2.
14. Falha de classificador, transição, kernel ou dependência numa conversa protegida resulta em zero outbound e alerta observável.
15. `remarketing=true` sozinho nunca autoriza nem proíbe envio; é apenas atributo de segmentação.

---

## 3. Classificador pós-opt-out

### 3.1 Aplicabilidade e input

O classificador roda apenas se a conversa canônica está `closed` e o fechamento ativo é `soft_opt_out`/R2. Outras conversas fechadas seguem a política existente; `dnc_hard` é bloqueio anterior ao classificador.

Input mínimo e imutável:

```text
text_normalized
content_kind / transcription_confidence
conversation_id + version
inbound_message_id / provider_message_id
close_kind + closed_at
last_r2_action_id + last_r2_delivered_at
cold_suppressed + dnc_hard
last_clarification_at
```

`last_r2_delivered_at` deve vir de ledger/mensagem marcada como R2 entregue, não de inferência pelo último texto. A janela de 48h começa no delivery confirmado; se não houver confirmação, usar `closed_at` como fallback explicitamente marcado em telemetria.

### 3.2 Output

```text
class: farewell_ack | reopen_intent | ambiguous | opt_out_again
reason_code: enum estável
matched_rules: lista
classifier_version: string
farewell_window_active: boolean
confidence_band: deterministic_high | deterministic_low
```

Não usar LLM na v1. O output é decisão de harness reproduzível, não texto livre.

### 3.3 Precedência

1. **Hard/novo opt-out:** comandos inequívocos (`pare`, `sair`, `stop`, remover/descadastrar, não mandar/chamar) e construções negativas. Resultado `opt_out_again`.
2. **Reopen explícito positivo:** intenção de retomar com objeto/ação (`mudei de ideia`, `tenho interesse`, `quero ver`, `como funciona`, `quanto custa`, `pode me explicar/mostrar`, pedido de agenda/demo/link). Resultado `reopen_intent`.
3. **Farewell contextual:** dentro de 48h após R2 entregue, ack curto/polido sem negação, pergunta comercial ou objeto de retomada (`obrigada`, `pode deixar`, `combinado`, `valeu`, emoji de ack). Resultado `farewell_ack`.
4. **Resto:** `ambiguous`.

Regras de conflito:

- Negação/opt-out vence tudo: “quero sair”, “obrigada, mas pare”.
- Reopen explícito vence o token de cortesia: “obrigada, quero ver”.
- `sim`, `oi`, `tudo bem?`, emoji isolado fora da allowlist e mídia sem transcrição confiável são `ambiguous`, não reopen.
- Pontuação `?` sozinha não prova interesse; precisa de termo/objeto comercial.
- Fora da janela de 48h, um ack curto perde o bias de farewell e vira `ambiguous`; nunca vira reopen só pelo tempo decorrido.

### 3.4 Corpus mínimo

Manter corpus versionado com pelo menos:

- exemplos reais de Joice (`Pode deixar`, `Obrigada`);
- positivos explícitos, inclusive cortesia + intenção;
- negativos e negações adversariais;
- mensagens vazias, emoji, áudio sem transcrição e texto longo;
- variações de acento, caixa, pontuação e erro comum;
- casos fora/dentro da janela;
- pares metamórficos: acrescentar “quero ver” a um farewell deve mudar para reopen; acrescentar “pare” deve mudar para opt-out.

Gate offline recomendado: **100% de recall em hard opt-out e farewell do corpus crítico**, zero falso reopen no corpus crítico e relatório separado de `ambiguous`; acurácia agregada não substitui esses gates.

---

## 4. Modelo de estado

### 4.1 Separar os conceitos

| Estado/campo lógico | Semântica | Quem pode mudar |
|---|---|---|
| `dnc_hard` | Proibição dura de contato automático | Detector hard cria; classificador de reopen nunca limpa |
| `cold_suppressed` | Bloqueio operacional de ação proativa cold | Soft opt-out ativa; reopen explícito soft pode desativar |
| `soft_opt_out_active` | Estado atual da preferência soft | Soft opt-out ativa; reopen explícito revoga com trilha |
| `remarketing_eligible` | Segmentação futura, sem autoridade de envio | Política de negócio; não participa sozinho do allow/deny |
| `close_kind` | Motivo do fechamento (`soft_opt_out_r2`, `hard_opt_out`, `human`, etc.) | Transição de fechamento |
| `reopen_epoch` | Identificador monotônico da retomada | Transição atômica de reopen |
| `reply_grant` | Grant de uso único vinculado ao inbound/epoch | Transição cria; kernel consome/expira |
| `cold_reenabled_at` | Auditoria da revogação soft | Transição de reopen |
| `cold_not_before` | Hold anti-blast após reopen | Transição de reopen; default recomendado +24h |
| `last_clarification_at` | Cap de clarificação | Kernel grava atomicamente ao reservar ação |

Os nomes físicos podem ser colunas ou uma tabela de policy state; não esconder todos em JSON mutável. Se metadata continuar temporariamente, as escritas devem fazer merge atômico no banco, nunca read/merge/write concorrente no webhook.

### 4.2 Registro de opt-out

Não deletar a linha de `platform_crm_lead_optout` para “liberar” a lead. Preservar evidência e distinguir estado atual de histórico, por exemplo com `scope`, `kind`, `active`, `revoked_at`, `revoked_by_event_id` e `reason`.

- Soft opt-out: registro ativo bloqueia cold; reopen explícito o marca revogado/inativo.
- Hard opt-out: permanece ativo; reopen classificado não o revoga.
- Leitura do kernel considera apenas supressões ativas e seu escopo.
- Migração de legado deve mapear com allowlist de razões conhecidas. Razão desconhecida fica hard/conservadora até revisão.

### 4.3 Transições

| Evento | Antes | Depois | Outbound permitido no evento |
|---|---|---|---|
| soft opt-out | ativo/qualquer | `closed`, soft ativo, cold suprimido, fila `opted_out` | R2 somente quando a fase própria estiver habilitada e somente para soft |
| `farewell_ack` | `closed` soft | sem mudança material; audita classe | nenhum |
| `ambiguous` (cap livre) | `closed` soft | continua `closed`; atualiza cap ao reservar | 1 clarificação |
| `ambiguous` (cap gasto) | `closed` soft | continua `closed` | nenhum |
| `reopen_intent` | `closed` soft | `bot_active`; soft revogado; cold não suprimido; novo epoch/grant; fila continua terminal, nunca `queued` | 1 ação reply, até 2 bolhas |
| `opt_out_again` hard | qualquer | `closed`; `dnc_hard=true`; cold suprimido; grants revogados | nenhum |
| novo soft opt-out após reopen | `bot_active` | `closed`; nova supressão soft ativa; fila terminal | R2 só se política de repetição permitir; recomendação v1: nenhum R2 repetido em 30d |

### 4.4 O significado exato de “liberar cold sem blast imediato”

Ao reabrir:

- revogar a supressão soft ativa e definir `cold_suppressed=false`;
- manter histórico de opt-out e de revogação;
- **não** mudar nenhuma fila para `queued`/`sending` e não preencher `next_followup_at`;
- impor `cold_not_before = reopened_at + 24h` como cap inicial;
- negar ações proativas enquanto a conversa estiver `bot_active` ou houver atendimento recente;
- depois do hold, a lead apenas volta a ser elegível para uma ação futura, separadamente criada e autorizada por campanha/kernel. O evento de reopen nunca é o gatilho dessa ação.

Isso cumpre a decisão #3 sem transformar consentimento de conversa em blast instantâneo.

---

## 5. Ordem runtime obrigatória

```text
webhook autenticado
  1. normalizar + deduplicar provider_message_id
  2. resolver conversa canônica SEM mutar status
  3. carregar policy state / fechamento / R2 / caps
  4. pré-gate dnc_hard
  5. classificar o inbound (se caso pós-opt-out)
  6. persistir inbound + decisão de classificação
  7. aplicar transição de estado idempotente/atômica
  8. cancelar reservas proativas pendentes
  9. consultar kernel conforme a decisão
       - farewell/opt_out/error: nenhuma ação
       - ambiguous: reserve reopen_clarification
       - reopen: emite grant de reply vinculado ao inbound
 10. executar ação determinística de clarificação OU despachar brain
 11. brain propõe reply
 12. kernel consome grant e reserva a ação final antes do sender
 13. sender persiste/entrega; ledger fecha resultado
```

Pontos importantes:

- “kernel antes do brain” é um **preflight de elegibilidade**, para não acordar o LLM quando a ação é impossível. O kernel ainda precisa autorizar/reservar novamente a ação concreta após o brain gerar conteúdo; preflight não é autorização de envio.
- `notifyColdOutreachInbound` não pode continuar sendo uma segunda classificação divergente. O webhook deve produzir uma decisão canônica e o motor cold deve aplicar os efeitos dessa decisão/evento, ou ambos devem chamar o mesmo functional core versionado.
- Para conversa protegida, falha do motor cold, da transição ou do classificador suprime brain. O fail-open atual pode continuar apenas em fluxos normais explicitamente fora do estado pós-opt-out.
- Clarificação é template fixo de uma bolha, não brain. Exemplo funcional: “Você quer retomar e saber mais sobre a Nexvy Beauty?”; respostas futuras voltam ao mesmo classificador.

### Contrato de idempotência

Usar chaves derivadas, sem timestamp aleatório:

- classificação/transição: `reopen-decision:{conversation_id}:{inbound_message_id}:{classifier_version}`;
- clarificação: `reopen-clarify:{conversation_id}:{inbound_message_id}`;
- reply: `reopen-reply:{conversation_id}:{reopen_epoch}:{inbound_message_id}`;
- R2: `r2-close:{conversation_id}:{soft_opt_out_event_id}:vN`.

Uma unique constraint/ledger deve fazer replays retornarem o resultado anterior, não refazer efeitos.

---

## 6. Kernel e caps anti-spam

### 6.1 Matriz de autorização

| Condição | clarification | reply | opening / part / follow-up / resume |
|---|---:|---:|---:|
| `dnc_hard=true` | deny | deny | deny |
| closed + farewell | deny | deny | deny |
| closed + ambiguous + cap livre | allow 1 bolha | deny | deny |
| closed + ambiguous + cap gasto | deny | deny | deny |
| reopen epoch/grant válido | deny | allow | deny no mesmo evento |
| cold soft ainda ativo | deny salvo ambiguous autorizada | deny salvo grant explícito | deny |
| `cold_not_before > now()` | n/a | allow por grant | deny |
| conversa `bot_active` com atendimento recente | n/a | allow por inbound/grant | deny proativo |

### 6.2 Caps concretos

1. Farewell: 0 bolhas, 0 brain.
2. Clarificação: 1 bolha por ação e no máximo 1 por conversa/lead em janela móvel de 24h.
3. Reopen: 1 ação de reply por inbound de reopen; máximo 2 bolhas nessa ação.
4. Grant de reply: uso único; TTL recomendado 30 minutos; consumo transacional.
5. Proativo causado pelo reopen: 0. Nenhum enqueue ou schedule na mesma cadeia causal.
6. Hold cold: 24h mínimo após reopen e nunca enquanto `bot_active`/atendimento recente.
7. R2: no máximo uma ação por evento de soft opt-out; máximo 2 bolhas (texto + link), idempotente. Sem R2 para hard opt-out.
8. Opt-out repetido: revoga imediatamente grants e reservas ainda não enviadas.
9. Caps existentes permanecem como teto adicional: bubble cap, opening cap, follow-up cap, janela operacional, release state e kill switch.
10. Escopo dos caps: por `product_id + lead_id`, atravessando variantes do telefone e conversas mergeadas; não apenas por conversation id.

---

## 7. Checks binários B1–B7 ajustados à decisão #3

Todos os checks devem verificar estado, ledger, fila, chamadas ao brain e sends. “Passou” exige todas as colunas do esperado; ausência de evidência é falha.

| Check | Setup/estímulo | Esperado binário |
|---|---|---|
| **B1 — soft opt-out/R2** | Conversa ativa recebe “no momento não tenho interesse” | Classifica soft; fila `opted_out`, follow-up nulo, conversa `closed`, soft ativo, `cold_suppressed=true`, `dnc_hard=false`, brain=0. Com R2 flag OFF: send=0. Na fase própria com flag ON: exatamente 1 ação R2/até 2 bolhas, uma única vez. |
| **B2 — farewell** | Dentro de 48h pós-R2: “Pode deixar” e replay “Obrigada” | Cada mensagem é `farewell_ack`; conversa continua `closed`; soft/cold permanecem ativos; status/fila não reabrem; brain=0; kernel reservations=0; outbound=0, inclusive em replay concorrente. |
| **B3 — reopen libera soft sem blast** | Dentro/fora da janela: “Obrigada, mudei de ideia, quero ver como funciona” | `reopen_intent`; conversa `bot_active`; soft opt-out fica revogado com evento auditável; `cold_suppressed=false`; `cold_not_before=+24h`; fila **não** vira `queued`; nenhum opening/FU/resume; exatamente 1 grant e no máximo 1 reply de até 2 bolhas. |
| **B4 — ambiguous** | “oi” duas vezes no mesmo período de 24h | Conversa permanece `closed`; primeira mensagem reserva exatamente 1 `reopen_clarification` de 1 bolha; segunda gera 0 outbound; brain=0 nas duas; soft/cold não mudam. |
| **B5 — novo opt-out após reopen** | Após B3, lead diz “pare de me mandar mensagem” | `opt_out_again`; `closed`; `dnc_hard=true`; cold suprimido; grant/reservas cancelados; fila terminal; brain=0; outbound=0; nenhum R2/site. Um soft “não tenho interesse” em fixture separada reativa soft suppression sem apagar histórico anterior. |
| **B6 — flag/rollback com Joice** | Flag OFF, SHADOW e ON usando transcript real | OFF reproduz contenção conservadora: nenhum reopen/send. SHADOW grava a decisão esperada sem mutação/send. ON classifica os acks como farewell e ainda produz 0 sends. Kill switch durante a corrida impede qualquer reserva posterior. |
| **B7 — cold elegível, não imediato** | Após B3, executar tick/replay imediato e depois simular campanha separada após hold | Antes do hold e no mesmo fluxo: 0 opening/FU e fila não reativada. Após hold, somente uma ação **separadamente enfileirada** pode chegar ao kernel; continua sujeita a status, horário, caps, owner, release e kill. Reopen por si só nunca cria essa linha. |

Testes negativos obrigatórios em B3/B5: hard DNC prévio nunca é limpo; “quero sair” é opt-out; “obrigada, quero paz” não é reopen; “obrigada, quero ver” é reopen.

---

## 8. Harness de validação

### 8.1 Camadas

1. **Unit puro:** normalização, aplicabilidade, precedência, janela de 48h, transição e decisão de action.
2. **Contract:** formato do evento canônico entre webhook, motor cold, kernel, brain e sender; rejeitar versão desconhecida.
3. **DB/kernel:** matriz allow/deny, consumo único, TTL, advisory lock, unique/idempotency e concorrência.
4. **Integração local:** webhook sintético completo com spies para brain/sender e banco isolado.
5. **Replay:** transcript Joice e corpus dourado, sem rede/provider.
6. **Shadow:** classifica tráfego real, compara “decisão nova vs contenção atual”, sem mutação de estado ou outbound.
7. **Canário:** allowlist de lead/conversa e teto absoluto; nenhuma campanha ampla.

### 8.2 Falhas/injeções a ensaiar

- webhook duplicado e dois workers concorrentes;
- timeout entre persistência e transição;
- transição aplicada e resposta HTTP perdida;
- falha do motor cold;
- kernel indisponível/deny;
- brain demorado ou duplicado;
- sender falha após reserva;
- metadata/version conflict;
- conversa mergeada e variantes de telefone;
- flag desligada entre preflight e send;
- novo hard opt-out enquanto reply está reservado.

Em todos os casos protegidos, o oráculo principal é “zero outbound não autorizado”; reconciliação posterior pode completar estado, jamais inventar envio.

### 8.3 Evidência mínima por execução

Artefato JSON versionado contendo:

- fixture e IDs sintéticos/redigidos;
- classifier/policy/kernel versions e flags;
- estado antes/depois;
- decisão + reason code;
- ledger reservations/denials;
- contagem de calls brain/sender;
- fila antes/depois;
- resultado B1–B7 e timestamp;
- logs de replay/concorrência.

Não usar apenas screenshot ou log textual como prova do estado final.

---

## 9. Fases e gates de promoção

### Fase 0 — contrato e baseline, sem runtime

- Fechar glossário soft/hard/remarketing/cold/grant.
- Congelar transcript Joice e corpus dourado.
- Capturar baseline do patch emergencial.
- Especificar eventos, reason codes, métricas e B1–B7.

**Gate:** contrato revisado; nenhum significado ambíguo de `do_not_contact` restante no plano.

### Fase 1 — classificador e máquina de estados puros

- Planejar módulo único compartilhado; não duplicar regex entre webhook e cold engine.
- Testar precedência, janela, negação, mídia e metamórficos.
- Modelar decisão sem I/O.

**Gate:** corpus crítico 100%; nenhum falso reopen/hard miss.

### Fase 2 — estado durável e kernel em modo deny-safe

- Migração aditiva para separar hard/soft e registrar grants/epochs.
- Backfill conservador com relatório, sem apagar linhas.
- Planejar ação `reopen_clarification` e regras de reply/cold.
- Testar locks, idempotência, expiração e rollback de reserva.

**Gate:** matriz do kernel e testes de concorrência passam; estado legado desconhecido continua bloqueado.

### Fase 3 — integração webhook em SHADOW

- Resolver conversa sem reabertura automática.
- Calcular e registrar decisão nova, mas manter contenção emergencial e zero novos sends.
- Comparar decisão canônica com o classificador cold atual.
- Alertar divergências e dependências fail-open.

**Gate:** período/amostra definidos pelo owner; zero classificação crítica divergente não explicada; B1–B7 passam em replay.

### Fase 4 — canário de reopen, R2 automático ainda OFF

- Habilitar por allowlist de produto + conversa/lead.
- Começar apenas com farewell/ambiguous; depois liberar reopen reply.
- Teto operacional: uma conversa por vez, observação após cada caso e kill switch pronto.
- Provar B2, B3, B4, B5, B6 e B7 sem R2 gerado pelo runtime.

**Gate:** zero outbound indevido, zero reenqueue automático, zero hard DNC limpo e evidência completa. Qualquer violação reverte imediatamente.

### Fase 5 — R2 em SHADOW, pós-canário

- Separar soft opt-out de hard antes de considerar envio.
- Gerar plano R2 e idempotency key sem chamar sender.
- Validar template/link allowlisted, repetição e casos PARE/SAIR.

**Gate:** B1 passa em shadow; hard opt-out produz zero plano R2; nenhuma duplicata em replay.

### Fase 6 — canário R2

- Allowlist mínima, ação própria no kernel, máximo 2 bolhas.
- Monitorar delivery e a janela de 48h.
- Expandir somente após evidência de R2 e reopen combinados.

**Gate:** zero R2 em hard opt-out, zero duplicata, B1–B7 completos end-to-end.

### Fase 7 — expansão controlada

- Aumentar percentuais em degraus, nunca saltar para 100%.
- Manter cohort de controle e relatório por classifier version.
- Congelar expansão diante de aumento de ambiguous, deny do kernel ou opt-out repetido.

---

## 10. Feature flags, observabilidade e rollback

### 10.1 Flags

Preferir configuração durável por produto/agente, lida pelo webhook e pelo kernel, com default OFF:

- `REOPEN_INTENT_V1_MODE = off | shadow | enforce`;
- `REOPEN_INTENT_V1_ALLOWLIST` para canário;
- `R2_AUTO_V1_MODE = off | shadow | enforce`, independente;
- kill switch existente continua soberano.

Não depender só de env no webhook: rollback precisa atingir também kernel/sender e ter leitura consistente. Registrar snapshot das flags em toda decisão/reserva.

### 10.2 Métricas/alertas

- classes por versão e faixa de janela;
- taxa de reopen, ambiguous e clarification;
- farewell com outbound (deve ser zero);
- reopen que criou queue/schedule (deve ser zero);
- hard DNC revogado pelo fluxo (deve ser zero);
- sends por inbound/epoch e duplicatas;
- deny reasons do kernel;
- falhas de transição, cold engine, brain e sender;
- opt-out novamente após reopen/R2;
- divergência shadow vs decisão aplicada.

Alertas imediatos para qualquer métrica “deve ser zero”.

### 10.3 Rollback operacional

1. Acionar kill switch para cessar novas reservas/sends.
2. Colocar `REOPEN_INTENT_V1_MODE=off` e `R2_AUTO_V1_MODE=off`.
3. Cancelar grants e reservas pendentes criados pela versão afetada.
4. Restaurar comportamento conservador: protected closed não reabre e não chama brain.
5. Não apagar auditoria nem sobrescrever em massa preferências. Para sessões soft já reabertas, bloquear proativo por policy global e revisar individualmente; rollback técnico não deve fabricar novo hard DNC.
6. Rodar reconciliador/read-only para listar estados parciais, filas reativadas e ações reservadas.
7. Só reativar após causa, fixture de regressão e B1–B7 completos.

O rollback deve funcionar sem rollback de schema: migrações são aditivas, readers antigos toleram campos novos e os defaults permanecem deny-safe.

---

## 11. Arquivos/superfícies previstos — somente para futura implementação

- classificador funcional compartilhado e testes ao lado de `_shared/cold-outreach`;
- `wa-qr-conversation-reopen.ts` deixa de decidir por metadata genérica e passa a aplicar decisão canônica;
- `platform-whatsapp-qr-webhook/index.ts`: lookup sem mutação, ordem runtime e fail-closed protegido;
- `cold-outreach/opt-out.ts` e `inbound-plan.ts`: separação soft/hard e consumo da decisão comum;
- `platform-cold-outreach/index.ts`: efeitos idempotentes, sem segunda verdade classificatória;
- migration de estado/grants e nova versão de `pcrm_authorize_and_reserve_agent_action`;
- docs de regra e caso Joice alinhados às novas semânticas;
- harness B1–B7 e artefatos de replay/shadow/canário.

Esta lista não autoriza mudanças; serve para impedir que uma implementação futura altere apenas o webhook e deixe kernel, fila ou opt-out com semântica antiga.

---

## 12. Critério final de GO

O Caminho A só está pronto para expansão quando:

- Q2=48h e Q4=pós-canário estiverem registradas como policy;
- todas as invariantes forem executáveis pelo harness;
- B1–B7 passarem com evidência de DB, ledger, brain e sender;
- soft/hard estiverem separados e legado desconhecido continuar conservador;
- reenfileiramento automático no reopen for estruturalmente impossível;
- flags e rollback tiverem sido ensaiados durante uma reserva concorrente;
- o canário de reopen terminar antes do primeiro envio automático de R2.

Até esse GO, permanece válida a contenção emergencial: conversa fechada protegida não reabre automaticamente e não dispara brain.
