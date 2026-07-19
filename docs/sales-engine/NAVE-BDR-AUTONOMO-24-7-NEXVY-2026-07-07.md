# Nave BDR — Arquitetura do BDR Autônomo 24/7 sobre a Infra Nexvy Real

> **Data:** 2026-07-07 · **Autor:** Claude (Opus 4.8) para Marcelo Silva · **Projeto:** SaasPlugin_vite
> **Rev. 2 (2026-07-07):** auto-improver corrigido por Marcelo — é o **Hermes agent** (NousResearch), não o openclaw. Hermes **não está deployado** (verificado KVM2/KVM4 via SSH). Vereditos 2, §2.2, §4, §5 e Apêndice A atualizados.
> **Natureza:** Arquitetura + plano, **ancorado nos ativos reais** (KVM2, KVM4/cerebro-infra, sales-spark, Duda, LiteLLM, Evolution). Não é genérico.
> **Objetivo:** BDR autônomo que pega lead **congelado** (raspado de Maps/IG/TikTok) → **opt-in** → handoff Duda. Auto-melhorável, 24/7, sem queimar canal.

---

## 0. TL;DR — 3 vereditos + o keystone

1. **LLM:** você **não** tem LLM local (ollama só serve embeddings). Tem o **gateway LiteLLM com roteamento por tag** — e ele já faz stake-routing. Regra: `volume` (barato) pro alto-volume; `reasoning` (Opus/Gemini-3-pro) pra mensagem que decide venda. **Medir PT-BR antes de fixar barato na 1ª mensagem.**
2. **Auto-improver = Hermes agent** (NousResearch, 211k★, v0.18.0) — *corrigido: não é o openclaw*. O openclaw (KVM4) é só gateway; hoje a única retroalimentação real é a memória/RAG da `cerebro-infra` (reindex cron 05:00 UTC, gated por `RAG_EVAL_THRESHOLD`). O Hermes — **ainda não deployado** — se auto-melhora via **criação autônoma de skills + skills que se auto-editam durante o uso, SEM eval-gate nativo**. Ou seja: o medo de "agente que se reescreve e vira spam" **APLICA-SE ao Hermes** → deploy dele é **pós-P1**, com skill-gate no golden set.
3. **Deliverability:** API oficial Meta + template aprovado **não** blinda de ban — a Meta bane por quality-rating (bloqueio+denúncia) e exige opt-in. **Frio quem toca é o anúncio, não o WhatsApp.**

> **Keystone:** fechar o **loop de eval de conversão**. Ele é (a) o portão de segurança da autonomia 24/7 e (b) o sinal de recompensa que faz a reingestão da `cerebro-infra` melhorar **conversão**, não só indexação. Sem ele, "24/7 autônomo + auto-melhora" = drift confiante rumo ao banimento.

---

## 1. Inventário REAL dos ativos (verificado 2026-07-07)

### KVM2 — `srv631079` (2 vCPU / 8 GB / CPU-only) — produção
- **sales-spark** (Supabase): 139 tabelas / 81 edges / 161 RLS. Orquestrador multi-agente (`product_agents`, `agent_routing_rules`, `orchestration_logs`), memória vetorial (`lead_semantic_memory` pgvector 1536), cadências (`cadences`/`steps`/`enrollments`/`step_runs`), A/B de prompt (`ai_prompt_experiments`/`variants`), eval (`ai_quality_evaluations`).
- **Evolution API** (`evolution_api`+postgres+redis) — canal WhatsApp de pé.
- **`scraper_imobiliario`** (`api-scraper-api-python`, FastAPI/uvicorn) — **padrão de scraper já existente** a reusar.
- **`claude-brain`** (`claude-code-vps:v1`, `sleep infinity`) — Claude Code headless idle.
- **LiteLLM** gateway. 6 SaaS Nexvy + ERP + NexvyLAW + n8n.

### KVM4 — `srv1801696` (4 vCPU / 16 GB / CPU-only, Ubuntu 24.04, criada 03/07) — cérebro
- **`openclaw`** (`ghcr.io/openclaw/openclaw:latest`, healthy): gateway de agente. 1 agente "Nexvy Orquestrador 🦞". Modelo: `litellm/reasoning` (primário) + `litellm/coding` (fallback). Canal Telegram (allowlist). MCP GitHub **read-only** (`get_*`/`list_*`/`search_*`).
- **`cerebro-infra`** stack: `memory-service` (RAG `/v1/memory/query`), `ollama` (embeddings `nomic-embed-text`), `reindex` (cron 05:00 UTC, **loop de escrita do cérebro, gated por `RAG_EVAL_THRESHOLD`/`RAG_EVAL_K`**), `pool`/`pool-dispatch`, `mcp-gateway` (0.2.0, multi-server), `litellm`.

