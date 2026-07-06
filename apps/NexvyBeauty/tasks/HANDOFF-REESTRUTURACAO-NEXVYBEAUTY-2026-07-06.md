# HANDOFF-MESTRE — Reestruturação NexvyBeauty (6 eixos)

> **Propósito:** transferir o estado COMPLETO da reestruturação do NexvyBeauty para uma sessão nova (conta paralela, Fable 5). O redesign visual é **1 de 6 eixos** — este é o documento guarda-chuva. O detalhe do eixo visual está no par [HANDOFF-REDESIGN-LUX-ROSE](HANDOFF-REDESIGN-LUX-ROSE-2026-07-06.md).
> **Data:** 2026-07-06 · **Autor:** sessão `75021603` (Opus 4.8) · **Repo:** `github.com/mfalcao09/SaasPlugin_vite` @ `main` `5e0e36c` (sincronizado com origin)
> **Base factual:** workflow `whse62dzc` (4 agentes, 10 memórias + 3 roadmaps + git) + verificação em disco. Artefatos citados foram **conferidos por existência** (os que a investigação alucinou estão marcados como "só em memória").

---

## 0 · TL;DR

A reestruturação tem **6 eixos**. O que está **no ar/em prod**: confinamento multi-host (E3), preço fonte-única (E5), módulos-fixos+planos+gating, autopilot de venda F0–F2 (número Cloud API oficial respondendo), Beauty Rosé no app, Nexvy Lux L1–L3 no gestao (5 telas P1). O que **falta** (frentes de dias, não "deploy pendente"): **EIXO 1 — pivot D3 multiproduto** (gestao = CRM do grupo p/ ~10 SaaS via `product_id`) **decidido mas NÃO executado**; autopilot Onda 5/6 + F4/F5/F6; Bloco B (operação da dona pós-venda); L4 do Lux (16 arquivos ainda com rosa). **Feito neste turno:** push dos 4 commits (agora `origin/main == 5e0e36c`) + estes 2 handoffs. **Segurado (não deployado de propósito):** atribuição Cakto (sem pagamento-teste), ERP e `cakto_*/affiliate_*` (sessão paralela de afiliados em voo).

---

## 1 · Sessões / contas envolvidas (a reestruturação foi multi-conta)

| originSessionId | Período | Eixos que originou |
|---|---|---|
| **`986d864f-…721352`** | 30/06–02/07 | **TRONCO** — CRM multiproduto (D3), gestao modular CRM/ERP, confinamento multi-host, módulos-fixos+planos |
| `22085aba-…7153e` | 05–06/07 | Nexvy Lux + tema-órfão azul + preço fonte-única |
| `0da479d7-…f46eae` | 06/07 | Beauty Rosé (app.*) |
| `b39039b0-…106779` | 05/07 | SDR nunca-rejeita + roteamento Fable |
| **`75021603-…d342a4`** | 06/07 | **ESTA** — aplicou Lux L3 + Rosé + push + estes handoffs |
| `05dc4b38-…` (nota) | — | sessão/máquina COM Supabase MCP (migrations via `apply_migration`) |

JSONLs locais: `~/.claude/projects/-Users-marcelosilva-Projects-GitHub/<ID>.jsonl`. Evidência de multi-máquina (verbatim em memória): *"Aplicação = Supabase CLI --linked (NÃO há Supabase MCP nesta máquina)"* vs outra sessão com MCP conectado ao `fzhlbwhdejumkyqosuvq`.

---

## 2 · Os 6 EIXOS (espinha dorsal)

