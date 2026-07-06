# SPEC AUDITÁVEL — NexvyPayments (ETAPA 3 consolidada, REASSENTADA sobre NexvyBeauty)

> Etapa 3 da esteira de produto · reassentada 2026-07-06 · slug `nexvypayments` (era `gestao-cobrancas`)
> **Este documento é a fonte única de verdade para a implementação do NexvyPayments.** Consolida o veredito do planner adversarial (Etapa 3a, `planner-veredito-3a.md`) sobre o blueprint + roadmap da Etapa 2, com o adendo autenticado NotaAS (§H do `notaas-report.md`).
> Consumidores: Marcelo + o loop de implementação do NexvyPayments (leem por caminho absoluto).
> **Contexto histórico (leia PRIMEIRO):** `../CONTEXTO-SESSOES.md` — transcritos JSONL das 2 sessões (`b58002ed…` esteira + `61748ace…` repivô) + linha do tempo das decisões, para a nova sessão partir com todo o contexto.
> Insumos travados (não reabrir): `nexvypayments-as-is-to-be.md` (D1..D6, P1..P5), `nexvypayments-blueprint.md`, `nexvypayments-roadmap.md` (este em `../../tasks/`).
>
> **Registro de skills (Passo 0):** `openapi-spec-generation` ✅ carregada e aplicada (§4) · `spec-to-code-compliance` ✅ carregada e aplicada (§5–§6, matriz de alinhamento com evidência exigida, severidade e anti-alucinação: status inicial = PENDENTE para 100% dos itens, sem inferir conformidade).

---

## 0. NOTA DE REASSENTAMENTO (por que este spec mudou de base)

Este spec era `gestao-cobrancas-spec-auditavel.md`, escrito assumindo um **clone do CRM Vendus** em repo separado. **Decisão travada (D1′):** o NexvyPayments **forka do NexvyBeauty** (`apps/NexvyBeauty` no monorepo `SaasPlugin_vite`), não de um Vendus clonado. Beauty *É* Vendus (mesma linhagem Lovable, provado byte-a-byte em `.vendus-src-reference/`), só que mais maduro e já embutido no monorepo com deploy pronto.

**O que o reassentamento aplicou (mapa §6, linha "spec REASSENTA"):**

1. **Re-mapeamento de coordenadas.** Todo `file:line` que apontava para `supabase/functions/*` / `supabase/migrations/` do Vendus foi re-ancorado em `apps/NexvyBeauty/supabase/...` (verificado por leitura direta — ver §0.1). Nomes de tabela/função/tool batem; os paths mudaram.
2. **Esteira do núcleo de cobrança.** Os schemas de fatura/pagador/item/contrato/acordo vão para uma esteira **NOVA** `apps/NexvyPayments/supabase/migrations_cobranca/`, que **espelha `migrations_salao/`** do Beauty (multi-tenant, `organization_id` preservado, RLS `organization_id = get_user_organization(auth.uid())`), **NÃO** `migrations_platform_crm/` (tenant-of-one, "SEM organization_id"). O NexvyPayments cobra clientes-finais de **vários tenants** → precisa de `organization_id`.
3. **`billing_history` da plataforma = molde de schema, não lógica.** As tabelas `platform_crm_*` (tenant-of-one, RLS via `has_role`) servem como **exemplo de estilo DDL/RLS**, não como fonte de comportamento de cobrança. O comportamento (pagador/fatura/boleto/PIX/NFS-e/conciliação) permanece **100% greenfield e válido** — nunca existiu no Vendus nem no Beauty.
4. **Gaps já fechados no Beauty.** LGPD-consents (`migrations_salao/20260619_lgpd_consents.sql`) e automação (`migrations_salao/20260626_salon_automation_foundation.sql`) **existem** → E2 parte deles, não recria do zero.
5. **Novo entregável de isolamento (A7).** Fork gerenciado exige que as mods de cobrança fiquem 100% ISOLADAS (arquivos/migrations próprios e aditivos) e que todo delta inevitável no core Vendus seja registrado em `docs/CORE-DELTA.md`. Entregável e critério binário em §3.2.

O núcleo de cobrança (C6/NotaAS/entidade Fatura/Pagador/lote/conciliação) **não muda de conteúdo** — muda apenas de *lar* (esteira `migrations_cobranca/`) e de *coordenadas de reuso* (Beauty em vez de Vendus). Os 25 entregáveis, os critérios binários, o OpenAPI 3.1, a matriz de conformidade (status PENDENTE) e os 9 gates permanecem.

### 0.1 Coordenadas de reuso RE-VERIFICADAS no Beauty (grep/read diretos, 2026-07-06)

| Motor / recurso | Coordenada Vendus (as-is) | **Coordenada Beauty (RE-VERIFICADA)** | Uso no spec |
|---|---|---|---|
| Cofre AES-256-GCM (chave-mestra + cifra `v1:`) | `meta-crypto.ts:25-51` | `apps/NexvyBeauty/supabase/functions/_shared/meta-crypto.ts:9` (`getMasterKey` via `get_or_create_meta_master_key`), `:25` (`encryptSecret`), `:38` (`'v1:'`), `:41-48` (`decryptSecret`) | A4 (cofre `billing_credentials`) |
| Chave-mestra GLOBAL única (risco A1/P-COBR-001) | `meta-crypto.ts:11` | `apps/NexvyBeauty/supabase/functions/_shared/meta-crypto.ts:11` (`rpc('get_or_create_meta_master_key')` — uma chave p/ todos os tenants) | P-COBR-001 (HKDF por-org) |
| RLS canônica multi-tenant | `supabase/migrations/*` (`get_user_organization`) | `apps/NexvyBeauty/supabase/migrations_salao/20260618_erp_salao.sql:28-63` (`organization_id = get_user_organization(auth.uid())`, 4 policies + índice `_org`) | A5 (padrão RLS de `migrations_cobranca/`) |
| Molde tenant-of-one (billing_history) | `billing_history` platform | `apps/NexvyBeauty/supabase/migrations_platform_crm/20260701_platform_crm_schema.sql:7` ("Dado GLOBAL da plataforma (tenant-of-one) => SEM organization_id"), `:16` (RLS via `has_role`) | molde de schema **apenas** |
| Registry de tools IA (extensão trivial) | `registry.ts:5-17` | `apps/NexvyBeauty/supabase/functions/_shared/tools/registry.ts:5-16` (`ALL_TOOLS`; `gerarLinkPagamentoTool` = esqueleto), `impl/` presente | D5 (4 tools novas + registro) |
| Orchestrator intent `financeiro` nativa | `orchestrator.ts:6,51` | `apps/NexvyBeauty/supabase/functions/_shared/orchestrator.ts:7` (`Intent` inclui `financeiro`), `:50` (`financeiro → boleto, reembolso, cobrança, nota fiscal`) | D5 (roteamento IA já reconhece cobrança) |
| Executor de step_runs lead-cêntrico | `cadence-tick:298-312`, `computeScheduledAt:35-41` | `apps/NexvyBeauty/supabase/functions/cadence-tick/index.ts:12` (`MAX_PER_TICK=50`), `:34-37` (`computeScheduledAt` por `delay_value`/`delay_unit`), `:42-50` (condições por `lead_id`) | D1/D2/D3 (reuso limitado ao executor; trigger/contexto/stop por fatura = novo) |
| Régua-lite por evento (análogo "fatura vencendo") | — | `apps/NexvyBeauty/supabase/functions/salon-automation-run/index.ts:7` (`dry_run` default), `:25` (TZ `America/Sao_Paulo`), `:46` (`pacote_vencendo`), `:59` (idempotência por insert duplicado) | referência de padrão p/ D2 |
| Fila pgmq de e-mail (fallback E1) | `email_infra.sql:131-175` | `apps/NexvyBeauty/supabase/functions/process-email-queue/index.ts` + `_shared/platform-email-send.ts` (fila transacional pgmq no Beauty; o `email_infra.sql:131-175` do Vendus **não existe com esse nome** — o análogo é `process-email-queue`) | E1 (fallback e-mail p/ payer sem WhatsApp) |
| WhatsApp dual-provider | `evolution-send`, `meta-crypto.ts` | `apps/NexvyBeauty/supabase/functions/evolution-send/index.ts`, `_shared/meta-crypto.ts`, `platform-meta-whatsapp-webhook/` | D4 (régua Meta prod) |