### LiteLLM — roteamento por tag (o "cérebro de modelos")
| Tag | Roteia p/ | Uso no BDR |
|---|---|---|
| **`volume`** | hy3-preview (Tencent, barato) | Scoring, dedup, enriquecimento, classificação de intenção |
| **`reasoning`** | Opus 4.8 / Gemini-3-pro / Grok-4 | 1ª mensagem, objeção, decisão de rota |
| `coding` | glm-5.2 / deepseek-v4-pro / mimo | — |
| `legal` | GLM / Sonnet / Opus | NexvyLAW |
Modelos individuais: glm-5/5.1/5.2, minimax-m3, claude-opus/sonnet, deepseek(-v4-flash/pro), qwen-235b, kimi, codestral, gpt-5/5.5, gemini-3-pro, grok-4, mimo, hy3.

### O back-half de venda que você JÁ tem
- **Duda** (framework QCR): SDR inbound production-grade — Qualificação Carteira Recuperável, scoring 4-D, anti-desqualificação, NEAT/SPICED/FAINT.
- **sales-spark**: pipeline, cadências, memória, eval.

**Conclusão:** ~70% da nave existe. Falta o **front-half (BDR outbound frio → opt-in)** e o **eval de conversão**.

---

## 2. Arquitetura da nave

### 2.1 O funil (frozen → opt-in → Duda)
```
Maps/IG/TikTok  ──scrape──▶  prospect_staging  ──enrich(volume LLM)──▶  score
     │                                                                    │
     └──────────────── ATIVAÇÃO (frio, canal que NÃO queima) ────────────┘
                                    │
              ┌─────────────────────┼──────────────────────┐
        custom-audience ads   lead magnet "Radar grátis"   soft-touch orgânico
                                    │
                          pessoa ENGAJA = OPT-IN  ← flip
                                    │
                    ┌──────────────▼───────────────┐
                    │  Duda (SDR) via WhatsApp API   │  ← já opted-in = seguro
                    │  qualifica → demo (sales-spark)│
                    └────────────────────────────────┘
```
**O BDR não vende. Ele leva congelado → opt-in.** A venda é da Duda, depois do flip.

### 2.2 A fronteira de autonomia (o que salva a operação)
| Etapa | Autonomia | Guardrail |
|---|---|---|
| Sourcing, enriquecimento, scoring, rascunho | **100% autônoma 24/7** | rate-limit por plataforma; dedup |
| Ativação por **ads/lead-magnet** | **100% autônoma** | orçamento cap; compliant por design |
| Envio WhatsApp (só a opted-in) | Autônoma **com circuit-breaker** | opt-in obrigatório; template aprovado; **kill-switch por quality-rating** (verde→amarelo = pausa); throttle por número |
| Auto-modificação de **comportamento** do agente (inclui **skill self-edit do Hermes**) | **NUNCA autônoma** | só via eval-gate (P1) + deploy revisado; skill mutada = candidata, golden set promove |

### 2.3 Ordem de canal (deliverability)
1. **Ads (custom audience)** — sobe a lista raspada, retargeta. Não queima número. Escala.
2. **Lead magnet** ("escaneio grátis quantas clientes sumiram do seu salão") — gera **opt-in legítimo**.
3. **WhatsApp API oficial + template** — só depois do opt-in. Protege quem optou; **não** autoriza frio.
4. IG DM / WhatsApp frio direto — só com contas/números descartáveis + circuit-breaker; alto risco de ban (ToS IG, quality Meta).

---

## 3. Roteamento de LLM por stake (usar as tags que já existem)

| Trabalho | Volume | Stake | Tag LiteLLM |
|---|---|---|---|
| Score de lead, dedup, resumo de enriquecimento, classificação de intenção | Altíssimo | Baixo | **`volume`** (hy3/deepseek-flash) |
| **1ª mensagem fria / lead-magnet copy / objeção** | Baixo | **Altíssimo** (msg ruim = report = número morto) | **`reasoning`** (Opus/Gemini-3-pro/Sonnet) |
| Decisão de rota / handoff | Médio | Alto | `reasoning` |

**Regra:** a economia de token na 1ª mensagem é ~1000× menor que o custo de um domínio/número queimado. **Nunca** barateie a mensagem que decide venda. **Sempre** barateie o volume.
**Fallback (SPOF):** VPS única satura/cai → use o LiteLLM com fallback (local→externo). "24/7" exige rede de segurança de roteamento.

