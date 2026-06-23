# Plano — Tornar o NexvyBeauty **superior** ao cloud-beauty-ai

> **Data:** 2026-06-22 · **Dono:** Marcelo Silva · **Ambos os projetos são do Marcelo**
> (cloud-beauty-ai = projeto Lovable; NexvyBeauty = este, em produção).
> Decisão: executar **Track A (IA) + Track B (coesão) em paralelo**.

---

## 0. Reframe — a verdade do inventário (3 agentes, read-only)

A premissa "o Lovable está muito melhor e estamos longe de um produto vendável" **se inverte
nos fatos**. O cloud-beauty-ai *parece* melhor (coeso, polido), mas é um **template raso**;
o NexvyBeauty é um **produto de produção** com 10× mais capacidade.

| Eixo | cloud-beauty-ai | **NexvyBeauty** |
|---|---|---|
| CRM | ~18 features reais | **18/20 reais** + LLM-as-Judge + A/B testing de prompt (ele NÃO tem) |
| WhatsApp | tabela vazia (schema, 0 código) | **QR + envio + recepção + webhook** reais (Evolution Go) |
| Pagamento | enum de plano (0 lógica) | **Cakto completo**: checkout auto + webhook + provisioning + recovery |
| Email | templates sem SMTP | **Lovable Emails**: domínio próprio, fila, supressão, automação cobrança |
| Edge functions | **0** (pasta vazia) | **~100+** em produção |
| Super-admin | rota `/master` básica | **24 painéis** (planos, billing, audit, health, quotas por trigger) |
| Em produção | não | **SIM** (app/apex/gestao.nexvybeauty.com.br, SSL, soberano) |

**Conclusão:** não estamos atrás. O gap real é **(1) coesão/polimento** (o que se *sente*) e
**(2) três features de IA** que temos só parciais. Tudo o mais já é nosso — e mais.

---

## 1. O que o cloud-beauty-ai tem de **realmente** melhor

1. **Coesão/polimento de UX** — nasceu limpo (salão+CRM unificados, sidebar agrupada, premium).
   O nosso cascateou de um CRM → sensação de "apps separados". *(Salão já re-skinado premium;
   falta CRM/admin + navegação.)*
2. **3 features de IA limpas** (nós temos só parciais):
   - **Lead scoring com decay** (nós: só `temperature` hot/warm/cold manual).
   - **NBA (Next-Best-Action) generativo** (nós: painel "Radar IA", sem recomendação LLM real).
   - **Daily-report com chamada LLM** (nós: `daily-report-ai` coleta contexto, mas **não chama o LLM** pra insights).

> Tudo o resto que ele tem, nós já temos igual ou melhor.

---

## 2. TRACK A — 3 features de IA (fechar gaps + nos tornar feature-superiores)

> ⚡ **2026-06-22 — IA ATIVADA + A3 FEITO (maior unlock da sessão).**
> Descoberta: a IA estava **DORMENTE** — 0 chaves (env de plataforma vazio + 0 `org_ai_credentials`
> + 0 `org_ai_routing`). Setei a chave **OpenRouter** (que já existia no Mac/VPS) como secret de
> plataforma `AI_API_KEY` (+ `AI_GATEWAY_URL`) no Supabase `fzhlbwhdejumkyqosuvq` → **toda a suíte
> de IA do NexvyBeauty está LIVE** (agentes, generate-insights, evaluate-conversation/LLM-as-Judge, etc.).
> **TRACK A COMPLETO (backend) + verificado:**
> - **A3** `daily-report-ai`: LLM (Gemini) + fallback gracioso (`mode: llm` no dry_run).
> - **A1** scoring com decay: coluna `leads.score` + função `recompute_lead_scores()` (temperatura +
>   progresso de etapa − decay temporal, clamp 0-100). Decay provado: hot 0d=55 → 7d=41 → 30d=10.
> - **A2** NBA generativo: tabela `lead_nba_sugestao` + edge fn `lead-nba` → ação + motivo + prioridade
>   + **mensagem pronta pra WhatsApp** (diferencial vs Lovable: a nossa EXECUTA via Evolution).
> Resta (vira **Track B / UI**): mostrar score na lista de leads; painel NBA + botão "Aplicar" →
> `evolution-send`; cron (pg_cron) chamando `recompute_lead_scores` diariamente p/ o decay rodar.
> Custo: créditos OpenRouter, limitado pelas quotas/plano.

Infra que já existe pra reusar: `org_ai_routing` (gateway/modelo por capability),
`generate-insights`, `daily-report-ai`, `lead_semantic_memory` (embeddings/RAG),
`campaign-ai-insights`, `evaluate-conversation` (LLM-as-Judge).

### A1 — Lead scoring com decay  ·  esforço ~M
- **Falta:** engine de regras (peso por evento/atributo) + **decay temporal** (envelhecimento) + recompute em batch.
- **Como:** tabela `lead_scoring_rules` (peso, decay_dias, condição) + cron edge fn `score-recompute`
  que recalcula `lead.score` (eventos recentes − decay). Reusa os eventos já capturados.
- **Verifica:** lead novo com interação sobe; lead parado decai ao longo dos dias (teste com 2 leads).

### A2 — NBA (Next-Best-Action) generativo  ·  esforço ~M
- **Falta:** LLM que recomenda a próxima ação (`{ acao, motivo, prioridade }`) por lead.
- **Como:** edge fn `lead-nba` → contexto (score, etapa, últimas N msgs, playbook ativo) → Gemini via
  nosso gateway → grava `lead_nba_sugestao`. Estende o painel "Radar IA" existente pra exibir.