| Eixo | O quê | Status (verificado) | Fonte |
|---|---|---|---|
| **E1 · Pivot D3 multiproduto** | gestao.* deixa de ser CRM de 1 produto → **CRM DO GRUPO** p/ ~10 SaaS via dimensão `product_id`/`platform_crm_products` (não 10 ports). + migração de domínio → `gestao.nexvy.tech`. Sequência travada: D3→domínio→LOTE L1-L13→D1(b)…D10(a)→Utmify por último. | 🔴 **DECIDIDO, NÃO EXECUTADO.** Domínio `gestao.nexvy.tech` já serve o bundle (HTTP 200), mas a dimensão `product_id` atrás dele **não foi implementada**. | memória `project_crm_grupo_multiproduto_decisoes_2026-07-02` |
| **E2 · Modular ModuleSwitcher** | Módulo VENDAS (CRM Vendus Remix desacoplado em `platform_crm_*`) + Módulo ERP/GESTAO (super-admin). Máxima: **CRM+ERP do tenant × CRM+ERP da operação — nunca fundir a fronteira.** | 🟡 Vendas portado 1:1 (registry ZERO EmBreve, motor E2E live). ERP **intocado**. Pendente: desacoplar `AffiliatesPanel` (sessão conjunta). Nenhum dos 4 commits tocou o ModuleSwitcher. | memória `reference_nexvybeauty_gestao_modular_crm_erp_2026-07-01` |
| **E3 · Confinamento multi-host** | 1 SPA serve 3 hosts (app.* operador / gestao.* super-admin / apex+www marketing). `HostConfinementGuard` client-side; sessão Supabase por-origem. | 🟢 **EM PROD** (commits `f219193`/`5c3b1db` anteriores). Sustenta o branding host-aware que o redesign reusa. | memória `reference_nexvybeauty_multihost_confinamento_2026-06-30` |
| **E4 · Autopilot Duda→Bia** | SDR que **NUNCA rejeita venda** (pagou = cliente); score roteia OFERTA (plano/upsell/cross-sell), nunca aceita/rejeita; Duda→Bia = UPGRADE; Bia = closer modelo forte. | 🟡 **F0–F2 provado E2E** (número Cloud API oficial no ar, webhook inbound provado, Duda respondeu sozinha). **Pendente:** Onda 5 (scoring determinístico + Bia master-closer + evals), Onda 6 (revival Vendus, 8 itens), F4/F5 (Cakto blindado + prova de fogo até pagamento), F6 (carteira-do-WhatsApp). | `tasks/PLANO-AUTOPILOT-VENDA-2026-07-05.md`, memória `project_sdr_nunca_rejeita_venda...` |
| **E5 · Preço fonte-única** | `public_plans` no DB é a fonte; personas **nunca guardam número** — brain injeta em runtime. Vale pros ~10 SaaS. | 🟢 **EM PROD** (go-live 05/07). Essencial 217 / Premium 387 / Ultra 687 no `fzhlbwhdejumkyqosuvq`. | memória `feedback_preco_fonte_unica_db_playbook_2026-07-05` |
| **E6 · Redesign duplo** | Beauty Rosé (app) + Nexvy Lux (gestao). Lux SUPERSEDE o azul `#0A52D1` (não restaurar). | 🟢 Rosé aplicado; Lux L1–L3 no ar (5 telas P1). 🔲 **L4 falta** (varredura P2/P3). **Único eixo que o handoff de redesign cobre.** | [HANDOFF-REDESIGN-LUX-ROSE](HANDOFF-REDESIGN-LUX-ROSE-2026-07-06.md) |

**Sub-eixos:** módulos FIXOS + planos por quota com gating enforced (🟢 prod, `1fad84b`) · medidor de uso v1.1 sobre tarifa Meta oficial (⏸️ adiado, 0 clientes) · canal WhatsApp da operação (🟡 dormente, aguardando QR do Marcelo + decisão Evolution × Meta Cloud).

---

## 3 · Backlog pendente consolidado

| Item | Tipo | Prova de pendência |
|---|---|---|
| **E1 · Pivot D3** (`product_id` + migração domínio) | arquitetura (dias) | memória D3 "decidido, execução pendente"; frente sequenciada |
| **E6 · Onda L4 do Lux** (P2 18 + P3 29 telas) | código | **16 arquivos** em `src/components/superadmin/` ainda com `text-pink-500`/`#EC4899`; nenhum `TEMPLATE-UI-GESTAO_v2` existe |
| **Atribuição Cakto por agente** | pagamento-teste | código no workflow `wqkcbsgp4`, **não deployado**; falta 1 pagamento real p/ reconciliar slug (`duda-sdr` vs `duda`) |
| **Bloco B — operação da dona pós-venda** | código | `tasks/AUDITORIA-AUTOPILOT-DIA0.md`: B2 (slug no provisionamento) marca **BLOQUEIA** → `/s/<slug>` em 404; B5/B6/B7 (seed serviços / automações `enabled=false` / Radar) FALTA/PARCIAL |
| **F4/F5 autopilot** (Cakto blindado + prova de fogo) | infra + pagamento | `PLANO-AUTOPILOT-VENDA-2026-07-05.md` §F4/F5 sem ✅ (F0-F2 têm ✅) |
| **Onda 5/6 autopilot** (Bia master-closer, revival Vendus 8 itens) | código | mesmo plano, "FILA — Onda 5/6"; só 5.2 ✅. *Nota: `25430d2` sugere 5.5/score QCR-V tocados, sem marca no plano* |
| **Revisão adversarial Fable** (L3 Lux + Rosé) | qualidade | só gate objetivo rodou (Fable sem crédito) |
| **IG/Messenger inbox** | código + externo | `tasks/todo-ig-messenger-inbox.md` quase 100% aberto; App Review Meta = gargalo externo |
| **F4 lançamento — Pilotos** | venda humana | `ROADMAP-LANCAMENTO-OFERTA-V3` F1/F2/F3 ✅, **F4 é HUMANO** (Marcelo vende, loop monitora) |

