# Mapa de REASSENTAMENTO — NexvyPayments dentro do ecossistema NexvyTech

> **Contexto:** consolidação dos 4 leitores (monorepo-infra, beauty-template, beauty-motores, beauty-vs-vendus).
> **Instrução verbatim do usuário:** "prepare tudo para que o NexvyPayments, seja um app embutido dentro do ecossistema NexvyTech".
> **Consumidor deste arquivo:** a sessão principal (orquestrador), que o lê para reescrever os 6 artefatos Vendus e preparar `apps/NexvyPayments/`.
> **Raiz do monorepo:** `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/` (paths relativos a ela salvo indicação absoluta).
> **Data:** 2026-07-06 · **Modo Conselheiro ativo.**

---

## 1) VEREDITO DE BASE — Beauty/SaasPlugin, NÃO Vendus clonado

**[Certo] Partir do NexvyBeauty (dentro do monorepo `SaasPlugin_vite`), NÃO do CRM Vendus clonado em repo separado.** A pergunta do replanejamento ("Beauty vs Vendus?") é uma **falsa dicotomia** — o Leitor 4 provou que **Beauty *É* o Vendus**, então "partir do Beauty" já é "partir do Vendus", só que da versão mais avançada, já embutida no monorepo, com o padrão de deploy pronto. Continuar clonando o Vendus para dentro do monorepo seria re-fazer à mão o trabalho que o Beauty já consolidou.

### Evidência de linhagem (MESMA base de código — família Bizon→Vendus→Beauty)
| Prova | file:line |
|---|---|
| Cópia literal do fonte Vendus dentro do Beauty | `apps/NexvyBeauty/.vendus-src-reference/` (repo Vendus inteiro: src/, 140 edges, `bun.lockb`, `.lovable/`) |
| Título "Remix do Vendus" | `apps/NexvyBeauty/.vendus-src-reference/REMIX.md:1` |
| Origem Lovable comum | `apps/NexvyBeauty/.vendus-src-reference/README.md:1` ("Welcome to your Lovable project") |
| Funções-gate herdadas (Beauty assume helper Vendus como pré-existente) | `apps/NexvyBeauty/supabase/migrations_platform_crm/20260701_platform_crm_schema.sql:603,639` (`has_role já existe`; `has_role(auth.uid(),'super_admin'::app_role)`) |
| Motor byte-idêntico | `apps/NexvyBeauty/supabase/functions/_shared/post-sale-engine.ts` (diff vazio vs vendus-ref) |
| Config shadcn byte-idêntica | `apps/NexvyBeauty/components.json` (diff vazio; 52 componentes UI iguais) |
| Stack idêntica | `.vendus-src-reference/package.json` → `vite_react_shadcn_ts`, react 18.3.1, vite 5.4.19, supabase-js 2.90.1 |

**Por que Beauty e não Vendus-repo-separado:**
1. Beauty já está **embutido no monorepo** — deploy (`make deploy-<app>`), Dockerfile único, Traefik file-provider, cascade — tudo pronto. Vendus é repo externo → teria de ser re-integrado do zero.
2. Beauty é **estágio mais avançado da mesma linhagem**: já resolveu 2 gaps que o as-is Vendus marca como zero — LGPD (`migrations_salao/20260619_lgpd_consents.sql`) e automação (`migrations_salao/20260626_salon_automation_foundation.sql`). Partir do Vendus = re-implementar esses gaps.
3. Beauty introduziu a **separação de esteiras** (`migrations_platform_crm/` = CRM-da-plataforma tenant-of-one; `migrations_salao/` = produto multi-tenant com `organization_id`) — exatamente o padrão arquitetural que Payments precisa herdar.

