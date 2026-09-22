# Plano de implementação — Caminho A (reabertura inteligente pós-opt-out)

**Status:** policy fechada (Opção B) — fases em `PHASES-PATH-A-OPTION-B.md`; **não implementar** sem GO por fase.  
**Origem:** pedido 2026-09-15; GPT-5.6-Sol (Cursor Task) e Codex CLI (`gpt-5.6-sol`) **indisponíveis** por usage limit até ~2026-09-16 **02:28** (fuso ambíguo → wakes UTC+BRT). Plano redigido pelo agente da sessão com base no código já auditado.  
**Repo:** `apps/NexvyBeauty`

### Decisões Marcelo (2026-09-15 ~23:00 BRT)
| # | Tema | Decisão |
|---|------|---------|
| 1 | Ambiguous | **1 clarificação** (cap 1/24h; sem cold) |
| 2 | Janela farewell pós-R2 | **48h** (fechado 2026-09-16; Sol + Marcelo) |
| 3 | Soft opt-out no reopen | **liberar opt-out de cold** (não só reply) |
| 4 | R2 automático | **pós-canário de reopen** (não na Fase 4; Sol + Marcelo) |
| 5 | Segunda opinião Sol/Codex | **recebida** — `sol-plan-reopen-path-A.md`; adoção **Opção B** |
| — | Modo de adoção | **Opção B** — fases em `PHASES-PATH-A-OPTION-B.md`; soltar amplo só após F0–F6 verdes + GO F7 |

**Implicação da #3:** o plano v1 recomendava “só reply / cold morto”. Marcelo inverte: reopen_intent **pode** limpar/relaxar `lead_optout` soft e sair de `cold_suppressed` (ainda com caps do kernel; sem blast imediato). Revisar fases 2–3 após Sol.

---

## 1. Invariantes e checks binários

### Invariantes
1. Após opt-out soft: cold **para** (fila `opted_out` / sem opening/FU).
2. R2 de encerramento (texto + site) é **uma** ação de fechamento, não pitch.
3. Ack de despedida **não** move gate para `bot_active` e **não** chama brain.
4. Interesse real **pode** reabrir atendimento (`reply` apenas).
5. Reabrir **nunca** reativa cold blast / apresentar / FU automático.
6. Caps do kernel (max 2 bolhas/ação, 1 opening, etc.) continuam válidos.

### Checks binários (cenários)

| # | Cenário | Esperado |
|---|---------|----------|
| B1 | Opt-out → R2 | 1 texto + 1 link; fila opted_out; status `closed`; `remarketing=true`; `cold_suppressed=true` |
| B2 | Pós-R2: "Pode deixar" / "Obrigada" | status permanece `closed`; 0 outbound; 0 brain |
| B3 | Pós-R2: "Quero ver / mudei de ideia / como funciona?" | `bot_active`; 1 turno `reply` permitido; opening/FU **denied** |
| B4 | Ambiguous ("oi", "tudo bem?") | `closed` mantido; ≤1 clarificação/dia **ou** silêncio+humano; sem cold |
| B5 | Novo opt-out após reopen | fecha de novo; cold continua off |
| B6 | Ligar TEST com Joice só em farewell | 0 envios |
| B7 | Ligar TEST com reopen_intent | ≤2 bolhas reply; 0 opening |

---

## 2. Design do classificador (puro / testável)

**Novo módulo sugerido:**  
`supabase/functions/_shared/cold-outreach/reopen-intent.ts`  
(+ `reopen-intent.test.ts`)

### Inputs
```ts
{
  text: string;
  context: {
    conversationStatus: 'closed' | 'bot_active' | ...;
    remarketing: boolean;
    coldSuppressed: boolean;
    doNotContactCold: boolean; // cold forever; NÃO = “Camila muda”
    lastOutboundWasR2Close: boolean; // janela curta pós-R2
    hoursSinceClose: number;
  }
}
```

