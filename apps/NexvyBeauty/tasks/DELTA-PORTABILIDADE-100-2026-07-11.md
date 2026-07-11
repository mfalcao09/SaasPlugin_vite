# DELTA PRA 100% — Porte Vendus V5 (canônico) → CRM da Plataforma
> ⚰️ **AÇÃO ABSORVIDA no [PLANO-MESTRE-GO-LIVE-2026-07-11](PLANO-MESTRE-GO-LIVE-2026-07-11.md)** (07-11). Este doc = a EVIDÊNCIA/detalhe da auditoria (mantém valor de consulta); a lista de execução vive no plano mestre.
> **2026-07-11 · sessão `6cf2fc02`** · auditoria 1:1 contra a **base canônica** `github.com/mfalcao09/oficial-vendus-v5` (não a cópia do salão) · 5 auditores paralelos, padrão DURO ("se não é cópia fiel, é gap").
> **Pergunta do Marcelo:** *"75% não é confortável. O que falta para os 100% viável — os 100% do que é possível pro nosso CRM?"*

---

## 0. Veredito honesto

**O número raw bate com teu incômodo: ~74% portado 1:1.** Mas o delta **não é caos espalhado** — ele se concentra em **2 blocos coerentes grandes + um rabo escasso**, e uma fatia dos "20%" é **trilha-própria que você já parkou** (Voz IA, Meta Ads, fluxos IG), não buraco de porte.

A verdade desconfortável, direto: o maior gap real **não é o inbox** (esse está fiel) — é o **cérebro/conteúdo dos agentes** (objeções, materiais, base de conhecimento, catálogo, pós-venda) que tem a **UI portada 1:1 mas o backend inerte** (tabelas `platform_crm_*` product-scoped nunca criadas). E há um cluster de **"mentira silenciosa"** (UI diz "salvo" e não persiste) que é bug de produto, não falta de feature.

---

## 1. Placar consolidado (5 domínios, 301 itens auditados)

| Domínio | ✅ 1:1 | 🟡 parcial | 🔴 não-portado | ⚪ N/A | Delta (dev-days) |
|---|---|---|---|---|---|
| **Inbox / Atendimento** | 37 | 9 | 1 | 5 | ~2-3 |
| **Agentes / Cérebro / Conteúdo** | 13 | 2 | 11 | 0 | **~11-12** |
| **Cadência / Jornada / Lead / Kanban** | 32 | 2 | 13 | 1 | ~4-5 |
| **Edge Functions (backend)** | 122 | 3 | 27 | 2 | ~7-8 (in-scope) |
| **Features de apoio + Hooks** | 14 | 6 | 1 | 0 | ~1.5-2 |
| **TOTAL** | **218** | **22** | **53** | **8** | — |

- **1:1 raw:** 218 / 293 in-scope = **74,4%** (confirma teu "75%").
- **Excluindo trilhas parked** (Voz/Ads/IG-flows ≈ 16 itens): **~79%**.
- **Total pra 100% 1:1 (menos trilhas parked): ~26-31 dev-days** de trabalho focado (~5-6 semanas de 1 dev, muito menos com paralelismo).

---

## 2. Como o delta se agrupa (a leitura que importa)

### 🅰 Trilhas próprias — JÁ parked por você (NÃO é buraco de porte)
Decisões de produto, não dívida de porte. Set aside do cálculo de "100% do CRM":
- **Voz IA** — 10 edges (`xai-voice-*`, `voice-*`) + `CallVoiceAIDialog`. Canal inteiro. GRANDE.
- **Meta Ads / atribuição CTWA** — `marketing-connect/sync`, `meta-ads-validate`. Conecta com a outra frente de ADS que você já explora.
- **Fluxos automáticos de IG** — `ig-flow-executor`, `instagram-flow-generate-ai`.

### 🅱 Cérebro/conteúdo do agente — O MAIOR BLOCO REAL (~11-12d)
Config/orquestração/MIA/goals/captação (quiz/forms/funis) **persistem 100%**. O gap é o **conteúdo product-scoped**: a UI está portada 1:1 mas as mutações caem num stub auto-documentado (`useProductHubStubs.ts` → `toast.info` + query `[]`). **8 tabelas + ~7 edges twin faltando:**
- Base de conhecimento (`knowledge_sources` + embedding/crawl/transcribe) · Catálogo de itens · Pós-venda (event-actions+logs+cron) · Objeções estruturadas · Materiais de venda · Vídeo-aulas · CTAs do chat · Templates de e-mail · Treino do agente · Gerar-agente-com-IA · Chat de teste do agente.
- **Causa-raiz única:** faltam as tabelas `platform_crm_*` sem `organization_id` (product-scoped) + versão `platform-*` de edges que **já existem** org-scoped (reaproveitáveis trocando o gate `organization_id`→`product_id`).
- **Impacto:** é o que alimenta a Duda/Bia por produto na plataforma. Afeta a QUALIDADE do "agente que vende" — o coração da proposta de valor.