---

## 4. Auto-melhoria SEGURA (o que você já tem + o que falta)

**Você já tem (seguro por design):** `cerebro-infra/reindex` reingere a memória de `sources/` diariamente (cron 05:00 UTC) e **só promove o índice se passar do `RAG_EVAL_THRESHOLD`**. Isso melhora o **conhecimento** do agente sem mutar seu comportamento. ✅

**O que falta (o keystone):** o eval de hoje mede **qualidade de retrieval**, não **conversão**. Para "BDR/SDR cada dia melhor em VENDER":
1. **Golden set de conversão** — 50–100 conversas reais rotuladas (rota correta? falso-descarte? converteu em opt-in/demo?). Tabela `agent_eval_cases` (ou `ai_quality_evaluations.is_golden`).
2. **Métrica de recompensa** = opt-in rate / reply-sem-report / demo-booked — **não** reply cru (reply agressivo que gera denúncia é lift negativo).
3. **Alimentar `sources/`** com as mensagens/objeções vencedoras → o reindex diário as absorve → **auto-melhoria real e gated**.
4. **Gate de deploy:** nenhuma variante de prompt (sales-spark) **nem skill do Hermes** (que se auto-edita em uso e não tem gate nativo) vai a produção sem passar no golden set (falso-descarte=0, opt-in≥baseline, report-rate↓). Skills do Hermes versionadas: mutação → candidata → eval promove.

> É assim que o sonho "cada dia melhor" vira verdade **sem** virar "cada dia mais perto do ban".

---

## 5. Gaps a construir (schema + infra)

1. **Sourcing multi-fonte** — estender `scraper_imobiliario`: Google Maps (via Apify MCP, dado público — OK), IG/TikTok (Apify actors, ban-aware, throttle, contas descartáveis). Saída → `prospect_staging`.
2. **`prospecting_runs` + `prospect_staging`** (tabelas novas no sales-spark): raw → enriched → promoted_lead_id; dedupe_key; status.
3. **Enriquecimento waterfall:** Maps → site → **CNPJ/Receita (BrasilAPI)** → email/telefone. LLM `volume` resume.
4. **Email como canal de cadência** (hoje `campaigns` tem CHECK `channel='whatsapp'`): remover trava, `email_identities` (domínios de envio separados + warmup), DKIM/DMARC via **Hostinger DNS MCP**.
5. **Agente BDR dedicado** (`product_agent` novo): `primary_objective` = "conseguir opt-in", não "qualificar". Playbook cold/trigger-based, <100 palavras.
6. **Eval de conversão** (P1 / §4) — o keystone.
7. **Deploy do Hermes agent** (NousResearch) como auto-improver — **estritamente pós-P1**: skills versionadas, backend Docker isolado, modelo apontando pro LiteLLM (`reasoning`/`volume`), skill-gate no golden set. Gateway WhatsApp/Telegram nativo do Hermes avaliado como substituto/complemento do openclaw.

---

## 6. Sequência com critérios verificáveis (Seção 8.3)

**P1 — Eval de conversão (keystone).** ✅ golden set 50+ rotulado; runner em CI; falso-descarte bloqueia PR; métrica = opt-in/report-rate. *(Menor esforço, destrava autonomia segura E auto-melhoria real.)*
**P2 — `prospecting_runs`/`prospect_staging` + estender scraper (Maps primeiro).** ✅ run de "salões em [cidade]" gera ≥N contatos enriquecidos promovidos.
**P3 — Ativação frio→opt-in (ads + lead magnet).** ✅ campanha de custom-audience roda; lead-magnet gera opt-in medido; **zero** WhatsApp frio.
**P4 — Agente BDR + handoff Duda.** ✅ opt-in → Duda assume; conversão opt-in→demo medida.
**P5 — WhatsApp API oficial só p/ opted-in + circuit-breaker.** ✅ quality-rating verde; kill-switch testado.
**P6 — Ligar reindex ao eval de conversão (auto-melhoria real).** ✅ mensagens vencedoras em `sources/`; reindex diário melhora opt-in rate semana-a-semana.

---

## 7. Riscos / anti-padrões

