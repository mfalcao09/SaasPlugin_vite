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
| 🐛 **ERRATA host de deploy (correção Marcelo 07-11)** | ✅ **CORRIGIDO** | eu deployei/provei P2.A-2 contra `gestao.nexvybeauty.com.br` (host ERRADO/fantasma). Canônico = **`gestao.nexvy.tech`** (mesmo container `nexvy-beauty-svc`, então P2.A-2 JÁ estava live no canônico — o bundle velho que vi era cache de aba). Fantasma **removido**: template `fd1522e` + Traefik vivo (404) + **DNS deletado no Cloudflare**. Deploy futuro: gate contra `gestao.nexvy.tech`. Memória [[gestao-host-canonico-nexvy-tech]] |
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
| **P3.B** Ads → **NexvyAds** | ✅ rota + **decisão de porte RATIFICADA (07-12)** | 3 auditorias fecharam: V5 é read-only real (OAuth+Graph+cofre = ouro, **ZERO escrita**) → veredito **PORT read-product + remap product-scoped (mecânico) + BUILD escrita/agentes**. Errata §11.9 (discovery nunca auditou o V5). Conexão = **Login for Business/config_id** (não "Embedded Signup"=WhatsApp). **Orquestrado NESTA sessão** (ordem Marcelo). F1 kickoff a seguir |
| **P3.C/D** IG send · jornada | ☐ | |
| **P4/P5** paridade fina · débitos | ☐ | |
| Decolagem: nº Meta API salão-teste | ☐ | |
| Decolagem: funil E2E | 🔚 por último | ordem Marcelo |
| ✅ **07-12 Consolidação (4 ondas)** | ✅ **DONE+DEPLOY+PROVADO** | Jornada + Radar/Follow-up + quickwins(Throughput/Dialogs) + cadence-hide · PRs [#31](https://github.com/mfalcao09/SaasPlugin_vite/pull/31)+[#32](https://github.com/mfalcao09/SaasPlugin_vite/pull/32) → main `0ba4dcc` · verify 3 lentes (runtime/migration/security SAFE) + fix RISKY getBottlenecks · **bundle `index-DBdjsTTE.js`** gate anti-fantasma + curl externo 200 · 🐛 build falhou 1x (comentário `*/6` quebrava esbuild, tsc tolerou) → fix #32 · lição [[gate-predeploy-build-nao-so-tsc]] |
| **P3.D Jornada do Lead** | ✅ **portada 1:1 + DEPLOY** | agente `a04b69b2`: journey/ (lib+hook+10 comp) + migration `20260712_journey_events` **APLICADA** (tabela+8 triggers+RLS, 0 linhas) + nav Vendas→Atendimentos · atribuição CTWA plugável · fast-follow: hardening triggers (wrap BEGIN/EXCEPTION) + COALESCE deal |
| Voz IA (Fase 2) — chaves | 🟡 XAI setada · ⏳ OpenAI | `XAI_API_KEY` no Supabase (digest `48c44c…`, valor nunca exposto) · `OPENAI_API_KEY` aguarda Marcelo criar conta · módulo code-complete, deploy espera as 2 chaves |

> **Governança de execução (v2, ordem Marcelo 07-11 noite):** sessão = **Opus 4.8 Ultracode** (orquestra+revisa); subagentes = **Sonnet 5** default, **Opus** p/ porte 1:1/merge semântico/auditoria; Fable autorizado se complexidade exigir. Fan-out real via **Workflow**.

---

## 🔒 TRAVA 1 — Validação do atendimento (registro COMPLETO desde 07-11 · nada se perde)
> Releitura de TODOS os submits do Marcelo desde *"Estou atacando a partir de agora a trava 1: validação do atendimento como um todo"*. Este bloco é o anti-retrabalho: nada some.

| # | Apontamento do Marcelo | Status 07-12 |
|---|---|---|
| T1.1 | Cards KPI: uppercase→Title Case (6 comp) | ✅ **DEPLOY** PR#29 `DK1x3twv` |
| T1.2 | Radar IA: botão fora do scroll + simetria dos cards | ✅ **DEPLOY** PR#30 `Cjchj127` (refinado em T1.5) |
| T1.3 | Cards da tela atendimento: alinhamento dos textos piorou | ✅ coberto por T1.1 (KpiCard h-full + rodapé mt-auto) |
| T1.4 | Follow-up: card "Status das réguas ativas" desalinhado | ✅ feito · 🔄 deploy consolidação · ⚠️ decisão: Title Case do título (manti sentence p/ simetria com irmãos) |
| T1.5 | Radar IA: botão colado no FUNDO + box maior + rebalancear boxes + horários flexíveis | ✅ feito (a81e0a1) · 🔄 deploy consolidação · ⚠️ não validado no browser |
| T1.6 | Jornada do Lead: não estava em gestao.* → portar 1:1 (dashboard + tabela) | ✅ portada tsc 0 (a04b69b2) · 🔄 deploy + migration journey |
| T1.7 | Throughput de campanhas: portar | ✅ código pronto · 🔄 deploy consolidação |
| T1.8 | Nova Campanha + Nova Cadência → abrir em Dialog sobre a lista | ✅ código pronto · 🔄 deploy consolidação |
| T1.9 | cadence-api: aba "API" aponta pro edge tenant (stub, não vaza) → esconder | ✅ auditado + escondido · 🔄 deploy consolidação |
| **T1.10** | **Menu CAPTAÇÃO: itens quebrados — inspeção vendus×gestao (ex.: Novo Formulário sem "Com IA")** | 🟡 **AUDITADO 07-12 — 8 gaps mapeados** (bloco abaixo). Exemplo do Marcelo CONFIRMADO + 7 outros. Correção = "onda Captação" pós-consolidação. (Errata: minha afirmação anterior de "submenu idêntico" estava ERRADA — era menu top-level, não telas.) |
| **T1.11** | **Instagram Flows: portado ou não?** | 🔴 **NÃO portado** — a portar (esforço M) |
| T1.12 | Voz IA: portar as-is (Grok) + anotar ElevenLabs p/ próxima onda | ✅ decidido · `XAI_API_KEY` setada · ⏳ OpenAI · ElevenLabs → Fase 2 |
| T1.13 | Meta Ads: portar 100% Vendus → NexvyAds | ✅ **veredito ratificado 07-12** (PORT read-product + BUILD escrita/agentes) — ver P3.B |
| **T1.14** | **Screenshots ANTES×DEPOIS de cada correção visual** | 🟡 **devido** — tooling instável (claude-in-chrome/devtools desconectados); tentando via chrome_control |

**Abertos reais desta trava:** T1.10 (captação — 8 gaps, ver abaixo) · T1.11 (Instagram Flows — portar) · T1.14 (screenshots antes×depois) · decisão Title Case (T1.4). O resto = feito, aguardando o deploy da consolidação.

### 📋 T1.10 — Gaps de Captação (audit 07-12 com evidência de código)
| # | Gap (Vendus tem → gestao não) | Esforço | Tipo | Prioridade |
|---|---|---|---|---|
| **C1** | **"Novo Formulário" sem "Com IA"** (o exemplo do Marcelo) — edge `form-generate-ai` **já existe** | P–M | **UI-only** | 🔥 alta (barato) |
| **C2** | Form **"Link público em breve"** — botão morto (form que não publica não capta). ⚠️ checar: `/f/:slug`+`platform-form-submit` do PR#26 podem já existir → viraria só fiação | M→P? | edge+rota (ou só wiring) | 🔥 alta |
| **C3** | **Novo Quiz sem "Com IA"/"Template"** (só diálogo genérico de funil) — edge `quiz-generate-ai` **já existe** | M | UI-only(AI)+porte template | alta |
| C4 | WhatsApp **"Builder visual" morto** + canal não conectado | G | edge+UI+provider | média (pós-MVP) |
| C5 | **FormResponseDetail** sem "Chamar IA / Inserir Cadência / Ver Lead" (3 botões) | M | UI+edge | média |
| C6 | **"Ligação Web" (VoiceCall) inexistente** no gestao | G | feature completa | baixa (overlap Voz IA Fase 2) |
| C7 | Quiz campo **"Upload" = placeholder** | P | UI+storage | baixa |
| C8 | Comentário **stale** (Templates/Results/Analytics ditos TODO, mas prontos) | P | errata doc | trivial |

**Scoping:** SEM bug de org_id — captação é product-scoped/super_admin de propósito. **Recomendação:** onda Captação = C1+C3+C5+C7+C8 (UI-only/barato, edges prontas) + checar C2; C4/C6 pós-MVP (C6 encosta no Voz IA da Fase 2).

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
| **P2.B — Autopilot venda** (scoping 7 scouts `wpzun2vbd`) | ✅ **runtime JÁ DONE** · 🔧 2 gaps | 🎉 ACHADO: o runtime de venda **já existe e funciona** em `platform-sales-brain` (1255 linhas, product-scoped, NÃO há `agents-engine` neste repo). Já entregues: `computeQcrScore` determinístico (5.1), `founder_status` READ+WRITE (2.4), Duda→Bia + `[PASSAR_BIA]` (5.3), LP `SalesPage`/`/vendas` + CTA wa.me+UTM (F3), atribuição `?src=` (appendSellerRef). **Gaps reais:** (1) brain-connect estruturado (obj/knowledge tabelas P2.A) → **PR [#24](https://github.com/mfalcao09/SaasPlugin_vite/pull/24)** code-complete, **verify adversarial 2/2 SAFE** (no-op enquanto tabelas vazias) — deploy espera goldens; (2) humanizer wire (muda cadência do bot LIVE) → **também no PR #24** (`0d08c59`, fallback-safe, coluna `humanization` confirmada 5/5 agentes) = deploy espera goldens. **HITL Marcelo:** goldens precisam `BRAIN_INTERNAL_SECRET` (✅ **setada 07-13**, destravado) · 1 pagamento-teste Cakto (**errata: é E2E checkout→provisionamento SEPARADO, NÃO pré-req dos goldens** — os goldens são 100% simulados) · oferta LP postergada (não bloqueia) |
| **A1 — Composer do atendimento** (scoping `wn2u8jx5o`) | ✅ **JÁ PRONTO** (não era porte) | composer/inbox de plataforma 100% portado + wireado: ChatArea+ChatInput, QuickReplies (`/`), QuickActionBar, InternalNotes (não é disabled), JourneyTimeline, Forward, Schedule, Audio, Media — paridade global **1.92× linhas** (≫0.6). Se sobra incômodo = bug/UX no que existe, não feature faltando · ⏳ aguarda sintoma do Marcelo (ou "ok, pronto") |
| **B11 — religação (4 grupos)** | ✅ **DONE+DEPLOY+PROVADO** | PR [#25](https://github.com/mfalcao09/SaasPlugin_vite/pull/25) `133f3d4`: generate-agent-ai + objections-SSE (`usePlatformHandleObjection`) + cadence-deeplink + **nova edge `platform-optimize-product-field`** · tsc 0 + build verde + **adversarial 2/2 SAFE** (auth/SSE/escopo/anti-XSS) · edge ACTIVE (401 anon=gate) · **frontend `index-G_YR9pa4.js`** em gestao.nexvy.tech+app · maioria dos "TODO(edge)" eram STALE · 4 bloqueados-externos (CatalogSync/WhatsApp/Google Calendar) NÃO tocados |
| **B11 — 2ª leva (5 grupos codáveis-já)** | ✅ **DONE+DEPLOY+PROVADO** | PR [#26](https://github.com/mfalcao09/SaasPlugin_vite/pull/26) `0b7bc41`: file-upload Cérebro (`sourceType=file`) · doc-import agente (edge nova) · test-chat (`product_agent_id` no webchat-bot) · booking-cancel (dispatcher `action=cancellation`) · **forms públicos** `/f/:slug` (edge nova `platform-form-submit`) · migration cancelamento APLICADA (coluna+CHECK, tabela vazia) · **adversarial RISKY→4 defeitos corrigidos** (verify_jwt público, injeção PostgREST, 403 cancelamento, ações client-dictated) → re-verificado · 5 edges deployadas · **frontend `index-DJ1QAL5Z.js`** · prova runtime: form-submit público **400** sem auth (não 401), import-agent **401** anon (gate) · TODO pré-go-live: rate-limit durável/captcha na edge pública |
| **B11 — 3ª leva (3 grupos)** | ✅ **DONE+DEPLOY+PROVADO** | PR [#27](https://github.com/mfalcao09/SaasPlugin_vite/pull/27) `90d9de4`: agent-connections (**tabela `platform_crm_agent_connections` APLICADA** — RLS super_admin/CASCADE/UNIQUE, revisada no banco antes de aplicar — + hook + AgentEditor/AgentCard + sync no create/update) · booking-notif cleanup (removeu controle morto, sem schema) · catalog-uploader (bucket product-documents) · tsc 0 + build verde + **adversarial 2/2 SAFE** (colunas vs tabela, wiring, cleanup, uploader) · **frontend `index-BMibYS0z.js`** · nota pré-existente (fora da leva): self-XSS de href em CatalogManager (super_admin-only, 1-linha) |
| **AdminExecutivePanel + WidgetFlowTab** | ✅ **DONE+DEPLOY+PROVADO** | PR [#28](https://github.com/mfalcao09/SaasPlugin_vite/pull/28) `bca806f`: **AdminExecutivePanel** (stub→painel) — tabela `platform_crm_admin_monitored_products` **APLICADA** + edge `platform-admin-executive-report` (métricas reais leads/conversas/vendas/pipeline + síntese IA, gate super_admin, fallback determinístico, anti-XSS) · **WidgetFlowTab** — canvas visual plugado (nós+conexões; reusou FlowCanvas funnel-typed, o PlatformCrmFlowCanvas era incompatível) · **CaptureManager**: revertido (Opção A — telas já são menus; ⏳ B disponível) · tsc 0 + build verde + deno 0 + **adversarial 2/2 SAFE** · fix: pipeline usa deals não-terminais (schema não tem 'open') · edge 401 anon=gate · **frontend `index-BuVdnIGW.js`** · débitos: cron do relatório diário · reconciliar PlatformCrmFlowCanvas morto · deals-model sem estado ativo |
| P2.C | **Arsenal agentes** (Frente 8) | 33 itens playbook §12 (estado-do-contato, abandono→resgate, handoffs, 10 testes de aceitação) — dedup contra o que F2 já entregou antes | G |
| P2.D | **Operação da dona ∥** (Frente 3) · 🗺️ **BLUEPRINT 07-13** | B3 pós-compra cria instância + e-mail QR (clientes = **Evolution/QR**, confirmado) · F6 pipeline de ingestão (`MESSAGES_SET`→`wa_timestamp`→dedupe→clientes) · C4 watcher · C2/C3 painéis · LGPD onboarding · **blueprint aterrado** (workflow 5+1 agentes): 3 pernas NÃO existem (instância Evolution auto · e-mail que sai — **cron da fila pgmq não existe** · ingestão F6) + agente de onboarding (function `platform-onboarding-brain` dedicada) · **Fases 0→3 buildáveis SEM o número do salão** · **4 decisões pendem Marcelo: D1 domínio de e-mail · D2 host da Evolution · D3 canal do agente · D4 janela+consentimento do backfill** | G |

## P3 — Crescimento + canais + analytics (o "alto fluxo" que você exige)
| # | Frente | Itens | Esforço | Nota |
|---|---|---|---|---|
| P3.A | **Motor de leads (C9 scrap)** — CORE · 🔄 **MUITO avançado (07-13)** | Nível 1+2 **LIVE** (keyword + classificador 4 baldes/4 camadas + `is_seed`) · **UI Prospecção** cockpit (keyword search · **colar handles** · **lixeira LGPD-safe** · **WhatsApp manual** · reclassificar · colunas · "porquê") · edges **leads-import-profiles** + **leads-import-handles** (PRs #54/#55/#56, no main+prod) · **859 leads BR-beleza no banco** (258 qualif · 174 afiliado · 47 sementes · 334 c/ WhatsApp) · **vídeo→Gemini→651 leads** · parede = teto mensal da conta MCP (upgrade US$29 à noite → meta 10k) · Nível 3/query-actor **congelados** (pós-receita) | G | pendente: campanha 10k (op) · botão "subir vídeo" (Gemini, backend = import edge, metade pronta) |
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

## 🎯 ONBOARDING PÓS-COMPRA — SPEC COMPLETO (Marcelo, 07-13) · HANDOFF-CRÍTICO
> Fonte-verdade do onboarding. Uma sessão 0-contexto constrói a partir daqui. Supersede o enquadramento do BLUEPRINT do workflow (que tinha um erro conceitual no canal — corrigido abaixo).

### Respostas do Marcelo às decisões D1–D4
- **D1 — e-mail:** domínio **POR PRODUTO**. Beauty → disparar de **`@nexvybeauty.com.br`**. Integrar **Resend**. TAREFA (Claude): criar o passo-a-passo completo de integração + o que fica pendente com o Marcelo (ver §Passo-a-passo Resend). HITL Marcelo: criar conta Resend + acesso ao DNS de `nexvybeauty.com.br`.
- **D2 — Evolution:** **continua no KVM4**, sem novidade (já roda lá).
- **D3 — canal do agente:** ⚠️ **ERRATA da análise anterior.** NÃO é número oficial genérico. O canal é **o MESMO thread da venda**: a cliente comprou usando o número DELA (salão ou pessoal) em contato com NOSSO número de vendas Nexvy. Esse mesmo par (**nosso número ↔ número dela**) continua no onboarding — é um **handoff Duda (vendas) → agente de onboarding (Customer Success) dentro da MESMA conversa**, até a cliente escolher trocar de número. **+ REUSAR o modelo de onboarding de criação de tenant (como admin) do Vendus v5** (já está no código). TAREFA (Claude): pesquisar a fundo e trazer EXATAMENTE como está no Vendus v5, pra analisar com o Marcelo **ANTES de codar**.
- **D4 — LGPD:** inserir declaração de que a cliente tem **consentimento legítimo** pro uso dos dados pessoais, e que **nós somos OPERADORES e ela é a CONTROLADORA** dos dados.

### O fluxo (8 etapas — exatamente como o Marcelo quer)
1. **Tela pós-checkout (sucesso) — IMPORTANTÍSSIMA.** Pago → cliente vai pra NOSSA tela de sucesso, com tudo na palma da mão + próximos passos detalhados.
2. **E-mail** pro endereço do checkout: infos de pagamento + infos do onboarding.
3. **Mesmo conteúdo por WhatsApp** pro WhatsApp da cliente. Amarrar cliente-WhatsApp × link-de-pagamento. DÚVIDA ABERTA (resolver): telefone pré-preenchido ao clicar no link (é possível?)? pedir o WhatsApp do atendimento? e se ela informar outro?
4. **Handoff Duda → agente de onboarding (CS)** no disparo por WhatsApp. O agente guia passo-a-passo, envia **prints da tela de onboarding** (imagem "demo" limpa/simulada). **O sistema informa ao agente em que FASE do onboarding a cliente está** (não é monitorar a tela; é saber "ela está na página 5").
5. **Playbook de dúvidas POR PÁGINA** do onboarding — o agente atende plenamente cada etapa.
6. **Wizard de onboarding** (plataforma NÃO liberada ainda; ela está só no wizard). **Última página = QR Code da instância Evolution dela** + orientações de leitura. Botão "pular leitura" possível, MAS deixar claro que o negócio "só começa a funcionar" quando o onboarding completo é feito (escanear o QR é parte disso).
7. **Tela de loading** (frases de incentivo: "estamos preparando tudo pro seu negócio alcançar o próximo nível", "hora do seu salão decolar", "preparando pra suas clientes terem o melhor atendimento"…) **enquanto a Evolution lê as conversas, o sistema reconhece os dados, puxa infos e MONTA o sistema da cliente** (ISTO é o código a fazer = F6). Pronto → **tela de sucesso** ("começar um novo tempo no meu negócio") → clica → wizard fecha. Ao fechar, o agente **explica os menus**, onde estão as funcionalidades, manda prints se houver dúvida.
8. **Agente acompanha** pós-onboarding. **Definir régua de follow-up de onboarding** — por quanto tempo o agente pergunta se há dúvida antes de considerar o salão **efetivamente implantado**.

### Passo-a-passo Resend (D1) — TAREFA Claude (detalhar/executar)
Rascunho: (1) conta/projeto Resend; (2) adicionar domínio `nexvybeauty.com.br`; (3) publicar SPF/DKIM/DMARC no DNS (Cloudflare) do `nexvybeauty.com.br`; (4) verificar domínio no Resend; (5) setar `RESEND_API_KEY` no Supabase; (6) criar cron `process-email-queue` (HOJE NÃO EXISTE → e-mail nunca sai); (7) trocar branding Vendus→NexvyBeauty em `send-transactional-email/index.ts:8,12,16`. **PENDENTE Marcelo:** criar a conta Resend + dar acesso ao DNS.

### Erro conceitual corrigido (crítico pro build)
O agente de onboarding **não é um brain novo genérico num número oficial**. É: (a) o **handoff dentro da conversa de vendas existente** (Duda→CS, mesmo par de números); (b) o **wizard de onboarding in-app** (as 8 telas, com fase rastreável); (c) a **máquina que monta o sistema** (Evolution lê histórico → F6 → carteira). **Reusar o onboarding-de-tenant do Vendus v5** (já no código) como base.

---

## 🔀 PROSPECÇÃO ATIVA — reorg de menu (Marcelo 07-13)
Transformar "Prospecção" (hoje sob **Captação**) num **menu próprio: "Prospecção Ativa"**, com páginas:
- **Buscas (ou Scraps)** = a página atual, **exatamente como está** (keyword + colar handles + lixeira + whatsapp-manual, segregado por extração).
- **Importação por vídeo** = subir o vídeo da IA → analisa/trata/sanitiza → vira leads (o que hoje o Claude faz na mão via Gemini + import edge).
- **Base consolidada** = TODOS os leads unificados numa base única (mantendo a segregação por scrap como opção/filtro).
- SUGESTÕES minhas: página **Sementes** (as ≥50k pra minerar) + **Lixeira/Excluídos** global.

**Minha opinião [Provável]:** EXCELENTE ideia — resolve o problema real (hoje o lead vive preso a 1 scrap). Recomendo a **Base consolidada como uma VIEW** que une todos os `platform_crm_extracted_leads` do produto, **dedup por handle/telefone**, preservando o override manual (segment/telefone/exclusão). Detalhar o design na execução.

---

## 🤝 HANDOFF 0-CONTEXTO (2026-07-13) — pra nova sessão controladora (outra conta Anthropic, mesmo Mac)
> Contexto: o limite semanal desta conta está em ~8% (92% usado) e degrada. Esta seção deixa TUDO pronto pra continuar sem fricção.

### VIVO em prod (NÃO re-fazer)
- Prospecção (C9) em `gestao.nexvy.tech`: keyword search · colar handles · lixeira LGPD · whatsapp-manual · reclassificar · colunas · "porquê". Bundle atual `index-DIffoox2.js`.
- Edges no main+prod: `leads-extraction-start/webhook`, `leads-import-profiles`, `leads-import-handles`. PRs #54/#55/#56 merjados.
- Migrations aplicadas: extracted_leads (qualification_layers/segment/is_seed) + `exclude_lixeira` (coluna `excluded_at` + tabela `platform_crm_lead_excluded`).
- **859 leads** no banco (product_id `806b5975-e268-402e-a65c-9e9503271041`): 258 qualif · 174 afiliado · 47 sementes · 334 c/ WhatsApp.
- `BRAIN_INTERNAL_SECRET` setada no Supabase (destrava goldens).
- Deploy: `ssh vps-hostinger` → `cd /opt/stacks/saasplugin-vite && git pull --ff-only origin main && ./infra/deploy-vps.sh NexvyBeauty nexvy-beauty gestao.nexvy.tech`. Build gate = `npm run build` (NÃO tsc). Edge deploy = `supabase functions deploy <fn> --project-ref fzhlbwhdejumkyqosuvq`.

### PENDÊNCIAS construíveis (respostas do Marcelo 07-13) — ORDEM
1. **Onboarding pós-compra (B3/B4)** — spec na seção acima. Fases 0→3 buildáveis SEM o número do salão. ✅ **Vendus v5 pesquisado (07-13 · doc `tasks/VENDUS-V5-ONBOARDING-TENANT-RESEARCH-2026-07-13.md` · repo `/Users/marcelosilva/Projects/GitHub/oficial-vendus-v5`):** já EXISTE lá um **`ImplantacaoWizard` (7 etapas: Empresa → Horários → Negócios [c/ "Cérebro": website/YouTube/FAQ/treino] → Agentes IA → Setores → Equipes → Revisão)** — estado em `onboarding_submissions` (`status` draft/submitted/applied/expired + payload jsonb inteiro, autosave 1500ms via RPCs SECURITY DEFINER), termina no edge **`apply-onboarding`** que grava nas tabelas reais + seta `organizations.onboarding_completed_at` + `onboarding_locked=true` (**é o que "libera" a plataforma** — bate com o passo 6 do Marcelo). Rotas `/admin/implantacao` (auth) e `/implantacao/:token` (público, session_token). **NÃO tem** etapa de QR/WhatsApp (só campo texto de contato). **→ PLANO: PORTAR o `ImplantacaoWizard` 1:1 pro NexvyBeauty e ADAPTAR:** (a) +etapa final = **QR da instância Evolution** (spec passo 6); (b) +**rastreio de FASE** exposto pro agente ("ela está na página 5", spec passo 4); (c) +**handoff Duda→CS no MESMO thread** (D3); (d) +**tela loading → F6 (Evolution lê histórico → carteira) → sucesso** (spec passo 7); (e) +declaração LGPD operador/controlador (D4). **ANALISAR o doc COM o Marcelo ANTES de codar.**
2. **Rodar os goldens** — `BRAIN_INTERNAL_SECRET` já setada. Deploy `tmp-eval-agents` + chamar com `x-brain-secret` + reportar a régua ≥90%. Marcelo quer eliminado LOGO.
3. **Página "Importação por vídeo"** (era "botão subir vídeo") — dentro do menu Prospecção Ativa. Backend = edge Gemini (extrai handles) → `leads-import-handles` (já existe).
4. **Base consolidada** — nova página no menu Prospecção Ativa (VIEW dedup).
5. **Onda Captação** (T1.10) — FINALIZAR DEFINITIVAMENTE (ordem enfática): C1 Novo Formulário "Com IA" (edge `form-generate-ai` existe) · C3 Novo Quiz "Com IA" (edge `quiz-generate-ai` existe) · C5 FormResponseDetail 3 botões.
6. **Instagram Flows** (T1.11) — portar. FINALIZAR DEFINITIVAMENTE (ordem enfática).
7. **P2.C Arsenal de Agentes** — Claude deve mapear o que falta (Marcelo perguntou se falta orientação/info) e responder.
8. **P3.C — ERRATA (Marcelo 07-13):** o envio pelo inbox do IG **já foi validado (envia + recebe)** → o **App Review da Meta NÃO é gate de lançamento**; é melhoria futura. Atualizar o status (deixou de ser bloqueador).

### HITL Marcelo (só ele)
- **Resend** (D1): criar conta + DNS de `nexvybeauty.com.br`.
- **Número do salão-teste:** comprado na **Salvy**; visível via API que já temos. Marcelo tem DÚVIDA: qual empresa está cadastrada na Salvy → Claude deve responder via API.
- **Cakto:** criará produto-teste DEPOIS de tudo pronto → **teste E2E do onboarding** (RADAR: teste final).
- **Conta MCP** → upgrade US$29 (à noite) → meta 10k leads.
- **Decisão de corte de lançamento** (Fase 1 completa vs. lançar + fast-follow).

---

## 📡 C9 — MOTOR DE LEADS (essencial importado do PLANO-C9 v2 · 07-13)
> Absorve `_indice-planos/PLANO-C9-MOTOR-EXTRACAO-LEADS-2026-07-12_v2.md` (que recebe errata apontando pra cá). Registro vivo = ESTE doc.

### Arquitetura 3 níveis
- **Nível 1 — Descoberta (keyword):** ✅ LIVE (acha leads diretos + sementes).
- **Nível 2 — Classificador de segmento:** ✅ LIVE (4 baldes + 4 camadas).
- **Nível 3 — Expansão em grafo** (semente → scrape seguidores → classifica → loop): ❄️ CONGELADO (exige conta IG logada/farm).

### 4 segmentos (`_shared/lead-geo.ts::classifyLeadSegment`)
- 🟢 **salao_cliente** (beleza BR + contato → `qualified`) → venda/ads
- 🔵 **afiliado_infoproduto** (curso/mentoria: kiwify/hotmart, "X alunas") → recrutamento (ativa quando o programa 30/10 estiver 100% no código)
- 🟡 **revisao** (beleza sem confirmar BR/contato) → triagem humana
- ⚪ **descarte** (fora do mercado) → lixeira + TTL (não hoardeia PII estrangeira)
- **4 camadas AND:** ICP(beleza) · Idioma(lusófono, tolerante) · GEO(BR fino, sem forjar +55) · Telefone(bio + todos os links, wa.me priorizado).
- **is_seed** ⊥ segmento: `follower_count ≥ 50k` → dispara Nível 3.

### Porta A — multi-vetor de descoberta (dedup por handle)
- **A1** username/nome → `apify/instagram-scraper` (searchType=user) — PRIMÁRIO (~$0,0027/perfil).
- **A2** conteúdo da bio (Google SERP) → `easy_scraper/instagram-profiles-finder` — **FÁBRICA DE SEMENTES** (~97% beleza/BR; snippet traz seguidores, não bio → precisa enriquecer). ~$0,0015.
- **A3** seguidores de semente → follower-scrape (Nível 3, congelado).
- **Handles colados / vídeo** → `apify/instagram-profile-scraper` (usernames[]) via edge `leads-import-handles`.
- **DESCARTADOS:** data-slayer Enriched ($0,012, 4,4× caro), Basic+profile ($0,0051, dominado).

### Ranking de assertividade de keyword (dados REAIS do banco · 07-13 · 181 perfis do conjunto-ouro)
| Tier | Keywords | % que vira salão-cliente qualif |
|---|---|---|
| **1 (ouro)** | `salão de beleza` (59%) · `escova progressiva` (54%) · `esmalteria` (48%) | 48-59% |
| **2 (médio)** | `cabeleireira` | 37% |
| **3 (FÁBRICA DE AFILIADO)** | `design de sobrancelhas` (27%) · `alongamento de unhas` (26%) · `micropigmentação` (17%) | baixo p/ salão, mas puxam MUITO infoproduto/curso |
> **A keyword define QUE segmento você pesca:** salões → Tier 1; afiliados (programa 30/10) → `alongamento de unhas`/`micropigmentação`. ⚠️ Amostra pequena (23-28/keyword); a varredura grande (6 grupos temáticos, ~1,6k perfis) está TRAVADA atrás da parede da conta MCP → recalcular os tiers com volume real após upgrade US$29.

### Query-actor (follower-search): ❄️ CONGELADO
Endpoint `friendships/{id}/followers/?query=` filtra server-side MAS exige `sessionid` autenticado (401 provado ao vivo). Custo real = farm de contas IG logadas + ban-management (ToS), não proxy. Só pós-receita.

### LGPD (base + postura) · Custo MVP
Art.7º §4 (dados públicos) + finalidade=`audiencia_ads` + opt-out (Art.18, respeitado no staging) + consumo segment-gated + descarte com TTL. Afiliado B2B = base ainda mais sólida.
Custo (orçamento R$500): A1 bateria ~$0,65 · A2 ~$0,46/run · enriquecimento ~$8 → total scrap **~R$50-70** · sobra **~R$430** p/ Meta ads.

---

## 📥 PROSPECTAGRAM — extração pela TELA (receita PROVADA · 07-13)
> **Por quê:** o **export CSV do prospectagram corrompe ~47% das linhas** (vírgula sem aspas → colunas embaralhadas, `followerCount` de 5,5 trilhões). Ler o **DOM renderizado sai LIMPO**. Provado 07-13: 134 leads, **78% com telefone íntegro** (vs 63% no CSV limpo).

- **Fonte:** `https://app.prospectagram.com.br/dashboard` (Chrome **LOGADO do Marcelo**). **Ferramenta:** `Control_Chrome` (`execute_javascript`) — o `claude-in-chrome` estava desconectado. Achar a aba com `list_tabs` (ex.: id 1303038085).
- **⛔ PROIBIDO:** NUNCA clicar em **"Perdido"** e **"Ganho"** (mudam estado do CRM, irreversível). Extração é **100% read-only via JS — zero clique**.
- **Estrutura:** NÃO é tabela — são **cards `.glass-card`** (600px). Contador "Contato" mostrava **502 leads**. Cada card: @handle (`<a>` cyan) · "Palavras-chave - kw - N" · POSTS/SEGUIDORES/SEGUINDO · nome · bio (contém o telefone) · site · botões. Telefone limpo = `<a href*="wa.me">` (fallback: regex na bio).
- **⚠️ Lista VIRTUALIZADA** (cards montam/desmontam no scroll) → scroll FINO + acumular num Map por handle + dedup. Scroll grosso pega só ~130.
- **Control_Chrome NÃO retorna async** → o script guarda em `window.__leadsClean` e a gente lê de volta numa 2ª chamada.

**Fluxo quando o Marcelo der o "vai" (base 100% scrapeada):** `list_tabs` → rodar o acumulador → ler `window.__leadsClean` → **classificar** pelo nosso motor (segmento/geo/qualified) → **dedup contra os 859** (handle/telefone) → importar na **Base consolidada**.

**Script provado (colar no `Control_Chrome.execute_javascript`, depois ler `window.__leadsClean`):**
```js
(async () => {
  const num=s=>{s=(s||'').replace(/[^\d]/g,'');return s?parseInt(s):null;};
  const BTN=new Set(['Ligar','WhatsApp','E-mail','Email','Direct','Abordei','Perdido','Ganho','Qualificar','Abordar','Indicar','Ferramentas','Pesquisar','Aberto','Sair']);
  const map=new Map((window.__leadsClean||[]).map(x=>[x.h.toLowerCase(),x]));
  const grab=()=>document.querySelectorAll('.glass-card').forEach(card=>{
    const a=card.querySelector('a'); const handle=(a?.innerText||'').trim();
    if(!/^@[a-z0-9._]{2,30}$/i.test(handle))return;
    const wa=card.querySelector('a[href*="wa.me"],a[href*="whatsapp"]')?.href||null;
    const web=[...card.querySelectorAll('a[href^="http"]')].map(x=>x.href).find(h=>!/instagram\.com|wa\.me|whatsapp/.test(h))||null;
    const L=(card.innerText||'').split('\n').map(s=>s.trim()).filter(Boolean);
    const kwm=(L.find(l=>/Palavras-chave/i.test(l))||'').match(/Palavras-chave\s*-\s*(.+?)\s*-\s*\d+/i);
    const idx=t=>L.findIndex(l=>l.toUpperCase()===t); const iF=idx('SEGUIDORES'),iG=idx('SEGUINDO');
    let bio=null; if(iG>=0){const r=L.slice(iG+2);const st=r.findIndex(l=>BTN.has(l));bio=(st>=0?r.slice(0,st):r).join(' ').trim()||null;}
    let phone=null; if(wa){const m=wa.match(/(\d{10,13})/);if(m)phone=m[1];}
    if(!phone&&bio){const m=bio.match(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/);if(m)phone=m[0].replace(/\D/g,'');}
    map.set(handle.toLowerCase(),{h:handle,k:kwm?kwm[1].trim():null,s:iF>0?num(L[iF-1]):null,p:phone,w:web,n:(iG>=0&&L[iG+1]&&!BTN.has(L[iG+1])?L[iG+1]:null),bio:(bio||'').slice(0,200)});
  });
  const sc=document.scrollingElement||document.documentElement;
  let last=map.size,stable=0;
  for(let i=0;i<300&&stable<12;i++){grab();sc.scrollTop+=600;await new Promise(r=>setTimeout(r,220));if(map.size===last)stable++;else{stable=0;last=map.size;}}
  grab(); window.__leadsClean=[...map.values()];
  window.__grabDone={total:window.__leadsClean.length,comTel:window.__leadsClean.filter(x=>x.p).length};
  return 'ok';
})()
// 2ª chamada p/ ler: JSON.stringify(window.__grabDone)   |   window.__leadsClean = os dados
```
> Campos: `h`=@handle · `k`=keyword · `s`=seguidores · `p`=telefone(E.164) · `w`=site · `n`=nome · `bio`. Mapear pro `buildLeadCard`/`qualifyLead` no import.

---

## 🎯 HANDOFF EXTRAÇÃO DE LEADS — orientações pra SESSÃO NOVA (07-13 · OFICIAL)
> O Marcelo monta a base por **3 vetores em paralelo**. TODOS convergem pro MESMO pipeline: extrair (limpo) → classificar (nosso motor) → dedup vs base → **Base consolidada**. NÃO refazer o que já roda.

### Vetor 1 — Prospectagram (⏸️ AGUARDANDO o "vai" do Marcelo)
- **STATUS: BLOQUEADO no sinal do Marcelo.** Ele ainda está scrapeando a base do prospectagram. Quando terminar, ele dá o **"vai"**. **SÓ AÍ baixar** — não antecipar.
- **Como:** seguir a receita da seção **"📥 PROSPECTAGRAM"** (acima) — `Control_Chrome` (não `claude-in-chrome`, que caiu), cards `.glass-card`, **scroll fino acumulador** (lista virtualizada), ⛔ **NUNCA clicar "Perdido"/"Ganho"**. Ler de `window.__leadsClean`.
- Depois: classificar + dedup vs 859 (handle/telefone) + importar na Base consolidada. Já provado 07-13: 78% com telefone, DOM sai limpo (CSV corrompe 47%).

### Vetor 2 — Screenshots dos GRANDES usuários / sementes (mineração de grafo à mão)
- O Marcelo tira **prints do conteúdo dos perfis grandes** (≥50k, as sementes) — lista de seguidores, comentários, marcados — pra colher @handles. **É o Nível 3 (expansão em grafo) feito à mão** (a versão automática está congelada por exigir farm de contas).
- **Como a sessão nova processa um print:**
  1. **Ler a imagem (visão)** → extrair TODOS os @handles visíveis (o Marcelo anexa os prints no chat; ler o arquivo).
  2. **Sanitizar + dedup** (tirar @, dedup interno, dedup vs os 859 já na base).
  3. **POST no edge `leads-import-handles`** `{product_id:'806b5975-e268-402e-a65c-9e9503271041', handles:[...]}` → ele dispara o profile-scraper Apify (usernames[]) + o webhook classifica e estagia. **É o MESMO caminho do "colar handles" / vídeo→Gemini** — não inventar fluxo novo.
  - Vários prints → juntar handles, dedup, POSTs de até **200/chamada** (teto do edge). ⚠️ Consome a conta Apify do PROJETO (APIFY_TOKEN) — barato (~US$0,0026/perfil), mas avisar volume alto.

### Vetor 3 — Scrap keyword/vídeo (já VIVO em prod)
- Keyword search + colar handles + import de vídeo já rodam na Prospecção. Conta MCP na parede mensal → upgrade US$29 destrava a meta 10k.

### Pipeline comum (todo vetor termina aqui)
`extrair limpo → buildLeadCard + qualifyLead (_shared/apify-leads.ts + lead-geo.ts) → dedup por handle/telefone → Base consolidada (product_id 806b5975-…)`. Respeita opt-out + lixeira (`excluded`). LGPD: Art.7º§4 + finalidade=audiencia_ads. Segmento define o funil (salão→ads; afiliado→programa 30/10).

---

## Governança (Seção 14)
- **Este é o registro vivo único.** Novos itens entram AQUI com dono+done+saiu; nada de doc novo paralelo.
- Docs superseded receberão errata apontando pra cá.
- Estado de execução por item: atualizado neste doc conforme os P's fecham (com prova).

---

*Fontes absorvidas: STATUS-GO-LIVE-07-11 · DELTA-PORTABILIDADE-100-07-11 (5 auditorias vs `oficial-vendus-v5`) · LEVANTAMENTO-07-08 · prioridades ditadas pelo Marcelo 07-11.*