---

## 4 · Fronteiras INVIOLÁVEIS (não tocar sozinho)

1. **NÃO mexer no Módulo ERP/GESTAO** sem sessão conjunta. Desacoplar `AffiliatesPanel` = decisão conjunta (máxima E2: nunca fundir tenant↔plataforma).
2. **NÃO editar `cakto_*` / `affiliate_*` / `cakto_credentials`** — há **sessão paralela de afiliados EM VOO (outra conta)**. Risco alto de sobrescrever trabalho em andamento.
3. **NÃO iniciar E1 (D3 + migração de domínio) como "deploy do pendente"** — é reestruturação de espinha dorsal, exige Plan Mode próprio + validação.
4. **NÃO restaurar o azul `#0A52D1`** — foi supersedido pelo Nexvy Lux.

---

## 5 · Gotchas transversais

- **Service Worker / PWA:** `/sw.js` cacheia agressivo. Sem versionamento/`skipWaiting`, **usuários reais podem não ver NENHUM deploy** até o SW atualizar — isso invalida silenciosamente "está no ar". `curl` não usa SW (por isso vejo `DcPLkMzY`); um browser com SW antigo pode ver o velho. **Follow-up pendente.**
- **Liveness do Lux só objetiva:** L1–L3 confirmados por computed-style (`--primary #213156`) + bundle, mas a **revisão adversarial visual (Fable) NÃO rodou**. Marcar como "no ar, não auditado visualmente".

---

## 6 · Estado no sistema + repositório

| Item | Valor |
|---|---|
| **Repo / HEAD** | `main` `5e0e36c` · **`origin/main == local`** (push feito neste turno; ahead/behind 0/0) |
| **Bundle no ar** | `assets/index-DcPLkMzY.js` — HTTP 200 em `app.nexvybeauty.com.br` **e** `gestao.nexvy.tech` (verificado) |
| **Container** | `nexvy-beauty` (svc `nexvy-beauty-svc`) — 1 serve os 3 hosts. Gestao roteado por `/opt/stacks/traefik/dynamic/nexvy-gestao-grupo.yml` |
| **Supabase** | `fzhlbwhdejumkyqosuvq` · EFs `platform-meta-whatsapp-webhook` + `platform-sales-brain` ACTIVE (autopilot F0-F2) · `platform_settings.primary_color='#C54B60'` |
| **Deploy frontend** | `rsync … vps-hostinger:/opt/stacks/saasplugin-vite/` → `ssh vps-hostinger "cd … && bash infra/deploy-vps.sh NexvyBeauty nexvy-beauty nexvybeauty.com.br"` (gate anti-phantom) |
| **Deploy EF** | `supabase functions deploy <fn> --project-ref fzhlbwhdejumkyqosuvq` (webchat/brain exigem JWT — **sem** `--no-verify-jwt`) |

---

## 7 · Artefatos-fonte (conferidos em disco)

**✅ Existem no repo (`apps/NexvyBeauty/tasks/`):** `AUDITORIA-AUTOPILOT-DIA0.md` (Bloco B) · `PLANO-AUTOPILOT-VENDA-2026-07-05.md` (F0-F6, ondas 5/6) · `todo-ig-messenger-inbox.md` · `ROADMAP-LANCAMENTO-OFERTA-V3-2026-07-04.md` · `ROADMAP-CONSOLIDADO-VITRINE-2026-06-23.md` · `PLANO-REDESIGN-LUX-GESTAO-2026-07-06.md` · `TEMPLATE-UI-GESTAO-2026-07-05.md` · `lux-reference/` + `rose-reference/` (CSS Lovable) · `HANDOFF-REDESIGN-LUX-ROSE-2026-07-06.{md,html}`.

**⚠️ Referenciados nas memórias mas NÃO encontrados em disco** (o conteúdo vive nas memórias, não persiste como doc — não perseguir estes paths): `tasks/d3-multiproduto/CONTRATO-DIMENSAO-PRODUTO.md`, `tasks/auditoria-portagem/*`, `docs/blueprint-super-admin-modular-*`, `docs/porte-modulo-vendas-DONE-*`. Para o conteúdo de E1/E2, **ler as memórias** `project_crm_grupo_multiproduto_decisoes_2026-07-02` e `reference_nexvybeauty_gestao_modular_crm_erp_2026-07-01`.

