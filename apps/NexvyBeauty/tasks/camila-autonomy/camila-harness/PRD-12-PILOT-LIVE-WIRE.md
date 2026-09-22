# PRD-12 — PILOT LIVE WIRE (fase única)

**Programa:** `camila-harness`  
**Contrato:** v1.2 + POLICY §6–8 (janelas, cadência, piloto)  
**Pré-requisito:** PRD-11 Loops 1–2 + L2b + `GO BUILD PILOT DELIVER` **PASS** (dry-run)  
**Modo:** **uma fase só** — cutover do harness antigo + fio que *pode* enviar WhatsApp real sob GO humano  
**Fora de escopo:** remarketing t1–t3; Kill maduro; UI rica; multi-número / 200 leads/dia; Voice/LIVE amplo; reativar Path A/R2/conductor  

---

## 1. Problema

O harness novo planeja o piloto (roster, Renata, spacing 42–197s, fila, janelas, feriados) com **0 WhatsApp real**.  
O `GO PILOT HARNESS v1` **ainda não tem o que ligar**, e o harness antigo ainda pode falar:

1. Transport real (Z-API) inexistente no módulo piloto  
2. `authorizeWireSend` ainda barra `allowReal && !dryRun` (`l2_real_whatsapp_forbidden`)  
3. Sem tick do **novo** harness + fila persistida  
4. Triagem no webhook **não** vira reply / Mensagem de Saída na fila  
5. **Harness antigo ainda plugado** (Path A reopen, R2 auto, Cold tick + `apresentar_sequence`, Conductor) — secrets off **não bastam**; precisa desconexão completa  

**Este PRD fecha só esse bloco**, em **uma** fase de construção, sem subdividir em loops.

---

## 2. Resultado (DoD da fase)

Com **`GO BUILD PRD-12`** (construção) e depois **`GO PILOT HARNESS v1`** (humano, ≥09h BRT):

| # | Entrega | Critério binário |
|---|---|---|
| 1 | Gate L2 relaxado **só** para piloto supervisionado | `allowReal+!dryRun` permitido **somente** se `goId` + lista + Voice≠OFF + flags piloto; automático continua bloqueado |
| 2 | Transport real (`WireTransport`) | `WireTransport` com `allowReal:true` chama envio QR/Z-API **uma bolha por vez**; dry default; nome definitivo do fio (não só piloto) |
| 3 | Tick piloto + **dono do cron = VPS** | Edge `harness-pilot-tick` existe; **crontab VPS** (`/opt/scripts/camila/…`) chama 1/min; **pg_cron legado unscheduled** |
| 4 | Fila persistida | Estado da fila + spacing — restart não perde `not_before` |
| 5 | Roster → lista manual | 10 phones do `PILOT_ROSTER`; Renata = resume + 2–4 |
| 6 | Reativo mínimo | Inbound na lista → envelope `reply` / `exit_message` na mesma fila; FC-1 completa 4 antes do reply |
| 7 | **Cutover legado HARD** | Path A reopen, R2 auto, Cold tick+apresentar, Conductor **incapazes de enviar** (código + flags + cron); evidence PASS |
| 8 | Evidence | `verify_harness_pilot_live.py` exit 0 + `L3-pilot-live-*.json` com `real_whatsapp_sends: 0` no BUILD |

**Não-DoD desta fase:** brain LLM completo; silêncio 24h→pool em produção; UI; campanha rmkt; delete físico do código Path A (pode ficar morto no repo).

---

## 3. Invariantes (nunca afrouxar)

1. **Zero WhatsApp** até `GO PILOT HARNESS v1` + `HARNESS_PILOT_LIVE=1` + `HARNESS_ALLOW_REAL_WHATSAPP=1`.  
2. Só phones da **lista manual** / `PILOT_ROSTER`.  
3. Kill **ON** → automático = 0; supervisionado com GO **não** é morto pelo Kill.  
4. Um envelope = um `leadId` + texto; **nunca** trocar destinatário.  
5. Spacing **42–197s** conta a partir da **1ª** mensagem (open ou resume) do lead.  
6. Fila: **nunca** enviar antes de `not_before`; prioridade continuar pacote → reply/exit → abrir próximo.  
7. Janelas: comercial / estendida / domingo / feriado (POLICY §6).  
8. Renata: texto de retomada **aprovado** (sem ontem/anteontem); **não** reenviar bolha 1.  
9. **Um único dono de disparo proativo:** novo harness via VPS. Path A / cold tick / apresentar / conductor = **0 sends** (não “evitar roster”; mortos).  
10. **Cron de tick mora na VPS** (padrão canary `/opt/scripts/camila/`). Sem novo `pg_cron` para o piloto; unschedules dos jobs antigos.