### Outputs
```ts
type ReopenClass =
  | 'farewell_ack'      // não reabre
  | 'reopen_intent'     // reabre reply-only
  | 'ambiguous'         // política B4
  | 'opt_out_again'     // re-silencia
  | 'not_applicable';    // conversa não está em pós-opt-out closed
```

### Heurísticas v1 (determinísticas; LLM só se Marcelo pedir depois)
- **opt_out_again:** padrões atuais de `opt-out.ts`
- **farewell_ack:**  
  `pode deixar`, `obrigad[oa]`, `ok`, `combinado`, `beleza`, `valeu`, `👍`, `🙏`,  
  e msgs ≤ ~40 chars sem pergunta de produto
- **reopen_intent:**  
  `quero`, `tenho interesse`, `mudei de ideia`, `pode (me )?(explicar|mostrar|contar)`,  
  `como funciona`, `quanto custa`, `link`, `site`, perguntas `?` + tokens de produto/agenda/whatsapp
- **ambiguous:** resto (cumprimento seco, emoji só, etc.)

**Prioridade:** `opt_out_again` > `reopen_intent` > `farewell_ack` > `ambiguous`  
(se “quero sair” → opt_out, não reopen)

Substituir uso cego de `shouldReopenClosedWaQrConversation` (hoje: DNC/remarketing = nunca) por:

```ts
shouldReopenClosedWaQrConversation(conv, classification)
// reopen só se classification === 'reopen_intent'
```

---

## 3. Modelo de estados

### Campos (metadata conversa) — proposta

| Campo | Papel |
|-------|--------|
| `remarketing` | elegível a recontato futuro (WHEN TBD) |
| `cold_suppressed` | **proíbe** opening/FU/apresentar |
| `close_kind` | `opt_out_r2` \| `human` \| … |
| `close_at` | ISO |
| `reopen_class_last` | auditoria |
| `reopen_allowed_reply` | true só após reopen_intent |
| `ambiguous_nudge_at` | cap 1/dia |

**Deprecar semântica:** `do_not_contact=true` como “Camila muda pra sempre”.  
Manter `do_not_contact` **só** para: hard LGPD (PARE/SAIR), already_contacted de incidente, ou flag explícita `dnc_hard=true`.

### Status conversa
- Opt-out R2 → `closed`
- farewell/ambiguous → permanece `closed`
- reopen_intent → `bot_active` + `reopen_allowed_reply=true`
- Opt-out de novo → `closed` + limpa `reopen_allowed_reply`

### Tabelas
- `platform_crm_lead_optout`: mantém soft opt-out para **cold**; no reopen_intent **não** apagar automaticamente (cold continua morto). Opcional: `reason` distingue `soft_remarketing` vs `hard_lgpd`.
- `platform_crm_cold_outreach_queue`: permanece `opted_out`

### Kernel (`pcrm_authorize_and_reserve_agent_action`)
Ajustar (fase 2):
- `opening` / `opening_part` / `followup`: deny se `cold_suppressed` OU optout soft/hard
- `reply`:  
  - deny se `dnc_hard`  
  - allow se `bot_active` + (`reopen_allowed_reply` OU não está em pós-opt-out)  
  - **não** deny só por `remarketing=true`

Hoje o patch `do_not_contact` é largo demais para o caminho A — precisa ser afinado.

---

## 4. Ordem de decisão (runtime)

```
inbound webhook
  → persist message (sempre)
  → ensureConversation
       se closed:
         classificar texto (reopen-intent)
         se reopen_intent → bot_active + reopen_allowed_reply
         senão → manter closed (NÃO reabrir)
  → notifyColdOutreach on-inbound (opt-out / auto-reply / want)
  → se farewell_ack | ambiguous | opt_out | cold suppress brain flags → NÃO dispatch brain
  → se reopen_intent | conversa normal bot_active → dispatchSalesBrain
  → brain → reserveAgentAction(reply)
       kernel: cold off; reply só se permitido
```

**R2 no opt-out (ainda faltando no runtime):**  
no `on-inbound` quando `intent=opt_out`, **antes** de silence: enfileirar/enviar 2 bolhas R2 (texto + URL allowlist), depois `closed` + flags. Idempotência por conversation_id.

