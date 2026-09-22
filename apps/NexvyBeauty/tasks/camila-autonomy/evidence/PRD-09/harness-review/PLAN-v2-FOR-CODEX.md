# Plano de construção — Camila Harness Engineering (pós board v2)

**Programa:** Camila — Harness Engineering (`camila-harness`)  
**Board canônico:** `Meu primeiro board v2.jpg` (imagem anexa)  
**Tipo:** C (arquitetura) → depois A (execução por módulo)  
**Pedido ao Codex:** validação final — PARECER / APONTAMENTOS / CONCLUSÃO.

---

## 1. Decisões de produto já fechadas (contrato)

### 1.1 Estados (colunas do board)
| Estado | Significado operacional |
|---|---|
| LEAD DB | Não tratados / não contatados |
| PRÉ-SELECIONADO | Escolhidos (UI ou agente); ainda sem contato |
| CONTATADO | Recebeu 1º disparo (4 bolhas / ~180s) |
| REMARKETING | **Gaveta de elegíveis** — contatados sem resposta **ou** soft + encerramento |
| ATENDIMENTO | Camila brain (inbound / interesse) |
| FECHAMENTO → ONBOARDING | Interesse → pagamento → onboarding |
| NÃO CONTATAR | Terminal para Camila (zero outbound auto) |

### 1.2 Laranja = NÃO é esteira automática
- Entrar em REMARKETING **não** agenda 1º/2º/3º sozinho.
- Disparos 1/2/3 só existem **depois** do GO humano: **"Preparar Campanha de Remarketing"** (caixa tracejada no board v2).
- Campanha pode ser **nunca**. Até lá: lead elegível, **dormindo** (sem proactive).
- Soft pause → soft exit (msg encerramento) → REMARKETING pool → **proactive_blocked** até campanha GO **ou** reactivate inbound.

### 1.3 Vermelho = não contatar (2 sub-gavetas internas)
Para Camila: **uma regra** — não contatar mais.  
Sub-gavetas CRM (não mudam o comportamento):
1. `hard_stop` — pedido explícito (PARE/SAIR/STOP/não me contate)
2. `cadence_exhausted` — sumiu nas 3 tentativas **de uma campanha que de fato rodou**  
   (+ opcional: `closed_lost` / sem interesse no atendimento — também sob “não contatar” operacional, motivo distinto)

### 1.4 Soft vs inbound
- Soft-fechada: **inativa** para cold/first-contact/brain até ela voltar **ou** campanha GO.
- Reactivate / interesse real → **ATENDIMENTO (inbound)**, nunca reenqueue cold / first contact.
- Goodbye ack (“pode deixar”) pós soft-exit → 0 outbound, não reativa.

### 1.5 Colisão de nomes (lei do glossário)
| Legado | Canônico |
|---|---|
| “R2” Path A (código) | **soft_exit** (mensagem de encerramento soft + site) |
| “2º disparo remarketing” board | **rmkt_t2** (só dentro de campanha com GO) |
| Path A / F0–F7 | maturidade **M0–M4 por módulo** |
| allowlist F7 | **pilot_cohort** |
| release + kill | **voice_gate** + **emergency_stop** |
| cold_not_before | **no_proactive_until** (anti-blast; não “ela é frio”) |
| cold_suppressed | **proactive_blocked** |

---

## 2. Contexto runtime (hoje — Lei1 recente)