---

## 4. Fase única — escopo de construção

```text
GO BUILD PRD-12?
  → §5.0 cutover legado HARD (antes ou junto do tick novo)
  → §5.1–5.5 (gate + transport + tick + persistência + reativo)
  → §5.4b wiring VPS cron (script + crontab entry documentada; armed só pós GO)
  → verify_harness_pilot_live.py PASS (0 send real se flags off)
  → STOP: aguardar GO PILOT HARNESS v1 (≥09h BRT)
  → com GO: armar crontab VPS + flags → 1º pacote Renata + cadência
  → evidence L3 + Lei1
```

**Não há Loop 12.1 / 12.2.** Uma entrega, um verify, um GO humano de disparo.

---

## 5. Entregáveis técnicos

### 5.0 Cutover — desligamento completo do harness antigo

#### 5.0.1 Mapa de plugs (estado atual) e decisão

Verificado em código + VPS (`crontab -l`, `/opt/scripts/camila/`):

| Rota antiga | Onde está plugada | Compatível plugar o novo harness? | Decisão PRD-12 |
|---|---|---|---|
| **Path A reopen** | `platform-whatsapp-qr-webhook` → `decidePathAClosedInbound` / mutação `reopen_soft` | **Não.** SM diferente (closed→reopen Path A vs triagem harness + fila de envelopes). | **Inativar completa:** force `REOPEN_INTENT_V1_MODE=off` + early-return no bloco Path A (`mode==="off"` já no-op; reforçar com hard-disable flag `PATH_A_RUNTIME=off` **ou** guard `if (harnessPilotActive) skip`). Zero `apply_mutation`. |
| **R2 auto** | `platform-cold-outreach` `on-inbound` → `tryPathAR2OnInbound` / `planR2Close` | **Não.** Exit Path A ≠ envelope `exit_message` do harness (idempotency, janela, fila). | **Inativar completa:** `R2_AUTO_V1_MODE=off` + `tryPathAR2OnInbound` short-circuit (nunca send). Soft exit só via §5.5. |
| **Cold tick** | Edge `action=tick` + migration `pg_cron` `platform-cold-outreach-tick` + canaries VPS que POSTam `tick` | **Não.** Fila `platform_crm_cold_outreach_queue` + anti-ban campanha ≠ `outbound-queue` envelopes / spacing 42–197s. | **Inativar completa:** `COLD_OUTREACH_ENABLED=false`; `tick` early-return `{ok, skipped:"legacy_tick_retired"}`; **`cron.unschedule('platform-cold-outreach-tick')`**. Canaries `d2_canary_*.py` **não** usam `tick` legado no piloto. |
| **`apresentar_sequence`** | Dentro do `tick` → `processApresentarSteps` / `startApresentarSequence` | **Não.** Bolhas 2–4 no metadata cold ≠ followups do `pilot-deliver` / `enqueueFollowupBubbles`. | **Inativar completa:** `processApresentarSteps` no-op se `LEGACY_APRESENTAR=off` (default off nesta fase); não iniciar novas sequences. |
| **Conductor** | `platform-camila-conductor` + `pg_cron` `platform-camila-conductor` | **Não.** Wake autónomo do brain ≠ piloto supervisionado com lista+GO. | **Inativar completa:** `CAMILA_CONDUCTOR_ENABLED=false` (+ dry/allow_live fail-closed); **`cron.unschedule('platform-camila-conductor')`**. |
| **Cold `on-inbound` opt-out** | Webhook → `notifyColdOutreachInbound` | **Parcial.** Opt-out/DNC ainda necessário. | **Manter só opt-out/silence**; ramos R2/apresentar mortos. Não reabrir Path A. |
| **Harness triage (já plugado)** | Webhook → `harnessInboundMetaPatch` | **Sim.** | **Estender** (§5.5): metadata → enqueue reply/exit na fila piloto. |
| **Transport Z-API / QR-send** | Cold `send` path / `platform-whatsapp-qr-send` | **Sim (só transporte).** | **Reusar** client/send shape em `WireTransport` (`wire-transport.ts` + impl Z-API); **não** reusar loop `tick`/queue cold. |