**Memórias-chave** (em `~/.claude/projects/-Users-marcelosilva-Projects-GitHub/memory/`): as 6 do redesign/preço/host-aware + `project_crm_grupo_multiproduto_decisoes_2026-07-02` + `reference_nexvybeauty_gestao_modular_crm_erp_2026-07-01` + `reference_nexvybeauty_multihost_confinamento_2026-06-30` + `project_sdr_nunca_rejeita_venda_consultora_planos_2026-07-05` + `project_nexvybeauty_modulos_fixos_planos_2026-06-19`. Todas indexadas em `MEMORY.md`.

---

## 8 · Como retomar (roteiro padrão) + decisão de sequência

**Regra:** cada frente entra com **Plan Mode** em `tasks/todo.md` (checks binários) → subagentes Opus (spec detalhada, teto 10–12, 1 workflow por vez) → verificação com prova → Fable revisa → deploy com DEPLOY-VERDE → commit em `main`.

**Sequência recomendada (a decidir com Marcelo):**
1. **E1 — Pivot D3** é a espinha dorsal decidida-mas-não-executada; maior alavanca. É frente de dias, exige plano próprio (ler memória D3 primeiro).
2. **E6 — L4 do Lux** é polish cosmético (16 arquivos), baixo risco, pode rodar em paralelo por não colidir com E1.
3. **E4 — F4/F5 + Bloco B** destrava a venda real (org nasce com slug, Cakto blindado). Depende de 1 pagamento-teste.

> Não prescrever E1 sem confirmação: é o pivô da plataforma. L4 é o candidato natural para "continuar em paralelo" enquanto E1 é planejado.

---

## 9 · PROMPT DE LANÇAMENTO (colar na sessão nova, Fable 5)

```
Contexto: retomo a REESTRUTURAÇÃO do NexvyBeauty (não só o redesign). Repo
github.com/mfalcao09/SaasPlugin_vite, app apps/NexvyBeauty/, branch main sincronizada em 5e0e36c.
Leia PRIMEIRO, nesta ordem:
1. apps/NexvyBeauty/tasks/HANDOFF-REESTRUTURACAO-NEXVYBEAUTY-2026-07-06.md (mestre, 6 eixos)
2. apps/NexvyBeauty/tasks/HANDOFF-REDESIGN-LUX-ROSE-2026-07-06.md (deep-dive do eixo visual)
3. Memórias: project_crm_grupo_multiproduto_decisoes_2026-07-02 (EIXO 1 = espinha),
   reference_nexvybeauty_gestao_modular_crm_erp_2026-07-01, project_sdr_nunca_rejeita_venda...

Estado no ar: confinamento multi-host (E3), preço fonte-única (E5), módulos-fixos+gating,
autopilot F0-F2 (número Cloud API respondendo), Beauty Rosé (app), Nexvy Lux L1-L3 (gestao),
bundle DcPLkMzY nos 3 hosts. Pendente: EIXO 1 (pivot D3 multiproduto + migração domínio,
DECIDIDO mas NÃO executado), L4 do Lux (16 arquivos com rosa residual), autopilot Onda 5/6 +
F4/F5/F6, Bloco B (operação da dona pós-venda — slug BLOQUEIA).

FRONTEIRAS INVIOLÁVEIS (não tocar sozinho): Módulo ERP/GESTAO; cakto_*/affiliate_*/cakto_credentials
(sessão paralela de afiliados EM VOO em outra conta); não restaurar o azul #0A52D1; não iniciar
E1 como "deploy do pendente" — é frente de dias com plano próprio. Gotcha: service worker/PWA
pode esconder deploys de usuários reais — validar SW antes de declarar liveness.

Tarefa: comigo (Marcelo), decidir QUAL frente avançar — provável E1 (D3, espinha, precisa Plan
Mode próprio) ou E6-L4 (polish, baixo risco, paralelizável). Roteiro padrão: Plan Mode em
tasks/todo.md com checks binários → subagentes Opus (teto 10-12, 1 workflow por vez) → verificação
com prova (computed==REF / tsc / grep) → Fable revisa adversarial → deploy DEPLOY-VERDE → commit
em main. Segurar: atribuição Cakto (falta pagamento-teste). Nada "pronto" sem prova.
```

---

## 10 · Ressalvas honestas

- **Push já estava feito** quando o workflow sintetizou (por isso a síntese disse "push desnecessário") — eu pushei os 4 commits neste turno e confirmei `origin/main == 5e0e36c`, 0/0. Não há contradição: está no GitHub.
- **A investigação alucinou 4 paths** de artefatos (D3 contract, blueprints). Removidos — o conteúdo real de E1/E2 está nas **memórias**, não em docs no repo.
- **Cakto segurada** — deployar `?src=` não-provado = atribuição de venda quebrada na raiz. Só após 1 pagamento-teste.
- **Liveness ≠ auditado** — L1–L3 do Lux confirmados por computed-style, mas sem revisão visual Fable e sob risco do service worker.
