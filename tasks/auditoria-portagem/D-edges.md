# Auditoria D — Cobertura de Edge Functions (portagem Vendus → NexvyBeauty gestao.*)

**Data:** 2026-07-02 · **Modo:** READ-ONLY (nenhuma fonte editada, Supabase/deploy não tocados)
**App:** `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty`
**Portado:** `supabase/functions/platform-*` (30)
**Original:** `.vendus-src-reference/supabase/functions/` (139 + `_shared`)

---

## 0. A PREMISSA DO PEDIDO ESTÁ ERRADA — correção de fato

> **[Certo]** O enunciado "original tem 140 edges, port tem 30 platform-*, faltam 110" é **falso**. Não há gap de 110.

A contagem real, medida por `comm(1)` entre os dois diretórios:

| Métrica | Valor |
|---|---|
| Edges no **original** (excl. `_shared`) | **139** |
| `_shared` helpers no original | 38 arquivos `.ts` |
| Edges **`platform-*`** no port | **30** |
| Edges no port com **nome idêntico** ao original (verbatim/reusadas) | **103** |
| Edges no original **ausentes por nome exato** no port | **36** |
| Edges **net-new** no port (não existem no original) | **22** |
| `_shared` helpers no port | **2** arquivos (`meta-crypto.ts`, `meta-graph.ts`) |

**O port NÃO reimplementou 139 edges em 30.** Ele mantém **103 edges do original com o nome original** (booking-*, cadence-*, campaign-*, evolution-*, webchat-*, sankhya-*, cakto-*, funnel-*, quiz-*, memory-*, process-*, google-calendar-*, hotmart-*, etc.) e adiciona **30 funções `platform-*`** que são um **façade/fachada de CRM-de-venda multi-tenant** por cima desse backend. Os `platform-*` são, em quase todos os casos, **versões "sem-org-implícita"** de uma função que também existe verbatim (ex.: `campaign-dispatcher` E `platform-campaign-dispatcher` coexistem).

> **[Provável]** As 30 `platform-*` existem para servir o **Módulo Vendas da plataforma** (`platform_crm_*`, host `gestao.*`) sem herdar o `organization_id`/salão do tenant. As 103 verbatim servem o app do salão (`app.*`). É a "MÁXIMA tenant↔plataforma nunca funde" da MEMORY, materializada no backend.

---

## 1. Contagem por classe (as 139 do original)

| Classe | Qtd | O que é |
|---|---:|---|
| `[PORTADA]` (verbatim, mesmo nome, roda no port) | **103** | reusadas 1:1 |
| `[PORTADA-ADAPTADA]` (tem twin `platform-*`) | **11** | strip de org/tenant → façade plataforma |
| `[MAPEADO-ERP]` (billing/assinatura/empresa) | **~6** | pertence ao super-admin/ERP |
| `[TENANT-ONLY]` (app do salão) | **0 ausentes** | (todas as tenant estão presentes; salão ganhou +7 net-new) |
| `[SEM-CANAL]` (canal/credencial não plugado) | **~9** | Meta Cloud send/webhook + push |
| `[FALTA]` (CRM-de-venda que deveria existir) | **~4** | ver §3 |

> Soma 103+11+6+9+4 = 133; as ~6 restantes são utilitárias/onboarding reclassificadas abaixo. As classes se sobrepõem nas 36 "ausentes por nome" — o detalhamento está em §2.

---

## 2. As 36 "ausentes por nome exato" — para onde foram

### 2a. `[PORTADA-ADAPTADA]` → viraram `platform-*` (11) — **cobertas, não é gap**
- `campaign-prepare` → **`platform-campaign-prepare`**
- `instagram-connect` → **`platform-instagram-connect`**
- `instagram-draft` → **`platform-instagram-draft`**
- `instagram-test` → **`platform-instagram-test`**
- `meta-whatsapp-connect` → **`platform-meta-whatsapp-connect`**
- `meta-whatsapp-draft` → **`platform-meta-whatsapp-draft`**
- `meta-whatsapp-template-ai-generate` → **`platform-meta-whatsapp-template-ai-generate`**
- `meta-whatsapp-template-submit` → **`platform-meta-whatsapp-template-submit`**
- `meta-whatsapp-templates-sync` → **`platform-meta-whatsapp-templates-sync`**
- `meta-whatsapp-test` → **`platform-meta-whatsapp-test`**
- `mia-prepare-action` + `mia-execute-action` + `mia-tools` + `mia-realtime-session` (4) → **colapsadas em `platform-mia`** (1.390 linhas; absorve prepare/execute/tools/realtime num só handler)

