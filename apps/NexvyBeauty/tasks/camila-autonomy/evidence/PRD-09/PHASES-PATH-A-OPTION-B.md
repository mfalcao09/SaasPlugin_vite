# Caminho A — Fases de correção (Opção B)

**Decisão Marcelo (2026-09-16):** Opção B — adotar o plano Sol por completo; **só soltar em produção ampla depois que todas as fases e checks estiverem verdes.**  
**Policy fechada:** Q2 = **48h** farewell · Q4 = R2 automático **somente pós-canário de reopen**.  
**Fonte:** `sol-plan-reopen-path-A.md` (Codex `gpt-5.6-sol`) + decisões 1/3/5 anteriores.  
**Escopo deste doc:** elaboração operacional das fases — **não autoriza** commit/deploy/envio sem GO explícito por fase.

### Regra da Opção B (ler primeiro)

| Pode acontecer durante as fases | Não pode acontecer até GO final |
|---|---|
| Código, testes, migração aditiva, shadow | Campanha ampla / % de leads reais |
| Canário em **allowlist mínima** (1 conversa) | R2 automático em produção geral |
| Kill switch / flags OFF a qualquer momento | “Ligar e ver no volume” |

**Contenção emergencial permanece válida** até o fim da Fase 4 (no mínimo): conversa `closed` protegida não reabre sozinha e não dispara brain, salvo allowlist explícita em enforce.

**Flags (defaults OFF):**
- `REOPEN_INTENT_V1_MODE = off | shadow | enforce`
- `REOPEN_INTENT_V1_ALLOWLIST`
- `R2_AUTO_V1_MODE = off | shadow | enforce` (independente; só sobe depois do canário reopen)

**Check binário do programa (Opção B):**  
`pronto para soltar` = Fases 0–6 verdes + B1–B7 com evidência + rollback ensaiado + GO Marcelo na Fase 7.  
Qualquer fase vermelha → **não avança**; rollback da fase; contenção emergencial.

---

## Mapa rápido

```text
F0 Contrato        → sem runtime
F1 Classificador   → só testes
F2 Kernel/estado   → DB deny-safe, sem send novo
F3 Webhook SHADOW  → decide, não muta/send
F4 Canário reopen  → allowlist; R2 OFF
F5 R2 SHADOW       → planeja R2, não envia
F6 Canário R2      → allowlist R2
F7 Expansão        → só com GO Marcelo (Opção B)
```

---

## Fase 0 — Contrato e baseline (sem runtime)

**Em leigo:** combinamos o dicionário. Soft ≠ hard. Remarketing não manda mensagem sozinho. Congelamos o caso Joice como prova.

### Correções / entregáveis
1. Glossário fechado: `dnc_hard`, `cold_suppressed`, `soft_opt_out_active`, `remarketing_eligible`, `reopen_epoch`, `reply_grant`, `cold_not_before`, `close_kind`.
2. Policy registrada: Q2=48h; Q4=R2 pós-canário; ambiguous=1 clarificação/24h; reopen libera soft cold **sem** blast.
3. Corpus dourado versionado (Joice + adversarial + metamórficos).
4. Baseline do patch emergencial documentada (comportamento atual em produção).
5. Spec de reason codes, eventos canônicos, métricas “deve ser zero”, B1–B7.
6. Atualizar `RULE-OPT-OUT-REMARKETING.md` + LEARNING-CASE Joice (semântica farewell vs reopen).

### Check binário (F0)
- [ ] Nenhum uso ambíguo de `do_not_contact` restante no plano/docs desta correção.
- [ ] Q2/Q4/opção B citados como policy (não “em aberto”).
- [ ] Corpus Joice congelado com IDs/fixtures redigidos.
- [ ] Lista B1–B7 alinhada à decisão #3 (soft revogado no reopen; fila não `queued`).

### Rollback
Só docs — reverter arquivos de evidência. Sem efeito em produção.

### Próximo
Só entra F1 com F0 verde.

---

## Fase 1 — Classificador puro + máquina de decisão (sem I/O)

**Em leigo:** um “juiz de texto” testável: adeus / quero ver / não entendi / pare. Sem WhatsApp de verdade ainda.

### Correções / entregáveis
1. Módulo único compartilhado (ex.: `_shared/cold-outreach/reopen-intent.ts` + testes) — **uma** verdade; webhook e cold **não** duplicam regex.
2. Precedência Sol: hard/opt-out → reopen → farewell (48h) → ambiguous.
3. Output: `class`, `reason_code`, `classifier_version`, `farewell_window_active`.
4. Sem LLM na v1.
5. Suite: Joice farewell; “obrigada, quero ver”; “obrigada, pare”; “oi”×2; mídia sem transcrição; dentro/fora 48h.

### Check binário (F1)
- [ ] `deno test` do módulo 100% verde.
- [ ] Corpus crítico: 100% recall hard opt-out + farewell Joice; **0** falso reopen no crítico.
- [ ] Gate metamórfico: acrescentar “quero ver” a farewell → reopen; acrescentar “pare” → opt_out.