### 🅲 Dashboard de Jornada / atribuição (~2-3d)
`lib/leadJourney.ts` (760 linhas) + `useLeadJourney.ts` (11 hooks) + 10 componentes `journey/` **não portados**. Cobre funil, heatmap, aquisição por origem/campanha/**criativo**, gargalos, touchpoints, feed real-time. É o "analytics de origem/campanha/criativo" que o levantamento citava — confirmado ausente. (A aba de jornada *por-lead* ESTÁ portada; falta o *dashboard analítico*.)

### 🅳 Inbox borda + "MENTIRA SILENCIOSA" (~2-3d) ⚠️
Núcleo do atendimento fiel. Gaps de borda, mas **3 são bug de produto** (UI diz "salvo", não persiste — pende coluna):
- 🔴 **`EditVisitorDialog`** — email do visitante não grava (`TODO` migration).
- 🔴 **`TransferModal`** — troca de conexão Evolution vira `console.warn`, não persiste (`evolution_instance_id`/`orchestrator_state`/`manual_admin_takeover`).
- 🟡 **Áudio iOS/Safari** — grava só webm/opus → não toca no iPhone; sem fallback "baixar".
- 🟡 FollowupAI sem `warnings`/`model` · AcceptTicket sem `force:takeover` · `InboxMetricsHeader` e `InboxProductSelector` não montados · `LeadEditModal` (editar lead vinculado do inbox) sempre abre só o EditVisitor.

### 🅴 Instagram — sender real de DM (~2-3d) ⚠️ VERIFICAR
`platform-instagram-*` só tem connect/draft/test/webhook. **Faltam `instagram-send` (o sender de DM real), `instagram-list-media`, `instagram-subscribe-fields`.** ⚠️ **Conflito a resolver:** sessões anteriores marcaram "IG outbound funcionando" — precisa confirmar se o envio de DM realmente funciona ponta-a-ponta ou se passa por outro caminho. Se `instagram-send` não existe e o outbound é reivindicado, ou vai por outra rota ou está quebrado.

### 🅵 Features de apoio — re-exposição (~1.5-2d)
Tudo existe tenant-side; falta re-expor na camada `platform_crm_*`: summaries de deals/comissões, gamificação de metas (leaderboard/badges), Google Calendar connect, AICampaignAssistant, squad-performance comparativo.

### 🅶 Cadência (~2-3d)
Editor rico + modelo byte-idênticos. Faltam: biblioteca de contextos reutilizáveis (`context_id`, hoje só inline) + editor rico no hub do produto (stub `todoBackend`).

---

## 3. 🔑 O lote de migrations que mata a "mentira silenciosa" (maior alavanca)
Um padrão atravessa 🅱🅳🅶: **a UI existe e mente porque falta a tabela/coluna `platform_crm_*`.** Um **lote único de migrations product-scoped** (com RLS via helper SECURITY DEFINER, padrão já usado no `platform_crm`) destrava de uma vez: as 8 tabelas de conteúdo + `visitor_email` + colunas do Transfer + `context_id` de cadência. **É o movimento de maior retorno** — transforma dezenas de UIs inertes em funcionais, e mata os bugs onde o sistema mente pro operador.

---

## 4. Ordem de ataque recomendada (rumo aos 100%)

| Prio | Pacote | Esforço | Por quê primeiro |
|---|---|---|---|
| **P0** | **Correção da "mentira silenciosa"** — lote de migrations (visitor_email, Transfer, context_id) + iOS audio + wirings do inbox (métricas, FollowupAI, AcceptTicket) | ~2-3d | Bug de produto: hoje o sistema **mente** pro operador. Barato e alto impacto de confiança |
| **P1** | **Cérebro/conteúdo do agente** — 8 tabelas + edges twin (`platform-*` a partir dos org-scoped existentes) | ~11-12d | Maior bloco; é o coração do "agente que vende". Paralelizável (1 tabela+hook+edge por vez) |
| **P2** | **Dashboard de Jornada** — `lib/leadJourney` + `useLeadJourney` + 10 componentes, re-wired p/ `platform_crm_*` | ~2-3d | Analytics de origem/campanha/criativo |
| **P3** | **Edges in-scope restantes** — instagram-send (+verificar outbound), 4 assist inbox/booking, fechar Meta-WA (media-upload+watchdog), infra (suspend/reactivate org, onboarding-link, accept-invite, provision-users) | ~7-8d | Rabo escasso mas real |
| **P4** | **Features re-exposição** + **cadência** (contextos + editor no hub) | ~3-4d | Paridade fina; nenhum é regressão |
| **—** | Voz IA · Meta Ads · Fluxos IG | — | **Parked** (trilha própria, tua decisão) |

---

## 5. Decisões que só você toma
1. **`CallVoiceAIDialog`** — confirma que é drop (junto com a trilha de Voz), certo?
2. **`InboxProductSelector`** — foi substituído de propósito pelo `ProductContext` global (E1/F2)? Se sim, ratifica e o item some do delta.
3. **`instagram-send`** — o outbound de DM que marcaram "funcionando" é real? (preciso verificar; se for gap, entra no P3).
4. **Corte do lançamento:** você quer **100% 1:1 antes de lançar** (todos os pacotes P0-P4, ~26-31d), ou **lançar com P0+P1 e P2-P4 como fast-follow**? — a máquina de venda já roda; o delta é qualidade/profundidade, não bloqueio de operação.

---

## 6. Ressalva de método
Auditoria por **leitura profunda + grep dos dois lados**, não `diff -r` byte-a-byte em cada arquivo. Onde afirmei "byte-idêntico" (useLeadTracking, useCadence) foi confirmado; nos blocos grandes (lead/ 21 arquivos, cadence/ 4) foi por presença em caminho idêntico + leitura de amostra. Rigor total nesses = rodar `diff -r` nas pastas (fecha a prova, ~1h).

---

*Fontes: 5 auditorias paralelas (Inbox, Agentes/Cérebro, Cadência/Jornada/Lead, Edges, Features/Hooks) vs `oficial-vendus-v5` clonado · cruzado com [LEVANTAMENTO-07-08](LEVANTAMENTO-PENDENCIAS-REAIS-2026-07-08.md) e [AUDITORIA-PORTABILIDADE-V5-07-11](AUDITORIA-PORTABILIDADE-V5-2026-07-11.md).*