1. **Frio no WhatsApp (mesmo com template aprovado)** → quality-rating despenca → ban. Frio = ads, não WhatsApp.
2. **Autonomia no envio sem circuit-breaker** → banimento em escala. Autonomia total no sourcing; gated no envio.
3. **Scraping IG/TikTok** viola ToS, é frágil → contas descartáveis + throttle; Maps é o seguro.
4. **Auto-melhoria medindo reply cru** → agente aprende a ser agressivo → denúncia. Medir **opt-in sem report**, não reply.
5. **Barão de token na 1ª mensagem** → 1 msg ruim custa um número. `reasoning` na mensagem, `volume` no resto.
6. **VPS única sem fallback** → 24/7 vira "até saturar". LiteLLM com fallback.
7. **LGPD** (Seção 11): base legal, opt-out em todo toque, dado sensível fora do DOM.

---

## Apêndice A — Repos / frameworks (resposta a "há algo no github")
- **hermes-agent** github.com/NousResearch/hermes-agent (211k★, v0.18.0 2026-07-01) — **o auto-improver escolhido** (correção: não é o openclaw). Skills autônomas que se auto-editam (agentskills.io), memória curada, gateways Telegram/Discord/Slack/WhatsApp/Signal, any-model (pluga no LiteLLM), 6 backends de execução. ⚠️ Sem eval-gate nativo em mutação de skill → deploy pós-P1.
- **SalesGPT** github.com/filip-michalsky/SalesGPT (~2.6k★) — máquina de estágios multicanal.
- **OpenOutreach** github.com/eracle/OpenOutreach (~2.2k★) — produto+ICP → descobre → qualifica → email (referência do BDR).
- **open-sdr** github.com/MatthewDailey/open-sdr — sub-agente de research por empresa.
- **Composio** github.com/ComposioHQ/composio — conectores agent→CRM/Gmail.
- Frameworks (você já tem equivalente via openclaw/sales-spark): LangGraph, CrewAI, Agno, OpenAI Agents SDK (TS), Vercel AI SDK, PydanticAI.
- Comerciais p/ copiar: 11x (multi-agente — você já tem), Clay (waterfall enrichment), Qualified (inbound intent), Lemlist/Instantly/Smartlead (warmup/deliverability).

## Apêndice B — Corpus de vendas/psicologia (resposta a "o que precisam saber")
- **Qualificação:** BANT · GPCTBA/C&I · **NEAT** (economic impact substitui budget — já na Duda) · MEDDIC · **SPICED** (Impact+Critical Event — já na Duda) · CHAMP · FAINT.
- **Discovery:** SPIN · Challenger · Sandler · **JOLT** (indecisão).
- **Mensagem:** **PAS** · AIDA · BAB · 3x3 research · **trigger/event-based** (maior lift) · Josh Braun poke-the-bear.
- **Psicologia:** **Cialdini (7)** — prova social de par-da-vertical > número genérico; scarcity real (30/30/1). **Chris Voss** — labeling, accusation audit, "no"-oriented questions (upgrade da Duda). **Loss aversion (Kahneman)** — custo de não-agir (a conta da QCR já é isso).
- **Cadência:** 8–12 toques · multicanal · <75–100 palavras · anti-padrão nº1: personalização falsa em escala (lift negativo + domínio queimado).
- **Fontes:** *Never Split the Difference* (Voss) · *Fanatical Prospecting* (Jeb Blount) · *Gap Selling* (Keenan) · *SPIN* (Rackham) · *Challenger Sale* · *JOLT Effect* · *Influence*/*Pre-Suasion* (Cialdini). Criadores: Josh Braun · 30MPC (Armand Farrokh) · Jed Mahrle · Will Allred (Lavender) · Florin Tatulea · Sam Nelson (Agoge) · Belkins · Cognism.

---

## 8. Flags de honestidade
- Roteamento por tag e infra: **[Certo]** (inspecionado na VPS 2026-07-07).
- Hermes agent: fatos do README (211k★, skill self-edit, sem gate documentado) **[Certo]** (lido 2026-07-07); comportamento real do loop de skills em produção **[Provável]** — validar no deploy. Ausência nas VPSs **[Certo]** (SSH grep 2026-07-07).
- "reindex tem eval de RAG-quality, não de conversão": **[Certo]** (env `RAG_EVAL_THRESHOLD` existe; é retrieval, não venda).
- "cheap PT-BR ≈ premium na 1ª mensagem": **[Palpite]** — medir com eval PT-BR antes de fixar.
- Star counts / benchmarks de reply: **[Provável]** — revalidar.

## 9. Decisão tomada (2026-07-07)
P1 confirmado por Marcelo ("Continue este trabalho"). Detalhamento completo — schema do golden set, runner em CI, integração cerebro-infra + skill-gate do Hermes — em [P1-EVAL-CONVERSAO-KEYSTONE-2026-07-07.md](P1-EVAL-CONVERSAO-KEYSTONE-2026-07-07.md).