### Rollback
Remover/ignorar módulo; produção inalterada (ainda não ligado).

### Próximo
F2 só com F1 verde.

---

## Fase 2 — Estado durável + kernel deny-safe

**Em leigo:** o banco e o “porteiro” (kernel) passam a entender soft/hard e o passe de uma conversa. Ainda sem liberar envio novo na prática.

### Correções / entregáveis
1. Migração **aditiva**: soft vs hard; grants/epochs; `cold_not_before`; não apagar histórico de `lead_optout` (usar `active`/`revoked_at`).
2. Backfill conservador: razão desconhecida → tratar como hard/bloqueado + relatório.
3. Nova ação kernel `reopen_clarification` (1 bolha, conversa pode ficar `closed`).
4. Reply de reopen: grant uso único, TTL ~30 min, ligado a `inbound_message_id`.
5. Matriz allow/deny Sol (§6): farewell=0; ambiguous=clarification; reopen=reply only; opening/FU/resume negados no evento; cold hold 24h.
6. Testes: idempotência, concorrência, TTL, consumo único, advisory lock.

### Check binário (F2)
- [ ] Migração aplica em ambiente de teste sem dropar dados.
- [ ] Matriz kernel coberta por testes (inclui “legado desconhecido = deny”).
- [ ] Simulação: reopen **não** move fila para `queued`.
- [ ] Hard DNC **não** é limpo por fluxo de reopen.
- [ ] Flags ainda `off` em produção.

### Rollback
Flags OFF; readers antigos toleram colunas novas; defaults deny-safe. Sem rollback de schema destrutivo.

### Próximo
F3 só com F2 verde.

---

## Fase 3 — Webhook em SHADOW (decide, não solta)

**Em leigo:** o sistema “pensa em voz alta” no log, mas continua agindo como hoje (tampa de emergência). Zero mensagem nova por causa do caminho A.

### Correções / entregáveis
1. Ordem runtime Sol: resolver conversa **sem** mutar → classificar → persistir decisão → (ainda sem transição enforce).
2. Fail-closed em conversa protegida se classificador/transição falhar.
3. Cold engine consome a **mesma** decisão canônica (sem segunda classificação divergente).
4. Comparar shadow vs contenção atual; alertar divergência crítica.
5. `REOPEN_INTENT_V1_MODE=shadow` só em allowlist interna / ambiente controlado.

### Check binário (F3)
- [ ] Replay B1–B7 (sem provider) verde.
- [ ] Período/amostra shadow definido (owner): **0** divergência crítica inexplicada em farewell/hard.
- [ ] Contagem de sends atribuíveis ao caminho A = **0**.
- [ ] Evidência JSON por execução (estado, decisão, ledger spies).

### Rollback
`MODE=off` → comportamento emergencial imediato.

### Próximo
F4 só com F3 verde + GO Marcelo para canário allowlist.

---

## Fase 4 — Canário de reopen (R2 automático OFF)

**Em leigo:** testamos em **uma** conversa real permitida: “obrigada” fica quieto; “quero ver” responde 1 vez; cold não explode.

### Correções / entregáveis
1. `MODE=enforce` **somente** `REOPEN_INTENT_V1_ALLOWLIST` (produto + lead/conversa).
2. Sequência canário: farewell → ambiguous → reopen reply → opt-out de novo.
3. Provar B2, B3, B4, B5, B6, B7 **sem** R2 gerado pelo runtime (`R2_AUTO_V1_MODE=off`).
4. Teto: **1 conversa por vez**; observação humana; kill switch armado.
5. Evidência: DB + ledger + brain calls + sends.

### Check binário (F4)
- [ ] Farewell: 0 outbound.
- [ ] Reopen: ≤2 bolhas reply; soft revogado; `cold_not_before=+24h`; fila **não** `queued`; 0 opening/FU.
- [ ] Ambiguous: ≤1 clarificação/24h.
- [ ] Hard após reopen: 0 R2; grants cancelados.
- [ ] Tick cold imediato pós-reopen: 0 opening.
- Qualquer violação → **rollback imediato** (flags OFF + kill).

### Rollback
Kill + `REOPEN_INTENT_V1_MODE=off` + cancelar grants da versão. Contenção emergencial.

### Próximo (Q4)
F5 só com F4 verde. **Proibido** ligar R2 automático antes.

---

## Fase 5 — R2 em SHADOW (pós-canário reopen)

**Em leigo:** quando alguém desiste de leve, o sistema **monta** o adeus+site no papel, mas ainda não envia.

### Correções / entregáveis
1. Separação soft/hard **obrigatória** antes de qualquer plano R2.
2. `R2_AUTO_V1_MODE=shadow`: gera plano + idempotency key; **sender não chamado**.
3. Template + URL allowlist; regra “sem R2 repetido em 30d” (v1).
4. Hard (`PARE/SAIR`): zero plano R2.

