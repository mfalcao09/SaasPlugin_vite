# PLANO MESTRE — Go-Live NexvyBeauty (registro ÚNICO)
> **2026-07-11 · sessão `6cf2fc02`** · este doc **SUPERSEDE e absorve**: [STATUS-GO-LIVE-07-11](STATUS-GO-LIVE-2026-07-11.md), [DELTA-PORTABILIDADE-100-07-11](DELTA-PORTABILIDADE-100-2026-07-11.md), [LEVANTAMENTO-07-08](LEVANTAMENTO-PENDENCIAS-REAIS-2026-07-08.md). Aqueles viram fonte/histórico; **a lista de ação viva é ESTA** (Seção 14: um registro só, close-before-open).
> **Divisão do Marcelo:** **FASE 1 = CORE** (mínimo pra plataforma plena + operação com alto fluxo: leads, ads, funil, venda automática). **FASE 2 = MELHORIA** (2ª fase). Dentro de cada fase: prioridade **P0→P5**.
> **Status:** ✅ feito/provado · 🔄 em execução · 🟡 parcial · ☐ a fazer · ⚠️ decisão do Marcelo.

---

## 📊 PLACAR (atualizado a cada fechamento com prova)
| Pacote | Status | Prova / Nota |
|---|---|---|
| **P0** mentira silenciosa | ✅ **6/6 DONE** | commit `81e4406` · edge v24 · bundle `index-8-60N2YO.js` 200 nos 4 hosts |
| PR #6 → main + VPS limpo | ✅ **DONE** | merge `f8966d2` · VPS HEAD==origin/main, tree limpo · container rebuild de git limpo · 200 nos 4 hosts · +x do deploy-vps.sh fixado (`0e07271`) |
| **P1.A** residual inbox (LeadEditModal · JourneyTimeline handoffs · áudio iOS) | ✅ **DONE+DEPLOY** | PR #8 `13b02aa` · edge v25 (fix handoffs engolidos `sector_id`→`to_sector_id`) · bundle `index-BnK6AkGC.js` 200 nos 3 hosts |
| **P1.A2** trigger_flow 1ª msg + Mia botões inline | ✅ **DONE+DEPLOY** | PR #10 `e7f8647` + edge deployada · trigger_flow agora ENVIA de verdade (matou msg-fantasma no histórico) · Mia botões JÁ existiam desde 03/07 (levantamento estava stale) |
| **P1.B — L4.0 + L4.1** (rubric 🔒 TRAVADA) | ✅ **DONE+DEPLOY+✅ VALIDADO MARCELO** | PRs #11+#12 → `94f0045` · `index-DyfytF6b.js` 4 hosts · **gate visual APROVADO 07-11 ("Toca em frente, visual validado!!")** |
| **P1.B — L4.4 (F4) + L4.5 (F6)** | ✅ revisadas+merge | PRs #13+#14 → `784ff71` · diffs 100% visuais · F4/F6 já estavam ~conformes (L4.0 fez o grosso); tipografia + arco-íris completado + KPI green→primary |
| **P1.B — L4.2 (F5-ERP)** | ✅ revisada+merge | PR #15 `e92c97b` — 6 telas ERP (86-88), receita F5 calibrada, colisão de checkout auto-reconciliada (lição: worktrees) |
| **P1.B — L4.3 + L4.6 (finais)** | ✅ revisadas+merge | PRs #16+#18 — L4.3: 8 telas Vendas (87-91) · L4.6: Mia+agenda (diff mínimo, F1 já conforme) |
| **P1.B — LUX L4 COMPLETO (6/6 ondas)** | ✅ **DONE — VALIDADO MARCELO 07-11** | "Tudo validado" · violet-IA ratificado como semântica (§1.3 da rubric) · prod `index-B2JtzwHl.js` |
| **🏁 P1 INTEIRO** | ✅ **COMPLETO E VALIDADO** | P1.A + P1.A2 + P1.B (6/6) + P1.C — todos com deploy provado + gate visual aprovado |
| ♻️ Errata Utmify (P4/D10) | ✅ aprovada Marcelo 07-11 | Utmify absorvida como Fase 2 do NexvyAds (atribuição) — registrada no MEMORY |
| **P2.A-0 — fundação do cérebro** | ✅ **DONE** | 🎉 ACHADO: 9 tabelas JÁ existiam (F4/db-spine, mergeado hoje — DELTA auditou antes) · faltava só a 10ª (`agent_training_materials`, 15==15, RLS provado) — PR #20 `6824b93` · **P2.A encolheu de ~11-12d pra religação** |
| **P2.A-1 — religar hooks (fim dos stubs)** | ✅ **DONE+DEPLOY** | PR #21 `8c1605f` — 8 subsistemas CRUD real · review adversarial Opus APROVOU (zero mismatch de coluna); orquestrador FECHOU as 2 ressalvas live (buckets path-agnósticos ✅ / schema==migration ✅) + corrigiu 2 nits (enabled guard + tipo NOT NULL) · bundle `index-DnoQkIgH.js` 200 · **cérebro persiste de verdade em prod** |
| **P2.A-2 — edges twin (pipelines)** | ✅ **DONE+DEPLOY+PROVADO** | PR #23 `8224db8` (WF `ww9uhyszl`): 9 edges portadas 1:1 + 5 stubs religados · **backend PROVADO: 9/9 `v1·verify_jwt=True·ACTIVE`** (list_edge_functions) · **frontend PROVADO: bundle `index-ByygTONo.js` (era DnoQkIgH) em gestao+app** via gate anti-fantasma + curl externo · gate anti-`organization_id` limpo, tsc delta-0, build verde, 9/9 `authenticatePlatformAgent` · secrets AI_API_KEY/AI_GATEWAY_URL ✅ · **✅ E2E PROVADO via chrome_control (07-11)**: super_admin real na UI ByygTONo → `generate-objections` HTTP 200/8.4s → `platform_crm_objections` 0→6 product-scoped (tabela nem tem coluna org_id) → teardown 0 (prod pristino) · ⏳ **1 HITL menor**: `FIRECRAWL_API_KEY` p/ ligar `catalog-sync-website` (edge dormente, sem caller — não bloqueia) |
| **🏁 P2.A INTEIRO (cérebro dos agentes)** | ✅ **COMPLETO E PROVADO** | A-0 (10 tabelas) + A-1 (8 hooks CRUD) + A-2 (9 edges/pipelines) — persiste E processa em prod, E2E validado. **CadenceTab**: 3 stubs = só atalhos; CRUD real de cadência vive na seção dedicada (`CadenceWizard` insert/update/steps) — impacto BAIXO, não-bloqueador |
| 🐛 Card nativo: envio de catálogo saía como LINK | ✅ **RESOLVIDO** (sessão spin-off) | PR #19 `ab95943` + deploy — WhatsApp `interactive product` + IG template + fallback link · **WABA↔catálogo VINCULADO** em prod · ⏳ HITL: Marcelo reenvia um plano no chat e confirma o card |
| 🐛 Auth service_role nas edges platform-* | ✅ **RESOLVIDO** (sessão 5de0b2f1) | NÃO estava quebrado: runtime injeta a key NOVA `sb_secret_*` como SUPABASE_SERVICE_ROLE_KEY; só falha quem usa a JWT LEGADA. Fix (c): callers externos usam a `sb_secret` (ZERO código). Caminho service_role+actorUserId PROVADO 200 E2E. **HITL só se/quando escrever trigger pg_net:** obter a sb_secret real (dashboard/Mgmt API — CLI mascara) pra gravar no Vault |
| **P1.C — GOs executados** | ✅ | db-spine mergeado (PR #7) · seed 4 produtos no banco (Beauty published + LAW/Ads/Payments draft) |
| **P1.C — F2 re-enxerto ProductContext** | ✅ **DONE+DEPLOY+RUNTIME** | PR #9 `93e7754` + deploy (`index-DVCtvFO1.js`) + **prova runtime via chrome_control**: LAW ativo→0 leads · Todos→6 leads · chip+localStorage corretos |
| **P1.B — L4.0 rubric v2 + worklist hardcode** | 🔄 prep | agente Opus escreve `TEMPLATE-UI-GESTAO_v2` (re-ancora navy, sai do azul) + worklist exata dos ~50 hardcodes — SEM aplicar; tua revisão antes de tocar arquivo |
| **P1.B** Lux L4 | ✅ mapa · ☐ execução | [P1B-MAPA](P1B-LUX-L4-MAPA-EXECUCAO-2026-07-11.md): 47 telas, ~40 visual-puro (~50 arqs hardcode, 42 azuis!), 7 feature-gaps roteados (R3) · 1ª onda = L4.0 rubric v2 + limpeza |
| **P1.C** CRM multiproduto E1/D3 | ✅ mapa · ⚠️ 3 GOs | [P1C-MAPA](P1C-E1D3-MAPA-EXECUCAO-2026-07-11.md): db-spine merge LIMPO · F2 = 4 conflitos c/ inbox A1.x · **gargalo = seed de produtos (1 só, confirmado ao vivo)** · lead manual grava product_id NULL · Traefik gestao.nexvy.tech fora do repo (ponto cego) |
| **P2.A** cérebro dos agentes (8 tabelas) | ☐ | aguarda fila |
| **P2.B/C/D** autopilot · arsenal · operação-dona | ☐ | |
| **P3.A** motor de leads (scrap) | ☐ confirmado CORE | vinculado à venda em piloto automático (ordem Marcelo 07-11) |
| **P3.B** Ads → **NexvyAds** | ✅ rota resolvida | frente própria (c5663f14); F1 dogfooding gestao.* em track paralelo; gate UI = merges P1.C |
| **P3.C/D** IG send · jornada | ☐ | |
| **P4/P5** paridade fina · débitos | ☐ | |
| Decolagem: nº Meta API salão-teste | ☐ | |
| Decolagem: funil E2E | 🔚 por último | ordem Marcelo |

> **Governança de execução (v2, ordem Marcelo 07-11 noite):** sessão = **Opus 4.8 Ultracode** (orquestra+revisa); subagentes = **Sonnet 5** default, **Opus** p/ porte 1:1/merge semântico/auditoria; Fable autorizado se complexidade exigir. Fan-out real via **Workflow**.

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
| P0.6 | Commit + push + deploy (frontend + edge `platform-webchat-inbox`) | ✅ `81e4406` · edge **v24** · bundle `index-8-60N2YO.js` HTTP 200 nos 4 hosts |

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
| P3.B | **Ads direcionados** — ✅ ROTA RESOLVIDA: **NexvyAds** (frente própria, sessão `c5663f14`) | F1 = plugar no CRM `gestao.*` (dogfooding, Meta primeiro). **Track paralelo AGORA** pro caminho-crítico humano (App Review Meta = semanas) + infra isolada (`ads_*`, OAuth, edges novas); **gate de montagem na UI = merges do P1.C** (evita colisão com Lux/ProductContext). Consequência: portar `marketing-connect/sync`/`meta-ads-validate` do V5 = **SUPERSEDED** (sai do delta) | — (frente própria) | doc: `_indice-planos/DISCOVERY-NEXVY-ADS-2026-07-11.md` |
| P3.C | **IG/Messenger** (reduzido — já conectou IG da operação) | `instagram-send` (sender real de DM ⚠️ verificar se outbound já funciona), `instagram-list-media`, `instagram-subscribe-fields` + resto do plano de 6 blocos | M | App Review Meta = gate |
| P3.D | **Dashboard de Jornada** (DELTA §🅲) | `lib/leadJourney` (760l) + `useLeadJourney` (11 hooks) + 10 componentes `journey/` → analytics origem/campanha/**criativo** | ~2-3d |

## P4/P5 — Paridade fina + débitos (o que sobrar)
| # | Item | Esforço |
|---|---|---|
| P4.1 | Features re-exposição: summaries deals/comissões, gamificação metas, Google Calendar connect, AICampaignAssistant, squad-performance comparativo | ~1.5-2d |
| P4.2 | Cadência: biblioteca de contextos (`context_id`) + editor rico no hub do produto | ~2-3d |
| P4.3 | Edges infra: suspend/reactivate org, onboarding-link, accept-invite-signup, admin-provision-users, fechar Meta-WA (media-upload + watchdog), 4 assist inbox/booking | ~4d |
| P5 | **Débitos 9.x distribuídos; sobra vira último P:** migration B7 (`opportunity_scan_schedules`) fire-now · afiliados fases 2-5 (branch stale — ⚠️ decisão) · Telefonia Salvy (⚠️ decisão) · WIP stash · ~~reconciliar HEAD do VPS~~ ✅ (07-11) · **versionar router Traefik `nexvy-gestao-grupo.yml` no repo** (hoje só no VPS; template hardcoda nexvybeauty.com.br — redeploy pode derrubar gestao.nexvy.tech) | var |

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

## ✅ Decisões RATIFICADAS (Marcelo, 07-11)
| # | Decisão | Efeito |
|---|---|---|
| R1 | **Ads = NexvyAds** (frente própria, sessão `c5663f14`; F1 dogfooding no gestao.*, Meta primeiro, agente HITL) | P3.B resolvido; portar `marketing-*` do V5 = **superseded** |
| R2 | **Scrap de leads = CORE**, vinculado à venda em piloto automático | P3.A confirmado |
| R3 | **Lux L4:** gap de *feature* numa tela → **roteia pro pacote dono**; L4 registra só o vínculo | evita execução dupla |
| R4 | **E1/D3:** separação **LÓGICA agora** (features/rotas/dados autônomos, mesmo bundle host-aware); **FÍSICA quando empilhar o 2º produto** no gestao.* — 🚨 **RADAR permanente** (memória gravada pra sessões futuras) | P1.C destravado |
| R5 | Subagentes = Opus 4.8; orquestração/revisão = Fable | governança |
| R6 | P1 autorizado; avanço gradual com placar | execução |

## ⚠️ Decisões AINDA pendentes (só você)
| # | Decisão | Bloqueia |
|---|---|---|
| 1 | `CallVoiceAIDialog` cai com a trilha de Voz? · `InboxProductSelector` substituído pelo ProductContext global? · `instagram-send` outbound é real? | limpa o delta |
| 2 | **Corte de lançamento:** Fase 1 completa antes de lançar, ou lançar com P0-P2 e P3-P5 fast-follow? | ritmo |
| 3 | Afiliados fases 2-5 · Telefonia Salvy — reimplementar ou descartar? | P5 |
| 4 | **Errata P4/D10** (Utmify → Fase 2 do NexvyAds, atribuição) — ato constitucional, aguarda teu "aprovo" na sessão Ads | NexvyAds F2 |

---

## Governança (Seção 14)
- **Este é o registro vivo único.** Novos itens entram AQUI com dono+done+saiu; nada de doc novo paralelo.
- Docs superseded receberão errata apontando pra cá.
- Estado de execução por item: atualizado neste doc conforme os P's fecham (com prova).

---

*Fontes absorvidas: STATUS-GO-LIVE-07-11 · DELTA-PORTABILIDADE-100-07-11 (5 auditorias vs `oficial-vendus-v5`) · LEVANTAMENTO-07-08 · prioridades ditadas pelo Marcelo 07-11.*
