# Plano — CRM de Plataforma (reimport DESACOPLADO) + Instagram DM

**Data:** 2026-07-01 · **Modelo de execução:** `/loop` com Claude (Opus) como **orquestrador + revisor** disparando **N subagentes** por tarefa; validação visual (Chrome) ao fim de cada fase. · **Supersede** a recomendação de "reuso" de `analise-crm-plataforma-super-admin-2026-07-01.md` (refutada: CRM do fork está morto/salon-reframed).

---

## 1. Requisito (reformulado)

O super-admin (a plataforma NexvyBeauty enquanto SaaS) precisa de um **CRM de venda de SaaS próprio**, para prospectar e converter salões em assinantes. Ele deve ser **REIMPORTADO do original limpo** (`crm-src` = novo-remix-vendus-v4, 100% SaaS-sales, salon-free) e ser **TOTALMENTE DESACOPLADO** do CRM do tenant (salão) — **jamais** compartilham tabela, componente ou rota. Adicionalmente, portar **Instagram DM** (mensageria) do mesmo original.

**Por que reimport e não reuso** (provado no código): o CRM herdado no fork está **morto ou salon-reframed** — `CommissionManager`/`GoalsManager`/`StageValueManager`/`SquadManager` = 0 referências (órfãos); `/leads` e `/pipeline` viraram "Contatos"/"Funil" de salão no cockpit do tenant; `admin/booking/*` deletado. Reusar = ressuscitar código morto **ou** acoplar plataforma↔tenant (proibido).

---

## 2. Decisões de arquitetura (⚠️ confirmar antes de disparar)

| # | Decisão | Default recomendado | Alternativa |
|---|---|---|---|
| **D1** | Isolamento de dados | Tabelas **`platform_crm_*`** em `public`, **sem `organization_id`** (dado global da plataforma, como `sales_leads`), **RLS = só super_admin**. UI em `src/components/superadmin/crm/`, hooks `usePlatformCrm*`, seções no super-admin. Nunca importa componente do `admin/` (tenant). | Schema Postgres separado `platform_crm.*` (mais isolado, porém atrito com PostgREST/RLS do Supabase) |
| **D2** | Modelo de pipeline | **1 pipeline default da plataforma** (`platform_crm_pipeline_stages`, sem product_id): Novo→Contatado→Demo→Proposta→Ganho/Perdido (`is_won`/`is_lost`) | Pipeline por tier de plano (mais complexo) |
| **D3** | **Alvo do Instagram DM** | **Inbox do TENANT** (reativar a feature que está desligada, via porte limpo) — IG é canal cliente↔salão | Instagram da PLATAFORMA (super-admin prospecta por IG) |
| **D4** | Escopo v1 | **Track A core:** leads + pipeline/kanban + deals + inbound (`sales_leads`→platform) + seção super-admin. Profundidade (comissões/metas/squads/cadências/tarefas/tags) = fases posteriores | Tudo de uma vez (maior risco/tempo) |

> **D3 é a única ambiguidade real.** Minha leitura: IG DM = reativar no **inbox do tenant** (era feature de salão, foi desligada por não funcionar; o porte a torna real). Se você quer IG DM pro **super-admin vender**, é retarget pequeno. Confirme.

---

## 3. Riscos

| Sev | Risco | Mitigação |
|---|---|---|
| 🔴 ALTO | **Vazamento de isolamento** — platform CRM visível ao tenant, ou vice-versa | RLS explícita `is_super_admin()`; `get_advisors` (security) por fase; **teste no Chrome logado como tenant** provando invisibilidade |
| 🔴 ALTO | **Instagram E2E** exige Meta App + conta IG business real | Validar UI de config + handshake do webhook; send/recv real fica gated a credencial (marco separado) |
| 🟡 MÉDIO | Componentes reimportados carregam premissas do `crm-src` (hooks/paths/types) | Cada subagente reescreve a camada de dados p/ `platform_crm_*`; `tsc --noEmit` por fase (build vite ignora tipos) |
| 🟡 MÉDIO | Pipeline product-scoped no original → single-pipeline na plataforma | D2 redesenha; migration própria |
| 🟢 BAIXO | Colisão de nomes | Prefixo `platform_crm_` + pasta `superadmin/crm/` |

---

## 4. Plano por fases (tarefas = subagentes; cada uma com critério binário + validação Chrome)

> Legenda: **BIN** = critério binário de sucesso · **👁 BROWSER** = validação visual no Chrome · **🔒 NÃO-VAZAMENTO** = prova de que não tocou o tenant.

### FASE 0 — Fundação: schema isolado + RLS *(1 subagente; barreira)*
- **T0.1** Migration `platform_crm_*` (leads, pipeline_stages, deals, lead_stage_history, tags, lead_tags, tasks, notes). Sem `organization_id`. RLS: `is_super_admin()` p/ tudo.
  - **BIN:** migration aplica; `list_tables` mostra as tabelas; `get_advisors(security)` sem erro novo; `select` como anon = 0 linhas/negado.
  - **👁 BROWSER:** n/a (schema) — provar via SQL.
  - **🔒 NÃO-VAZAMENTO:** nenhuma FK/edit em `leads`/`deals`/`pipeline_stages` (tenant).
- **T0.2** Seed pipeline default (6 estágios) + 2-3 leads sintéticos p/ validação visual.
  - **BIN:** 6 stages + ≥2 leads em `platform_crm_*`.