> **Ressalva honesta (VERIFICAR):** o `infra/cascade-core.sh:11` forka o core **do NexvyOficinas**, não do Beauty. Beauty é a **referência de arquitetura** (este mapa); a **fonte de execução da cascata** é Oficinas (core sales-spark estável), com os avanços do Beauty (platform-shell modular, `usePlatformBranding` 3-modos, HostConfinementGuard) portados manualmente por cima. Decidir na hora do cascade: rodar `cascade-core.sh` (fonte Oficinas) OU `cp -r apps/NexvyBeauty` (fonte Beauty, mais features, mas exige limpar salão). **Recomendação: `cp -r apps/NexvyBeauty` + limpeza**, porque Payments precisa dos avanços de Beauty (platform-shell, 3-modos de branding), e o baseline SQL de 161 tabelas que o cascade aplica é o mesmo.

---

## 2) ÁRVORE CANÔNICA — esqueleto `apps/NexvyPayments/`

Espelha o app mais maduro (Beauty). Stack: Vite 5 + React 18 + SWC + TS + Tailwind3 + shadcn/Radix + React Router 6 + TanStack Query 5 + Supabase (Edge Functions Deno + Postgres RLS).

```
apps/NexvyPayments/
├── package.json                    # "name":"nexvy-payments" (kebab); deps herdadas de Beauty
├── package-lock.json
├── vite.config.ts                  # port 8080, alias "@"→src, SEM manualChunks (apps/NexvyBeauty/vite.config.ts:19-28)
├── tailwind.config.ts              # tokens HSL da marca cobrança
├── components.json                 # shadcn (byte-idêntico ao Beauty/Vendus)
├── tsconfig.{app,node}.json · eslint.config.js · postcss.config.js
├── index.html                      # <title>/theme-color/manifest da marca Payments (cf. apps/NexvyOficinas/index.html:6,14)
├── .env                            # LOCAL, ignorado (build local)
├── .env.production                 # VERSIONADO: VITE_SUPABASE_URL + anon key do projeto NOVO
├── public/                         # icons, sw.js, manifest, decor (rebrand)
├── docs/                           # blueprints + specs do produto (ver §7)
│   └── specs/                      # <-- artefatos Vendus reassentados aqui
├── tasks/                          # planos .md/.html + todo.md + subpastas de referência
├── supabase/
│   ├── config.toml                 # project_id + [functions.<webhook>] verify_jwt=false
│   ├── functions/                  # edges Deno + _shared/ (herda motores; +novos de cobrança)
│   │   └── _shared/                # orchestrator.ts, cadence-*, evolution-*, meta-*, cakto-*, tools/
│   ├── migrations_platform_crm/    # CRM-da-plataforma (tenant-of-one) — herda p/ vender Payments
│   └── migrations_cobranca/        # NOVO: núcleo multi-tenant (organization_id) — espelha migrations_salao/
└── src/
    ├── main.tsx                    # tema host-aware + SW + cache-bust (apps/NexvyBeauty/src/main.tsx:13-15)
    ├── App.tsx                     # providers + BrowserRouter + guards + Home host-aware
    ├── index.css                   # tokens :root/.dark + .theme-nexvy-institucional
    ├── config/
    │   ├── brand.ts                # ÚNICO ponto de cascade declarado (apps/NexvyBeauty/src/config/brand.ts:1-41)
    │   ├── modules.ts              # módulos de cobrança (troca erp_salao)
    │   ├── adminMenu.ts · integrationsCatalog.ts · aiModelsCatalog.ts
    ├── lib/
    │   ├── publicUrl.ts            # multi-host (só trocar APEX_BASE — publicUrl.ts:54)
    │   ├── colors.ts · lazyWithRetry.ts · api/
    ├── hooks/                      # useAuth, useSuperAdmin, useOrganizationPlan, usePlanModules, usePlatformBranding…
    ├── integrations/supabase/      # client.ts (gerado) + types.ts
    ├── pages/                      # Login, Admin, SuperAdmin, SalesPage, Public*, legal/, cobranca/
    ├── cockpit/                    # casca do operador/tenant (dashboard recebíveis, régua, inadimplência)
    ├── components/
    │   ├── ui/                     # shadcn primitives
    │   ├── auth/                   # ProtectedRoute, SuperAdminRoute, HostConfinementGuard
    │   ├── layout/                 # Sidebar, AppTopBar, MobileBottomNav, UnifiedShell
    │   ├── superadmin/             # platform-shell/ + crm/ + payments/ + branding/
    │   ├── brand/ · theme/
    │   └── admin/ + módulos cobrança # faturas, régua, boleto/PIX, NFS-e, conciliação
    └── types/
```