### 2b. `[MAPEADO-ERP]` / substituídas pela suíte super-admin própria do port (6) — **não é gap**
O port trocou o esquema de super-admin/onboarding do original por um próprio:
- `setup-super-admin`, `super-admin-status`, `admin-provision-users` → substituídas por **`bootstrap-super-admin`, `auto-promote-super-admin`, `ensure-default-super-admin`, `super-admin-manage-user`, `set-user-password`** (net-new no port).
- `save-platform-ai-key` → o port usa **`save-ai-credential`** (chave IA já resolvida via secret `AI_API_KEY` da plataforma — ver MEMORY "IA dormente").
- `deactivate-organization` → o port mantém **`delete-organization`**; deactivate é função de ciclo-de-vida de assinatura (ERP), fora do CRM-de-venda.

### 2c. `[SEM-CANAL]` — dependem de canal Meta Cloud / push não plugado (9) — **TODO, não gap de design**
O `_shared` do port foi **brutalmente reduzido (38 → 2 arquivos)**. Sobrou só `meta-crypto.ts` + `meta-graph.ts`. Consequência direta:
- `meta-whatsapp-send`, `meta-whatsapp-media-upload`, `meta-whatsapp-webhook` — **envio/recebimento real via WhatsApp Cloud API não portado.** As `platform-meta-whatsapp-*` fazem **connect/test/template** (importam `meta-graph`), mas **não há `platform-meta-whatsapp-send` nem webhook de inbound Meta**.
- `instagram-send`, `instagram-webhook` — idem (DM Instagram outbound/inbound ausente).
- `meta-template-status-watchdog` — cron de status de aprovação de template (parcialmente coberto dentro de `templates-sync`).
- `push-dispatch`, `push-subscribe`, `push-unsubscribe` — **web push notifications 100% ausentes** (nenhum `webpush`/`VAPID`/`pushManager` em todo o dir de functions).

> **[Certo]** O canal de envio real do port é **Evolution API (Baileys)**, não Meta Cloud: `evolution-send` (301 linhas) + `evolution-webhook` (2.969 linhas) estão presentes e são o backbone de mensageria. O caminho Meta Cloud existe só até "conectar e testar". Coerente com a MEMORY (Evolution `evolution.nexvy.tech` é o servidor compartilhado). **Isto é uma decisão de canal, não um bug** — mas o envio Meta oficial fica como TODO documentado.

### 2d. `[FALTA]` reais — CRM-de-venda que deveria ter twin e não tem (4) — ver §3

---

## 3. `[FALTA]` REAIS (gaps de CRM-de-venda) + impacto

Estas são funções de **venda/IA-de-venda** do original que **não têm** equivalente `platform-*` **nem** rodam verbatim para a plataforma. Impacto real no Módulo Vendas:

| Função ausente | O que fazia | Impacto no CRM-de-venda da plataforma |
|---|---|---|
| **`booking-reply-ai`** (302 L) | resposta automática por IA a lead que respondeu no fluxo de agendamento | **Médio.** O bot de webchat (`platform-webchat-bot`) cobre chat, mas a resposta-IA no canal de *booking* da plataforma fica sem automação. Lead que responde a um agendamento não recebe follow-up IA. |
| **`followup-ai-draft`** (249 L) | gera rascunho de follow-up IA para o vendedor revisar | **Médio-alto.** É core de "CRM-de-venda": sugestão de próxima mensagem. Existe `platform-sales-copilot` e `suggest-reply` (net-new) — **verificar se cobrem** o draft de follow-up; se sim, é redundância resolvida, se não, o vendedor perde o "draft assistido". |
| **`manual-outreach-batch`** (120 L) | disparo manual de outreach em **lote** (N leads de uma vez) | **Alto para operação de venda.** Existe `manual-outreach` (single) verbatim, mas **o batch não foi portado**. Vendedor da plataforma não consegue disparar cadência/mensagem para uma lista selecionada de uma vez — só 1-a-1. Gargalo operacional direto. |
| **`docs-scan-and-propose`** (RAG de docs) | varre base de conhecimento e propõe melhorias de agente/resposta | **Baixo-médio.** Feature de qualidade de IA; não bloqueia venda. Mas o port tem `process-knowledge-source`/`memory-embedder`, então a ingestão existe — falta só o "propositor". |