### Check binário (F5)
- [ ] Soft opt-out → exatamente 1 plano R2 (≤2 bolhas) em shadow; 0 send.
- [ ] Hard → 0 plano R2.
- [ ] Replay não duplica plano.
- [ ] B1 shadow verde.

### Rollback
`R2_AUTO_V1_MODE=off`. Reopen canário pode permanecer como estava (flags reopen independentes).

### Próximo
F6 só com F5 verde + GO Marcelo.

---

## Fase 6 — Canário R2

**Em leigo:** o adeus+site sai de verdade, mas só na allowlist mínima.

### Correções / entregáveis
1. `R2_AUTO_V1_MODE=enforce` na mesma allowlist (ou allowlist R2 dedicada, ainda mínima).
2. Ação própria no kernel; máx. 2 bolhas; idempotente.
3. Monitorar delivery e início da janela farewell 48h.
4. B1–B7 end-to-end com R2 real na allowlist.

### Check binário (F6)
- [ ] Soft: 1 R2 entregue; closed; soft+cold_suppressed; 0 brain no adeus.
- [ ] Hard: 0 R2.
- [ ] Pós-R2 farewell na allowlist: 0 outbound (B2).
- [ ] Zero duplicata em reentrega de webhook.
- [ ] Evidência completa (ledger + provider id).

### Rollback
`R2_AUTO_V1_MODE=off` (+ kill se necessário). Reopen pode voltar a shadow/off.

### Próximo
F7 **somente** com F0–F6 verdes + checklist GO final + **GO explícito Marcelo**.

---

## Fase 7 — Expansão controlada (único “soltar” da Opção B)

**Em leigo:** só agora aumentamos o público, aos poucos — nunca 0→100%.

### Correções / entregáveis
1. Ramp: allowlist → % baixo → cohort controle → subir em degraus.
2. Congelar expansão se subir: ambiguous, deny kernel, opt-out repetido, qualquer métrica “deve ser zero”.
3. Relatório por `classifier_version`.
4. Ensaio de rollback sob reserva concorrente **antes** do primeiro degrau amplo.

### Check binário (F7 / GO final)
- [ ] Q2=48h e Q4=pós-canário registrados como policy (este doc + RULE).
- [ ] Invariantes Sol executáveis no harness.
- [ ] B1–B7 verdes com evidência DB/ledger/brain/sender.
- [ ] Soft/hard separados; legado desconhecido conservador.
- [ ] Reenqueue no reopen **estruturalmente impossível** (teste B3/B7).
- [ ] Flags/rollback ensaiados.
- [ ] Canário reopen (F4) concluído **antes** do primeiro R2 auto (F6) — já historicamente verdadeiro.
- [ ] **GO Marcelo** por escrito para o degrau N.

### Rollback
Kill → ambos MODE=off → cancelar grants → contenção emergencial → reconciliar read-only → não fabricar hard DNC em massa.

---

## Dependências entre fases (não pular)

| Desta | Para | Bloqueio se |
|-------|------|-------------|
| F0 | F1 | Glossário/policy incompletos |
| F1 | F2 | Corpus crítico falhou |
| F2 | F3 | Kernel/matriz vermelha |
| F3 | F4 | Shadow com divergência crítica / sends > 0 |
| F4 | F5 | Qualquer outbound indevido no canário reopen |
| F5 | F6 | Plano R2 em hard ou duplicata |
| F6 | F7 | B1–B7 incompletos ou sem GO Marcelo |

---

## Superfícies a tocar (visão; implementação só após GO por fase)

| Superfície | Fases |
|------------|-------|
| `reopen-intent.ts` (+ tests) | F1 |
| migration + `pcrm_authorize…` | F2 |
| `wa-qr-conversation-reopen.ts` | F2–F4 |
| `platform-whatsapp-qr-webhook` | F3–F4 |
| `opt-out.ts` / `inbound-plan.ts` / cold-outreach | F2–F6 |
| docs RULE / LEARNING | F0 (+ sync F4/F6) |
| harness B1–B7 / shadow / canário | F1–F6 |

---

## Estado atual (baseline)

| Item | Estado |
|------|--------|
| Contenção emergencial (não reabrir DNC/remarketing) | Ativa em produção |
| Plano Sol | Entregue (`sol-plan-reopen-path-A.md`) |
| Opção B + Q2 + Q4 | **Confirmados neste doc** |
| Código Caminho A (classificador/kernel novo) | **Ainda não iniciado** |
| Próxima ação de execução | GO Marcelo para **começar Fase 0** (docs/contrato) ou já F0+F1 |

---

## Aprovação

- [x] Opção B
- [x] Q2 = 48h
- [x] Q4 = R2 pós-canário reopen
- [ ] GO para executar Fase 0 (elaboração já feita; execução = editar RULE/corpus/baseline)
- [ ] GO para Fase 1+ (código)

**Owner:** Marcelo · **Elaboração:** sessão `26ffcdd9` · **Data:** 2026-09-16