> **VERIFICAR na implementação (contradições marcadas pelo mapa §6, ainda abertas):**
> - `_shared/ai-router.ts` existe no Beauty mas divergiu do vendus-ref — validar contrato `resolveAIConfig(org, capability)` antes de assumir comportamento do as-is §4.4.
> - `_shared/whatsapp-router.ts` **NÃO está** em `apps/NexvyBeauty/supabase/functions/_shared/` (presente no vendus-ref, ausente no Beauty) — descobrir ONDE o Beauty roteia Meta-vs-Evolution antes de assumir `whatsapp-router.ts:90-92` do as-is. D4 depende disso.
> - Fonte da cascata (Oficinas vs `cp -r Beauty`): decidir antes de rodar (mapa §1/§4). A Fase C do `cascade-core.sh` copia src de Oficinas e conflita com `cp -r apps/NexvyBeauty` — usar cascade só p/ Fases A+B (schema+edges) e manter `src/` do Beauty.

---

## 1. Sumário e veredito

**Veredito do planner adversarial: SIM-COM-CORREÇÕES — aplicadas integralmente neste spec.**

O confronto de 9 alegações do blueprint contra código real confirmou as citações de reuso (agora re-ancoradas no Beauty, §0.1). A premissa falsa era de **esforço**: "portar é fácil / adapter é fino". Resultado: 5 pontos de quebra, 11 lacunas de escopo e 13 correções — todas incorporadas nas §2–§8 abaixo.

**Nota de reconciliação da sessão:** a quebra **#3** (sandbox NotaAS não documentado) foi **superada pelo adendo §H** do `notaas-report.md` — homologação EXISTE ("notas emitidas não têm valor fiscal", toggle "Ativar Produção" por organização/projeto). A correção 3 muda de "descobrir se há sandbox" para "critérios de F3 rodam em homologação; cutover de produção é gate humano". O adendo também trouxe: **cota SaaS Pro = 2.000 notas/mês < teto D5 (5.000)** → gate **G-QUOTA** criado; campo **`referencia`** confirmado como chave de idempotência/correlação do outbox; endpoints canônicos confirmados (§H.2, refletidos no OpenAPI §4).

**O que muda vs roadmap original (resumo executivo):**
1. **A0 (PoC mTLS edge→C6)** entra como PRIMEIRO entregável do trilho C6 — gate binário com fallback arquitetural nomeado (micro-serviço C6 fora do edge, colide com P4 → decisão do Marcelo).
2. **F4 (régua) redimensionada como construção nova** — trigger por fatura + contexto de fatura na mensagem + stop por fatura são novos; só o executor de `step_runs` (`apps/NexvyBeauty/supabase/functions/cadence-tick/index.ts`) é reuso.
3. **G-C6 dividido** em G-C6-SANDBOX e G-C6-PROD; **G-QUOTA criado**; G-NOTAAS reduzido a residual.
4. **DDL enriquecida**: multa/juros, retenções fiscais, `cnpj` no cofre, estado `substituida` na máquina de estados.
5. **`renegociar` especificada** (§2, correção 7): acordo gera N faturas-parcela vinculadas a `agreement_id`; fatura original → `substituida`.
6. **4 marcos de valor** reordenados com homologação E2E antes de qualquer produção (§3.3).
7. **[REASSENTAMENTO] A7 — isolamento do fork** entra na Fase A: mods de cobrança em `migrations_cobranca/` (aditivo) + `CORE-DELTA.md` mantido (mapa §0.1).

---

## 2. As 13 correções aplicadas