#### 5.0.2 O que “desconexão completa” significa (binário)

Não é só “secrets off no checklist”. BUILD PASS exige **todas**:

1. **Flags deploy:**  
   `REOPEN_INTENT_V1_MODE=off`, `R2_AUTO_V1_MODE=off`, `COLD_OUTREACH_ENABLED=false`, `CAMILA_CONDUCTOR_ENABLED=false`, `CAMILA_CONDUCTOR_ALLOW_LIVE≠true`.  
2. **Código fail-closed:** tick legado / R2 send / Path A mutate / conductor wake **não enviam** mesmo se alguém reativar um secret isolado (preferência: dead-code path com `LEGACY_CAMILA_SENDERS=off` master, default off).  
3. **Cron:**  
   - Supabase: `platform-cold-outreach-tick` e `platform-camila-conductor` **unscheduled** (SQL migration ou runbook verificado).  
   - VPS: **nenhum** crontab chamando `action=tick` do cold; único tick armável = `harness-pilot-tick` (§5.4b).  
4. Evidence: seção `legacy_cutover` no verify com `path_a_sends_possible=false`, `r2_sends_possible=false`, `cold_tick_retired=true`, `apresentar_retired=true`, `conductor_cron_off=true`, `vps_owner=harness_pilot_tick`.

#### 5.0.3 Premissa VPS (dono do disparo)

**Hoje (checado 2026-09-18):**

- Canaries Camila já rodam na VPS: `/opt/scripts/camila/d1_run.py`, `d2_canary_run.py` → HTTP POST edge.  
- `crontab` root da VPS **não** tem job 1/min permanente de Camila (canaries foram one-shot).  
- Migrations ainda definem **pg_cron** Supabase para cold tick + conductor — risco de dual-owner se ambos vivos.

**Decisão:** o tick do piloto **mora na VPS**, no mesmo padrão operacional dos canaries:

```text
VPS crontab (* * * * *, flock)
  → /opt/scripts/camila/harness_pilot_tick.py|.sh
  → POST …/platform-cold-outreach  {"action":"harness-pilot-tick"}
     OU  …/platform-camila-harness-pilot
  → edge: pickNext → (dry|transport) → persist
```

- **Não** criar novo `pg_cron` para o piloto nesta fase.  
- **Unschedule** pg_cron legado (cold + conductor) como parte do cutover.  
- Crontab VPS fica **comentado / desarmado** até `GO PILOT HARNESS v1` (script existe; linha cron só após GO).

---

### 5.1 Gate piloto (`wire-gates.ts`)

- Remover bloqueio absoluto `l2_real_whatsapp_forbidden` **ou** substituir por:  
  `pilotLive === true && kind === "supervised" && goId && manualList && voice !== "OFF"`.  
- Automático + Kill continua fail-closed.  
- Testes: real supervisionado **allowed** só com flags; sem GO / fora lista / automático → block.

### 5.2 Transport definitivo (`wire-transport.ts` + `wire-transport-zapi.ts`)

- Tipo canónico: **`WireTransport`** (família `wire-gates` / `wire-send` — **não** `PilotTransport`).  
- `createDryWireTransport()` = default BUILD (0 WA).  
- Impl real: `wire-transport-zapi.ts` → `send(envelope)` → `platform-whatsapp-qr-send` (ou client Z-API do cold).  
- Grava mensagem outbound no CRM (mesmo shape do cold).  
- Falha de rede → envelope **não** marca `delivered`; retry idempotente pela `idempotencyKey`.  
- Mesmo tipo serve pós-piloto (remarketing/UI depois); só a *origem* do GO muda.

