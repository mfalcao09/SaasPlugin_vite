# Policy — Camila Harness Engineering (v1.2)

## 1. Timeline

| Fase | Voice | Kill | Envio |
|---|---|---|---|
| Agora | OFF | ON | Nada |
| Piloto | **TEST** | **ON** | Só **supervisionado** (lista manual). Automático bloqueado pelo Kill. Reativo on se lead falar. |
| Maduro | conforme GO | TBD fino | UI + regras maduras |

## 2. Kill — escopo (founder)

- **Mata:** disparos **automáticos** / Camila falando **sozinha**.  
- **Não mata:** disparo **autorizado manualmente** (supervisionado), incl. 1º disparo (4 mensagens).  
- Objetivo: não impedir construir/testar o harness; impedir Camila solta.  
- Evolução pós-100%: **TBD** (não discutir agora).

## 3. Soft exit

**Mensagem de Saída** = um único texto (educado + site/preview) para soft e hard. Destinos: STATE-MACHINE.
(Board v2 pode dizer “Mensagem de encerramento soft” — mesmo conceito.)

## 4. Triagem

Obrigatória antes de Camila assumir.  
Ordem: hard → goodbye(só pós-exit) → soft → ruído → interesse.

**Citação:** se a lead mandar várias bolhas seguidas, Camila cita a **pergunta feita a ela** (Andressa: “E vc?”), não cumprimento nem “Tudo bem” afirmativo.  
**Resposta-ouro (Marcelo, Andressa):** “Estou bem, também. Obrigada por perguntar 🥰”. O cérebro gera o texto; o quote nativo aponta a pergunta.  
**Sem stub:** proibido “Recebi sua mensagem / em breve te respondo”. Resposta real + cérebro ligado para a próxima.  
**Meio das 4:** texto claro (não ruído) **para o script** e Camila assume; ruído deixa o pacote seguir.

## 5. Retomada

Template: `RULES-AUTOMATED-COLD.md` (janela de atendimento ontem…).  
Antes das mensagens faltantes; ≤48h.  
Horário da retomada: **estendida** (não exige comercial de novo).

## 6. Janelas de atendimento (fonte de verdade)

Código: `_shared/camila-harness/attendance-window.ts`.  
**Só o Harness Engineering** decide horário. Fuso `America/Sao_Paulo`. Fim exclusivo (`hora < fim`).

### Nomes das janelas

| Nome | Dias | Horário BRT |
|---|---|---|
| **Comercial** | segunda a sexta | **09h–18h** |
| **Estendida** | segunda a sábado | **08h–22h** |

- **Domingo:** fechado (zero envio, zero resposta).  
- **Feriado nacional** (calendário BrasilAPI → `platform_crm_business_holidays`): igual domingo.  
- Runtime carrega datas via `holidays.ts` / `loadHarnessHolidayDates`.  
- Sem calendário carregado: feriado não bloqueia; domingo continua fechando.

### O que cada situação significa

| Situação | Significado em português |
|---|---|
| Abrir conversa nova | Camila manda a **1ª** das 4 mensagens de apresentação. |
| Terminar as outras 3 | Já mandou a 1ª; completa 2–4 do mesmo pacote (~3 min). |
| Retomar abertura incompleta | Continua o **mesmo** pacote (≤48h). |
| Lead respondeu | Pessoa escreveu; Camila pode responder. |
| Mensagem de Saída | Texto de encerramento educado. |
| Domingo / feriado | Dia inteiro fechado. |
| Fora de qualquer janela | Ex.: 07h ou 23h em dia útil. |

### Tabela OUT / IN

| Situação | Pode OUT? (enviar) | Pode IN? (responder se a lead escrever) | Janela |
|---|---|---|---|
| Abrir conversa nova (1ª das 4) | Sim, só na comercial | Não se aplica* | **Comercial** |
| Terminar as outras 3 da mesma abertura | Sim, na estendida (teto 22h) | Se escrever no meio: **completa as 4** e **depois** responde | **Estendida** |
| Retomar abertura incompleta | Sim, na estendida | Idem | **Estendida** |
| Lead respondeu (conversa ativa) | Sim | Sim | **Estendida** |
| Mensagem de Saída | Sim | Sim | **Estendida** |
| Domingo | Não | Não | Fechado |
| Feriado nacional | Não | Não | Fechado |
| Fora de qualquer janela | Não | Não | Nenhuma |

\*Se a pessoa escrever antes da 1ª mensagem, vale a linha “Lead respondeu” / fora de janela conforme o horário.

## 7. Cadência entre leads (piloto)

Código: `lead-spacing.ts` + `outbound-queue.ts`.

| Regra | Detalhe |
|---|---|
| Contagem | Após a **1ª** mensagem de um lead, sorteia espera para a **1ª** do próximo |
| Intervalo piloto | **42s–197s** (aleatório inclusivo) |
| Bolhas 2–4 | Mesmo pacote; **não** usam esse sorteio |
| Fila | Um envelope por vez; cada envelope tem `leadId` + texto; **nunca** antes de `not_before` |
| Prioridade | Continuar pacote → reply/exit desse lead → abrir próximo lead |
| Encavalamento | Conversas paralelas ok; saídas serializadas |

## 8. Piloto — deliver (BUILD)

Código: `pilot-roster.ts` + `pilot-deliver.ts`.  
Action preview: `platform-cold-outreach` → `harness-pilot-plan` (sempre `real_whatsapp_sends: 0`).

| Item | Estado |
|---|---|
| Lista 10 | `platform_crm_lead_state.derived_stage = preselected` (+ `facts.harness`) |
| Renata | Retomada aprovada + bolhas 2–4 (sem reenviar bolha 1) |
| Cadência | 42–197s entre 1ªs; fila um envelope por vez |
| WhatsApp real | **OFF** até `GO PILOT HARNESS v1` + flags |

## 9. Maturidade M0–M4

Ver PLAN-v1.2.md. M2 = piloto TEST + Kill ON + supervisionado + reativo.

## 10. TBD

Remarketing campaign; Kill semântica madura (`stop_new` / `abort_inflight`); cadência live multi-número; transport real pós-GO.
