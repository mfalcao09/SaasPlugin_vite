# 🚦 ESTADO DE GO-LIVE — NexvyBeauty (foto consolidada)
**2026-07-16** · sessão controladora da maratona. Esta é a **foto única de go-live** — supersede a visão espalhada de INVENTARIO/PLANO-MESTRE para efeito de decisão de lançamento.

## TL;DR
O produto **+ a máquina de aquisição de 3 vetores** estão **construídos, deployados e provados** (gated onde aplicável). O que separa do lançamento **não é mais código — é ops do Marcelo** (E2E real, LP, flags, números, RIPD) + curar/aprovar a base. **Recomendação: lançar no CORE como piloto controlado 1-3 salões.**

---

## ✅ NO AR — o que já está deployado e provado (gated)

### Produto
| Peça | Estado | PR |
|---|---|---|
| Onboarding E2E (wizard 9 passos + telemetria) | ✅ prod | #63 |
| Brain de vendas: Duda→Bia · roteador **blindado** (roleta morta, `??null`) · preço fonte-única · sunset (275/427/693→383/599/849, sem "vagas") | ✅ prod (eval **97,92%**) | #65/#68 |
| Automação real (4 receitas default ON) + Agente de Carteira (auditor + captura conversacional) | ✅ prod, gated | #69 |
| Modo retenção da Nina (dormente até `nina-health-scan`) | ✅ prod, gated | #67/#68 |
| Handoff pós-compra Duda→Lia (mesmo thread) | ✅ prod, flag OFF | #66 |
| E-mail transacional (Resend) — fix do 403 (chave nova sb_secret), dry-run seguro | ✅ prod, dry-run | #76 |
| **Esteira demo: backend + front** (o raio-x navegável — R$2.760/23 clientes no teste) | ✅ prod | #70-74 (back) · #77 (front) |
| Prospecção: menu + Base Consolidada + **portão de aprovação PER-LEAD** (clean slate: 0 aprovados, 4.006 crus intactos) | ✅ prod | #64 · #82→#83 |

### Aquisição — 3 vetores
| Vetor | Estado | PR |
|---|---|---|
| **Cold outbound**: motor anti-ban (warm-up/teto/jitter/segment-gate/kill-switch) + script vencedor + IG DM + opt-out + handoff | ✅ prod, **gated OFF**, smoke verde | #75 |
| **Ads inbound**: atribuição CTWA + Duda-inbound-mode + CAPI desacoplado + schema | ✅ prod, gated OFF (funil **3/6** com produtor; #5/#6 fast-follow) | #78-81 |
| **A demo/raio-x** = a isca/fecho compartilhado dos dois (a análise de cold cravou como a alavanca de conversão) | ✅ construída | — |

---

## 🔴 FILA-HITL DO MARCELO — os desbloqueadores reais do lançamento (não é código)
1. **E2E R$10** (compra real → prova a máquina inteira ponta-a-ponta) — **o gate nº1**.
2. **LP nova** (Lovable) → eu subo.
3. **Flags:** `EMAIL_SEND_ENABLED=true` (Resend, chave já existe) · `ONBOARDING_HANDOFF_ENABLED=true` (P10 + smokes) · duplo-gate cold (`dry_run=false` + `COLD_OUTREACH_ENABLED=true`) · `NINA_HEALTH_SCAN_ENABLED` (após validar âncora D-7).
4. **Números:** burner dedicado (cold, ≠ WABA oficial) · número oficial novo + WABA/Página FB (ads inbound).
5. **Resend:** confirmar domínio `nexvybeauty.com.br` verificado (SPF/DKIM/DMARC).
6. **Ads:** App Review Meta · audiências (excluir os 1.919 + lookalike da semente de 1.497) · secrets CAPI.
7. **Legal:** sign-off do RIPD/`PRIVACY_VERSION` (esteira).
8. **Aprovar as bases** na Prospecção (portão per-lead) — a base sobe pra consolidada só após seu aval.

---

## 🔄 Em voo — sob minha coordenação (reportam a mim, gated)
- **Sessão Oferta** — montando a oferta mais irresistível ($100M Offers, demo no centro). MARCO 1 ✅.
- **Sessão ADS** — gestão/otimização de ads (A2-back agente ✅ gated; front buildando). **Fast-follow.**
- **Minha fila:** downstream (campanhas + cold lendo `approved_at` per-lead — building) · esta foto.

## 🟡 Fast-follows (lança sem)
Nina D-7 (0 pagantes hoje, importa em D+30) · Captação C1/C5/C8 (UI-only) · CAPI #5/#6 producers (checkout/sale) · Ads management UI · Instagram Flows · Voz IA (Fase 2).

---

## 🎯 Recomendação de corte de lançamento
**Lançar no CORE como piloto controlado (1-3 salões):** sell → buy → onboard → automate + a demo. A máquina está construída e provada; os gates que faltam são **ops sua**, não código. **Semana, não meses.** A esteira/retenção/outbound/ads-management entram como fast-follow.