| # | Correção (veredito 3a) | O que mudou no plano (neste spec) |
|---|---|---|
| 1 | **[BLOQUEADOR] PoC mTLS edge→C6 antes de tudo no trilho C6** | **A0 inserido como primeiro entregável do trilho C6** (antes de B1). Critério binário: `POST /v1/auth` sandbox C6, com client cert, de DENTRO de edge function deployada → 200 + `access_token`. **Fallback arquitetural nomeado:** se `Deno.createHttpClient({cert,key})` indisponível no runtime gerenciado Supabase → micro-serviço C6 fora do edge (container leve no VPS existente), o que colide com P4 e exige decisão HITL do Marcelo ANTES de F2. O GET de confirmação do c6-webhook depende do mesmo mTLS (encadeado com quebra #5). |
| 2 | **[BLOQUEADOR] Régua por fatura = construção nova** | Decisão 7 do blueprint reescrita: `cadence-*` do Beauty é lead-cêntrico (condições por `lead_id` em `apps/NexvyBeauty/supabase/functions/cadence-tick/index.ts:42-50`; agenda por delay em `computeScheduledAt` `:34-37`, não por due_date). F4 redimensionada: **reusa-se apenas o EXECUTOR de `step_runs`**; são construção nova: (a) `invoice_id` no enrollment (`source_ref` estruturado), (b) tick passa fatura/valor/vencimento ao outreach, (c) stop POR FATURA (pagar 1 de 3 não para as outras 2 réguas), (d) agendamento por `due_date` (D-3 = vencimento−3d). Entregáveis D1–D3. |
| 3 | **G-NOTAAS superado pelo adendo §H** | Sandbox/homologação EXISTE. Critérios de C1–C3 rodam em **homologação**; toggle "Ativar Produção" = gate humano (dentro de G-NOTAAS-resid). G-NOTAAS reduzido ao residual §H.3: preço R$/nota, prazo de cancelamento por município, cobertura do município do case #1. |
| 4 | **verify_jwt dos webhooks com dono (A6)** | Entregável explícito A6: `curl` externo SEM JWT em `c6-webhook`/`notaas-webhook` → 200; funções de dinheiro (`c6-billing`, `invoice-batch-generate`, `notaas-emit`) → 401. Corrigido o registro: `config.toml` do app tem 1 linha (`project_id`), NÃO "0 linhas"; o mecanismo `verify_jwt=false` por função vive no deploy Lovable/dashboard, não versionado — A6 documenta e prova por curl. |
| 5 | **Split G-C6** | G-C6 dividido: **G-C6-SANDBOX** (credenciais sandbox para desenvolver F2 — destrava B1) e **G-C6-PROD** (conta PJ do case #1 + tarifa de boleto negociada ≤R$1,20 — gate do Marco 2). Tarifa é gate de viabilidade da margem (§8.2 do blueprint), não detalhe. |
| 6 | **DDL invoices += multa/juros + estado `substituida`** | `invoices` ganha: `valor_original numeric(12,2)`, `multa_pct numeric(5,2)`, `juros_pct numeric(5,2)`, `valor_multa numeric(12,2)`, `valor_juros numeric(12,2)`. Máquina de estados ganha **`substituida`** (terminal): 2ª via de boleto vencido = NOVA emissão com nova `referencia`/`nosso_numero`, fatura antiga → `substituida` com `metadata.substituted_by = <invoice_id novo>`. Transições novas: `vencida → substituida`, `emitida → substituida` (renegociação). Entregável A5. |
| 7 | **`renegociar` especificada ANTES de F4** | **Materialização definida (recomendação deste spec, adotada):** acordo de renegociação cria registro em `billing_agreements` (nova tabela: `id, organization_id, payer_id, invoice_id_original, n_parcelas, desconto_pct, status, aprovado_por`) e **gera N novas faturas-parcela vinculadas por `agreement_id`** (coluna nova em `invoices`); a fatura original vai a **`substituida`**. Critérios: acordo de 3 parcelas → 3 invoices novas com `agreement_id` preenchido + original `substituida`; desconto > alçada do tenant → handoff humano (nenhuma fatura criada); acordo é idempotente por `(invoice_id_original)` ativo. Entregável D5. |
| 8 | **Multi-CNPJ: coluna `cnpj` no cofre** | `billing_credentials` muda `UNIQUE(organization_id, provider)` → **`UNIQUE(organization_id, provider, cnpj)`** (custo: 1 coluna). Nota: multi-CNPJ NotaAS é serviço contratado (limite de projetos por plano, §H.1.5) → **v1 opera com 1 CNPJ por tenant, limitação declarada** (P-COBR-004), mas o schema não trava a evolução. Entregável A5. |
| 9 | **Fallback e-mail para pagador sem WhatsApp** | Incluído (não subtraído): pagador sem `whatsapp` → régua degrada para e-mail reusando a fila pgmq de e-mail existente (`apps/NexvyBeauty/supabase/functions/process-email-queue/index.ts` + `_shared/platform-email-send.ts`). Entregável E1. |
| 10 | **Dia útil no vencimento** | `invoice-batch-generate` conecta `business_hours`/`holidays` existentes no CRM Beauty: vencimento em feriado/fim de semana → rola para dia útil seguinte. Critério dentro de B3. |
| 11 | **Retenções fiscais no modelo** | `contracts` e `invoices` ganham `iss_retido boolean DEFAULT false` e `retencoes jsonb DEFAULT '{}'` (`{pis, cofins, irrf, csll, cp}` em R$ — espelha payload NotaAS §A/H.2). Case #2 (cowork B2B) precisa. Entregável A5; `notaas-emit` propaga (C1). |
| 12 | **Admin burden na unit economics** | Instrumentação E3 ganha contador de eventos operacionais (nota em erro, cancelamento, renovação A1, município não coberto) → h/mês estimadas no piloto e incorporadas à unit economics. Medição no piloto = P-COBR-002. |
| 13 | **Item 0.3 vira caça a policies permissivas** | Auditoria RLS (A3) reescopada: hipótese "RLS ausente em massa" NÃO se sustentou (amostra pós-baseline: todas ON e org-scoped). Risco real: **policies permissivas** — ex.: `webchat_conversations` INSERT `WITH CHECK (true)`. A3 = 100% ON **+ varredura de `WITH CHECK (true)`/`USING (true)`** nas tabelas pós-baseline, com lista justificada das exceções. |

---

## 3. Fases e entregáveis auditáveis

### 3.1 Legenda de MÉTODO DE AFERIÇÃO

| Código | Método | Quem executa |
|---|---|---|
| TA | Teste automatizado (Deno test / SQL de asserção versionado no repo) | CI / Claude |
| CURL | curl real contra ambiente deployado (sandbox/homolog/prod) | Claude + humano observa |
| INSP | Inspeção manual verificável (ls, grep, painel, screenshot) | Claude / humano |
| VEXT | Validador externo (query de auditoria SQL, scanner, revisor) | Claude + revisor |
| CI | Gate de pipeline (grep/lint bloqueante) | CI |

### 3.2 Tabela mestre de entregáveis (A0..E4 do veredito + A7 de isolamento, enriquecida)

> **Convenção de paths (REASSENTADA):** onde a coluna "Artefatos concretos" diz `supabase/functions/...` ou `supabase/migrations_cobranca/...`, o caminho absoluto no fork é `apps/NexvyPayments/supabase/...`. Novos schemas de cobrança vão em `apps/NexvyPayments/supabase/migrations_cobranca/` (esteira nova, aditiva, espelhando `migrations_salao/`); reuso de `_shared/*` vem de `apps/NexvyBeauty/supabase/functions/_shared/` (copiado no fork, editado só quando aditivo).

| ID | Descrição | Artefatos concretos | Critério binário | Aferição | Gate HITL |
|---|---|---|---|---|---|
| **A0** | PoC mTLS edge→C6 (PRIMEIRO do trilho C6) | `supabase/functions/c6-mtls-poc/index.ts` (descartável); relatório de resultado no PR | `POST /v1/auth` sandbox C6 de dentro de EF deployada → 200 + `access_token`. FALHOU → fallback micro-serviço fora do edge, decisão registrada | CURL | **Marcelo decide arquitetura se falhar** (colisão com P4) |
| **A1** | Remover `admin-provision-users` (se presente no fork) | delete de `supabase/functions/admin-provision-users/`; grep no front | `ls` → não existe; grep por chamadas no front → 0 hits | INSP+CI | Revisor (G-SEC-REV) |
| **A2** | Helper `_shared/require-caller-org.ts` | `supabase/functions/_shared/require-caller-org.ts` + testes | org do body ignorada → 403 se cross-org; sem JWT → 401; JWT válido → org do token | TA | — |
| **A3** | Auditoria RLS tabelas pós-baseline (ON + permissividade) | `docs/security/rls-audit-2026-07.md` + query SQL versionada | 100% das tabelas com `organization_id` → RLS ON; policies `WITH CHECK (true)`/`USING (true)` listadas e justificadas ou corrigidas | VEXT | Revisor (G-SEC-REV) |
| **A4** | Cofre `billing_credentials` cifrado | migration `migrations_cobranca/*_billing_credentials.sql`; `_shared/billing-crypto.ts` (reusa `apps/NexvyBeauty/supabase/functions/_shared/meta-crypto.ts:9,25,41`) | `SELECT` como anon/authenticated → 0 linhas; round-trip `v1:` → decifra = plaintext; nada legível no banco | TA | — |
| **A5** | DDL modelo completo (com correções 6/8/11) na esteira `migrations_cobranca/` | migrations em `migrations_cobranca/`: `payers`, `billing_groups`, `contracts`, `invoices` (+multa/juros/valor_original/`agreement_id`/retenções/estado `substituida`), `invoice_items`, `billing_events`, `billing_agreements`; `cnpj` em `billing_credentials` + `UNIQUE(org,provider,cnpj)`; RLS canônica `organization_id = get_user_organization(auth.uid())` (padrão `migrations_salao/20260618_erp_salao.sql:28-63`) | INSERT cross-org via client → rejeitado; `\d invoices` mostra multa_pct/juros_pct/valor_multa/valor_juros/valor_original/agreement_id/iss_retido/retencoes; CHECK de status inclui `substituida`; toda tabela tem `organization_id` + índice `_org` | TA+INSP | — |
| **A6** | verify_jwt=false só nos webhooks | doc de deploy + prova curl versionada em `docs/security/verify-jwt-matrix.md` | curl externo SEM JWT: `c6-webhook`/`notaas-webhook` → 200 (ou 4xx de validação, nunca 401 JWT); `c6-billing`/`invoice-batch-generate`/`notaas-emit` → 401 | CURL | — |
| **A7** | **[REASSENTAMENTO] Isolamento do fork (fork gerenciado)** | `docs/CORE-DELTA.md` (registro de todo delta inevitável no core Vendus); confirmação de que schemas de cobrança vivem só em `migrations_cobranca/` | grep: nenhuma tabela de cobrança (`payers`/`invoices`/`contracts`/`billing_*`) definida fora de `migrations_cobranca/`; **toda** edição a arquivo do core (ex. `src/main.tsx`, `src/config/brand.ts` p/ branding) está listada em `CORE-DELTA.md` com justificativa; migrations de cobrança são **aditivas** (nenhum `ALTER`/`DROP` em tabela do core sem entrada em CORE-DELTA) | INSP+CI | Revisor (G-SEC-REV) |
| **B1** | `c6-billing` (porta de `c6.py:217-515` + parser `:917-1069`, pós-A0) | `supabase/functions/c6-billing/index.ts` + `_shared/c6-payloads.ts` (puro) + testes do parser | Sandbox: Bolepix emitido → `nosso_numero`+linha digitável+QR; consulta idempotente; cancelamento OK | CURL | G-C6-SANDBOX |
| **B2** | Outbox `billing_outbox` (pgmq) | migration `migrations_cobranca/*_billing_outbox.sql` (`pgmq.create('billing_outbox')`) + wrappers RPC (molde da fila pgmq do Beauty, `process-email-queue`) + DLQ | `enqueue`/`read_batch`/`move_to_dlq` funcionam via RPC; msg com `referencia` gravada ANTES do POST | TA | — |
| **B3** | `invoice-batch-generate` idempotente + dia útil | `supabase/functions/invoice-batch-generate/index.ts` | 2× mesma competência → 0 faturas duplicadas (UNIQUE segura); vencimento em feriado/fds → dia útil seguinte (`business_hours`/`holidays`) | TA | — |
| **B4** | `c6-webhook` + GET de confirmação (mTLS) | `supabase/functions/c6-webhook/index.ts` (parser 100% reuso `c6.py:917-1069`) | webhook pago → fatura `paga` + `billing_events(paga)`; webhook repetido → idempotente (1 evento); payload não confirmado pelo GET → rejeitado | TA+CURL | — |
| **B5** | 1ª fatura boleto+PIX em PRODUÇÃO (case #1) | credencial prod no cofre; execução real | boleto real registrado no C6 com `nosso_numero` de produção | INSP | **G-C6-PROD** |
| **C1** | `notaas-emit` lote (homologação) | `supabase/functions/notaas-emit/index.ts` (`POST /api/v1/emitir/batch`, ≤100/lote, `referencia`=invoice_id, retenções propagadas) | lote 100 → 202 `{batchId}`; 101 itens → split em 2 chamadas; `notaas_invoice_id` gravado por fatura; NUNCA reenvia sem consultar status por `referencia` | TA + CURL homolog | G-NOTAAS-resid + G-A1 |
| **C2** | `notaas-webhook` HMAC + dedup | `supabase/functions/notaas-webhook/index.ts` (HMAC-SHA256 timing-safe de `X-Notaas-Signature`; dedup por `X-Notaas-Delivery`) | assinatura inválida → rejeitado (401/403); `deliveryId` repetido → processado 1×; `nfse.issued` → `nfse_status='emitida'`; `documents_ready` 2× (partial→complete) tolerado | TA | — |
| **C3** | Imutabilidade fiscal | trigger/guard SQL (em `migrations_cobranca/`) + fluxo formal de cancelamento | `DELETE` de nota emitida → rejeitado; cancelar = `POST /cancelar` + `billing_events(cancelada)` + trilha | TA | — |
| **D1** | Trigger da régua POR FATURA | `supabase/functions/billing-cadence-enroll/index.ts`; coluna/uso de `invoice_id` no enrollment (`source_ref` estruturado); tick passa contexto | `billing_events(emitida)` → enrollment com `invoice_id`; mensagem cita fatura/valor/vencimento (não genérica) | TA | — |
| **D2** | Agendamento por due_date | extensão do agendador (D-3/D0/D+1/D+7 relativos a `vencimento`, não `now+delay`; contraste `cadence-tick:34-37`); TZ America/Sao_Paulo (padrão `salon-automation-run:25`) | fatura vencendo em D+3 → step D-3 agendado HOJE; D+7 agendado para vencimento+7 | TA | — |
| **D3** | Stop POR FATURA | stop keyed por `(enrollment, invoice_id)`, não por `lead_id` (contraste `cadence-tick:42-50`) | payer com 2 faturas abertas paga 1 → régua da paga PARA, régua da outra CONTINUA; nenhuma msg pós-pagamento da paga | TA | — |
| **D4** | Régua Meta prod + opt-in | templates utility (fatura/lembrete/atraso/2ª via) aprovados; `optin-guard.ts` no caminho; Evolution só dev/inbound. **VERIFICAR roteamento Meta-vs-Evolution** (`whatsapp-router.ts` ausente no Beauty, §0.1) | régua prod usa template aprovado; sem opt-in → NÃO envia; log do envio com template_id | CURL+INSP | **G-META-TPL** |
| **D5** | 4 tools IA + `renegociar` materializada | `_shared/tools/impl/{consultar_fatura,segunda_via,enviar_comprovante,renegociar}.ts` + registro no `registry.ts` (padrão `apps/NexvyBeauty/supabase/functions/_shared/tools/registry.ts:5-16`); prompt-injection shield §11.3 | 2ª via → NOVA emissão (nova `referencia`/`nosso_numero`) + original `substituida`; `renegociar` → `billing_agreements` + N faturas-parcela com `agreement_id` + original `substituida`; desconto>alçada → handoff (0 faturas); input >8k chars/padrão de injeção → bloqueado+logado | TA | — |
| **E1** | Conciliação + baixa manual + fallback e-mail | painel de inadimplência; ação de baixa manual; rota e-mail via pgmq p/ payer sem WhatsApp (`process-email-queue`) | baixa manual grava `billing_events(paga){origem:'manual'}`; payer sem WhatsApp → régua envia e-mail | TA | — |
| **E2** | LGPD mínimo + audit PII | audit CRUD `payers` → `platform_audit_logs`; endpoint de erasure; registro de base legal por tenant; retenção por tabela. **Parte de** `migrations_salao/20260619_lgpd_consents.sql` (já existe no Beauty) | CRUD em `payers` gera linha de audit; erasure anonimiza contato MANTENDO fatura/nota (obrigação fiscal 5 anos) | TA | — |
| **E3** | Instrumentação custo real + limites Lovable + admin burden | métricas: custo/fatura medido, % sem humano, invocations/mês por tenant, contador de eventos operacionais (correção 12) | custo/fatura MEDIDO (não estimado) visível; invocations/mês visível; gatilho quantificado de migração VPS registrado | INSP | **G-INFRA** |
| **E4** | Prova de horizontalidade (case #2 cowork) | onboarding do cowork usando só `metadata` | cowork onboarded com **0 migrations novas de vertical** e 0 código novo | INSP | **G-PILOTO** |

**Total: 25 entregáveis** (A0–A7: 8 · B1–B5: 5 · C1–C3: 3 · D1–D5: 5 · E1–E4: 4). *(Era 24 sem A7; A7 de isolamento do fork adicionado no reassentamento. Errata aritmética 2026-07-06: esta linha dizia "26"; 8+5+3+5+4=25.)*

### 3.3 Ordem topológica e marcos de valor

```
A0 (PoC mTLS — decide arquitetura do trilho C6)
 └─► A1 → A2 → A3 → A4 → A5 → A6 → A7        [Fase A: hardening+dados+isolamento — G-SEC-REV]
        └─► B2 → B3 ─┬─► B1 → B4             [Fase B: emissão C6 — G-C6-SANDBOX]
                     └─► C1 → C2 → C3        [Fase C: NFS-e homologação — G-A1, G-NOTAAS-resid]
                              │
        ══ MARCO 1 ══ 1ª fatura em HOMOLOGAÇÃO com boleto+PIX (sandbox C6) + NFS-e
                      (homolog NotaAS) E2E, vinculados à MESMA fatura
                              │
                     B5 [G-C6-PROD] + toggle "Ativar Produção" NotaAS [G-NOTAAS-resid] + G-QUOTA
        ══ MARCO 2 ══ 1ª fatura PROD do case #1 (boleto real + nota real)
                              │
                     D1 → D2 → D3 → D4 [G-META-TPL] → D5
                              │
                     E1 → E2 → E3 [G-INFRA]
        ══ MARCO 3 ══ 1º ciclo mensal 100% automático do case #1
                      (lote→emissão→régua→conversa→conciliação, ≥95% sem toque humano)
                              │
                     E4 [G-PILOTO]
        ══ MARCO 4 ══ case #2 (cowork) onboarded SEM código novo (prova D2 horizontal)
```

Gargalos externos disparados CEDO (na Fase A/B, consumidos depois): G-C6-PROD (relacionamento bancário), G-A1 (cert do tenant), G-META-TPL (submissão Meta), G-NOTAAS-resid (perguntas ao dono), G-QUOTA (upgrade de plano NotaAS).

---

## 4. OpenAPI 3.1 — superfície de API do produto

Skill `openapi-spec-generation` aplicada. Convenções: rotas reais são `POST {SUPABASE_URL}/functions/v1/<nome>`; auth de usuário = JWT Supabase (Bearer); webhooks inbound são públicos (`verify_jwt=false`) com validação própria (HMAC NotaAS / GET de confirmação C6) e aparecem tanto como `paths` (nossos receptores) quanto na seção `webhooks` (contrato do emissor terceiro). Tools do agente IA não são HTTP público — documentadas com `x-internal: true`. **Todos os exemplos são sintéticos (CNPJs/CPFs fictícios).**

```yaml
openapi: 3.1.0
info:
  title: NexvyPayments — API do produto (edge functions)
  version: 0.1.0
  description: >
    Superfície de API do módulo de cobranças do NexvyPayments (fork gerenciado
    do NexvyBeauty/Vendus, embutido no monorepo SaasPlugin). Edge functions
    Supabase (Deno). Multi-tenant por organization_id (RLS canônica
    get_user_organization). A org do caller vem SEMPRE do JWT
    (require-caller-org); organization_id em body é ignorado (correção D-3).
    Núcleo de cobrança em migrations_cobranca/ (esteira nova, aditiva).
servers:
  - url: https://SUPABASE_REF.supabase.co/functions/v1
    description: Projeto Supabase NOVO do NexvyPayments (SUPABASE_REF resolvido no provisionamento)

security:
  - supabaseJwt: []

paths:
  /invoice-batch-generate:
    post:
      operationId: invoiceBatchGenerate
      summary: Gera o lote de faturas da competência (idempotente)
      description: >
        Materializa invoices+invoice_items dos contratos ativos da competência.
        Idempotente por UNIQUE(organization_id, contract_id, competencia).
        Vencimento em feriado/fim de semana rola para dia útil seguinte.
      security: [{ supabaseJwt: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [competencia]
              properties:
                competencia: { type: string, pattern: '^\d{4}-\d{2}$', examples: ['2026-08'] }
                contract_ids:
                  type: array
                  items: { type: string, format: uuid }
                readings:
                  type: array
                  description: Leituras do mês para contratos modo_valor=variavel
                  items:
                    type: object
                    required: [contract_id, valor]
                    properties:
                      contract_id: { type: string, format: uuid }
                      valor: { type: number, examples: [187.50] }
            example:
              competencia: '2026-08'
              readings:
                - contract_id: '11111111-1111-4111-8111-111111111111'
                  valor: 187.50
      responses:
        '200':
          description: Lote gerado (ou já existente — idempotente)
          content:
            application/json:
              schema:
                type: object
                properties:
                  created: { type: integer, examples: [42] }
                  skipped_existing: { type: integer, examples: [3] }
                  invoice_ids: { type: array, items: { type: string, format: uuid } }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '422': { $ref: '#/components/responses/UnprocessableEntity' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /c6-billing:
    post:
      operationId: c6Billing
      summary: Operações C6 (emitir/consultar/cancelar) — INTERNA
      description: >
        Chamada pelo billing-outbox-worker (service_role), não pelo front.
        Porta Deno de c6.py. Exige mTLS com o C6 (pré-condição A0).
        referencia é gravada ANTES do POST (idempotência de outbox).
      security: [{ supabaseJwt: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              oneOf:
                - type: object
                  required: [action, invoice_id, tipo]
                  properties:
                    action: { const: emitir }
                    invoice_id: { type: string, format: uuid }
                    tipo: { type: string, enum: [bolepix, pix] }
                - type: object
                  required: [action, nosso_numero]
                  properties:
                    action: { type: string, enum: [consultar, cancelar] }
                    nosso_numero: { type: string, examples: ['0009876543'] }
            example:
              action: emitir
              invoice_id: '22222222-2222-4222-8222-222222222222'
              tipo: bolepix
      responses:
        '200':
          description: Resultado da operação
          content:
            application/json:
              schema:
                type: object
                properties:
                  nosso_numero: { type: string, examples: ['0009876543'] }
                  linha_digitavel: { type: string, examples: ['33690.00012 34567.890123 45678.901234 5 99990000018750'] }
                  pix_copia_cola: { type: string }
                  qr_base64: { type: string, contentEncoding: base64 }
                  status: { type: string, enum: [registrado, liquidado, cancelado] }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409':
          description: Cobrança já emitida para esta referencia (dedup outbox)
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
        '422': { $ref: '#/components/responses/UnprocessableEntity' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /c6-webhook:
    post:
      operationId: c6Webhook
      summary: Webhook INBOUND do C6 (liquidação) — público
      description: >
        verify_jwt=false. C6 NÃO assina o webhook; validação = GET de
        confirmação na API C6 (mTLS) antes de dar baixa. Idempotente por
        (nosso_numero, evento). Payload chega como JSON duplo-escapado.
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              description: Envelope C6 (string JSON duplo-escape; parser reuso c6.py:917-1069)
            example: '{"evento":"liquidacao","nosso_numero":"0009876543","valor_pago":187.50,"pago_em":"2026-08-12T14:03:00-03:00"}'
      responses:
        '200': { description: Recebido (processado ou descartado idempotente) }
        '403': { description: GET de confirmação C6 não confirmou o pagamento }
        '422': { $ref: '#/components/responses/UnprocessableEntity' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /notaas-emit:
    post:
      operationId: notaasEmit
      summary: Emite NFS-e em lote via NotaAS — INTERNA
      description: >
        Chamada pelo billing-outbox-worker. Monta payload por fatura
        (referencia = invoice_id, ÚNICO gancho de correlação/dedup — §H.2),
        POST /api/v1/emitir/batch (≤100/lote; >100 → split). NotaAS NÃO tem
        idempotência: NUNCA reenviar sem consultar status por referencia.
      security: [{ supabaseJwt: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [invoice_ids]
              properties:
                invoice_ids:
                  type: array
                  maxItems: 100
                  items: { type: string, format: uuid }
            example:
              invoice_ids: ['22222222-2222-4222-8222-222222222222']
      responses:
        '202':
          description: Lote aceito pela NotaAS (assíncrono)
          content:
            application/json:
              schema:
                type: object
                properties:
                  batch_id: { type: string, examples: ['bat_xyz456'] }
                  queued: { type: integer, examples: [1] }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409':
          description: Fatura já tem notaas_invoice_id (dedup por referencia)
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
        '422': { $ref: '#/components/responses/UnprocessableEntity' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /notaas-webhook:
    post:
      operationId: notaasWebhook
      summary: Webhook INBOUND da NotaAS — público
      description: >
        verify_jwt=false. Valida HMAC-SHA256 do body raw (X-Notaas-Signature,
        comparação timing-safe) + dedup por X-Notaas-Delivery. Tolera
        nfse.documents_ready 2× (partial→complete). Atualiza nfse_status.
        Endpoint de cadastro do webhook: POST /api/v1/webhooks/endpoints (§H.2).
      security: []
      parameters:
        - in: header
          name: X-Notaas-Signature
          required: true
          schema: { type: string, examples: ['sha256=9f2c1a...'] }
        - in: header
          name: X-Notaas-Delivery
          required: true
          schema: { type: string, format: uuid }
        - in: header
          name: X-Notaas-Event
          required: true
          schema: { type: string, enum: [nfse.issued, nfse.error, nfse.cancelled, nfse.documents_ready, batch.completed] }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/NotaasWebhookEnvelope' }
      responses:
        '200': { description: Processado (ou dedup — 1× por deliveryId) }
        '401': { description: Assinatura HMAC inválida }
        '422': { $ref: '#/components/responses/UnprocessableEntity' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /billing-cadence-enroll:
    post:
      operationId: billingCadenceEnroll
      summary: Traduz evento de fatura → régua (enrollment POR FATURA)
      description: >
        Construção nova (correção 2): enrollment carrega invoice_id
        (source_ref estruturado); agendamento por due_date (D-3/D0/D+1/D+7,
        TZ America/Sao_Paulo); stop por fatura, não por lead. Reusa apenas o
        executor de step_runs (apps/NexvyBeauty/.../cadence-tick).
      security: [{ supabaseJwt: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [invoice_id, event]
              properties:
                invoice_id: { type: string, format: uuid }
                event: { type: string, enum: [emitida, vencendo, vencida, paga, substituida] }
            example: { invoice_id: '22222222-2222-4222-8222-222222222222', event: emitida }
      responses:
        '200':
          description: Enrollment criado/atualizado ou régua parada (event=paga|substituida)
          content:
            application/json:
              schema:
                type: object
                properties:
                  enrollment_id: { type: string, format: uuid }
                  action: { type: string, enum: [enrolled, rescheduled, stopped] }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409': { description: Enrollment ativo já existe para esta fatura (idempotente) }
        '422': { $ref: '#/components/responses/UnprocessableEntity' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /tools/consultar_fatura:
    post:
      operationId: toolConsultarFatura
      summary: 'Tool IA: consulta faturas do pagador (x-internal)'
      x-internal: true
      description: Invocada pelo runtime de agentes (registry.ts), nunca exposta ao público. Shield §11.3 aplicado ao input.
      security: [{ supabaseJwt: [] }]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [payer_documento]
              properties:
                payer_documento: { type: string, examples: ['12345678000190'] }
                competencia: { type: string, examples: ['2026-08'] }
      responses:
        '200':
          description: Faturas do pagador (resumo seguro p/ conversa)
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Invoice' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '422': { $ref: '#/components/responses/UnprocessableEntity' }

  /tools/segunda_via:
    post:
      operationId: toolSegundaVia
      summary: 'Tool IA: 2ª via = NOVA emissão; original → substituida (x-internal)'
      x-internal: true
      security: [{ supabaseJwt: [] }]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [invoice_id]
              properties:
                invoice_id: { type: string, format: uuid }
                novo_vencimento: { type: string, format: date, examples: ['2026-08-20'] }
      responses:
        '200':
          description: Nova fatura emitida (nova referencia/nosso_numero); original marcada substituida
          content:
            application/json:
              schema:
                type: object
                properties:
                  new_invoice_id: { type: string, format: uuid }
                  linha_digitavel: { type: string }
                  pix_copia_cola: { type: string }
        '409': { description: Fatura original já substituida/paga }
        '422': { $ref: '#/components/responses/UnprocessableEntity' }

  /tools/enviar_comprovante:
    post:
      operationId: toolEnviarComprovante
      summary: 'Tool IA: registra comprovante enviado pelo pagador (x-internal)'
      x-internal: true
      security: [{ supabaseJwt: [] }]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [invoice_id, media_url]
              properties:
                invoice_id: { type: string, format: uuid }
                media_url: { type: string, format: uri }
      responses:
        '200': { description: Comprovante anexado; fatura vai à fila de conciliação manual }
        '422': { $ref: '#/components/responses/UnprocessableEntity' }

  /tools/renegociar:
    post:
      operationId: toolRenegociar
      summary: 'Tool IA: renegociação — acordo → N faturas-parcela (x-internal)'
      x-internal: true
      description: >
        Materialização (correção 7): cria billing_agreements + N novas
        faturas-parcela vinculadas por agreement_id; fatura original →
        substituida. Desconto acima da alçada do tenant → handoff humano
        (nenhuma fatura criada). Idempotente por acordo ativo na fatura.
      security: [{ supabaseJwt: [] }]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [invoice_id, n_parcelas]
              properties:
                invoice_id: { type: string, format: uuid }
                n_parcelas: { type: integer, minimum: 1, maximum: 12, examples: [3] }
                desconto_pct: { type: number, minimum: 0, maximum: 100, examples: [5] }
      responses:
        '200':
          description: Acordo criado com faturas-parcela
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Agreement' }
        '403': { description: Desconto acima da alçada → handoff humano (acordo NÃO criado) }
        '409': { description: Já existe acordo ativo para esta fatura }
        '422': { $ref: '#/components/responses/UnprocessableEntity' }

webhooks:
  c6PaymentNotification:
    post:
      summary: 'Callback do C6 Bank → nosso /c6-webhook'
      description: >
        Sem assinatura documentada pelo C6 → o receptor SEMPRE confirma via
        GET (mTLS) antes de dar baixa. Ver path /c6-webhook.
      requestBody:
        content:
          application/json:
            schema: { type: object, description: 'Envelope C6 (JSON duplo-escape)' }
      responses:
        '200': { description: ACK }
  notaasEvent:
    post:
      summary: 'Callback da NotaAS → nosso /notaas-webhook'
      description: >
        HMAC-SHA256 (X-Notaas-Signature) + dedup (X-Notaas-Delivery).
        5 retentativas com backoff (imediato,1m,5m,30m,2h); timeout 10s.
        Endpoint cadastrado via POST /api/v1/webhooks/endpoints (§H.2).
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/NotaasWebhookEnvelope' }
      responses:
        '200': { description: ACK (responder <10s para não gerar retry) }

components:
  securitySchemes:
    supabaseJwt:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: >
        JWT Supabase do usuário do tenant. organization_id extraído do token
        via get_user_organization (require-caller-org); body é ignorado.
        Webhooks públicos usam security:[] + validação HMAC/GET.

  responses:
    Unauthorized:
      description: Sem JWT válido (401)
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    Forbidden:
      description: Org do caller não confere / sem role exigida (403)
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    UnprocessableEntity:
      description: Payload inválido (422)
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    TooManyRequests:
      description: Rate limit (429) — respeitar Retry-After
      headers:
        Retry-After: { schema: { type: integer } }
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }

  schemas:
    Error:
      type: object
      required: [error]
      properties:
        error: { type: string, examples: ['cross_org_forbidden'] }
        message: { type: string }
        correlation_id: { type: string }

    Payer:
      type: object
      required: [id, organization_id, tipo_documento, documento, nome]
      properties:
        id: { type: string, format: uuid }
        organization_id: { type: string, format: uuid }
        lead_id: { type: [string, 'null'], format: uuid }
        tipo_documento: { type: string, enum: [cpf, cnpj] }
        documento: { type: string, description: 'Só dígitos', examples: ['12345678000190'] }
        nome: { type: string, examples: ['Condominio Exemplo Ltda'] }
        email: { type: [string, 'null'], examples: ['financeiro@exemplo.test'] }
        whatsapp: { type: [string, 'null'], examples: ['+5567999990000'] }
        endereco:
          type: object
          description: '{logradouro,numero,bairro,cidade,uf,cep,ibge} p/ NFS-e'
        status: { type: string, enum: [ativo, inativo] }
        metadata: { type: object }

    Contract:
      type: object
      required: [id, organization_id, payer_id, descricao, modo_valor, dia_vencimento]
      properties:
        id: { type: string, format: uuid }
        organization_id: { type: string, format: uuid }
        payer_id: { type: string, format: uuid }
        group_id: { type: [string, 'null'], format: uuid }
        descricao: { type: string, examples: ['Medição individualizada de água — unidade 101'] }
        modo_valor: { type: string, enum: [fixo, variavel] }
        valor_fixo: { type: [number, 'null'] }
        dia_vencimento: { type: integer, minimum: 1, maximum: 28 }
        codigo_servico_nfse: { type: [string, 'null'], examples: ['010700'] }
        aliquota_iss: { type: [number, 'null'], examples: [2.0] }
        iss_retido: { type: boolean, default: false }
        retencoes:
          type: object
          description: 'Correção 11: {pis, cofins, irrf, csll, cp} em R$ (payload NotaAS)'
        status: { type: string, enum: [ativo, pausado, encerrado] }
        metadata: { type: object, description: 'Vertical vive aqui: {unidade, hidrometro, sala…}' }

    Invoice:
      type: object
      required: [id, organization_id, contract_id, payer_id, competencia, valor_total, vencimento, status]
      properties:
        id: { type: string, format: uuid }
        organization_id: { type: string, format: uuid }
        contract_id: { type: string, format: uuid }
        payer_id: { type: string, format: uuid }
        agreement_id:
          type: [string, 'null']
          format: uuid
          description: 'Correção 7: preenchido em faturas-parcela de renegociação'
        competencia: { type: string, pattern: '^\d{4}-\d{2}$', examples: ['2026-08'] }
        valor_original: { type: [number, 'null'], description: 'Correção 6: valor antes de multa/juros/desconto' }
        valor_total: { type: number, examples: [187.50] }
        multa_pct: { type: [number, 'null'], examples: [2.0] }
        juros_pct: { type: [number, 'null'], description: '% a.m.', examples: [1.0] }
        valor_multa: { type: [number, 'null'] }
        valor_juros: { type: [number, 'null'] }
        iss_retido: { type: boolean, default: false }
        retencoes: { type: object }
        vencimento: { type: string, format: date, examples: ['2026-08-10'] }
        status:
          type: string
          description: Máquina de estados única (blueprint §5 + correção 6)
          enum: [rascunho, aprovada, emitindo, emitida, erro, vencida, paga, cancelada, substituida]
        c6_nosso_numero: { type: [string, 'null'] }
        c6_linha_digitavel: { type: [string, 'null'] }
        c6_pix_copia_cola: { type: [string, 'null'] }
        c6_status: { type: [string, 'null'], enum: [registrado, liquidado, cancelado, null] }
        notaas_invoice_id: { type: [string, 'null'], examples: ['inv_abc123'] }
        notaas_ch_nfse: { type: [string, 'null'] }
        nfse_status: { type: [string, 'null'], enum: [pendente, emitida, erro, cancelada, null] }
        pago_em: { type: [string, 'null'], format: date-time }
        valor_pago: { type: [number, 'null'] }
        metadata:
          type: object
          description: 'Em substituida: {substituted_by: <invoice_id>}'

    Agreement:
      type: object
      required: [id, organization_id, payer_id, invoice_id_original, n_parcelas, status]
      properties:
        id: { type: string, format: uuid }
        organization_id: { type: string, format: uuid }
        payer_id: { type: string, format: uuid }
        invoice_id_original: { type: string, format: uuid }
        n_parcelas: { type: integer, examples: [3] }
        desconto_pct: { type: number, examples: [5] }
        status: { type: string, enum: [ativo, quitado, quebrado, cancelado] }
        aprovado_por: { type: string, description: 'ia_dentro_alcada | humano:<user_id>' }
        parcela_invoice_ids: { type: array, items: { type: string, format: uuid } }

    BillingEvent:
      type: object
      required: [id, organization_id, invoice_id, tipo, created_at]
      properties:
        id: { type: string, format: uuid }
        organization_id: { type: string, format: uuid }
        invoice_id: { type: string, format: uuid }
        tipo:
          type: string
          enum: [emitida, vencendo, vencida, paga, nfse_emitida, nfse_erro, cancelada, substituida, renegociada]
        payload: { type: object, examples: [{ origem: 'c6-webhook', nosso_numero: '0009876543' }] }
        created_at: { type: string, format: date-time }

    NotaasWebhookEnvelope:
      type: object
      required: [event, deliveryId, timestamp, data]
      properties:
        event: { type: string, examples: ['nfse.issued'] }
        deliveryId: { type: string, examples: ['del_xyz789'] }
        timestamp: { type: string, format: date-time }
        data:
          type: object
          examples:
            - invoiceId: 'inv_abc123'
              chNFSe: '4321000001234'
              nNFSe: '00001'
```

---

## 4.1 Adendo NotaAS (§H autenticado — endpoints canônicos)

Confirmado no `notaas-report.md` §H.2 (refletido no OpenAPI acima). O adapter `notaas-emit` consome estes endpoints da NotaAS (terceiro):

| Endpoint NotaAS | Uso no NexvyPayments | Entregável |
|---|---|---|
| `POST /api/v1/emitir` | Emissão unitária (fallback / retry pontual por `referencia`) | C1 |
| `POST /api/v1/emitir/batch` | Emissão em lote (≤100/lote; >100 → split); caminho principal do `notaas-emit` | C1 |
| `GET /api/v1/invoices/:id/status` | Consulta status ANTES de reenviar (NotaAS não tem idempotência nativa) | C1 |
| `POST /api/v1/cancelar` | Cancelamento fiscal formal (NotaAS não faz substituição; runbook cancelar+reemitir) | C3, P-COBR-005 |
| `POST /api/v1/webhooks/endpoints` | Cadastro do endpoint do `notaas-webhook` (HMAC + dedup) | C2 |

**Invariantes do adendo:**
- **Sandbox = homologação** ("notas emitidas não têm valor fiscal"); toggle "Ativar Produção" por organização/projeto = gate humano (G-NOTAAS-resid).
- **Cota SaaS Pro = 2.000 notas/mês < teto D5 (5.000)** → gate **G-QUOTA** antes do go-live full do case #1.
- **`referencia` = `invoice_id`** = chave de idempotência/correlação do outbox (NUNCA reenviar sem consultar status por `referencia`).

---

## 5. Matriz de conformidade spec↔código

Skill `spec-to-code-compliance` aplicada: cada entregável tem evidência exigida e status. **Regra anti-alucinação: status nasce PENDENTE para 100% dos itens; só muda com evidência citável (file:line, output de curl, resultado de teste). Nunca inferir conformidade.** Match types na atualização: `full_match | partial_match | mismatch | missing_in_code`.

### 5.1 Matriz (estado inicial — 2026-07-06)

| Entregável | Evidência exigida (para virar CONFORME) | Status |
|---|---|---|
| A0 | Output do curl dentro da EF deployada: HTTP 200 + JSON com `access_token` do sandbox C6; OU relatório de falha + decisão de fallback assinada | **PENDENTE** |
| A1 | Output de `ls apps/NexvyPayments/supabase/functions/admin-provision-users` = erro; grep no `src/` = 0 hits; CI verde | **CONFORME** — 2026-07-06, iteração 4: `ls` → "No such file or directory"; `grep -rn admin-provision-users src/` = 0 hits; `npm run build` exit 0 (commit `ea09417`). Certificação do revisor entra no G-SEC-REV (P3, fim da Fase A) |
| A2 | Arquivo `_shared/require-caller-org.ts` + suite de teste com os 3 casos (403/401/org-do-token) passando | **CONFORME** — 2026-07-06, iteração 5: `supabase/functions/_shared/require-caller-org.ts` + `_shared/__tests__/require-caller-org.test.ts`; `deno test` = **11 passed, 0 failed** (3 casos do spec + service_role/actorUserId + 7 robustez), aferição re-executada pelo revisor (autor: subagente Opus). Org real via `profiles.organization_id` (padrão do baseline: webchat-inbox/index.ts:93). Nota: comparação da service key é `===` (paridade com molde platform-crm-auth) — endurecer p/ timing-safe no consumo (Fases B+/A6) |
| A3 | `docs/security/rls-audit-2026-07.md` com query + resultado: N tabelas, 100% ON, lista de policies permissivas com justificativa/correção | **PENDENTE** |
| A4 | Migration aplicada (`migrations_cobranca/*_billing_credentials.sql`) + teste: SELECT anon = 0 linhas + round-trip `v1:` passando (reuso `meta-crypto.ts:25,41`) | **PENDENTE** |
| A5 | Migrations `migrations_cobranca/` aplicadas; `\d invoices` com as 9 colunas novas; CHECK de status com `substituida`; `\d billing_credentials` com `cnpj` + UNIQUE triplo; `\d billing_agreements` existe; toda tabela org-scoped; teste INSERT cross-org rejeitado | **PENDENTE** |
| A6 | `docs/security/verify-jwt-matrix.md` com outputs de curl: 2 webhooks sem JWT ≠ 401; 3 funções de dinheiro sem JWT = 401 | **PENDENTE** |
| A7 | grep: 0 tabelas de cobrança fora de `migrations_cobranca/`; `docs/CORE-DELTA.md` existe e lista toda edição a arquivo do core (com justificativa); nenhuma migration de cobrança faz `ALTER`/`DROP` em tabela do core sem entrada em CORE-DELTA | **PENDENTE** |
| B1 | Output de curl sandbox: Bolepix com `nosso_numero`+linha+QR; consulta 2× = mesmo resultado; testes do parser (fixtures de `c6.py`) verdes | **PENDENTE** |
| B2 | `SELECT pgmq.metrics('billing_outbox')` OK; testes das RPCs enqueue/read/dlq verdes | **PENDENTE** |
| B3 | Teste: 2 execuções mesma competência → count igual; teste dia útil (vencimento cai sábado → segunda) | **PENDENTE** |
| B4 | Teste: webhook fixture → status `paga` + 1 `billing_events`; replay → sem 2º evento; fixture não confirmada pelo GET → rejeitada | **PENDENTE** |
| B5 | Screenshot/JSON do boleto PROD com `nosso_numero` real + registro do gate G-C6-PROD aprovado | **PENDENTE** |
| C1 | Curl homologação: lote 100 → 202 com `batchId`; teste split 101→2 chamadas; teste "nunca reenvia sem consultar" (mock) | **PENDENTE** |
| C2 | Testes: HMAC inválido → 401; deliveryId repetido → 1 processamento; `documents_ready` partial+complete → estado final correto | **PENDENTE** |
| C3 | Teste: DELETE em nota `issued` → exceção do guard; fluxo de cancelamento gera evento com trilha | **PENDENTE** |
| D1 | Teste: `billing_events(emitida)` → enrollment com `invoice_id`; render da 1ª msg contém valor+vencimento da fatura | **PENDENTE** |
| D2 | Teste com clock fixo (TZ São Paulo): fatura venc D+3 → step D-3 hoje; D0 e D+7 nas datas certas | **PENDENTE** |
| D3 | Teste: payer com 2 faturas, paga a 1ª → step_runs da 1ª cancelados, da 2ª intactos | **PENDENTE** |
| D4 | IDs dos 4 templates aprovados na Meta; teste opt-in ausente → 0 envios; log de envio prod com template_id; roteador Meta-vs-Evolution localizado (§0.1) | **PENDENTE** |
| D5 | Testes das 4 tools: 2ª via cria nova invoice + original `substituida`; renegociar 3× → 1 agreement + 3 parcelas; desconto>alçada → handoff + 0 faturas; injeção >8k → bloqueado | **PENDENTE** |
| E1 | Teste: baixa manual grava evento `{origem:'manual'}`; payer sem whatsapp → mensagem na fila pgmq de e-mail (`process-email-queue`) | **PENDENTE** |
| E2 | Teste: CRUD payers → linhas em `platform_audit_logs`; erasure → contato anonimizado E fatura/nota intactas | **PENDENTE** |
| E3 | Painel com custo/fatura medido + invocations/mês; doc do gatilho VPS quantificado; contador de eventos operacionais ativo | **PENDENTE** |
| E4 | Diff de migrations entre onboarding do cowork e o estado anterior = vazio; org do cowork operando | **PENDENTE** |

### 5.2 Quebras do planner classificadas por severidade

| Quebra | Severidade | Estado | Tratamento no spec |
|---|---|---|---|
| #1 mTLS em edge function não provado (`c6.py:160-162,184-194`; TODA chamada C6 exige client cert; fetch Deno padrão não expõe; `Deno.createHttpClient` unstable) | **CRÍTICA** (bloqueia trilho C6 inteiro, incl. GET de confirmação do B4) | ABERTA | A0 primeiro entregável; fallback nomeado; gate HITL de arquitetura |
| #2 Motor cadence-* lead-cêntrico; régua por fatura é construção nova (stop errado, msg sem contexto, agenda por delay) — RE-VERIFICADO no Beauty (`apps/NexvyBeauty/supabase/functions/cadence-tick/index.ts:34-37,42-50`) | **ALTA** (v1 enviaria msg errada e pararia régua errada) | ABERTA | D1/D2/D3 redimensionados como construção nova; reuso limitado ao executor |
| #3 Sandbox NotaAS não documentado | — | **SUPERADA** (adendo §H: homologação existe) | Critérios C1–C3 em homologação; "Ativar Produção" = gate |
| #4 verify_jwt dos webhooks sem dono (mecanismo não versionado no repo) | **MÉDIA** | ABERTA | A6 com matriz curl provada e documentada |
| #5 Idempotência "nativa" C6 superestimada (retry é do CLIENTE, `c6.py:288-323`; dedup server-side nunca testada em prod; webhook sem assinatura) | **BAIXA-MÉDIA** | ABERTA | B4 valida por GET sempre; outbox nunca confia em dedup do C6; teste de replay obrigatório |

---

## 6. Certificação por fase (quem afere o quê)

| Fase | Entregáveis | Aferidor primário | Aferidor de gate | Prova mínima para fechar a fase |
|---|---|---|---|---|
| **A — Hardening + dados + isolamento** | A0–A7 | Claude (TA/INSP) + CI (grep A1/A7) + VEXT (query RLS A3) | **Humano** (revisor sênior: G-SEC-REV; Marcelo: arquitetura se A0 falhar) | A0 curl real; suite A2/A4/A5 verde; A3 doc revisado; A6 matriz curl; A7 CORE-DELTA.md + grep de isolamento limpo |
| **B — Emissão C6** | B1–B5 | Claude (TA) + **curl real sandbox** (B1/B4) | **Humano**: G-C6-SANDBOX (credenciais), G-C6-PROD (conta PJ + tarifa ≤R$1,20) | Bolepix sandbox E2E; replay de webhook idempotente; B5 só após gate |
| **C — NFS-e homologação** | C1–C3 | Claude (TA) + **curl real homologação NotaAS** | **Validador externo** (dono da conta NotaAS: G-NOTAAS-resid) + humano (G-A1 cert; toggle produção) | lote 100 em homolog; HMAC+dedup testados; guard fiscal ativo |
| **D — Régua + IA** | D1–D5 | Claude (TA com clock fixo) | **Validador externo** (Meta aprova templates: G-META-TPL) | stop-por-fatura provado; msg com contexto; 4 tools com testes; shield ativo |
| **E — Conciliação/LGPD/prova** | E1–E4 | Claude (TA/INSP) | **Humano/negócio**: G-INFRA (Marcelo), G-PILOTO (case #1 assina), G-QUOTA (upgrade NotaAS antes do full) | ciclo mensal ≥95% sem humano (Marco 3); cowork sem migration (Marco 4) |

Regra transversal (CLAUDE.md §1.4 + §10): **nada fecha com "writer side green"** — todo entregável com integração externa exige outcome verificável externo (curl real, entrega do webhook no histórico da NotaAS, template aprovado no painel Meta).

---

## 7. Gates HITL consolidados

| Gate | O que trava | Critério de liberação (binário) | Quem resolve | Bloqueia |
|---|---|---|---|---|
| **G-SEC-REV** | Hardening Fase A (A1/A3/A6/A7 + §11.2) | Revisão de segurança aprovada por escrito | Marcelo + revisor sênior | Qualquer fase com dinheiro |
| **G-C6-SANDBOX** | Credenciais sandbox C6 disponíveis p/ dev | curl A0/B1 executável com as credenciais | Marcelo | B1 (dev do trilho C6) |
| **G-C6-PROD** | Conta PJ do case #1 + **tarifa de boleto negociada** | Credencial prod no cofre + tarifa documentada ≤R$1,20 (senão: boleto pass-through, PIX default) | Marcelo (relacionamento bancário) | B5 / **Marco 2** |
| **G-NOTAAS-resid** | Residual §H.3: **preço R$/nota**, **prazo de cancelamento** por município, **cobertura do município do case #1** | 3 respostas documentadas + toggle "Ativar Produção" acionado conscientemente | Dono da conta NotaAS (Marcelo) | C1 em produção / Marco 2 |
| **G-QUOTA** | Cota do plano NotaAS ≥ volume do case #1 (**SaaS Pro 2.000/mês < teto D5 5.000**) | `GET /org/settings` → `creditsLimit ≥ volume mensal contratado do case #1` | Marcelo (upgrade do plano) | Go-live FULL do case #1 (Marco 3 em volume pleno) |
| **G-A1** | Certificado A1 (.pfx+senha) do CNPJ case #1 | Upload aceito: 201 com `subjectCN` + `daysUntilExpiration > 90` | Tenant case #1 | C1 (emissão homolog/prod) |
| **G-META-TPL** | 4 templates utility aprovados (fatura, lembrete, atraso, 2ª via) | Status "approved" no painel Meta p/ os 4 | Meta (submeter na Fase A/B) | D4 (régua em produção) |
| **G-PILOTO** | Compromisso pago do case #1 (teste de desespero — parecer PMF §8) | Contrato de piloto pago OU carta de intenção com valor, assinado ANTES do go-live definitivo | Marcelo + case #1 | Marco 4 / go-live definitivo |
| **G-INFRA** | Limites Lovable Cloud medidos | Invocations/pgmq/storage por tenant medidos + gatilho de migração VPS **quantificado** (nº, não "futuro") | Marcelo | Escala pós-piloto (N tenants) |

---

## 8. Pendências para PENDENCIAS.md

| ID | Pendência | Trigger de resolução |
|---|---|---|
| P-COBR-001 | **Derivação de chave por-org no cofre** (hoje: chave-mestra global `apps/NexvyBeauty/supabase/functions/_shared/meta-crypto.ts:11` via `get_or_create_meta_master_key` custodiando A1 de todos os tenants — blast radius total). Implementar HKDF com salt por tenant | ANTES de onboardar o tenant nº 3 (N>2). Dívida de segurança nomeada, não backlog |
| P-COBR-002 | **Admin burden medido no piloto** (renovação anual A1, notas em erro, cancelamentos, municípios não cobertos) → h/mês na unit economics | Fim do 1º ciclo mensal do case #1 (Marco 3) — E3 coleta os contadores |
| P-COBR-003 | **Preço NotaAS em R$ por nota/plano** ainda não capturado (adendo §H.3) — a margem da linha "NFS-e R$0,20–0,60" do blueprint é premissa | Resposta do G-NOTAAS-resid; recalcular §8.2 do blueprint se sair da faixa |
| P-COBR-004 | **Multi-CNPJ por tenant = limitação declarada do v1** (schema já suporta via `UNIQUE(org,provider,cnpj)`; NotaAS cobra multi-projeto como serviço contratado) | Primeiro tenant real com 2+ CNPJs emissores → contratar upgrade NotaAS + habilitar fluxo |
| P-COBR-005 | **Prazo de cancelamento de NFS-e por município** não documentado (varia na prática); runbook de "cancelar+reemitir" (NotaAS não tem substituição) | G-NOTAAS-resid + 1º cancelamento real em produção |
| P-COBR-006 | **URLs de CDN NotaAS públicas e imutáveis** (pdfUrl/xmlUrl sem auth — LGPD): proxy assinado obrigatório no v1 (entregável dentro da UI de Notas); avaliar `storageBaseUrl` white-label | Antes do Marco 2 (nenhuma URL crua chega ao pagador) |
| P-COBR-007 | **Convergência dos adapters C6/NotaAS com o ERP-Educacional (FIC)** — manutenção dupla Python/Deno (R8); contrato §2.3 do blueprint publicado, extração p/ pacote compartilhado adiada | Quando o FIC iniciar o trilho NFS-e Cassilândia-MS |
| P-COBR-008 | **Rate limit numérico da project key NotaAS** não documentado — dimensionar rajada de 50×100 notas com margem | G-NOTAAS-resid; teste de carga em homologação antes do Marco 3 em volume pleno |
| P-COBR-009 | **[REASSENTAMENTO] Roteamento Meta-vs-Evolution não localizado no Beauty** (`_shared/whatsapp-router.ts` presente no vendus-ref, ausente em `apps/NexvyBeauty/supabase/functions/_shared/`) — D4 depende de saber onde o Beauty decide provider | Início da Fase D (antes de D4) |
| P-COBR-010 | **[REASSENTAMENTO] Fonte da cascata (Oficinas vs `cp -r Beauty`)** — a Fase C do `cascade-core.sh` copia src de Oficinas e conflita com `cp -r apps/NexvyBeauty`. Decisão: cascade só Fases A+B (schema+edges), `src/` do Beauty | Antes de rodar `cascade-core.sh` no provisionamento (mapa §4) |

---

*Fim do spec auditável reassentado. Base: NexvyBeauty (fork gerenciado). Núcleo de cobrança em `apps/NexvyPayments/supabase/migrations_cobranca/` (esteira nova, aditiva, espelha `migrations_salao/`). Próximo consumidor: Etapa 4 (loop-readiness) — este arquivo + a matriz §5.1 são o contrato; o loop de implementação atualiza os status PENDENTE→CONFORME com evidência citável, nunca por inferência. Disciplinas de fork gerenciado (A7): mods 100% isoladas, CORE-DELTA.md mantido, atualizações futuras = diff seletivo.*
