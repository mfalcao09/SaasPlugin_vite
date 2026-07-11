# PLANO MESTRE — Go-Live NexvyBeauty (registro ÚNICO)
> **2026-07-11 · sessão `6cf2fc02`** · este doc **SUPERSEDE e absorve**: [STATUS-GO-LIVE-07-11](STATUS-GO-LIVE-2026-07-11.md), [DELTA-PORTABILIDADE-100-07-11](DELTA-PORTABILIDADE-100-2026-07-11.md), [LEVANTAMENTO-07-08](LEVANTAMENTO-PENDENCIAS-REAIS-2026-07-08.md). Aqueles viram fonte/histórico; **a lista de ação viva é ESTA** (Seção 14: um registro só, close-before-open).
> **Divisão do Marcelo:** **FASE 1 = CORE** (mínimo pra plataforma plena + operação com alto fluxo: leads, ads, funil, venda automática). **FASE 2 = MELHORIA** (2ª fase). Dentro de cada fase: prioridade **P0→P5**.
> **Status:** ✅ feito/provado · 🔄 em execução · 🟡 parcial · ☐ a fazer · ⚠️ decisão do Marcelo.

---

## ✅ JÁ PROVADO (base da decolagem — não re-fazer)
| Item | Prova |
|---|---|
| Máquina de venda: pagamento → webhook → provisionamento → org operacional | E2E 07-08 + webhook LIVE 07-11 (2 testes 200, guard-rail) |
| Planos mapeados (Essencial/Premium/Ultra) + slugs | banco 07-11 |
| Cards nativos Meta (catálogo + auto-sync ao salvar plano) | GET /products = 3 itens; edge live |
| Telegram alerts (rede de segurança ops) | HTTP 200 |
| Dedup `cakto_orders` | UNIQUE NULLS NOT DISTINCT, provado |
| Deploy do bundle desta sessão | `index-BsTNxNjo.js`, 200 nos 3 hosts |

---

# FASE 1 — CORE (mínimo pra uso pleno + operação com fluxo)

## P0 — ✅ CÓDIGO PRONTO (5/5) · 🔄 publicação em andamento
**Descoberta:** as colunas JÁ existiam no banco — a mentira era 100% no código (write path dropava os campos). Zero migration. tsc 0 erros + deno check verde.
| # | Item | Status |
|---|---|---|
| P0.1 | `EditVisitorDialog` grava `visitor_email` + read path + painel lateral (bonus: `LeadContextPanel` mostrava sempre null) | ✅ código |
| P0.2 | `TransferModal` persiste `orchestrator_state`/`evolution_instance_id`/takeover em `metadata` (3 console.warn removidos) | ✅ código |
| P0.3 | `AcceptTicketDialog` → `force:takeover` fio completo (dialog→hook→edge consome) | ✅ código |
| P0.4 | `FollowupAIDialog` renderiza `warnings` (caixa âmbar) + `model` | ✅ código |
| P0.5 | `InboxMetricsHeader` montado via `metricsSlot` (nota: no canônico também era dead-import; montado pela intenção) | ✅ código |
| P0.6 | Commit + push + deploy (frontend + edge `platform-webchat-inbox`) | 🔄 |

## P1 — Uso pleno + o que mais preocupa (Atendimento · Lux · CRM multiproduto)
| # | Frente | Itens | Esforço |
|---|---|---|---|
| P1.A | **Atendimento (finalizar porte)** | `LeadEditModal` (editar lead vinculado do inbox) · `JourneyTimeline` handoffs (assumiu/devolveu/transferiu) · áudio iOS/Safari (AAC + fallback baixar) · A1 composer HITL residual · `trigger_flow` 1ª msg via Cloud API · Mia botões inline Confirmar/Cancelar | M-G |
| P1.B | **Lux L4** (te preocupa muito) | 47 telas (P2=18 + P3=29) + limpeza rosa (16 arq) + rubric v2 (tirar âncora azul) + revisão adversarial tela-a-tela | G |
| P1.C | **CRM multiproduto E1/D3** | pivot product-aware (LOTE L1-L13) · seed ~9 produtos · F2 prova runtime (2+ produtos) · religar 10 stubs · lead manual gravando `product_id` | G |

## P2 — Vender no automático (Autopilot · Cérebro dos agentes · Operação da dona ∥)
| # | Frente | Itens | Esforço |
|---|---|---|---|
| P2.A | **Cérebro/conteúdo do agente** (o oco — DELTA §🅱) | 8 tabelas `platform_crm_*` product-scoped + edges twin: knowledge sources, catálogo, pós-venda, objeções estruturadas, materiais, vídeo-aulas, CTAs, email-templates + gerar-agente-IA + chat-teste. Reusa edges org-scoped existentes (troca `org_id`→`product_id`) | ~11-12d |
| P2.B | **Autopilot venda** (Frente 2 levant) | scoring QCR determinístico (`computeQcrScore` PR÷217) · `founder_status` READ no runtime · transição `[PASSAR_BIA]` · humanização (agrupamento/digitação) · atribuição Cakto (`duda-sdr`×`duda` + 1 pagamento-teste) · CTA LP+UTM 1st-party · copy LP 15→30/30/1 | M-G |
| P2.C | **Arsenal agentes** (Frente 8) | 33 itens playbook §12 (estado-do-contato, abandono→resgate, handoffs, 10 testes de aceitação) — dedup contra o que F2 já entregou antes | G |
| P2.D | **Operação da dona ∥** (Frente 3) | B3 pós-compra cria instância + e-mail QR (clientes = **Evolution/QR**, confirmado) · F6 pipeline de ingestão (`MESSAGES_SET`→`wa_timestamp`→dedupe→clientes) · C4 watcher de queda · C2/C3 painéis · LGPD onboarding | G |