---

## 5. Caps anti-spam (incidente 5)

1. Max **2** bolhas / ação (já no kernel).  
2. Pós-reopen: **1** turno reply automático; segundo turno exige novo reopen_intent ou humano.  
3. Ambiguous: **1** clarificação / 24h / conversa.  
4. Janela farewell pós-R2 (ex. 24–48h): bias forte a `farewell_ack` para msgs curtas.  
5. Cold: **zero** opening enquanto `cold_suppressed`.  
6. Kill/OFF: inalterados como trava operacional.

---

## 6. Fases de implementação

### Fase 0 — Contrato (docs, sem runtime)
- Atualizar `RULE-OPT-OUT-REMARKETING.md` + LEARNING-CASE: farewell vs reopen.  
- Remover linguagem “DNC eterno = muda”.

### Fase 1 — Classificador puro + testes
- Criar `reopen-intent.ts` + suite (Joice: Pode deixar/Obrigada → farewell; “quero ver” → reopen).  
- Refatorar `wa-qr-conversation-reopen.ts` para usar classificação.

### Fase 2 — Webhook
- `ensureConversation`: reopen só com `reopen_intent`.  
- Suppress brain em farewell/ambiguous.  
- Deploy `platform-whatsapp-qr-webhook`.

### Fase 3 — Kernel SQL
- Afinar `do_not_contact` → `dnc_hard` / `cold_suppressed`.  
- `reply` + `reopen_allowed_reply`.  
- Testes SQL ou harness e2e sintético.

### Fase 4 — R2 automático no opt-out
- Executar texto+site no motor; allowlist URL; evidência.

### Fase 5 — Eval / canário
- Golden: Joice farewell; Joice reopen; ambiguous.  
- Canário 1 lead real só com GO.

**Arquivos principais:**  
`reopen-intent.ts*`, `wa-qr-conversation-reopen.ts`, `platform-whatsapp-qr-webhook/index.ts`, `platform-cold-outreach/index.ts`, `inbound-plan.ts`, migration authorize, docs RULE/LEARNING.

---

## 7. Riscos e rollback

| Risco | Mitigação |
|-------|-----------|
| Falso reopen (“obrigada, quero paz”) | prioridade farewell; janela pós-R2; testes |
| Falso farewell (“obrigada, quero ver”) | se tiver `quero|interesse|?` → reopen |
| Ambiguous vira spam de clarificação | cap 1/dia |
| Kernel ainda bloqueia reply por DNC largo | fase 3 obrigatória antes de ligar TEST em leads remarketing |
| R2 não enviado (só doc) | fase 4 explícita |

**Rollback:** feature flag `REOPEN_INTENT_V1=false` → comportamento emergencial (não reabrir remarketing) + OFF/kill.

---

## 8. Anti-padrões
- LLM decide sozinho se “manda 4 bolhas” sem kernel.  
- Reabrir = liberar cold de novo.  
- `do_not_contact` eterno para soft “não tenho interesse”.  
- Qualquer inbound → `bot_active`.  
- Silenciar para sempre quem só disse “talvez outra oportunidade”.

---

## 9. Decisões em aberto para Marcelo

1. **Ambiguous:** silêncio total, 1 clarificação automática, ou fila humana?  
2. **Janela farewell pós-R2:** 24h, 48h ou 7 dias com bias farewell?  
3. Soft opt-out remove linha de `lead_optout` no reopen, ou só libera `reply`? (recomendado: **só reply**)  
4. R2 automático no runtime na Fase 4, ou continua humano até canário?  
5. Quer **segunda opinião** do GPT-5.6-Sol/Codex quando o limite resetar (~02:28), antes de codar?

---

## Nota de franquia
- Cursor Task `gpt-5.6-sol-max-fast`: usage limit Ultra.  
- Codex CLI `gpt-5.6-sol` (ChatGPT auth): mesmo limite até **2026-09-16 02:28**.  
Este arquivo é o plano de trabalho para análise conjunta; pode ser contrastado com Sol/Codex após o reset.