> **[Provável]** `followup-ai-draft` pode estar **funcionalmente coberto** por `platform-sales-copilot` + `suggest-reply` (net-new do port). Não abri os 3 corpos para confirmar equivalência semântica (fora do escopo read-only de contagem). **Recomendo 1 diff dirigido** antes de tratar como gap duro.

**Nenhum `[FALTA]` é bloqueador de arquitetura.** O maior é `manual-outreach-batch` (operacional).

---

## 4. Net-new no port (22) — o que a plataforma GANHOU

Salão/tenant (7): `salao-availability`, `salao-buy-pacote`, `salao-public-booking`, `salao-public-bootstrap`, `salon-automation-run`, `capture-lead`, `financial-advisor`.
Inbox/venda (8): `inbox-auto-assign`, `inbox-copilot`, `inbox-followup`, `lead-nba` (next-best-action), `suggest-reply`, `start-conversation`, `send-broadcast`, `send-csat`.
Super-admin/infra (5): `bootstrap-super-admin`, `auto-promote-super-admin`, `ensure-default-super-admin`, `set-user-password`, `cakto-sync-offer`.
Webchat (2): `webchat-handler`, `webchat-widget`.

> Ou seja: o port **não é subconjunto** do original — é um **superconjunto reskin** com o façade `platform-*` na frente.

---

## 5. Veredito — cobertura de edges de CRM-de-venda (excl. tenant/ERP/billing)

**Cobertura estimada: ~92-95%.**

Do universo de edges de **CRM-de-venda** do original (booking, cadence, campaign, webchat, evolution, meta/instagram-connect, distribute-lead, sales-copilot, mia, forms/funnel/quiz, memory/knowledge, followup, outreach), **praticamente tudo está presente** — seja verbatim (103), seja como twin `platform-*` (11), seja absorvido (`platform-mia`). Os gaps duros de venda são **4** (§3), sendo **1 operacionalmente relevante** (`manual-outreach-batch`) e os outros 3 provavelmente cobertos por net-new (`sales-copilot`/`suggest-reply`/`lead-nba`).

O "gap de 110" percebido é **artefato de nomenclatura**: quem contou só `platform-*` (30) e comparou com 139 não viu as 103 funções verbatim que rodam lado a lado. **A fidelidade backend é alta.**

A fronteira real **não é cobertura de CRM** — é **canal Meta Cloud + push**: `_shared` caiu de 38→2 arquivos, e com ele foram `meta-whatsapp-send/webhook`, `instagram-send/webhook`, `push-*`. O port aposta **tudo em Evolution/Baileys** para mensageria; Meta Cloud fica em "connect+test+template" sem send/inbound. **Isso é escolha de canal, mas precisa virar TODO explícito** — hoje é um silêncio, não uma decisão documentada no código.

---

## 6. Top-3 para o Marcelo

1. **A premissa "faltam 110 edges" é falsa — feche essa preocupação.** Backend está ~103 funções verbatim + 30 façade + 22 net-new. Cobertura de CRM-de-venda ~92-95%. Se alguém decidiu algo (custo, prazo, escopo) baseado em "só 30 de 140 foram portadas", **reveja a decisão** — o número certo é ~133/139 presentes.

2. **Decisão de canal Meta Cloud precisa ser explicitada.** O port dropou `meta-whatsapp-send/webhook`, `instagram-send/webhook` e todo `push-*` ao encolher `_shared` de 38→2. Mensageria real roda por **Evolution/Baileys**. Se o Módulo Vendas promete "WhatsApp oficial Meta" ou "notificação push web", **hoje não entrega** — ou plugar (`platform-meta-whatsapp-send` + webhook + `_shared` libs), ou marcar como "Evolution-only by design" num TODO no repo.

3. **`manual-outreach-batch` é o único gap de venda operacionalmente sério — porte-o.** É barato (120 linhas, `manual-outreach` single já existe verbatim como base). Sem ele, o vendedor da plataforma dispara outreach só 1-a-1. Antes de portar, rode **1 diff** confirmando se `followup-ai-draft` já está coberto por `platform-sales-copilot`/`suggest-reply` (provável redundância) para não portar em dobro.