### 5.3 Persistência da fila

Escolher **uma** (preferência A):

| Opção | Onde | Prós |
|---|---|---|
| **A (preferida)** | metadata chave `harness_pilot_queue` (singleton / campanha piloto) | Sem migration nova |
| B | Tabela `platform_crm_harness_pilot_queue` | Mais limpa; custa migration |

Campos mínimos: `pending[]`, `spacing`, `inFlightLeadId`, `goId`, `updated_at`.

### 5.4 Tick `harness-pilot-tick` (edge)

- Action nova em `platform-cold-outreach` **ou** edge dedicada `platform-camila-harness-pilot`.  
  Preferência: **action no cold file** só como host HTTP (já autenticado); lógica em `_shared/camila-harness/` — **não** chama `tick` legado.  
- Ordem: carregar fila → `pickNext(now)` → se vazio, exit → se dry/flags off, **não** Z-API → se live+GO, transport → `deliverPicked` → se open/resume, `enqueueFollowupBubbles` → salvar fila.  
- Cap: **1 envelope por tick**.  
- Se `COLD_OUTREACH_ENABLED` flipar true por acidente: `harness-pilot-tick` **ignora** fila cold; tick legado continua retired.

### 5.4b Wiring VPS (obrigatório)

Entregáveis:

1. Script `/opt/scripts/camila/harness_pilot_tick.py` (espelhado em `tasks/camila-autonomy/camila-harness/ops/` no repo).  
2. Runbook: instalar crontab com `flock`, secret via env file (padrão `.env.d1`).  
3. Verify BUILD: script existe no repo + dry POST não envia WA.  
4. Verify pós-GO: crontab armado **e** jobs pg_cron legado ausentes (`cron.job` query ou evidence assinado).

### 5.5 Reativo mínimo

- Webhook: além de `harnessInboundMetaPatch`, se phone ∈ lista piloto **e** flags piloto:  
  - pacote FC incompleto → anota intent, **não** reply;  
  - pacote completo + soft/hard → enqueue `exit_message`;  
  - interesse/neutral pós-4 → enqueue `reply` (stub determinístico v1 default).  
- **Não** chamar `tryPathAR2OnInbound` nem Path A reopen.  
- Mesma fila / janela estendida.  
- Opt-out via `on-inbound` (ramo silence) permanece.

### 5.6 Flags + isolation (além do cutover código)

| Secret / flag | Estado exigido no BUILD |
|---|---|
| `COLD_OUTREACH_ENABLED` | `false` |
| `REOPEN_INTENT_V1_MODE` | `off` |
| `R2_AUTO_V1_MODE` | `off` |
| `CAMILA_CONDUCTOR_ENABLED` | `false` |
| `CAMILA_CONDUCTOR_ALLOW_LIVE` | não `true` |
| `HARNESS_PILOT_LIVE` | `0` até GO |
| `HARNESS_ALLOW_REAL_WHATSAPP` | `0` até GO |
| `LEGACY_CAMILA_SENDERS` (se introduzido) | `off` |

### 5.7 Renata (produto)

- Ordem 1 do roster; resume text canônico.  
- Inbound com auto-reply de salão — aceito; não muda o texto.

---

## 6. Check binário (fase)

**Arquivo:** `loop/verify_harness_pilot_live.py`

**PASS se e somente se:**

1. `deno test` em `pilot-deliver` + `outbound-queue` + `lead-spacing` + transport mock + gate piloto + cutover guards  
2. Código: caminho `allowReal` supervisionado **sem** `l2_real_whatsapp_forbidden` genérico  
3. Existe `harness-pilot-tick`; flags off → 0 Z-API  
4. Persistência: round-trip fila (teste)  
5. Webhook/piloto: soft/hard/interest enfileiram exit/reply **em teste** (sem WA)  
6. **Cutover legado:**  
   - `tick` legado retired / no-send  
   - Path A mutate path unreachable com flags default  
   - R2 send unreachable  
   - apresentar no-op  
   - conductor gated off  
   - evidência de unschedule pg_cron **ou** SQL migration no repo + runbook  
   - script VPS `harness_pilot_tick` presente no repo  