---

## 3) MOTORES — o que o Beauty JÁ dá vs o que é NOVO

### 3a. Herda pronto (motor agnóstico ao domínio — reaproveitamento quase 1:1)
| Motor | Cobertura | Âncoras (raiz do monorepo) |
|---|---|---|
| **Régua/cadência** | ~85% | `apps/NexvyBeauty/supabase/functions/cadence-tick/index.ts:1` (cron 5min, MAX_PER_TICK=50, delay/janela/condições), `cadence-enroll/index.ts:1` |
| **Régua-lite por evento** (o análogo mais próximo de "fatura vencendo") | forte | `apps/NexvyBeauty/supabase/functions/salon-automation-run/index.ts:1` (cron diário, dry-run, idempotência via unique index, TZ-safe) — `pacote_vencendo`→`fatura_vencida_D+1/D+3/D+7` |
| **Recuperação por status de pagamento** | parcial | `apps/NexvyBeauty/supabase/functions/cakto-recovery-trigger/index.ts:1` (`STATUS_TO_EVENT` :45) — acoplado a payload Cakto |
| **WhatsApp dual-provider** | 100% | `evolution-send/index.ts:1` (13 tipos msg), `platform-meta-whatsapp-webhook/index.ts`, `_shared/meta-crypto.ts` (byte-idêntico) |
| **Agente IA + tools** (intenção `financeiro` já nativa) | ~80% | `_shared/orchestrator.ts:1` (Intent inclui `financeiro` :6; prompt `financeiro → boleto, reembolso, cobrança, nota fiscal` :51); `_shared/tools/registry.ts:5` (5 tools; `gerar_link_pagamento` é o esqueleto da futura `consultar_fatura`) |
| **Multi-tenant/super-admin/onboarding-ao-pagar** | 100% | `organization_id` universal (RLS); `useSuperAdmin.ts`; `create-organization-admin/index.ts`; `_shared/cakto-plan-provisioning.ts`; platform-shell módulo `erp` (registry.tsx:72-225) |
| **CRM-da-plataforma multiproduto** | 100% | `migrations_platform_crm/` + módulo `vendas` (registry.tsx:233-478) — grupo vende Payments pelo mesmo CRM (`product_id`) |
| **Livro-caixa/DRE (base de tela)** | parcial | `apps/NexvyBeauty/src/pages/salao/Financeiro.tsx:1` + tabela `lancamentos` (types.ts:5948) — lançamento retroativo, NÃO fatura |

### 3b. 100% NOVO — ausência estrutural do ecossistema inteiro (nunca existiu no Vendus nem no Beauty)
> **[Certo] O pilar central (motor de dinheiro real) é greenfield.** No Beauty todo "pagamento" sempre foi terceirizado a gateway de infoproduto (Cakto/Hotmart/Doppus) que apenas *avisa* via webhook. `boleto_barcode` só aparece como campo **lido** de webhook externo (`doppus-webhook/index.ts:382`); grep por `linha_digitavel/cnab/remessa/nosso_numero/notaas/rps` = **zero**.