## P3 — Crescimento + canais + analytics (o "alto fluxo" que você exige)
| # | Frente | Itens | Esforço | Nota |
|---|---|---|---|---|
| P3.A | **Motor de leads (scrap)** — CORE por você | réplica do prospectagram: Apify IG/Maps/TikTok + enrichment + LGPD 3 travas. Gate = PoC F0 | G | ⚠️ novo build; confirmar entrada agora |
| P3.B | **Ads direcionados** — CORE por você | ⚠️ **DECISÃO:** via edges Meta Ads do CRM (`marketing-connect/sync`, `meta-ads-validate`) OU via a frente separada **advertising-hub** que você explora? | M-G | ⚠️ define a rota |
| P3.C | **IG/Messenger** (reduzido — já conectou IG da operação) | `instagram-send` (sender real de DM ⚠️ verificar se outbound já funciona), `instagram-list-media`, `instagram-subscribe-fields` + resto do plano de 6 blocos | M | App Review Meta = gate |
| P3.D | **Dashboard de Jornada** (DELTA §🅲) | `lib/leadJourney` (760l) + `useLeadJourney` (11 hooks) + 10 componentes `journey/` → analytics origem/campanha/**criativo** | ~2-3d |

## P4/P5 — Paridade fina + débitos (o que sobrar)
| # | Item | Esforço |
|---|---|---|
| P4.1 | Features re-exposição: summaries deals/comissões, gamificação metas, Google Calendar connect, AICampaignAssistant, squad-performance comparativo | ~1.5-2d |
| P4.2 | Cadência: biblioteca de contextos (`context_id`) + editor rico no hub do produto | ~2-3d |
| P4.3 | Edges infra: suspend/reactivate org, onboarding-link, accept-invite-signup, admin-provision-users, fechar Meta-WA (media-upload + watchdog), 4 assist inbox/booking | ~4d |
| P5 | **Débitos 9.x distribuídos; sobra vira último P:** migration B7 (`opportunity_scan_schedules`) fire-now · afiliados fases 2-5 (branch stale — ⚠️ decisão) · Telefonia Salvy (⚠️ decisão) · WIP stash · commit migration dedup · reconciliar HEAD do VPS (card ativo) | var |

---

## 🚀 DECOLAGEM (transversal — corta as fases)
| Passo | Status |
|---|---|
| Máquina pagamento→provisionamento | ✅ provado |
| Onboarding **número Meta API do salão-TESTE** (só o nosso; clientes = QR) | ☐ a construir/validar |
| **Teste de funil E2E completo** | 🔚 **POR ÚLTIMO** (após pendências técnicas — sua ordem d) |
| Piloto controlado 1-3 salões | após funil |

---

# FASE 2 — MELHORIA (segunda fase, pós-core)
- **Voz IA no atendimento** (canal inteiro: 10 edges `xai-voice-*`/`voice-*` + `CallVoiceAIDialog`)
- **Fluxos automáticos de IG** (`ig-flow-executor`, `instagram-flow-generate-ai`)
- **Apresentação visual rica de produtos** (imagens no catálogo Meta ~5 linhas + visual do checkout Cakto = manual) — [análise](MELHORIA-APRESENTACAO-VISUAL-PRODUTOS-POS-LANCAMENTO-2026-07-11.md)
- Profundidade: D6b suíte 13 abas de agente, D7 webhooks saída, D9 push

---

## ⚠️ Decisões que destravam (só você)
| # | Decisão | Bloqueia |
|---|---|---|
| 1 | **Ads = via CRM Meta Ads ou via advertising-hub?** | P3.B (a rota) |
| 2 | **Motor de leads (scrap) entra agora** como P3.A core? (novo build, gate PoC) | P3.A |
| 3 | `CallVoiceAIDialog` cai com a trilha de Voz? · `InboxProductSelector` substituído pelo ProductContext global? · `instagram-send` outbound é real? | limpa o delta |
| 4 | **Corte de lançamento:** Fase 1 completa antes de lançar, ou lançar com P0-P2 e P3-P5 fast-follow? | ritmo |
| 5 | Afiliados fases 2-5 · Telefonia Salvy — reimplementar ou descartar? | P5 |

---

## Governança (Seção 14)
- **Este é o registro vivo único.** Novos itens entram AQUI com dono+done+saiu; nada de doc novo paralelo.
- Docs superseded receberão errata apontando pra cá.
- Estado de execução por item: atualizado neste doc conforme os P's fecham (com prova).

---

*Fontes absorvidas: STATUS-GO-LIVE-07-11 · DELTA-PORTABILIDADE-100-07-11 (5 auditorias vs `oficial-vendus-v5`) · LEVANTAMENTO-07-08 · prioridades ditadas pelo Marcelo 07-11.*