7. Evidence `L3-pilot-live-build-latest.json` com `real_whatsapp_sends: 0` + `legacy_cutover: PASS`  

**Após GO PILOT (operacional):**  
Lei1 — ≥1 pacote Renata no ledger + 0 phones fora da lista + crontab VPS armado + 0 sends de rotas legadas; `PILOT-RESULT.json`.

---

## 7. Gates humanos

| Frase | Quando |
|---|---|
| `GO BUILD PRD-12` | Inicia construção (cutover + live wire; 0 WA) |
| `GO PILOT HARNESS v1` | Após BUILD PASS + ≥09h BRT + Voice TEST + Kill ON + cutover PASS → armar crontab VPS + flags live |
| HARD_STOP | Voice OFF; `HARNESS_*=0`; desarmar crontab VPS; fila não reprocessa; legado permanece off |

---

## 8. Ordem de implementação (fase única)

1. **Cutover legado HARD** (§5.0) — flags + no-ops + unschedule SQL/runbook  
2. Gate piloto  
3. Persistência fila  
4. Transport Z-API + `harness-pilot-tick` edge (flags off → dry)  
5. Script VPS + runbook (cron desarmado)  
6. Reativo mínimo no webhook (sem Path A/R2)  
7. Verify live + evidence  
8. STOP — aguardar GO PILOT  

Tick edge = único writer da fila; VPS só dispara o edge.

---

## 9. Rollback

- Flags piloto → 0; desarmar crontab VPS  
- Tick edge deixa de enviar  
- Fila pode permanecer (não reprocessar sem GO)  
- **Legado permanece off** (rollback ≠ reativar Path A/cold/conductor)

---

## 10. Aceite

Marcelo confirma: verify BUILD PASS + `legacy_cutover` PASS + texto Renata ok + runbook VPS ok.  
Só então `GO PILOT HARNESS v1`.

---

## 10b. PRD-12 fecha o gap até o disparo do piloto?

**Sim — para Camila Harness Engineering ficar *pronta para disparar o piloto*.**  
Após `GO BUILD PRD-12` → BUILD PASS → cutover PASS → `GO PILOT HARNESS v1` (≥09h BRT) + armar crontab VPS + flags live, **não falta bloco de engenharia** no caminho do 1º disparo supervisionado (Renata + shortlist).

| Fecha (engenharia do piloto) | Não fecha (fora do DoD do piloto) |
|---|---|
| Cutover Path A / R2 / cold tick+apresentar / conductor | Remarketing t1–t3 |
| `WireTransport` real + gate supervisionado | Brain LLM completo no reply |
| Fila persistida + tick + cron VPS | UI rica de disparo |
| Reativo mínimo (reply/exit stub) | Kill maduro (`stop_new` / `abort_inflight`) |
| Isolation + evidence 0 WA no BUILD | Multi-número / 200 leads/dia / Voice LIVE amplo |

**Não** = “Camila produto completo”. **Sim** = “fio + cutover + VPS prontos para o GO do piloto”.

O documento DRAFT sozinho **não** deixa pronto — falta implementar (`GO BUILD PRD-12`) e o GO humano de disparo.

---

## 11. Referências

- Auditoria pré-GO (sessão 2026-09-18): bloqueadores B1–B5  
- Plugs: `platform-whatsapp-qr-webhook/index.ts`, `platform-cold-outreach/index.ts`, `platform-camila-conductor/index.ts`  
- Crons SQL: `20260715_cold_outreach_cron.sql`, `20260902_camila_conductor_cron.sql`, `20260904_camila_conductor_cron_live_safe.sql`  
- VPS: `/opt/scripts/camila/` (canaries); crontab root sem job Camila permanente (2026-09-18)  
- `POLICY.md` §6–8 · `pilot-deliver.ts` · `wire-transport.ts` · `outbound-queue.ts` · `lead-spacing.ts` · `PILOT_ROSTER`  
- PRD-11 (histórico L1–L3 dry)  

**Status:** BUILD PASS — aguardando `GO PILOT HARNESS v1` (≥09h BRT). Zero WhatsApp real até o GO.