- **NOSSO DIFERENCIAL (ele não tem):** a NBA do Lovable só *sugere*. A nossa **executa** —
  botão "Aplicar" dispara no **WhatsApp real** (Evolution) ou enfileira cadência. Recomendação → ação.
- **Verifica:** lead quente gera sugestão acionável + botão que dispara mensagem real.

### A3 — Daily-report com LLM  ·  esforço ~P (menor)
- **Falta:** só a **chamada ao LLM** — o coletor de contexto (`daily-report-ai`) já existe.
- **Como:** após o gather, mandar os KPIs/eventos pro Gemini (`response_format: json_object`) →
  `{ resumo, destaques[], alertas[], recomendações[] }`, com fallback gracioso (sem crédito → estrutura atual).
- **Verifica:** relatório do dia traz texto gerado (não só números), com destaques/alertas.

---

## 3. TRACK B — Coesão & polimento (o gap que se sente)

### B1 — Estender o re-skin premium pra fora do salão  ·  esforço ~M-G
- Salão (6 telas) **✅ feito**. Levar o mesmo padrão (Card/Table/Dialog/Badge, dark via tokens,
  gráficos recharts) pras telas **tenant-facing** do CRM que o dono de salão usa
  (leads/inbox/relatórios), e pro **ModuleHub** (cards premium, agrupados).
- *Escopo consciente:* priorizar o que o **dono de salão vê**; o admin profundo (300 arq.) é 2ª onda.

### B2 — Unificar a navegação  ·  esforço ~M
- Hoje: ModuleHub → "apps separados". Alvo: shell **coeso** estilo cloud-beauty-ai
  (1 sidebar agrupada — Principal/Operacional/Atendimento/Gestão — + seletor de salão), reduzindo
  a sensação de fragmentação. Reusa a `SalaoLayout` premium como base do shell unificado.

---

## 4. Sequenciamento (paralelo)

| Sprint | Track A (IA) | Track B (coesão) |
|---|---|---|
| **S1** | A3 daily-report-LLM (rápido, fecha 1 gap já) | ModuleHub premium + shell unificado (B2) |
| **S2** | A1 scoring com decay | Re-skin telas tenant-facing do CRM (B1) |
| **S3** | A2 NBA generativo + **botão que executa** (WhatsApp real) | Acabamento + responsivo/dark |

Cada item entra como sprint verificável (critério binário). Edge functions vão via Supabase MCP
(deploy_edge_function/apply_migration) — preciso confirmar o **project ref** do Supabase do NexvyBeauty
e que estou logado pra verificar as telas autenticadas (ou uso o padrão `/demo`).

---

## 5. Critério de sucesso (declarativo)

- [ ] **A1** scoring sobe com interação e decai com inatividade (2 leads de teste).
- [ ] **A2** NBA gera sugestão acionável + botão dispara mensagem **real** no WhatsApp.
- [ ] **A3** daily-report traz texto gerado por LLM (resumo/destaques/alertas).
- [ ] **B1/B2** dono de salão navega num produto **coeso e premium** ponta a ponta (ModuleHub →
      salão → CRM tenant) — sem "cara de apps colados".
- [ ] Resultado: NexvyBeauty supera o cloud-beauty-ai em **capacidade + integrações + coesão + IA**.

---

## 6. O que NÃO fazer (guard-rails)

- ❌ **Não rebasear** pro stack Lovable/TanStack/Cloudflare — jogaria fora WhatsApp/Cakto/email/
  soberania (o nosso moat) por ganho só arquitetural + lock-in.
- ❌ **Não migrar dados** do cloud-beauty-ai (template vazio; nada a trazer).
- ✅ Usar o cloud-beauty-ai como **referência de arquitetura/UX-alvo** e de **2 features** (scoring-decay
  patterns, NBA), portadas pra nossa infra real.

---

## 7. Progresso — sessão 2026-06-23 (last-mile A1/A2 + Track B paralelo)

**A1 (scoring com decay) — FECHADO:**
- ✅ Decay cron instalado (`cron.job` `lead-score-decay`, `0 6 * * *` → `select recompute_lead_scores()`). Antes: `decay_cron=0` (score congelado). Agora envelhece sozinho.
- ✅ Coluna **Score** na lista de leads (`LeadsTable.tsx` + novo `LeadScoreBadge.tsx`, sortable por `score`).

**A2 (NBA generativo) — FECHADO:**
- ✅ Novo `LeadNbaCard.tsx`: botão **Gerar** (`lead-nba`) + **Aplicar (WhatsApp)** (`evolution-send`) + Copiar/Descartar.
- ✅ Montado em `RadarLeadDetailSheet.tsx` (painel Radar IA) **e** `LeadDetailPage.tsx` (aba Resumo).
- ✅ Prova E2E ao vivo: `lead-nba {dry_run}` → `mode:llm`, NBA acionável + msg pronta pra WhatsApp.

**Infra:** `types.ts` regenerado do schema vivo (saúde de tipos 47→20 erros, todos pré-existentes; meus arquivos limpos). `vite build` ✅ verde. (`tsc -b` é vermelho por design no projeto — não é gate; vite é.)

**Track B (coesão):** rodando em worktree isolado `cascade/track-b-coesao` (agente de fundo) — shell unificado + re-skin tenant-facing. Merge + verificação após retorno.

**Resta:** revisar/mergear Track B · build+deploy VPS combinado · prova anti-phantom · screenshots.
