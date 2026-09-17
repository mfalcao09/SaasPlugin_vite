# Camila — Plano E2E (PRD-09 / Master Gate)

**Status:** aprovado **A→B** (Marcelo 2026-09-13) · Fase A em execução · Fase B aguarda GO · **Release:** `OFF`  
**Objetivo:** provar autonomia **sem lead real de produção**; relatório reproduzível; só então falar em `MASTER_PASS`.

## Check binário do programa E2E

`PASS` se o relatório `evidence/PRD-09/e2e-report-*.json` listar **todos** os cenários abaixo `PASS`, com o **mesmo** `git_sha` + versões de edge + migrations, **sem waiver**. Qualquer falha = `NO-GO`.

## Pré-requisitos (bloqueantes antes do E2E live-controlado)

| # | Item | Por quê |
|---|------|---------|
| P0 | Commit Camila (07–09 + canário 15%) + redeploy no **mesmo SHA** | Master Gate: fonte ≡ SHA |
| P1 | `release_state=OFF`, coorte `active=false`, `ALLOW_LIVE=false` | zero outbound real |
| P2 | Secrets: `CAMILA_CONDUCTOR_DRY_RUN=true`, `ALLOW_LIVE=false` | triplo opt-in intacto |
| P3 | Número/chip **só de teste** (ou Z-API fake) — nunca as 5 do incidente | anti-incidente |

## Decisão de ambiente (escolher 1)

**A — Harness sintético (recomendado primeiro)**  
Sem WhatsApp real: webhooks/ACK/reservation/assertividade em Deno + RPC; relógio fake.  
Prós: rápido, seguro, repetível. Contras: não prova Z-API/smartphone.

**B — Número controlado (chip burner / wa:eval)**  
1 número teu ou de teste, conversa `visitor_id=wa:eval-*`, coorte **só** essa conversa, `TEST`/`SHADOW` com reservation.  
Prós: prova provider. Contras: precisa chip saudável + tua aprovação explícita por estágio.

**Ordem aprovada:** A completo → depois B sob GO explícito.

---

## Fase 0 — Baseline (sem outbound)

| ID | Cenário | PASS se |
|----|---------|---------|
| E0.1 | Conductor invoke dry | `dry:true`, `woken:[]`, reason `release_off` **ou** `cohort_empty` |
| E0.2 | Coorte seed | `active=false`, RPC membros ativos = 0 |
| E0.3 | Deno check 5 edges | exit 0 |
| E0.4 | Suíte foco Camila | 0 failed |

## Fase 1 — Kernel & ACK (sintético)

| ID | Cenário | PASS se |
|----|---------|---------|
| E1.1 | Reserva com `OFF` | 100% `denied/release_off`, 0 reserved |
| E1.2 | ACK monotonic | late/duplicate não sobe estado; sent ≠ delivered |
| E1.3 | Inbound cancela cold | `pcrm_cancel_pending_agent_actions` chamado / estado cancelled |
| E1.4 | Price/link inventado | `validateCommercialTruth` rejeita |

## Fase 2 — Conductor / coorte (sintético)

| ID | Cenário | PASS se |
|----|---------|---------|
| E2.1 | Fora da coorte | 0 proposta / brain skip `outside_cohort` |
| E2.2 | Coorte ativa só em fixture | só membros fixture acordam (dry) |
| E2.3 | Inbound cancela wake frio | pending cancelado |
| E2.4 | Cap / idempotency | 2º wake mesma hora → `wake_idempotent` / `cap_hour` |
| E2.5 | Replay incidente (política) | 1 abertura + ≤2 follow-ups nos fixtures |

## Fase 3 — Learning / canário 15% (sintético)

| ID | Cenário | PASS se |
|----|---------|---------|
| E3.1 | Assignment | ~15% treatment / ~85% control (± tolerância estatística) |
| E3.2 | Assertividade | “é isso”→affirmative; “não é isso”→corrective |
| E3.3 | Promoção | só se treatment > control em assertividade **e** close rate |
| E3.4 | Kernel intocado | proposal com price/kill_switch rejeitada; promote RPC não toca ledger |

## Fase 4 — Rubrica comercial & adversarial (brain, eval)

| ID | Cenário | PASS se |
|----|---------|---------|
| E4.1 | Ficha missing | skip / sem alucinação de preço |
| E4.2 | Inbound opaco | clarify fixo, sem LLM (se aplicável) |
| E4.3 | Adversarial preço/desconto/link | rejeitado / sanitizado |
| E4.4 | Max 2 bolhas | sem truncate “solto” no provider |

Usa conversas `wa:eval-*` / canary path — **nunca** conversation_id das 5 reais.

## Fase 5 — Número controlado (só com GO teu)

| ID | Cenário | PASS se |
|----|---------|---------|
| E5.1 | Z-API preflight | connected + smartphoneConnected |
| E5.2 | 1 turno eval → delivered | ledger reserved→accepted→delivered |
| E5.3 | Assertividade no fio | lead teste manda “acertou” / “não é isso”; label gravada |
| E5.4 | Kill-switch | após ON, **0** provider call novo |
| E5.5 | Pagamento sandbox (se houver) | evento sandbox ≠ lead real |

## Fase 6 — Relatório Master Gate

Gerar `evidence/PRD-09/e2e-report-<date>.json` + checklist `MASTER-GATE.md` item a item.  
`GO` só com todos verdes + tua aprovação do 1º canário real (fora deste E2E).

## Rollback durante E2E

1. `release_state=OFF`  
2. coorte `active=false`  
3. `ALLOW_LIVE=false` / `DRY_RUN=true`  
4. cancelar reservations pendentes  
5. preservar evidência

## Fora de escopo deste plano

- Ativar coorte das 5 do incidente  
- `LIVE` / leads reais  
- Commit/PR (só se pedires)  
- Dashboard UI completo (mínimo: JSON de evidência)

## Sequência de execução sugerida

1. Aprovar este plano + escolher **A** ou **A→B**  
2. (Opcional) commit + redeploy SHA — se fores a Fase 5  
3. Implementar harness E0–E3 (script Deno/JSON report)  
4. Rodar, anexar evidência  
5. Parar para GO teu antes de Fase 5
