# PRD-11 — Camila Harness Engineering (Loop de execução)

**Programa:** `camila-harness`  
**Contrato:** `tasks/camila-autonomy/camila-harness/` **v1.2**  
**Board:** Meu primeiro board v2  
**Modo:** loop engineering — **GO humano → harness pronto** (poucas etapas)  
**Fora de escopo:** campanha remarketing (t1–t3); Kill maduro fino (`stop_new`/`abort_inflight`)

---

## 1. Resultado (Definition of Done)

Com **um GO final de piloto** do Marcelo, o sistema entrega:

1. Funil operacional: **DB → amarelo → 1º disparo supervisionado (4 bolhas) → verde**  
2. Triagem: ruído / soft / hard / interesse / goodbye  
3. **Mensagem de Saída** (texto único + site/preview) → laranja ou vermelho conforme contrato  
4. Pool laranja **sem** disparo automático  
5. Lead fala → Camila **reativa** atende (no modo piloto)  
6. Gates: Voice **TEST** + Kill **ON** (Kill só automático; supervisionado liberado)  
7. Zero WhatsApp **antes** do GO de piloto; depois do GO, só lista manual supervisionada  

**Não-DoD:** esteira remarketing, LIVE amplo, UI completa de disparo (pode ser mínima/GO CLI na v1 do piloto).

---

## 2. Invariantes (nunca afrouxar)

Ver contrato v1.2. Em uma linha: **FC-1 completa 4**; Kill ≠ bloqueio do supervisionado; Mensagem de Saída ≠ rmkt; hoje até GO = OFF+Kill absoluto no runtime legado até o harness novo estar no ar em shadow.

Durante **construção** (Loops 1–2): **nenhum WhatsApp real** (Voice OFF + Kill ON no sentido operacional atual).  
Só o **GO Piloto** autoriza envio supervisionado.

---

## 3. Loop único — 3 etapas (não mais)

```text
GO_BUILD?
  → LOOP 1 SHADOW     (máquina + testes, 0 WhatsApp)
  → LOOP 2 WIRE       (caminho supervisionado ligado em código, ainda 0 WhatsApp real)
  → STOP: GO_PILOT?   (humano; após Loop 2 verify PASS)
  → LOOP 3 PILOT      (lista manual + métricas verdes)
  → DONE (harness piloto pronto; Marcelo aceita)
```

| Loop | Nome | Entrada | Saída |
|---|---|---|---|
| **1** | SHADOW | GO_BUILD | Kernel + FC + triagem + saída em shadow; evidence PASS |
| **2** | WIRE | Loop 1 verify PASS | Send path supervisionado implementado; flags fail-closed; 0 WhatsApp |
| **3** | PILOT | **GO_PILOT** Marcelo + Loop 2 verify PASS | N≥1 disparo supervisionado real + atendimento reativo ok |

**Regra de loop:** cada loop tem **1 check binário**. FAIL → rollback do loop → ESCALATE (não avançar). Máx. 3 retries. Não afrouxar check.  
**Revisão de entrega:** o gate de qualidade é o **verify binário + evidence** (+ Lei1 no piloto). **Codex / segundo LLM não é gate** (removido 2026-09-17 — indisponível até ~21/09; não bloquear construção).

---

## 3.1 Revisão Codex — REMOVIDA (histórico)

~~Revisão obrigatória por Codex após cada loop.~~  
**Status:** removida do caminho crítico. Motivo: usage limit Codex até ~2026-09-21.  
Validação passa a ser: `verify_*.py` exit 0 + evidence + gates humanos (GO_BUILD / GO_PILOT / aceite DONE).  
Reintroduzir segundo revisor só com novo GO explícito do Marcelo.

---

## 4. Loop 1 — SHADOW

### Entregáveis
- Modelo de estados alinhado a v1.2 (`db` / `preselected` / `contacted` / `remarketing_pool` / `service` / `do_not_contact`)
- Planejador first-contact: 4 bolhas, FC-1, idempotência, retomada ≤48h (simulado)
- Classificador/triagem: hard, soft, ruído, interesse, goodbye (pós-saída)
- Mensagem de Saída (conteúdo + destino laranja/vermelho) em shadow
- Suite de testes (cenários B: soft, hard mid-4, silêncio→pool, ruído→service)
- Evidence JSON + runner verify

### Check binário
`verify_harness_shadow.py` (ou equivalente) **exit 0** + todos cenários obrigatórios PASS + **zero** send real no ledger.

### Métricas (alvo)
| Métrica | Alvo |
|---|---|
| Cenários contrato cobertos | 100% da lista mínima (§7) |
| Sends reais | **0** |
| Tempo loop | ≤ 2 dias úteis (orientação) |