1. **Integração bancária C6 (boleto + PIX)** — emissão (linha digitável, nosso número, CNAB/API), PIX cobrança (QR dinâmico/txid, copia-e-cola), **conciliação/baixa automática**. mTLS/certificado do banco (o "A0=PoC mTLS gate" da memória) sem análogo — o mais perto é OAuth client_id/secret Cakto (`cakto-client.ts:23`, muito mais simples). **VERIFICAR:** A0 mTLS gate é pré-requisito bloqueante.
2. **NFS-e via NotaAS** — emissão de nota fiscal de serviço municipal (RPS/série/CNPJ emitente). Território inédito.
3. **Entidade Fatura/Invoice** — não existe tabela `invoices`. `lancamentos` e `pacote_clientes` (types.ts:7968) são parentes, mas sem vencimento futuro, ciclo recorrente, status acionável (`emitida→enviada→vencida→paga→cancelada`), vínculo boleto/PIX, ou geração em lote.
4. **Pagador/Contrato de mensalidade** — `leads`+`deals` é funil one-shot. Falta contrato recorrente (pagador↔valor↔dia-venc↔ciclo↔status).
5. **Faturamento em lote com valor variável** — disparo em lote existe para *mensagens* (`campaign-dispatcher`), não para **gerar N cobranças** de planilha de medição (caso #1 água/condomínio).

**Resumo dos 4 pilares:** Cadastro ~70% · Emissão 0% · Régua ~85% · IA ~80%. Beauty entrega de graça os 3 pilares mais caros (régua, IA, infra multi-tenant/WhatsApp); falta o motor bancário/fiscal.

---

## 4) RECEITA DE ADIÇÃO AO MONOREPO

**Pré-requisitos:** projeto Supabase novo (dashboard) → `SUPABASE_REF`; DNS Cloudflare `nexvypayments.com.br → 145.223.29.96` (IP VPS, `cascade-core.sh:144`).

### Arquivos a CRIAR
| Path | Origem/receita |
|---|---|
| `apps/NexvyPayments/` (dir completo) | `cp -r apps/NexvyBeauty apps/NexvyPayments` → limpar `node_modules/ dist/ .temp/ .vendus-src-reference/`; editar `package.json` name→`nexvy-payments`, `index.html`, `src/config/brand.ts` |
| `apps/NexvyPayments/.env.production` (versionado) | `VITE_SUPABASE_URL` + anon key do projeto novo (formato `apps/NexvyGYM/.env.production`) — `.gitignore:8-11` força-inclui `!apps/**/.env.production` |
| `infra/traefik/NexvyPayments.yml.template` | topologia split app./gestao./apex → copiar `NexvyBeauty.yml.template` e **HARDCODAR domínio** nos 3 pares de router (o script NÃO passa domínio pro Beauty — `NexvyBeauty.yml.template:3-7,13,27,43`; passar `DOMAIN=app.x` gera `gestao.app.x`, bug documentado) |

### Arquivos a EDITAR
| Path | Mudança |
|---|---|
| `docker-compose.yml` | novo serviço `nexvy-payments` (copiar bloco GYM `docker-compose.yml:59-68`): `build.args.APP_DIR: NexvyPayments`, `container_name: nexvy-payments`, `networks:[traefik-public]`, `env_file:.env`. **Sem `ports`, sem labels** (Traefik alcança na :80 do nginx interno) |
| `Makefile` | `DOMAIN_PAYMENTS=nexvypayments.com.br` (~linha 9); alvo `deploy-payments: pull` → `ssh $(VPS) "$(REMOTE_DIR)/infra/deploy-vps.sh NexvyPayments nexvy-payments $(DOMAIN_PAYMENTS)"` (cf. `Makefile:38-39`); incluir em `.PHONY` (`Makefile:1`) e opcionalmente `deploy-all` (`Makefile:43`) |
| `.env.example` (opcional/doc) | bloco Payments |

### PROVISIONAR banco/edges (roda LOCAL contra Supabase novo)
```bash
./infra/cascade-core.sh NexvyPayments <SUPABASE_REF> nexvy-payments nexvypayments.com.br
```
- Fase A: extensions, reset schema public (**DROPA public — só greenfield**, guard `cascade-core.sh:45-51`, bypass `FORCE=1`), baseline ~161 tabelas de `tasks/plano-implementacao-sales-spark/baseline/`, GRANTs, seeds, storage/realtime, 10 crons (`cascade-core.sh:53-111`)
- Fase B: copia+deploy ~115 edge functions de NexvyOficinas (`:113-117`)
- Fase C: copia src+configs, gera `.env`, `npm build` (`:119-134`)
> **VERIFICAR contradição:** se a fonte do app for `cp -r apps/NexvyBeauty` (§1), a Fase C do cascade (que copia src de Oficinas) **conflita** — usar cascade só para Fases A+B (schema+edges) e manter o `src/` vindo do Beauty. O cascade dá a **plataforma** (auth, planos, super-admin, IA/WhatsApp), NÃO o domínio de cobrança (boleto/C6/NotaAS não existem no core).

### Fase D — MANUAL (`cascade-core.sh:143-151`)
DNS (app./gestao./apex/www) → Traefik (template §4) → `make deploy-payments` → **Secrets server-side** (`AI_API_KEY`, `RESEND_API_KEY`, `SUPER_ADMIN_EMAIL` + **credenciais C6/NotaAS/mTLS — NUNCA no frontend**, Seção 11 CLAUDE.md) → Auth Site URL → Branding (`UPDATE platform_settings`) → super admin signup.

**Deploy final:** `make deploy-payments` → gate anti-phantom (`deploy-vps.sh:81-113`, `--no-cache`, compara hash `index-*.js` servido).

---

## 5) MULTI-HOST / BRANDING / CONFINAMENTO / PLATAFORMA×TENANT

Payments herda a arquitetura de 1 SPA em 3 classes de host, decidida por hostname em runtime (não 3 builds). **Tenant SEMPRE por login, NUNCA por subdomínio** (declarado em todos os templates, `NexvyGYM.yml.template:6`).

| Camada | Arquivo-chave | Ajuste p/ Payments |
|---|---|---|
| **Classificação de host** | `apps/NexvyBeauty/src/lib/publicUrl.ts` (`isGestaoHostname` :31-33, `isApexDomain` :38-41, `APEX_BASE` :54, `requiredHostClass` :95-104) | trocar `APEX_BASE` → `nexvypayments.com.br` |
| **Confinamento** | `apps/NexvyBeauty/src/components/auth/HostConfinementGuard.tsx:21-34` (redirect cross-origin p/ host certo, montado `App.tsx:209`) | herda intacto |
| **Tema host-aware pré-paint** | `apps/NexvyBeauty/src/main.tsx:13-15` (`classList.add("theme-nexvy-institucional")` no gestao.*) | herda; classe institucional = Nexvy Lux navy+dourado |
| **Branding white-label 3-modos** | `apps/NexvyBeauty/src/hooks/usePlatformBranding.ts` (gestao→remove inline :136-144; isBrandDefault→paleta :root :151-159; tenant→`generateColorScale` :160-190) | trocar cor-default de `#c54b60` p/ cor Payments |
| **Marca ativa** | `apps/NexvyBeauty/src/config/brand.ts:102-107` `getActiveBrand()` | `BRAND_CONFIG` key→`nexvypayments` |
| **Home host-aware** | `App.tsx:263-283` (gestao→PlatformShell; apex→SalesPage; app→CockpitShell) | herda |

### Separação PLATAFORMA vs TENANT (4 eixos — o que Payments mais herda)
- **Host:** `app.*`=tenant (operador logado) · `gestao.*`=super-admin do grupo · confinados mutuamente.
- **Rota/componente:** tenant=`cockpit/*`+`ProtectedRoute`; plataforma=`superadmin/**`+`SuperAdminRoute`.
- **Dados/schema (o mais importante):** duas famílias físicas de migrations. **Núcleo de cobrança Payments segue o modelo `migrations_salao/` (multi-tenant, `organization_id` preservado), NÃO `migrations_platform_crm/` (tenant-of-one, "SEM organization_id" — `20260701_platform_crm_schema.sql:7,16`).** Payments cobra clientes-finais de vários tenants → precisa de `organization_id`.
- **Shell modular:** `platform-shell/registry.tsx` — módulo `erp` (billing/planos/Cakto, genérico ~100%) + módulo `vendas` (CRM Vendus 1:1). Máxima cravada (`registry.tsx:33-38`): **CRM ≠ ERP, nunca duplicar.**

---

## 6) PLANO DE TRANSPORTE DOS 6 ARTEFATOS VENDUS + mudança em D1..D6

> **Regra-mãe (Leitor 4):** NÃO refazer do zero. O as-is Vendus continua correto como **inventário conceitual dos motores** (Beauty É Vendus, muitos byte-idênticos). Precisa de **overlay/diff sobre o Beauty**, não refazimento.

### 3 correções obrigatórias que atravessam TODOS os artefatos
1. **Re-mapear file:line de migrations:** as-is aponta `supabase/migrations/` (326, repo Vendus); no Beauty virou `migrations_platform_crm/` + `migrations_salao/`. **Coordenadas mortas** — nomes de tabela/função batem, paths não.
2. **Esteira do núcleo de cobrança:** copiar modelo `migrations_salao/` (multi-tenant), NÃO `migrations_platform_crm/` (tenant-of-one).
3. **Gaps já fechados no Beauty:** LGPD-consents e salon-automation existem → partir deles, não recriar.

### Transporte artefato-a-artefato
| Artefato Vendus | Ação | O que muda |
|---|---|---|
| **1. as-is-map** | **REASSENTA** (overlay/diff) | re-mapear file:line p/ `apps/NexvyBeauty/supabase/...`; marcar LGPD+automação como "já resolvido"; §8 (pagador/fatura/boleto/PIX/NFS-e/conciliação) permanece 100% greenfield e válido |
| **2. blueprint** | **EDITA** | trocar "partir do Vendus clonado" → "partir do Beauty/SaasPlugin embutido"; arquitetura multi-host+platform-shell já existe (não projetar, referenciar) |
| **3. roadmap** | **EDITA** | remover sprints de "clonar/integrar Vendus ao monorepo" (feito); reordenar: A0=PoC mTLS C6 (gate) primeiro, depois entidade Fatura+Pagador, depois emissão, depois régua-por-vencimento (reconfig, não código) |
| **4. spec** | **REASSENTA** | schemas de fatura/pagador/item → nova esteira `migrations_cobranca/` (espelha `migrations_salao/`, `organization_id`); `billing_history` da plataforma = molde de schema, não lógica |
| **5. loop (régua)** | **EDITA (reconfig)** | motor `cadence-*`+`salon-automation-run` já presente; trocar trigger de filtro-CRM → `due_date`/vencimento; adicionar tools `consultar_fatura`/`emitir_2via`/`renegociar` ao `registry.ts` (sem tocar orchestrator) |
| **6. (5º/6º da esteira, ex. D-doc)** | **EDITA** | atualizar referências de infra p/ o novo lar; VERIFICAR contratos de edges divergentes |

### Mudança nas decisões D1..D6
| Decisão | Antes (Vendus) | Depois (Beauty/SaasPlugin) |
|---|---|---|
| **D1 partir de** | "partir do Vendus clonado no monorepo" | **"partir do Beauty/SaasPlugin (Vendus já embutido+avançado)"** — mudança central |
| **D2 esteira migrations** | `supabase/migrations/` única | `migrations_cobranca/` (novo, multi-tenant) + herda `migrations_platform_crm/` |
| **D3 multiproduto CRM** | — | herda módulo `vendas` + `product_id` (grupo vende Payments pelo mesmo CRM) |
| **D4 canal** | Evolution+Meta | herda 100% (byte-idêntico) |
| **D5 pagamento** | C6+NotaAS+Cakto | Cakto=onboarding SaaS (herda); C6/NotaAS=greenfield (A0 mTLS gate) |
| **D6 régua** | motor novo | herda `cadence-*`, reconfig por vencimento |

> **VERIFICAR (contradições marcadas pelos leitores):**
> - `ai-router.ts` divergiu (Beauty ≠ vendus-ref): validar contrato `resolveAIConfig(org, capability)` antes de assumir comportamento do as-is §4.4.
> - `_shared/whatsapp-router.ts` **NÃO está no `_shared/` do Beauty** (presente no vendus-ref, ausente no Beauty): verificar ONDE Beauty roteia Meta-vs-Evolution antes de assumir `whatsapp-router.ts:90-92` do as-is.
> - Fonte da cascata (Oficinas vs `cp -r Beauty`): decidir antes de rodar (§1, §4).

---

## 7) ONDE FICAM OS ARTEFATOS NO NOVO LAR

**Espelhar Beauty (dois níveis usados no monorepo):**
- **Produto Payments** → `apps/NexvyPayments/docs/specs/` (spec, blueprint, as-is reassentado) + `apps/NexvyPayments/tasks/` (roadmap, todo.md, loop/régua, planos de execução). Convenção: relatório de entrega sai **pareado `.md`+`.html`** (CLAUDE.md Seção 4).
- **Cross-app** (baseline SQL, sprints multi-produto) → root `tasks/` (`plano-implementacao-sales-spark/baseline/` já consumido por `cascade-core.sh:29`).
- **Repo Vendus Cobranças separado** (`saas-gestao-cobrancas/docs/specs/`, memória 07-06) = fonte externa dos 6 artefatos; ao reassentar, **copiar para `apps/NexvyPayments/docs/specs/`** e editar in-place — NÃO deixar a referência apontando p/ o repo externo.

> **Nota:** não há `CLAUDE.md` no root do monorepo (confirmado ausente pelo Leitor 1) — vale o global. IP/security-headers/Traefik central vivem fora do repo (`/opt/stacks/traefik/` no VPS), não verificáveis aqui.

---

## RESUMO EXECUTIVO (para o replanejamento)

**Base:** partir do **NexvyBeauty/SaasPlugin embutido** (Beauty *É* Vendus, provado byte-a-byte, já no monorepo e mais avançado) — D1 muda de "partir do Vendus" para "partir do Beauty".

**Os 5 achados que mais mudam o plano:**
1. **Falsa dicotomia resolvida:** Beauty=Vendus (`.vendus-src-reference/REMIX.md:1`, `post-sale-engine.ts` e `components.json` byte-idênticos). Escolher Beauty é gratuito e melhor.
2. **Adição ao monorepo é receita conhecida:** 3 arquivos a criar (dir app + `.env.production` + `Traefik template`) + 2 a editar (`docker-compose.yml`, `Makefile`) + `cascade-core.sh`. Sem CI; deploy `make deploy-payments` com gate anti-phantom.
3. **Emissão é 100% greenfield** (boleto C6/PIX/NFS-e/conciliação): nunca existiu no ecossistema; A0=PoC mTLS C6 é o gate bloqueante — sobe no topo do roadmap.
4. **Régua+IA+multi-tenant vêm de graça** (~85%/~80%/100%): `cadence-*`+`salon-automation-run`+`orchestrator.ts` (intenção `financeiro` nativa) — reconfig, não reescrita.
5. **Esteira de migrations do núcleo = `migrations_salao/` (multi-tenant `organization_id`), NÃO `migrations_platform_crm/` (tenant-of-one)** — Payments cobra clientes-finais de vários tenants.
