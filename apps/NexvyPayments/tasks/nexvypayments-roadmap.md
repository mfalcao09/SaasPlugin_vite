# ROADMAP — NexvyPayments (app embutido no ecossistema NexvyTech)

> Etapa 2 da esteira de produto · reassentado 2026-07-06 · slug `nexvypayments`
> **Base:** fork gerenciado do **NexvyBeauty** (`apps/NexvyBeauty/`), que *É* o Vendus (linhagem provada byte-a-byte em `.vendus-src-reference/`), só mais maduro e já no monorepo `SaasPlugin_vite`.
> Pareado com `nexvypayments-blueprint.md`. Prazo = **ASAP**: sequência semanal indicativa (S0, S1…), sem datas-calendário — manda a **dependência técnica**, não o calendário.
> Consumidores: planner adversarial da Etapa 3, Marcelo e o loop de implementação. Critério de aceite **binário** por entregável (passou/falhou), gates HITL nomeados, DoD por fase, marcos de valor.
>
> **O que mudou no reassentamento (vs `gestao-cobrancas-roadmap.md`):**
> - **REMOVIDO:** sprints de "clonar/integrar Vendus ao monorepo" — feito (Beauty já está embutido, com deploy/Traefik/cascade prontos).
> - **ADICIONADO:** **Fase 0.5 — Criação do app no monorepo** com a receita exata da §4 do mapa de reassentamento (`cp -r` Beauty→NexvyPayments, edições de identidade, cascade Fases A+B, Traefik template, `make deploy-payments`, secrets server-side).
> - **NOVO GATE/TOPO:** **A0 = PoC mTLS C6** sobe ao topo do trilho bancário como gate bloqueante (sem análogo no ecossistema; §3b do mapa).
> - **Fase 0 recalibrada:** o Beauty **não tem** `admin-provision-users` (item 0.1 vira *verificação*, não remoção) — escopo reduzido; o helper anti-IDOR (0.2) permanece NOVO, apoiado em `platform-crm-auth.ts` como molde.
> - **Esteira de migrations do núcleo de cobrança:** pasta NOVA `supabase/migrations_cobranca/` (espelha `migrations_salao/`, multi-tenant, `organization_id` preservado), **NÃO** `migrations_platform_crm/` (tenant-of-one).
> - **Disciplinas de hard fork** (D1′): mods de cobrança 100% isoladas em arquivos/migrations próprios e aditivos; todo delta inevitável no core registrado em `docs/CORE-DELTA.md`; atualizações futuras do upstream = diff seletivo, nunca merge cego.

---

## Gates HITL (humano no loop — bloqueiam a fase que dependem)