### Rollback
Reverter branch do loop; Voice/Kill inalterados (já OFF).

---

## 5. Loop 2 — WIRE

### Entregáveis
- Caminho de envio **supervisionado** (GO + lista manual) no código — **desligado** por default
- Distinção runtime: automático bloqueado por Kill; supervisionado exige `go_id` / aprovação
- Persistência: bolha reserved/sent/failed; retomada
- Soft_exit delivery path (link preview) wired, gated
- Pool: marcar elegível **sem** schedule rmkt
- Webhook: triagem → transição de estado (ainda sem brain live se Voice OFF)
- Evidence + verify wire fail-closed

### Check binário
`verify_harness_wire.py` exit 0:  
- tentativa de send **sem** GO supervisionado → bloqueada  
- com GO em **dry-run/shadow** → plano ok  
- Kill/Voice OFF → **0** WhatsApp real  
- idempotência: replay não duplica bolha

### Métricas
| Métrica | Alvo |
|---|---|
| Sends reais | **0** |
| Bloqueio sem GO | 100% nos testes |
| Duplicata de bolha | **0** |

### Rollback
Flags/default OFF; desligar wire path.

---

## 6. Loop 3 — PILOT (só com GO_PILOT)

### Pré-GO (humano)
Frase: **`GO PILOT HARNESS v1`**  
Pré-condições: Loop 1+2 PASS; lista manual definida; Voice→TEST; Kill permanece ON (só auto); horário/janela acordada.

### Entregáveis
- ≥1 lead da lista: 4 bolhas supervisionadas entregues (ou retomada correta)
- Soft e/ou hard path observado **ou** simulado em canário + 1 path real mínimo
- Inbound → Camila reativa responde (cita msg quando contrato pede)
- Silêncio 24h → pool (pode ser clock fake em teste + 1 observação)
- Dashboard/log mínimo: estado do lead + último evento
- Evidence `PILOT-RESULT.json` + Lei1

### Check binário
`verify_harness_pilot.py` exit 0 + Lei1:
- outbound **só** lista manual + GO  
- automático continua 0  
- FC-1 respeitado no(s) pacote(s)  
- Mensagem de Saída só nos destinos certos  
- Kill não bloqueou o pacote supervisionado; bloqueou tentativa automática (teste)

### Métricas (piloto)
| Métrica | Alvo |
|---|---|
| Pacotes first-contact completos / iniciados | **100%** (FC-1) |
| Bolhas duplicadas | **0** |
| Outbound fora da lista manual | **0** |
| Sends automáticos (sem GO) | **0** |
| Inbound com triagem aplicada | **100%** dos casos do piloto |
| Tempo até 1º pacote verde após GO_PILOT | ≤ 1 dia útil |

### Rollback
Voice OFF; cancelar GO; Kill ON; parar supervisionado.

---

## 7. Cenários mínimos (Loops 1–3)

1. Soft pós-4 → Mensagem de Saída → laranja  
2. Hard mid-4 → completa 4 → Mensagem de Saída → vermelho  
3. Interesse → service (cita)  
4. Ruído → 24h → humano → service  
5. Silêncio 24h → pool  
6. Goodbye pós-saída → noop  
7. Crash mid-4 → retomada ≤48h (bolha retomada + faltantes)  
8. Replay → sem bolha duplicada  
9. Sem GO → sem send  
10. Automático com Kill ON → bloqueado  

---

## 8. Artefatos / pastas

```
camila-harness/
  (contrato v1.2)
  loop/
    LOOP-MANIFEST.json
    run_harness_loop.py
    verify_harness_shadow.py
    verify_harness_wire.py
    verify_harness_pilot.py
  evidence/
    L1-shadow-*.json
    L2-wire-*.json
    L3-pilot-*.json
```

---

## 9. Gates humanos (só estes)

| Gate | Frase | Quando |
|---|---|---|
| GO_BUILD | `GO BUILD HARNESS` | Inicia Loop 1 |
| GO_PILOT | `GO PILOT HARNESS v1` | Inicia Loop 3 — **exige Loop 2 verify PASS** |
| STOP | qualquer HARD_STOP / incidente | Rollback |

Sem GO_PILOT → **nunca** WhatsApp real do harness novo.  
Avanço entre loops: **somente** verify binário verde (+ evidence).

---

## 10. Fora / depois

- Remarketing campaign (Preparar Campanha, t1–t3)  
- Kill semântica madura  
- UI rica de disparo (piloto pode ser GO + lista)  
- LIVE / cohort amplo  

---

## 11. Critério “harness sai pronto”

**Pronto** = Loop 3 PASS + `PILOT-RESULT.json` + Lei1 verde + Marcelo confirma aceite do piloto.

Até lá: status `BUILDING` ou `AWAITING_GO_PILOT`.