### FASE 1 — Reimport dos componentes de CRM (desacoplados) → `superadmin/crm/` *(N subagentes paralelos, 1 por cluster)*
- **T1.1** Kanban: copiar `KanbanBoard`+cols/filters/cards/StageManagerDialog do `crm-src` → `superadmin/crm/kanban/`, reescrevendo dados p/ hooks `usePlatformCrm` (tabelas novas).
  - **BIN:** `npm run build` verde; componente lê `platform_crm_leads`/`_pipeline_stages`.
  - **👁 BROWSER:** (após Fase 2 montar a rota) kanban renderiza com os leads seed.
- **T1.2** Leads: `LeadsManager`+Table/Filters/KPICards/Create/Import → `superadmin/crm/leads/`, reescrito p/ `platform_crm_leads`.
  - **BIN:** build verde; lista lê tabela nova.
- **T1.3** Deals + notas + tags: reimport mínimo p/ o funil fechar (ganho/perdido).
  - **BIN:** build verde.

### FASE 2 — Seção "Vendas da Plataforma" no super-admin *(1 subagente; barreira)*
- **T2.1** Adicionar seção em `SuperAdmin.tsx` + `SuperAdminSidebar` (abas Funil/Contatos/Negócios), guardada `super_admin`.
  - **BIN:** build+deploy; rota existe.
  - **👁 BROWSER:** `gestao.nexvybeauty.com.br/super-admin` → item "Vendas da Plataforma" → **kanban com leads seed renderiza**; abas trocam.
  - **🔒 NÃO-VAZAMENTO:** logado como **tenant** em `app.*`, a seção **não existe/none reachable**.

### FASE 3 — Inbound: `sales_leads` (LP) → `platform_crm_leads` *(1 subagente)*
- **T3.1** Edge/trigger que promove cada `sales_leads` novo em `platform_crm_leads` (estágio "Novo"), preservando UTM/origem.
  - **BIN:** inserir 1 `sales_leads` cria 1 `platform_crm_lead`.
  - **👁 BROWSER:** submeter form da LP pública → lead aparece no kanban "Novo" do super-admin.

### FASE 4 — Instagram DM (porte limpo do original) — **Track B** *(N subagentes)*
- **T4.1** Migration `instagram_connections` + `instagram_webhook_logs` (tenant-scoped, `organization_id`, segredos AES-256).
- **T4.2** Deploy edges `instagram-draft/connect/webhook/send/test` (`--project-ref fzhlbwhdejumkyqosuvq`; webhook `verify_jwt=false`).
- **T4.3** Portar `InstagramWizard` + `InstagramConnectionsPanel` p/ integrações do tenant; ligar recepção ao `webchat_conversations` (channel=instagram).
  - **BIN:** build+deploy; wizard renderiza; handshake GET do webhook responde `hub.challenge`.
  - **👁 BROWSER:** tenant → Integrações → Instagram → wizard abre; cria conexão draft (gera verify_token + URL).
  - **🔒 NÃO-VAZAMENTO:** IG é tenant-scoped por `organization_id`/RLS; não toca `platform_crm_*`.
- **T4.4** (gated) Reativar `feature_instagram` nos planos **só depois** de E2E provado com conta Meta real.

### FASE 5 — Validação E2E no Chrome + prova de desacoplamento *(orquestrador)*
- **T5.1** Walkthrough: super-admin opera funil da plataforma (criar lead → mover estágio → fechar deal). Tenant opera salão sem ver nada da plataforma. IG DM: wizard + handshake.
  - **👁 BROWSER:** screenshots de cada marco.
  - **🔒 NÃO-VAZAMENTO:** confirmado nos 2 hosts (gestao.* vs app.*).

---

## 5. Modelo de orquestração `/loop`

1. **Orquestrador (eu)** lê a fase atual → dispara **subagente(s)** por tarefa (prompt self-contained: objetivo + arquivos + BIN + proibições de não-vazamento; **não** buildar/commitar/deployar — eu faço).
2. Subagentes retornam → **eu reviso** o diff, rodo `tsc`/`build`, **deploy** (VPS), **valido no Chrome** (👁 BROWSER da fase).
3. Se BIN + BROWSER ✅ e 🔒 provado → **avanço** a fase. Senão → re-disparo subagente com correção.
4. `/loop` pacing entre fases; eu seguro cada marco pra você revisar quando quiser.

**Regra de barreira:** Fases 0 e 2 são barreira (sequenciais). Fase 1 e Fase 4 têm tarefas **paralelas** (clusters disjuntos). Fase 3 depende de 0-2.

---

## 6. Critério de "pronto" (declarativo)

- Super-admin tem funil de venda de SaaS funcional (leads→estágios→deal ganho/perdido), **provado no Chrome**, alimentado pelo inbound da LP.
- **Zero** compartilhamento com o CRM do tenant (provado nos 2 hosts + RLS + advisors).
- Instagram DM: wizard + webhook handshake operacionais no tenant (send/recv real gated a credencial Meta).
- Tipos regenerados; build verde; deploy servindo bundle novo (prova por string no bundle).

---

## 7. Gate de aprovação

**Aguardando confirmação** para iniciar o `/loop`. Confirme (a) as decisões §2 — em especial **D3 (alvo do Instagram DM)** e **D4 (escopo v1)** — e eu disparo a Fase 0.