- Voice gate: **OFF** + emergency_stop **ON** (Camila não fala).
- Pilot cohort Path A legado: 5 números; policies reopen/soft-exit “armadas” no cercadinho, boca fechada.
- Cadência remarketing 1/2/3 automática: **não** é o comportamento desejado; board v2 corrige.
- Soft exit canário (ex-F6) já provado em allowlist; teardown OFF/kill.
- PR Path A (#204) aberto no histórico — rename/cutover ainda não é hard rename em prod.

---

## 3. Arquitetura do harness (módulos)

```
camila-harness/
  GLOSSARY.md
  STATE-MACHINE.md          # board v2 formalizado
  POLICY.md                 # proactive vs inbound; gates
  modules/
    01-selection/           # DB → pré-selecionado
    02-first-contact/       # 4 bolhas / janela 180s
    03-response-triage/     # respondeu? ruído? soft? interesse?
    04-soft-exit/           # msg encerramento soft (+ site)
    05-remarketing-pool/    # elegibilidade; SEM schedule automático
    06-remarketing-campaign/# GO "Preparar Campanha" → t1/t2/t3 (24h+6d)
    07-reactivate-inbound/  # inbound válido → atendimento; proíbe cold
    08-service-close/       # atendimento → fechamento → onboarding
    09-do-not-contact/      # hard_stop | cadence_exhausted | closed_lost
  safety/
    voice-gate.md
    emergency-stop.md
    pilot-cohort.md
  verify/
  evidence/
  aliases-v1.json
```

### Responsabilidades-chave
| Módulo | Faz | Não faz |
|---|---|---|
| 05-remarketing-pool | Marca elegível; dorme | Agendar t1/t2/t3 |
| 06-remarketing-campaign | Só com GO; 3 touches; timers; cancel se reply/opt-out | Rodar sem GO |
| 07-reactivate-inbound | Abre SERVICE; reply normal | Reenqueue cold / first contact |
| 04-soft-exit | Encerramento educado | Virar “2º disparo” |

### Gates transversais (fail-closed)
1. emergency_stop  
2. voice_gate (OFF/TEST/CANARY/LIVE)  
3. hard_stop / do-not-contact  
4. proactive_blocked (pool sem campanha; soft dormant)  
5. pilot_cohort (em módulos em M2)  
6. Elegibilidade revalidada **no send**, não só no schedule  

---

## 4. Máquina de estados (resumo)

```
DB → select → PRESELECTED → first_contact → CONTACTED
  CONTACTED + silence 24h → REMARKETING_POOL (dormant)
  CONTACTED + noise → wait → (real?) else → POOL
  CONTACTED + soft → soft_exit → POOL (proactive_blocked)
  CONTACTED + interest → SERVICE

REMARKETING_POOL
  [idle] até GO campanha OU inbound reactivate
  GO → CAMPAIGN (t1 → wait → t2 → wait → t3)
    reply hard → DNC(hard_stop)
    reply interest → SERVICE
    silence after t3 → DNC(cadence_exhausted)

SERVICE
  interest → CLOSE → PAY → ONBOARDING
  no interest → DNC(closed_lost)
  hard → DNC(hard_stop)
```

---

## 5. Plano de construção / correção (fases)

### Fase 0 — Contrato (C1 docs) — **fazer primeiro**
- [ ] `GLOSSARY.md` com leis soft_exit ≠ rmkt_t2; pool ≠ campaign
- [ ] `STATE-MACHINE.md` espelhando board v2 + sub-gavetas vermelhas
- [ ] `POLICY.md` (proactive vs inbound; GO campanha; Voice/Emergency)
- [ ] `aliases-v1.json` (F*/R2/Path A → nomes novos)
- **Check binário:** docs revisados + zero menção a R2/F7 como nome de produto sem alias

### Fase 1 — Alinhar runtime legado ao contrato (sem ligar Voice)
- [ ] Documentar mapeamento: Path A reopen → módulo 07; “R2” código → 04 soft_exit
- [ ] Garantir invariante: soft_exit **não** agenda campaign touches
- [ ] Pool: `remarketing_eligible` / status REMARKETING **sem** jobs t1/t2/t3
- [ ] Manter voice OFF + kill até GO explícito
- **Check:** Lei1 release OFF/kill; zero outbound fora cohort; zero rmkt_t* sem campaign_id/GO

### Fase 2 — Soft exit + reactivate (piloto) sob nomes novos
- [ ] Alias/flags: `CAMILA_SOFT_EXIT_*`, `CAMILA_REACTIVATE_*`, `CAMILA_PILOT_COHORT`
- [ ] Dual-read legado → canônico; telemetria de uso legado
- [ ] Testes: soft → pool dormant; farewell 0 send; reactivate → service; hard never auto-clear
- **Check:** suite B1–B7 traduzida; canário só cohort; Voice ainda OFF salvo GO TEST

### Fase 3 — Remarketing campaign (módulo 06) — **novo, sob GO**
- [ ] Entidade `campaign` + GO “Preparar Campanha”
- [ ] t1/t2/t3 com 24h + 6d; cancel on reply/opt-out; revalidate on send
- [ ] Exhausted → DNC sub-gaveta cadence_exhausted (≠ hard_stop no CRM)
- **Check:** sem GO = 0 touches; com GO + silence×3 = exhausted; hard = hard_stop

### Fase 4 — Triagem / first-contact / service-close
- [ ] Contratos ruído, first contact 4/180s, payment/onboarding states
- [ ] Agentes na seleção = recomendação; autorização determinística antes de contact

### Fase 5 — Cutover hard rename (C3) só após equivalência
- [ ] Remover aliases quando telemetria legado ≈ 0 + rollback testado

---

## 6. Invariantes (não negociáveis)

1. REMARKETING_POOL sem campaign GO → **zero** proactive.  
2. soft_exit ≠ rmkt touch; nomes/handlers/métricas separados.  
3. Reactivate → SERVICE inbound only; proibido reenqueue cold.  
4. Hard stop nunca limpo por classificador de reopen.  
5. cadence_exhausted ≠ hard_stop no CRM; ambos = não contatar para Camila.  
6. Voice OFF / Emergency ON ⇒ nenhum módulo “M2” fura a boca.  
7. Elegibilidade no **send**.  

---

## 7. O que NÃO fazer agora

- Não ligar Voice LIVE.  
- Não implementar cadência remarketing automática sem entidade campaign/GO.  
- Não hard-rename flags em prod sem Fase 0–2.  
- Não tratar “sumiu 3×” como hard se campanha nunca rodou.

---

## 8. Perguntas ao Codex (validação final)

1. Board v2 + este plano resolvem a contradição soft→remarketing automático?  
2. Separação pool (05) vs campaign (06) está correta e suficiente?  
3. Sub-gavetas vermelhas (hard vs exhausted vs closed_lost) ok para Camila unificada?  
4. Ordem das fases 0→5 é segura? Algo inverter?  
5. Lacunas restantes antes de executar Fase 0?  
6. Status final: APROVADO / APROVADO COM RESSALVAS / REJEITAR  

### Formato obrigatório de resposta
```
## PARECER
## APONTAMENTOS
## CONCLUSÃO
Status: ...
Próximo passo recomendado: ...
```