| Gate | O que trava | Quem resolve | Bloqueia |
|---|---|---|---|
| **A0-MTLS** | PoC de mTLS/certificado C6 provado (handshake TLS mútuo contra sandbox C6 fecha; token OAuth obtido) — **gate de viabilidade técnica do trilho bancário inteiro** | Marcelo + relacionamento C6 | Fase 2 (boleto/PIX) inteira — se mTLS não fecha, não há produto |
| **G-META-SEC** | Hardening F0 (require-caller-org, cofre, RLS) + camadas §11.2 aprovados por revisão | Marcelo + revisor sênior | Qualquer fase com dinheiro (todas após F0.5) |
| **G-NOTAAS** | 6 perguntas ao dono da conta NotaAS (sandbox NFS-e? preço/créditos? município case #1 coberto? A1 obrigatório? prazo cancelamento? rate da project key?) — `notaas-report.md §F` | Dono da conta NotaAS | Fase 3 (NFS-e) |
| **G-C6** | Credenciais C6 sandbox→prod do CNPJ case #1 + **tarifa de boleto negociada ≤R$1,20** (gate de viabilidade da margem, §8.2 blueprint) | Marcelo (relacionamento bancário) | Fase 2 (boleto/PIX) prod |
| **G-A1** | Certificado A1 (.pfx + senha) do CNPJ case #1 emitido e em mãos | Tenant case #1 | Fase 3 (NFS-e) |
| **G-META-TPL** | Templates Meta utility de cobrança aprovados (fatura, lembrete, atraso, 2ª via) — lead-time externo | Meta (submissão na F1) | Fase 4 (régua) prod |
| **G-PILOTO** | Compromisso pago/carta de intenção do case #1 ANTES do go-live (teste de desespero, PMF §8 do as-is-to-be) | Marcelo + case #1 | Marco de valor 5 (go-live definitivo) |
| **G-INFRA** | Limite do plano Supabase/VPS medido + gatilho de migração/escala quantificado | Marcelo | Escala pós-piloto |

---

## A0 — PoC mTLS C6 (S0, PARALELO à F0.5, GATE BLOQUEANTE do trilho bancário)

> **Sobe ao topo por decisão do reassentamento.** É o único pilar 100% greenfield sem análogo no ecossistema (§3b do mapa: grep por `linha_digitavel/cnab/nosso_numero/mtls` no Beauty = zero). Se o handshake mTLS com o C6 não fechar, o produto inteiro é inviável — provar ANTES de investir no resto. Não bloqueia F0/F0.5/F1 (que independem do banco), mas bloqueia toda a Fase 2.

| # | Entregável | Critério de aceite BINÁRIO |
|---|---|---|
| A0.1 | Spike isolado: cliente Deno/Node que faz handshake mTLS contra endpoint sandbox C6 usando cert de teste | Handshake TLS mútuo **completa** (sem `UNABLE_TO_VERIFY_LEAF`/`self signed`); log mostra cadeia aceita |
| A0.2 | Obter token OAuth C6 via canal mTLS (client_credentials sobre a conexão mútua) | `POST /oauth/token` retorna `access_token` válido; token usável em 1 chamada autenticada de leitura |
| A0.3 | Documentar em `docs/specs/a0-mtls-poc.md`: como carregar `.pfx`/`.pem` no runtime Deno das Edge Functions (Supabase) SEM expor cert no bundle | Doc lista o mecanismo (Deno `Deno.createHttpClient` com `caCerts`/client cert OU proxy) e onde o cert vive (secret server-side, §11.1) |

**Gate**: **A0-MTLS** (PoC provado) — desbloqueia a Fase 2.
**DoD A0**: mTLS C6 fecha em sandbox; token obtido; caminho de carregamento de cert nas Edge Functions Deno decidido e documentado (não no frontend, §11.1).

---

## Fase 0.5 — Criação do app NexvyPayments no monorepo (S0)

> **NOVO.** Substitui os antigos sprints de "clonar Vendus". Aplica a receita exata da §4 do mapa. Produz um app deployável e vazio-de-cobrança (plataforma herdada funcionando: auth, planos, super-admin, IA/WhatsApp), pronto para receber o núcleo greenfield nas fases seguintes.
> **Pré-requisitos:** projeto Supabase novo (dashboard) → `SUPABASE_REF`; DNS Cloudflare `nexvypayments.com.br → 145.223.29.96` (IP VPS).

### 0.5a — Esqueleto do app (arquivos a CRIAR)
| # | Entregável | Critério de aceite BINÁRIO |
|---|---|---|
| 0.5.1 | `cp -r apps/NexvyBeauty apps/NexvyPayments` → remover `node_modules/ dist/ .temp/ .vendus-src-reference/ docs/ tasks/` do destino (docs/tasks do Payments já existem próprios) | `ls apps/NexvyPayments/` mostra `src/ supabase/ public/ package.json …` e **NÃO** contém `.vendus-src-reference/`; `du -sh` sem `node_modules` |
| 0.5.2 | Editar identidade: `package.json` `"name":"nexvy-payments"`; `index.html` `<title>`/theme-color/manifest da marca Payments; `src/config/brand.ts` `BRAND_CONFIG.key='nexvypayments'`, `name`, `sector` (cobrança), `primaryColor`, `defaultModules` de cobrança (`brand.ts:43-59` é o único ponto de cascade) | `grep -c nexvybeauty apps/NexvyPayments/src/config/brand.ts` = **0**; `getActiveBrand()` retorna `key:'nexvypayments'` no app.* |
| 0.5.3 | `apps/NexvyPayments/.env.production` (VERSIONADO): `VITE_SUPABASE_URL` + anon key do projeto NOVO (formato `apps/NexvyGYM/.env.production`; `.gitignore` força-inclui `!apps/**/.env.production`) | Arquivo existe e versionado (`git check-ignore` → não ignorado); contém URL do projeto novo, **nunca** service_role |
| 0.5.4 | `infra/traefik/NexvyPayments.yml.template` — copiar `NexvyBeauty.yml.template` e **HARDCODAR** `nexvypayments.com.br` nos 3 pares de router (app./gestao./apex); NÃO confiar no `DOMAIN` do script (bug documentado: `DOMAIN=app.x` gera `gestao.app.x`) | Template tem 3 hosts corretos (`app.`, `gestao.`, apex) hardcoded; `grep gestao.app` = **0** |

### 0.5b — Registro no monorepo (arquivos a EDITAR — deltas no core → registrar em `docs/CORE-DELTA.md`)
| # | Entregável | Critério de aceite BINÁRIO |
|---|---|---|
| 0.5.5 | `docker-compose.yml`: novo serviço `nexvy-payments` (copiar bloco GYM `:59-68`): `build.args.APP_DIR: NexvyPayments`, `container_name: nexvy-payments`, `networks:[traefik-public]`, `env_file:.env`, **sem `ports`, sem labels** | `docker compose config` valida; serviço `nexvy-payments` presente com `APP_DIR: NexvyPayments` |
| 0.5.6 | `Makefile`: `DOMAIN_PAYMENTS=nexvypayments.com.br` (~linha 11); alvo `deploy-payments: pull` → `deploy-vps.sh NexvyPayments nexvy-payments $(DOMAIN_PAYMENTS)` (molde `Makefile:22-23`); incluir em `.PHONY` (`Makefile:1`) e em `deploy-all` | `make -n deploy-payments` imprime o comando ssh correto; `deploy-payments` em `.PHONY` |
| 0.5.7 | Registrar quaisquer deltas inevitáveis no core em `docs/CORE-DELTA.md` (disciplina D1′) | Arquivo existe; cada linha editada de arquivo do core Vendus/Beauty listada com motivo |

### 0.5c — Provisionar banco/edges (cascade Fases A+B, roda LOCAL contra Supabase novo)
| # | Entregável | Critério de aceite BINÁRIO |
|---|---|---|
| 0.5.8 | Rodar `./infra/cascade-core.sh NexvyPayments <SUPABASE_REF> nexvy-payments nexvypayments.com.br` **usando só Fases A+B** (schema baseline ~161 tabelas + GRANTs + seeds + crons; deploy ~115 edges) | Baseline aplicado (`\dt` ≈161 tabelas); edges deployadas (`supabase functions list` popula) |
| 0.5.9 | **Preservar `src/` vindo do Beauty** (não deixar a Fase C do cascade sobrescrever com src de Oficinas — contradição marcada no mapa §4/§6): a Fase C copia src de Oficinas e **conflita** com o `cp -r Beauty` | `diff apps/NexvyPayments/src/config/brand.ts` = o brand editado (0.5.2), não o de Oficinas; platform-shell modular do Beauty presente |
| 0.5.10 | Deploy: `make deploy-payments` → gate anti-phantom (`deploy-vps.sh:81-113`, `--no-cache`, compara hash `index-*.js` servido) | `curl -sI https://app.nexvypayments.com.br` → **200**; hash do bundle servido == hash buildado (anti-phantom) |

### 0.5d — Secrets server-side + branding (Fase D manual)
| # | Entregável | Critério de aceite BINÁRIO |
|---|---|---|
| 0.5.11 | Secrets via `supabase secrets set` (server-side, **NUNCA** `NEXT_PUBLIC_*`/frontend, §11.1): `AI_API_KEY`, `RESEND_API_KEY`, `SUPER_ADMIN_EMAIL` (C6/NotaAS/mTLS chegam nas fases 1-3) | `grep -rn "C6\|NOTAAS\|api_key" apps/NexvyPayments/src apps/NexvyPayments/.env.production` por segredo real = **0**; secrets listados via CLI |
| 0.5.12 | Auth Site URL do projeto novo (app./gestao./apex) + Branding (`UPDATE platform_settings`) + primeiro super admin signup | Login funciona nos 3 hosts; `HostConfinementGuard` redireciona cross-origin; super admin acessa `gestao.*` |

**Marco de valor 0**: **"NexvyPayments no ar, vazio-de-cobrança, plataforma herdada funcionando"** — app deployado, 3 hosts respondendo 200, auth/super-admin/IA/WhatsApp herdados do Beauty operacionais, **zero** motor bancário ainda.
**Gate**: G-INFRA (medir limites do projeto Supabase novo desde já).
**DoD F0.5**: `make deploy-payments` publica; `curl` 200 nos 3 hosts; nenhum segredo no frontend; `src/` é o do Beauty (não Oficinas); deltas no core registrados em `CORE-DELTA.md`.

---

## Fase 0 — Hardening bloqueador + fundação de dados de cobrança (S1)

> **Não passa dinheiro sem esta fase.** Ataca G12/R1. Depende de F0.5 (app existe). Bloqueia todas as fases com dinheiro.
> **Recalibrada no reassentamento:** o Beauty **não tem** `admin-provision-users` (verificado: `ls` retorna "No such file or directory") → item 0.1 vira *verificação*, não remoção. O helper anti-IDOR permanece NOVO (não existe `require-caller-org.ts` no Beauty); molde de auth server-side = `_shared/platform-crm-auth.ts` (padrão `getClaims`+gate por `user_roles`, `platform-crm-auth.ts:46-104`).

| # | Entregável (arquivo/rota/migration) | Critério de aceite BINÁRIO |
|---|---|---|
| 0.1 | **Verificar** ausência de `admin-provision-users` e de qualquer edge de provisionamento sem gate (herdado limpo do Beauty) | `ls supabase/functions/admin-provision-users` → "não existe" (JÁ confirmado); grep no front por chamadas = **0 hits** |
| 0.2 | Helper `_shared/require-caller-org.ts` (NOVO): extrai `organization_id` do JWT via `getClaims`+`get_user_organization`, **ignora body** — molde `platform-crm-auth.ts:46-104` (mesmo padrão, gate por org em vez de super_admin) | Teste: chamada com `organization_id` de outra org no body → **403**; sem JWT → **401**; JWT válido → org do token; service_role atua sobre `actorUserId` do body |
| 0.3 | Auditoria RLS das tabelas de cobrança pós-baseline (~161 herdadas + novas) | Query de cobertura: toda tabela com `organization_id` tem RLS ON = **true** para 100% |
| 0.4 | Migration cofre `migrations_cobranca/…_billing_credentials.sql`: tabela `billing_credentials` + RLS negado ao client | `SELECT` como usuário anon/authenticated → **0 linhas**; via service_role → linhas |
| 0.5 | Migrations do modelo em `migrations_cobranca/` (espelha `migrations_salao/`, `organization_id` preservado): `payers`, `billing_groups`, `contracts`, `invoices`, `invoice_items`, `billing_events` + RLS canônica (blueprint §3) | Cada tabela: RLS ON; INSERT cross-org via client → **rejeitado**; índices criados (`\d` confirma); pasta é `migrations_cobranca/`, **não** `migrations_platform_crm/` |
| 0.6 | Hardening §11.2: `build.sourcemap:false`, CSP, `X-Frame-Options`, honeytoken `/api/trap`, CORS não-`*` nas edges de dinheiro | `curl` de headers mostra CSP+XFO; sourcemap ausente no bundle servido; `/api/trap` dispara alerta |
| 0.7 | Crons novos de cobrança usam secret via `Deno.env`/Vault (não JWT literal) | grep por JWT hardcoded nas migrations de cron novas = **0** |

**Gate**: G-META-SEC (revisão de segurança aprovada).
**DoD F0**: engenheiro sênior aprova hardening; modelo de dados de cobrança criado em `migrations_cobranca/` com RLS provada; nenhum secret em plaintext ou no front; disciplinas de hard fork respeitadas (arquivos aditivos, não edição do core).

---

## Fase 1 — Cofre + onboarding financeiro + cadastro (S1–S2)

> Base para conectar serviços externos com segurança. Depende de F0. **Cakto (onboarding SaaS do próprio tenant) herda 100% do Beauty; C6/NotaAS são greenfield.**

| # | Entregável | Critério de aceite BINÁRIO |
|---|---|---|
| 1.1 | `_shared/billing-crypto.ts` (NOVO, aditivo) reusando `encryptSecret`/`decryptSecret` de `_shared/meta-crypto.ts` para `billing_credentials` | Round-trip: cifra `v1:...` → decifra = plaintext original; valor no banco começa com `v1:`, nunca legível |
| 1.2 | Edge `cobranca-onboarding` (`action=connect_c6`) — grava C6 client/secret/cert cifrados; usa cert via caminho mTLS provado em A0.3 | `POST` conecta; `billing_credentials` tem row `provider='c6'` cifrada; front recebe só `metadata` mascarado |
| 1.3 | Edge `cobranca-onboarding` (`action=create_notaas_project` + `upload_a1`) via Org Token server-side | `POST /org/projects` retorna 201; A1 aceito (`subjectCN`, `daysUntilExpiration` em `metadata`); sem A1 → erro claro |
| 1.4 | UI wizard "Onboarding financeiro" (molde `WizardCadastroContaBancaria.tsx` do ERP herdado) | Wizard completa os 3 passos e mostra status "conectado" por provider |
| 1.5 | UI Pagadores + import CSV (molde `LeadsManager.tsx`) | Importa CSV com CPF/CNPJ+contato+endereço; `payers` populada; vínculo opcional a `lead_id` |
| 1.6 | UI Contratos (fixo/variável, dia_vencimento, grupo) | Cria contrato fixo e variável; aparece na lista; `metadata` da vertical gravada |
| 1.7 | Submissão dos templates Meta utility (dispara G-META-TPL) — via canal WhatsApp herdado do Beauty | 4 templates submetidos à Meta; status "pending" registrado |

**Marco de valor 1**: **"Tenant case #1 onboarded"** — C6 conectado, Projeto NotaAS criado com A1, pagadores e contratos do case #1 no sistema.
**Gates disparados**: G-NOTAAS (perguntas), G-A1 (coletar cert), G-META-TPL (submeter).
**DoD F1**: onboarding roda fim-a-fim; nenhuma credencial trafega ao front; cadastro do case #1 completo.

---

## Fase 2 — Emissão boleto/PIX (C6) + outbox (S2–S3)

> Depende de F1 (cofre + contratos) **e de A0-MTLS** (PoC mTLS provado). Gate G-C6.

| # | Entregável | Critério de aceite BINÁRIO |
|---|---|---|
| 2.1 | `supabase/functions/c6-billing/` — porta de `c6.py:217-515` + parser `:917-1069` (Deno), sobre o cliente mTLS de A0 | Smoke em sandbox C6: emite Bolepix → retorna `nosso_numero`+linha digitável+QR; consulta idempotente OK |
| 2.2 | Migration fila `billing_outbox` em `migrations_cobranca/` (pgmq, reuso wrappers `email_infra.sql:131-175`) + DLQ | `pgmq.create('billing_outbox')` OK; `enqueue`/`read`/`move_to_dlq` funcionam via RPC |
| 2.3 | Edge `invoice-batch-generate` — materializa faturas da competência (idempotente) | Rodar 2× a mesma competência → **0 faturas duplicadas** (UNIQUE segura); fatura em `rascunho` |
| 2.4 | Edge `billing-outbox-worker` + cron pg_cron (30s) — consome fila, chama `c6-billing`, grava `referencia` antes do POST | Fatura `aprovada` → boleto emitido em ≤2min; `referencia` única por `(invoice,trilho)`; erro → DLQ, não duplica |
| 2.5 | Edge `c6-webhook` — baixa por liquidação, valida por GET de confirmação | Webhook de pago → fatura vai a `paga`; `billing_events(paga)` gravado; webhook repetido → idempotente |
| 2.6 | UI Faturas (lista+estados, molde `FinancialDashboard.tsx`) + botão "Aprovar lote" | Lote aprovado emite; painel mostra estados; PIX destacado como default (desafio 1 do cofundador) |
| 2.7 | Máquina de estados aplicada (blueprint §5) — transições inválidas rejeitadas | Tentar `rascunho→paga` direto → **rejeitado**; transições válidas → OK |

**Marco de valor 2**: **"1ª fatura real do case #1 emitida com boleto+PIX C6 em produção"** (após G-C6).
**Gate**: **A0-MTLS** (pré-condição técnica) + **G-C6** (credenciais prod + tarifa negociada ≤R$1,20 para viabilidade boleto, §8.2).
**DoD F2**: lote emite boleto/PIX sem duplicar; webhook dá baixa; re-run seguro.

---

## Fase 3 — NFS-e (NotaAS) vinculada à fatura (S3–S4)

> Depende de F1 (Projeto+A1) e F2 (fatura+outbox). Gates G-NOTAAS, G-A1.

| # | Entregável | Critério de aceite BINÁRIO |
|---|---|---|
| 3.1 | `supabase/functions/notaas-emit/` — cliente lote `POST /emitir/batch` (≤100), `referencia` por item | Lote de 100 → `202 {batchId}`; `notaas_invoice_id` gravado por fatura; 101 itens → split em 2 chamadas |
| 3.2 | Edge `notaas-webhook` — HMAC-SHA256 + dedup `X-Notaas-Delivery` | Assinatura inválida → **rejeitado**; `delivery` repetido → processado 1×; `nfse.issued` → `nfse_status='emitida'` |
| 3.3 | Integração no `billing-outbox-worker`: fatura aprovada dispara boleto **e** nota | Fatura emitida tem `c6_nosso_numero` E `notaas_invoice_id`; nota falha não bloqueia baixa do boleto |
| 3.4 | Imutabilidade fiscal: nota emitida não deleta; cancelar = operação formal | `DELETE` de nota emitida → **rejeitado**; cancelar grava `billing_events(cancelada)` + trilha |
| 3.5 | UI Notas (emitidas/erro/canceladas) + link PDF/XML com proxy (não CDN cru — §9.1) | Painel lista notas; link de PDF passa por proxy assinado, não URL pública crua |

**Marco de valor 3**: **"1ª fatura do case #1 com boleto+PIX+NFS-e emitidos e vinculados"**.
**Gates**: G-NOTAAS (respostas), G-A1 (cert em produção).
**DoD F3**: ciclo emissão dupla (boleto+nota) fecha por fatura; idempotência fiscal provada; nota nunca duplica em retry.

---

## Fase 4 — Régua conversacional + atendimento IA (S4–S5)

> Depende de F2/F3 (eventos de fatura). Gate G-META-TPL.
> **Reconfig, não reescrita:** o motor `cadence-*` + `salon-automation-run` + `orchestrator.ts` (intenção `financeiro` nativa) já vem do Beauty (~85%/~80%). Trocar trigger de filtro-CRM → `due_date`/vencimento; adicionar tools ao `registry.ts` sem tocar `orchestrator.ts`.
> **VERIFICAR antes de codar (marcado no mapa §6):** (a) `ai-router.ts` divergiu (Beauty ≠ vendus-ref) — validar `resolveAIConfig(org, capability)`; (b) `_shared/whatsapp-router.ts` **NÃO existe no Beauty** (confirmado: `ls` → "No such file or directory") — confirmar ONDE o Beauty roteia Meta-vs-Evolution antes de assumir o contrato do as-is.

| # | Entregável | Critério de aceite BINÁRIO |
|---|---|---|
| 4.1 | Edge `billing-cadence-enroll` — traduz `billing_events` → `cadence-enroll` existente (blueprint §2.4) | `billing_events(emitida)` → enrollment criado via `POST cadence-enroll`; step_run agendado |
| 4.2 | Trigger por due_date: cadência D-3/D0/D+1/D+7 sobre a fatura (novo trigger sobre `salon-automation-run`, não reescrita do `cadence-tick`) | Fatura vencendo em 3 dias → mensagem D-3 disparada; D+7 dispara cobrança de atraso |
| 4.3 | Stop-por-pagamento (reuso `cadence-on-response`/`applyStopActions`) | `billing_events(paga)` → régua daquela fatura **para** imediatamente; nenhuma msg pós-pagamento |
| 4.4 | Disparo via Meta Cloud oficial (template utility + `optin-guard.ts`) — P1; roteamento Meta/Evolution conforme achado do VERIFICAR (b) | Régua em prod usa template aprovado; sem opt-in → não envia; Evolution só dev/inbound |
| 4.5 | 4 tools IA no `_shared/tools/registry.ts` (molde `gerar_link_pagamento`): `consultar_fatura`, `segunda_via`, `enviar_comprovante`, `renegociar` (alçada+handoff) | Pagador pede 2ª via no WhatsApp → IA responde com boleto/PIX; desconto acima da alçada → handoff humano |
| 4.6 | Prompt-injection shield (§11.3) nas 4 tools | Input malicioso (>8k chars / padrão de injeção) → bloqueado + logado com hash |

**Marco de valor 4**: **"1º ciclo mensal completo do case #1 100% sem intervenção humana"** — lote→emissão→régua→conversa→conciliação, ≥95% das faturas sem toque manual.
**Gate**: G-META-TPL (templates aprovados).
**DoD F4**: régua dispara e para sozinha; IA resolve 2ª via/status sem humano na maioria; instrumentação de "% sem humano" no ar; contratos `ai-router`/roteamento-WhatsApp validados (não assumidos).

---

## Fase 5 — Conciliação, LGPD mínimo, painel e prova de horizontalidade (S5–S6)

> Depende de tudo acima. Fecha o v1 e prova D2. **LGPD-consents já existe no Beauty (`migrations_salao/20260619_lgpd_consents.sql`) — partir dele, não recriar.**

| # | Entregável | Critério de aceite BINÁRIO |
|---|---|---|
| 5.1 | Painel de inadimplência + conciliação (baixa manual quando preciso) | Dashboard mostra pagos/vencidos/em-aberto; baixa manual grava `billing_events` |
| 5.2 | LGPD mínimo (G13) sobre a base herdada de LGPD-consents: base legal por tenant, retenção por tabela, audit de PII em `payers`, erasure de pagador | CRUD em `payers` loga em `platform_audit_logs`; erasure anonimiza contato mantendo fatura fiscal |
| 5.3 | Instrumentação PMF: % faturas pagas sem humano, % conversas resolvidas pela IA, dias-para-pagar, custo real/fatura | Métricas visíveis no painel; custo/fatura **medido** (não estimado) |
| 5.4 | Instrumentar limites de infra (invocations/pgmq/storage do Supabase novo) — dispara G-INFRA | Contador de invocations/mês por tenant visível; gatilho de migração/escala quantificado |
| 5.5 | **Prova de horizontalidade (D2)**: onboarding do case #2 (cowork) **sem migration nova** | Cowork onboarded usando só `metadata` (0 migration específica de vertical) = **true** |

**Marco de valor 5**: **"Case #1 sai do Asaas"** (migração completa) + **"case #2 (cowork) onboarded sem código novo"** (prova D2).
**Gate**: G-PILOTO (compromisso pago do case #1 confirmado antes do go-live definitivo).
**DoD F5**: v1 completo; case #1 em produção pagando; horizontalidade provada; LGPD mínimo no ar; limites de infra medidos.

---

## Caminho crítico e dependências

```
A0 (PoC mTLS C6) ────────────────[A0-MTLS gate]──────────────┐
   (S0, paralelo)                                              │
                                                               ▼
F0.5 (app no monorepo) ──► F0 (hardening+dados) ──► F1 (cofre+onboarding+cadastro)
   [G-INFRA]                 [G-META-SEC]                 │
                                                          ├──► F2 (C6 boleto/PIX+outbox) ──┐
                                                          │      [A0-MTLS + G-C6]           │
                                                          └──► F3 (NotaAS NFS-e) ───────────┼──► F4 (régua+IA)
                                                                 [G-NOTAAS, G-A1]           │      [G-META-TPL]
                                                                                            │         │
                                                                                            └────────────► F5 (concil.+LGPD+D2)
                                                                                                          [G-PILOTO]
```

**Gargalos externos (lead-time não-controlável) — atacar cedo:**
- **A0-MTLS** (viabilidade técnica do banco) → **S0, antes de tudo**. Se falha, o produto não existe.
- G-C6 (relacionamento bancário + tarifa) → iniciar na F0.5, não na F2.
- G-A1 (tenant obter certificado) → pedir ao case #1 já na F1.
- G-META-TPL (aprovação Meta) → submeter na F1 (item 1.7), consumir na F4.
- G-NOTAAS (respostas do dono) → perguntar na F1, consumir na F3.

**Regra de sequência (desafio 2 do cofundador):** o marco de valor pago (G-PILOTO) fica no fim (F5) porque é o teste de desespero definitivo, MAS o marco de valor 3 (boleto+PIX+nota da 1ª fatura real) é a prova intermediária de que os pilares 1-3 funcionam antes de investir no polimento do pilar 4 (IA de renegociação avançada). **A0 é a prova ainda mais precoce** — de que o pilar de emissão é sequer viável — e por isso sobe ao topo. Se F1-F3 não retiverem o case #1, reavaliar antes de F4.

---

## Riscos de cronograma e mitigação

| Risco | Mitigação |
|---|---|
| **mTLS C6 não fecha (A0)** → produto inviável | **A0 no topo (S0), isolado e barato**; falha do PoC redireciona a estratégia ANTES de qualquer investimento no resto |
| Fase C do cascade sobrescreve `src/` do Beauty com o de Oficinas | Rodar cascade **só Fases A+B** (schema+edges); preservar `src/` do `cp -r Beauty` (item 0.5.9) |
| Traefik template gera host errado (`gestao.app.x`) | Hardcodar domínio nos 3 routers (item 0.5.4), não confiar no `DOMAIN` do script |
| G-C6 (tarifa/credencial) atrasa e trava emissão | Sandbox C6 na F2 permite construir sem prod; prod só depende do gate |
| Templates Meta reprovados (G-META-TPL) | Fallback: conversa iniciada pelo pagador (janela de serviço 24h) na F4 enquanto reaprova |
| `ai-router`/roteamento-WhatsApp do Beauty divergem do as-is | Itens VERIFICAR na F4: validar contratos reais antes de codar (não assumir file:line do as-is) |
| Upstream Vendus V6+ tenta reintroduzir no core | Disciplina D1′: diff seletivo, mods aditivas em `migrations_cobranca/` e `_shared/*billing*`, deltas em `CORE-DELTA.md` |
| Volume estoura infra antes da F5 | G-INFRA quantifica o teto (5.4); migração/escala é decisão medida, não emergência |
| Escopo v1 grande (D4, 4 pilares) | Marcos de valor binários por fase; case #1 é o piloto único (cowork só valida em F5) |
