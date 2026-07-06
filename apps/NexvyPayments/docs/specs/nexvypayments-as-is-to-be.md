# AS-IS × TO-BE — NexvyPayments (app embutido no ecossistema NexvyTech)

> Etapa 1 da esteira de produto · reassentado 2026-07-06 · slug `nexvypayments`
> **Lar do produto:** `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyPayments/` (app do monorepo `SaasPlugin_vite`, NÃO mais repo standalone).
> **Base de código:** forka do **NexvyBeauty** (`apps/NexvyBeauty/`) — provado byte-a-byte que **Beauty *É* Vendus** (`.vendus-src-reference/REMIX.md:1`, `post-sale-engine.ts` e `components.json` byte-idênticos), só que mais maduro e já embutido. "Partir do Beauty" = "partir do Vendus" da versão mais avançada.
> **Insumos verificados:** `scratchpad/saasplugin-beauty-map.md` (mapa de reassentamento, 4 leitores sobre o monorepo), `scratchpad/vendus-as-is-map.md` (5 leitores sobre o código Vendus/Beauty), `scratchpad/monorepo-c6-report.md` (C6/billing/NFS-e), `scratchpad/notaas-report.md` (docs NotaAS).
> **Overlay aplicado:** este documento REASSENTA o as-is-to-be original (que partia do Vendus clonado). As referências `file:line` de migrations foram re-mapeadas de `supabase/migrations/` (repo Vendus) → `apps/NexvyBeauty/supabase/migrations_platform_crm|salao/`. LGPD e salon-automation deixam de ser gaps (já resolvidos no Beauty). O núcleo de cobrança (pagador/fatura/boleto/PIX/NFS-e/conciliação) permanece **100% greenfield e válido**.

---

## 0. Estratégia de HARD FORK GERENCIADO (travada — não reabrir)

O NexvyPayments é um **hard fork gerenciado do NexvyBeauty**. Beauty é a base-mãe própria da casa (não um upstream de terceiros). O Vendus original chegou como snapshot Lovable **sem histórico git comum** — portanto merge automático de versões futuras é impossível por construção. Consequência operacional:

- **Versões futuras do upstream Vendus (V6+) NÃO se mergeiam automaticamente.** Viram **fonte de PATCHES SELETIVOS** (diff dirigido, cherry-pick conceitual), nunca merge cego.
- **3 disciplinas obrigatórias** para manter a capacidade de absorver patches sem quebrar o produto:
  1. **Isolamento total das mods de cobrança.** Toda modificação de cobrança vive em **arquivos e migrations próprios e aditivos** (`migrations_cobranca/`, `supabase/functions/c6-billing/`, `supabase/functions/notaas-*/`, componentes `src/components/admin/cobranca*`, tools novas no registry). **NUNCA editar o core Vendus/Beauty** para adicionar cobrança.
  2. **Registro de todo delta no core.** Qualquer edição inevitável de um arquivo do core (ex.: `main.tsx` para branding host-aware, `adminMenu.ts` para o item de menu, `registry.ts` para registrar uma tool nova) é registrada em **`docs/CORE-DELTA.md`** com o motivo. Esse arquivo é o mapa de reconciliação em cada atualização futura.
  3. **Atualização futura = diff seletivo, não merge cego.** Ao chegar um V6+ do Vendus (ou um avanço no Beauty), roda-se diff dirigido: aplica só o que interessa, testando contra `CORE-DELTA.md` para não sobrescrever adaptações da casa.

> **[Certo]** Sem essas 3 disciplinas, a primeira atualização do upstream vira um merge-hell irreversível (snapshot sem ancestral comum) — o custo de manter a disciplina agora é ordens de magnitude menor que o custo de perdê-la depois.

---

## 1. Escopo travado (Decisões D1..D6 — REASSENTADAS)

> As decisões abaixo foram atualizadas conforme o §6 do mapa de reassentamento. A mudança central é **D1**: partir do Beauty embutido, não do Vendus clonado.

| # | Decisão (reassentada) | Origem |
|---|-----------------------|--------|
| **D1** | **Partir do NexvyBeauty** (`apps/NexvyBeauty/`, dentro do monorepo `SaasPlugin_vite`) — Vendus já embutido e mais avançado; a "escolha Beauty vs Vendus" era falsa dicotomia. Mods de cobrança 100% isoladas (hard fork gerenciado, §0) | Reassentamento (2026-07-06); antes: "partir do Vendus clonado" |
| **D2** | **Esteira de migrations do núcleo de cobrança = `migrations_cobranca/` (NOVA)**, espelhando o modelo `migrations_salao/` do Beauty (**multi-tenant, `organization_id` preservado**). NÃO usar `migrations_platform_crm/` (tenant-of-one, sem `organization_id` — `apps/NexvyBeauty/supabase/migrations_platform_crm/20260701_platform_crm_schema.sql:7,16`). Produto continua **horizontal multi-tenant**: tenant = qualquer negócio de mensalidade (NF + boleto + conversa). Case #1 (água/medição) e #2 (cowork) são instâncias | Reassentamento; produto horizontal mantido de AskUserQuestion (2026-07-06) |
| **D3** | **Motor de emissão próprio** com trilhos: **Cakto** (herdado do Beauty, já é o onboarding-ao-pagar do SaaS) + **C6 direto** (boleto/PIX, greenfield). Herda o **CRM multiproduto da plataforma** (`migrations_platform_crm/` + módulo `vendas`, `product_id`): o GRUPO vende o Payments pelo mesmo CRM central. Asaas NÃO é o motor | Reassentamento + AskUserQuestion (2026-07-06) |
| **D4** | **v1 completo (4 pilares)**: faturamento por unidade em lote + NFS-e vinculada + régua de cobrança automatizada (WhatsApp) + atendimento IA. Canal WhatsApp dual-provider **herdado 100% do Beauty** (Evolution + Meta Cloud, byte-idêntico). "Emitir a nota, emitir o boleto, disparar pelo whatsapp e dialogar com o cliente" | AskUserQuestion (2026-07-06) |
| **D5** | **NFS-e via NotaAS** (`https://docs.notaas.com.br` · base `https://platform.notaas.com.br/api/v1`) + **C6 para boleto/PIX**. Cakto = onboarding do SaaS (herda), NÃO trilho de fatura condominial. Volume de referência case #1: **500–5.000 faturas/mês** → outbox + idempotência = requisito de arquitetura | Reassentamento + AskUserQuestion (2026-07-06) |
| **D6** | **Régua herda o motor** `cadence-*` + `salon-automation-run` do Beauty (reconfig por vencimento, não código novo): trocar trigger de filtro-CRM → `due_date`/status de fatura; adicionar tools `consultar_fatura`/`emitir_2via`/`renegociar` ao `registry.ts` sem tocar o `orchestrator.ts` | Reassentamento |

### Premissas declaradas (Karpathy §8.1 — não travadas; corrigir se erradas)

| # | Premissa |
|---|----------|
| P1 | Canal de PRODUÇÃO da régua = **WhatsApp Meta Cloud oficial** (template utility + opt-in; `_shared/optin-guard.ts` herdado). Evolution/Baileys fica para dev e conversas iniciadas pelo pagador. Cobrança em canal não-oficial = risco de ban inaceitável. **VERIFICAR** onde o Beauty roteia Meta-vs-Evolution: o `_shared/whatsapp-router.ts` do Vendus **NÃO está no `_shared/` do Beauty** (presente no vendus-ref, ausente no Beauty) — confirmar o mecanismo de roteamento antes de assumir `whatsapp-router.ts:90-92`. |
| P2 | Mapeamento multi-tenant fiscal: **1 tenant (organization) ↔ 1 Projeto NotaAS (1 CNPJ emissor)**, criado programaticamente via Org Token no onboarding, com upload do certificado A1 do tenant. |
| P3 | Papel do Cakto no v1 = **onboarding/checkout do SaaS** (o que já faz no Beauty via `_shared/cakto-plan-provisioning.ts`). O trilho fatura→boleto/PIX registrado é **C6**. Cakto NÃO emite boleto registrado avulso de fatura condominial. |
| P4 | **Deploy = app do monorepo**: `make deploy-payments`, Traefik file-provider, domínio `nexvypayments.com.br` (app./gestao./apex), **Supabase novo**. Gate anti-phantom no `deploy-vps.sh`. Migração para VPS não é decisão futura — já É o padrão do monorepo. |
| P5 | Nome/marca **travados: NexvyPayments** (slug `nexvypayments`). Mercado/idioma: Brasil, pt-BR. Marca institucional (gestao.*) = tema Nexvy Lux (navy+dourado); cor-default do app a definir (trocar `#c54b60` do Beauty em `usePlatformBranding.ts`). |

---

## 2. TO-BE — o produto

**Uma frase:** o tenant cadastra seus pagadores e contratos recorrentes, o sistema gera as faturas do mês em lote, emite boleto/PIX (C6) e NFS-e (NotaAS), dispara a régua pelo WhatsApp e **conversa** com o pagador (2ª via, status, renegociação) via IA — tudo dentro do CRM/plataforma que o Beauty já entrega pronto.

**A tese anti-Asaas:** gateways emitem mas não conversam; CRMs conversam mas não emitem. Este produto fecha o ciclo emissão↔conversa num lugar só — e a camada de conversa (motor de cadências + agentes IA + omnichannel) **já vem pronta no Beauty** (herdada do Vendus, provada byte-a-byte).

### 2.1 Pilares — o que o Beauty já dá vs o que é greenfield

```
┌─────────────────────────────────────────────────────────────────┐
│  NEXVYBEAUTY (herdado): multi-tenant · omnichannel WhatsApp     │
│  dual-provider · motor de cadências · salon-automation-run     │
│  · agentes IA (intenção `financeiro` nativa) · pgmq · pg_cron  │
│  · LGPD-consents · CRM multiproduto da plataforma              │
└─────────────────────────────────────────────────────────────────┘
   ▲ PILAR A            ▲ PILAR B           ▲ PILAR C        ▲ PILAR D
   Cadastro &           Emissão             Régua            Atendimento
   Faturamento          (GREENFIELD)        conversacional   IA de cobrança
   ~70% herdado         C6: boleto/PIX      ~85% herdado     ~80% herdado
   pagadores, grupos    NotaAS: NFS-e       (cadence-* +     (orchestrator
   (condomínio→unid.),  Cakto: onboarding   salon-automation intent=financeiro
   contratos, lote      SaaS (herda)        reconfig p/      + tools novas no
   mensal, importação   [0% no ecossistema] due_date)        registry.ts)
```

> **[Certo] O pilar central (motor de dinheiro real, PILAR B) é 100% greenfield.** No Beauty todo "pagamento" sempre foi terceirizado a gateway de infoproduto que apenas *avisa* via webhook. `boleto_barcode`/`boleto_url` só aparecem como campo **lido** de webhook externo (`apps/NexvyBeauty/supabase/functions/doppus-webhook/index.ts:382`); grep por `linha_digitavel/cnab/remessa/nosso_numero/notaas/rps` no ecossistema = **zero**. **A0 = PoC mTLS C6 é o gate bloqueante** (sobe ao topo do roadmap).

### 2.2 Fluxo do usuário (tenant)

1. **Onboarding financeiro** (wizard): conecta conta C6 (client_id/secret + cert mTLS), cria Projeto NotaAS via API (CNPJ + upload A1 + senha), aprova templates Meta utility.
2. **Cadastro**: importa pagadores por CSV (CPF/CNPJ, contato WhatsApp, endereço p/ NFS-e) e organiza em grupos (ex.: condomínio → unidades); define contratos/serviços recorrentes (valor fixo ou variável por competência).
3. **Fechamento mensal**: gera o lote de faturas da competência (valores fixos ou planilha de leituras); revisa; aprova.
4. **Emissão**: outbox processa o lote — boleto/PIX no C6 + NFS-e no NotaAS (lote ≤100/chamada), com estados por fatura (rascunho → emitindo → emitida/erro → enviada → paga/vencida/cancelada) e retry idempotente.
5. **Régua**: fatura emitida → mensagem com boleto/PIX; D-3 lembrete; D0 vencimento; D+1/D+7/D+15 atraso — pausa automática quando o webhook C6 confirma pagamento.
6. **Conversa**: pagador responde no WhatsApp → agente IA resolve 2ª via, status, comprovante, renegociação simples (guard-rails: alçada de desconto, handoff humano).
7. **Gestão**: dashboard de inadimplência, controle de emissão de notas, conciliação por webhook, baixa manual quando preciso.

### 2.3 O que fica explicitamente FORA do v1 (subtração)

NF-e/NFC-e · conciliação CNAB/OFX de outros bancos · portal web do pagador · branding white-label de revenda por tenant (a infra 3-modos existe, mas revenda white-label não é v1) · split/repasse · negativação/protesto · app mobile · multi-moeda/idioma.

---

## 3. AS-IS verificado (reassentado para o Beauty)

### 3.1 NexvyBeauty (base do produto) — mapa completo em `saasplugin-beauty-map.md`

- **É o CRM de vendas/SDR multi-tenant com IA** (linhagem Bizon→Vendus→Beauty), embutido no monorepo. Beauty avançou 2 gaps que o as-is Vendus marcava como zero.
- **Multi-tenancy sólido herdado**: `organization_id` universal + RLS via `get_user_organization`/`has_role`/`is_super_admin`. Funções-gate assumidas como pré-existentes pelo Beauty (`apps/NexvyBeauty/supabase/migrations_platform_crm/20260701_platform_crm_schema.sql:603,639` — `has_role já existe`). ⚠️ Cobertura RLS das tabelas novas de cobrança será responsabilidade da esteira `migrations_cobranca/` (RLS por `organization_id` obrigatório).
- **Motores reaproveitáveis herdados** (o coração do negócio):
  - **Cadências** — `apps/NexvyBeauty/supabase/functions/cadence-tick/index.ts:1` (cron 5min, MAX_PER_TICK=50, delay/janela/condições), `cadence-enroll/index.ts:1`.
  - **Régua-lite por evento** (o análogo mais próximo de "fatura vencendo") — `apps/NexvyBeauty/supabase/functions/salon-automation-run/index.ts:1` (cron diário, dry-run, idempotência via unique index, TZ-safe). Molde direto de `fatura_vencida_D+1/D+3/D+7`.
  - **Recuperação por status de pagamento** — `apps/NexvyBeauty/supabase/functions/cakto-recovery-trigger/index.ts:1` (acoplado a payload Cakto).
  - **WhatsApp dual-provider** — `apps/NexvyBeauty/supabase/functions/evolution-send/index.ts:1`, `platform-meta-whatsapp-webhook/index.ts`, `_shared/meta-crypto.ts` (byte-idêntico). **VERIFICAR** roteamento Meta-vs-Evolution (P1).
  - **Agente IA + tools** — `_shared/orchestrator.ts:1` (Intent inclui `financeiro`; prompt `financeiro → boleto, reembolso, cobrança, nota fiscal`); `_shared/tools/registry.ts` (5 tools; `gerar_link_pagamento` é o esqueleto da futura `consultar_fatura`). **VERIFICAR:** `ai-router.ts` divergiu (Beauty ≠ vendus-ref) — validar `resolveAIConfig(org, capability)` antes de assumir o comportamento do as-is.
  - **Multi-tenant/super-admin/onboarding-ao-pagar** — `organization_id` universal (RLS); `useSuperAdmin.ts`; `create-organization-admin/index.ts`; `_shared/cakto-plan-provisioning.ts`; platform-shell módulo `erp`.
  - **CRM-da-plataforma multiproduto** — `migrations_platform_crm/` + módulo `vendas` (o grupo vende Payments pelo mesmo CRM via `product_id`).
- **✅ LGPD — JÁ RESOLVIDO no Beauty (deixa de ser gap G13)**: `apps/NexvyBeauty/supabase/migrations_salao/20260619_lgpd_consents.sql` cria a tabela `public.lgpd_consents` — **auditoria imutável** de consentimento (Lei 13.709/2018): identidade do titular, timestamp do servidor, IP, user-agent, versão/texto exato aceito, geolocalização por IP; gravada **somente server-side** (service_role), sem UPDATE/DELETE no app. Payments herda e estende o `scope` para `cobranca`/`pagador`.
- **✅ Automação — JÁ RESOLVIDA no Beauty (deixa de ser gap)**: `apps/NexvyBeauty/supabase/migrations_salao/20260626_salon_automation_foundation.sql` + `20260626_salon_automation_cron.sql` criam `public.salon_automation_rules` (com `organization_id NOT NULL`, `unique(organization_id, tipo)`, índice por org) e `salon_automation_log`. Mecanismo **dedicado, separado do `tag_automations` de pagamento** ("zero risco ao fluxo de dinheiro"). Regras **nascem DESLIGADAS** (`enabled=false`) — nada dispara sozinho até o owner ligar. Molde direto da régua de inadimplência.
- **Billing existente é do eixo errado**: plataforma→tenant (`subscriptions`/`billing_history` — bom molde de schema) e espelho passivo de infoproduto. **Cobrança tenant→cliente-final é 100% greenfield.**
- **Segurança — herdada do Vendus (Seção 5)**: os bloqueadores as-is (`admin-provision-users` sem auth; IDOR via `organization_id` no body; segredos "encrypted" em plaintext; JWT anon hardcoded em cron; baseline reintroduz escalonamento) **precisam ser reauditados no Beauty** — verificar se já foram corrigidos na linhagem mais madura antes de tratar como bloqueador ativo.
- **UI**: casca do módulo custa pouco (item em `adminMenu.ts` + `case` em `renderSection` + moldes prontos).

### 3.2 C6 Bank (ecossistema-monorepo) — detalhe em `monorepo-c6-report.md`

- Adapter Python completo e **smoke-testado 19/19 em sandbox** (nunca em produção): Bolepix v2 (boleto+PIX híbrido), boleto /v1 fallback, PIX cob/cobv, consulta/cancelamento idempotentes, webhook parser, OAuth2 mTLS (token TTL 5min).
- **Portabilidade → Deno: ~60% da lógica é pura** (montagem de payload + parser de webhook) → copiar; trocar `requests` por `fetch`; esforço núcleo ~2-3h + integração. **A0 = PoC mTLS gate** (o certificado/mTLS do banco não tem análogo no ecossistema — o mais perto é OAuth client_id/secret Cakto, muito mais simples). **VERIFICAR: A0 mTLS gate é pré-requisito bloqueante.**
- Modelo financeiro do ERP reutilizável como referência de schema: `financeiro.bancos`, `contas_bancarias`, `cobrancas`, `financeiro_pendencias`.
- GAP: webhook C6 sem assinatura documentada → validar por GET de confirmação.

### 3.3 NotaAS (D5) — detalhe em `notaas-report.md`

- **Multi-tenant nativo e 100% programático**: Org Token (`ntaas_org_`) → `POST /org/projects` (1 projeto = 1 CNPJ) → upload cert A1 (.pfx ≤50KB + senha) → `POST .../api-keys` (key `ntaas_` exibida 1×). Sem A1 → `422 CERT_MISSING`.
- **Emissão assíncrona** (`202 queued`, poll ou webhook), lote de até **100 itens**, **SEM chave de idempotência documentada** → outbox próprio com `referencia` única é obrigatório (retry de rede sem isso = nota duplicada real).
- **Webhooks prontos p/ conciliação fiscal**: `nfse.issued/error/cancelled/documents_ready/batch.completed`, HMAC-SHA256 (`X-Notaas-Signature`), `X-Notaas-Delivery` p/ dedup, 5 retries até 2h, timeout 10s; `documents_ready` pode disparar 2×.
- **Não documentado (gate G-NOTAAS)**: sandbox NFS-e, preço/créditos, prazo de cancelamento, substituição de nota, limite de projetos por plano, cobertura do(s) município(s) do case #1.

### 3.4 O que NÃO existe em lugar nenhum (verificado por grep no ecossistema Beauty)

Entidade pagador · fatura do tenant + itens · emissão de boleto própria · NFS-e no Beauty e no monorepo · régua por vencimento · conciliação/baixa · recorrência de cobrança do cliente-final · domínio condomínio/unidade/medição · cron versionado p/ `cadence-tick` · integração Asaas (só card `comingSoon`).

> **Deixaram de estar nesta lista** (vs. as-is Vendus original): **LGPD** (agora existe `lgpd_consents` no Beauty) e **automação por evento** (agora existe `salon_automation_*` no Beauty).

---

## 4. GAP ANALYSIS G1..G15 (reassentado)

> Legenda de estratégia: paths de destino da esteira nova = `apps/NexvyPayments/supabase/migrations_cobranca/` (multi-tenant, `organization_id`). Moldes de referência = arquivos do Beauty. G13 e o gap de automação foram RESOLVIDOS na base.

| # | Gap | AS-IS (Beauty) | TO-BE | Estratégia | Esforço |
|---|-----|----------------|-------|-----------|---------|
| G1 | Entidade Pagador | `leads` (prospect) e echo de gateway | cadastro de cliente-final (CPF/CNPJ, contatos, endereço fiscal) | tabela nova `payers` em `migrations_cobranca/` + vínculo opcional `lead_id`/conversa p/ herdar omnichannel | M |
| G2 | Grupos e contratos recorrentes | — | condomínio→unidades; contrato com valor fixo/variável por competência | `billing_groups` + `contracts` + itens com `metadata jsonb` (unidade, leitura) — genérico, sem vertical hardcoded | M |
| G3 | Fatura + itens + estados | `billing_history` (molde, eixo plataforma) | fatura com competência, vencimento, ciclo de estados, numeração | tabelas novas `invoices`/`invoice_items`; máquina de estados única p/ boleto+nota | M |
| G4 | Boleto/PIX | adapter C6 Python sandbox (monorepo) | emissão registrada por tenant no Payments | portar p/ `supabase/functions/c6-billing/` (Deno; ~60% cópia), credencial mTLS por tenant em cofre cifrado, webhook liquidação. **A0 mTLS = gate** | M |
| G5 | NFS-e | inexistente no ecossistema | emissão vinculada à fatura com controle | cliente NotaAS Deno + onboarding Projeto/A1 por tenant + webhooks HMAC | M |
| G6 | Outbox de emissão idempotente | pgmq só p/ e-mail | lote 500–5.000/mês re-rodável sem duplicar | fila pgmq própria + `referencia` única por fatura×competência×trilho + DLQ | M |
| G7 | Régua por due_date | `cadence-*` dispara por filtro CRM; `salon-automation-run` por evento | régua D-3/D0/D+1/D+7 com stop-por-pagamento | **reconfig, não código novo**: novo tipo de trigger no motor `cadence-*` + reaproveitar `salon-automation-run` (molde `pacote_vencendo`→`fatura_vencida`) | S/M |
| G8 | Tools IA de cobrança | 5 tools de vendas; intenção `financeiro` já nativa no `orchestrator.ts` | `consultar_fatura`, `segunda_via`, `enviar_comprovante`, `renegociar` (alçada + handoff) | adicionar ao `_shared/tools/registry.ts` (padrão existente) SEM tocar `orchestrator.ts`; registrar em `docs/CORE-DELTA.md` | S/M |
| G9 | Conciliação/baixa | — | webhook C6 (pago) + NotaAS (emitida/cancelada) + baixa manual + painel inadimplência | handlers de webhook + `financeiro_pendencias` (ERP) como referência de modelo | M |
| G10 | UI módulo Cobranças | moldes prontos (`LeadsManager`/`FinancialDashboard`/`CaktoAdminPanel`/`CadenceWizard`) | seção "Cobranças" no admin | item novo em `adminMenu.ts` + `case` em `renderSection` + moldes; delta no core registrado em `CORE-DELTA.md` | S/M |
| G11 | Onboarding financeiro do tenant | wizard Cakto/Evolution herdados como padrão | conectar C6 + criar Projeto NotaAS + subir A1 + aprovar templates Meta | wizard novo isolado em `src/components/admin/cobranca/` | M |
| G12 | Segurança p/ produção com dinheiro | herdada do Vendus (reauditar no Beauty) | fluxo de dinheiro sem takeover/IDOR; credenciais cifradas | reauditar `admin-provision-users`/IDOR no Beauty; se persistirem, corrigir; cofre padrão `meta-crypto` p/ C6/NotaAS/A1 | M (bloqueador condicional) |
| G13 | ~~LGPD mínimo de cobrança~~ **RESOLVIDO na base** | ✅ `lgpd_consents` já existe (`migrations_salao/20260619_lgpd_consents.sql`) | estender `scope='cobranca'`/`'pagador'`; retenção + erasure de pagador | herdar tabela imutável do Beauty; adicionar só retenção/erasure específicos de cobrança | S (era M) |
| G14 | Cron versionado | 10 crons no baseline do cascade; `cadence-tick` fora | todos os jobs do produto em migrations | migration `cron.schedule` p/ `cadence-tick` + outbox + watchdogs em `migrations_cobranca/` | S |
| G15 | Templates Meta utility de cobrança | `optin-guard` + sync de templates herdados | templates aprovados (fatura, lembrete, atraso, 2ª via) | criar/submeter templates; gate externo de aprovação Meta (G-META) | S (lead-time externo) |

---

## 5. Riscos R1..R11 (com mitigação)

| # | Risco | Mitigação |
|---|-------|-----------|
| R1 | **Segurança herdada do Vendus** (`admin-provision-users` sem auth, IDOR service_role, segredos plaintext, JWT anon em cron) pode ter vindo no fork Beauty | **Reauditar no Beauty ANTES de dinheiro em produção**: verificar quais desses já foram corrigidos na linhagem madura; corrigir os remanescentes no fluxo financeiro; cofre cifrado (`meta-crypto`); rotacionar o que vazou |
| R2 | Cobrança via WhatsApp não-oficial (Evolution/Baileys) → ban do número | P1: Meta Cloud oficial com template utility + opt-in em produção; Evolution só dev/atendimento inbound |
| R3 | NotaAS sem idempotência, sem sandbox documentado, preço/cancelamento/substituição não documentados | Outbox próprio com `referencia` única (G6); gate G-NOTAAS: 6 perguntas ao dono da conta antes da Fase de emissão |
| R4 | Custódia de certificado A1 do tenant (upload .pfx + senha) = responsabilidade de segurança séria; lead-time do tenant | Cofre cifrado com acesso só server-side; A1 como item de onboarding com checklist; NUNCA repetir padrão de plaintext (CLAUDE.md §11.1) |
| R5 | C6 nunca rodou em produção; webhook sem assinatura; conta PJ + credenciais por tenant têm lead-time bancário | **A0 = PoC mTLS** em sandbox→prod (gate no topo do roadmap); validação de webhook por GET; onboarding bancário como gate externo (G-C6) |
| R6 | Cakto como trilho de fatura recorrente é uso fora do desenho | P3: Cakto restrito a onboarding/checkout do SaaS no v1; trilho registrado = C6 |
| R7 | LGPD alto risco (CPF/CNPJ + dívida + conversa) | **Mitigado na base**: `lgpd_consents` imutável já existe no Beauty (G13); resta estender escopo + retenção/erasure de pagador |
| R8 | Colisão de ecossistema: ERP-Educacional (FIC) também precisará de NFS-e; C6 fica com manutenção dupla Python/Deno | Construir cliente NotaAS e c6-billing como módulos isoláveis (**disciplina §0.1**: arquivos próprios aditivos) p/ reuso futuro |
| R9 | Aprovação de templates Meta tem lead-time e pode reprovar | Submeter na Fase 1 (não na véspera); fallback: conversa iniciada pelo pagador (janela de serviço) |
| R10 | **Deriva do hard fork**: atualização futura do Vendus/Beauty pode sobrescrever mods de cobrança | **Disciplina §0**: isolamento em `migrations_cobranca/` + arquivos próprios; `docs/CORE-DELTA.md` como mapa de reconciliação; diff seletivo, nunca merge cego |
| R11 | Escopo v1 grande (D4 all-in: 4 pilares) — mas 3 deles (~85%/~80%/100%) já vêm do Beauty | Fases com marcos de valor nomeáveis e critérios binários; foco de esforço no PILAR B (greenfield); case #1 como piloto guiado |

---

## 6. NFRs e premissas técnicas

1. **Idempotência ponta a ponta** (D5 + R3): `referencia` única fatura×competência×trilho; re-rodar o lote do mês NUNCA duplica boleto/nota; retry com backoff + DLQ na fila.
2. **RLS por `organization_id` em TODAS as tabelas novas** de `migrations_cobranca/` (padrão canônico do Beauty; segue o modelo `migrations_salao/`, NÃO `migrations_platform_crm/`).
3. **Segredos**: credenciais C6 (client/secret/cert mTLS), keys NotaAS (`ntaas_org_`/`ntaas_`), A1 (.pfx+senha) — cifradas com envelope (molde `meta-crypto`), acesso só server-side, NUNCA `VITE_*`, NUNCA plaintext (CLAUDE.md §11.1). Secrets provisionados na Fase D do cascade (`AI_API_KEY`, `RESEND_API_KEY` + credenciais de cobrança).
4. **Imutabilidade fiscal**: nota emitida nunca é deletada; cancelamento é operação formal com trilha; numeração por Projeto NotaAS.
5. **Volume**: lote NotaAS ≤100 itens/chamada → 5.000 notas = 50 chamadas; rate C6 respeitado pela fila; emissão tolerante a indisponibilidade municipal (assíncrona).
6. **Timezone** America/Sao_Paulo em vencimentos e régua (janela já existe no `cadence-tick`: `withinWindow`; e no `salon-automation-run`, TZ-safe).
7. **Webhooks**: NotaAS validado por HMAC + dedup `X-Notaas-Delivery`; C6 por GET de confirmação.
8. **Base legal LGPD**: execução de contrato (cobrança) + legítimo interesse (recuperação); opt-in Meta para template; retenção por tabela. **Prova de consentimento herdada** de `lgpd_consents`.
9. **Isolamento de fork (§0)**: mods de cobrança em arquivos/migrations próprios e aditivos; `docs/CORE-DELTA.md` registra todo delta no core; atualização futura = diff seletivo.

---

## 7. Unit economics preliminar (faixas + premissas; câmbio premissa R$5,40/US$)

| Componente | Custo por fatura | Premissa |
|---|---|---|
| Boleto C6 liquidado (Bolepix) | R$0,80–2,50 | tarifa BaaS a negociar — **VERIFICAR contrato C6** |
| PIX C6 | R$0,00–0,60 | faixa de mercado |
| NFS-e NotaAS | R$0,20–0,60 | **preço não documentado** (créditos) — VERIFICAR com dono da conta |
| WhatsApp Meta utility (3–6 msgs de régua) | R$0,13–0,26 | ~US$0,008/msg BR; atendimento na janela de serviço não paga template |
| IA (atendimento, gemini-flash via gateway) | R$0,01–0,10/conversa | só faturas que geram conversa |
| **Total variável/fatura cobrada** | **≈ R$1,00–3,50** | dominado pela tarifa do boleto; PIX derruba p/ <R$1 |

- **Benchmark**: Asaas ≈ R$1,99–3,49 por boleto liquidado (VERIFICAR vigente) **sem** CRM, sem régua conversacional, sem IA.
- **Implicação de pricing** (a cravar na Etapa 2): assinatura por tenant (faixa R$197–597/mês; **preço = fonte única no DB** `public_plans`, memória 07-05) + variável por fatura (R$0,99–1,99) → margem bruta positiva no cenário conservador com 500–5.000 faturas/mês/tenant. "Ilimitado" é impossível (custo variável real por fatura).
- **Custo fixo por tenant ≈ 0 marginal**: infra do monorepo compartilhada (VPS + Supabase novo), sem custo de plano Lovable Cloud (deixa de ser premissa — não é mais repo standalone).

---

## 8. Parecer de PMF (Framework "Quem Puxa Quem?" — skill `product-market-fit`)

> Mantido válido do artefato original. O reassentamento não muda o julgamento de mercado (mesma tese, mesmo case #1); só reforça a **vantagem injusta** (a plataforma inteira já está construída no Beauty, não só o motor de conversa).

### TL;DR
**Veredito: pré-PMF, Rota A (desespero declarado), arquétipo Enterprise/B2B** — hipótese de valor escrita e non-consensus clara (emissão↔conversa no mesmo produto), com design partner identificado mas **teste de desespero ainda não rodado**. Os 3 movimentos: (1) transformar o case #1 em **piloto pago/compromisso financeiro antes do build terminar**; (2) validar a tese com 3–5 entrevistas no mesmo perfil; (3) instrumentar desde o v1 as métricas que provam o fit.

### Rota e justificativa
**Rota A.** O job já existe e dói de forma consciente: "todo mês, emitir NF + boleto de cada cliente/unidade e receber sem perseguir pagador manualmente". O case #1 já PAGA por metade da solução (Asaas emite) e carrega a outra metade nas costas (perseguição manual no WhatsApp). Não é Rota B (desespero já declarado) nem Rota C (contas a receber é job antigo).

### Auditoria — 12 perguntas

| # | Pergunta | Check | Evidência / lacuna |
|---|----------|-------|---------------------|
| 1 | Job em 1 frase sem citar o produto | ✅ | "emitir NF+boleto e receber de N clientes recorrentes sem trabalho manual" |
| 2 | Mercado bom + inflexão | 🟡 | Inflexão real: PIX ubíquo + WhatsApp universal + IA barata. TAM não quantificado → Etapa 2 |
| 3 | Hipótese de valor escrita (what/who/how) | ✅ | Este doc §2; persona: gestor financeiro de operadora de serviços recorrentes B2B2C |
| 4 | Rota única declarada | ✅ | Rota A |
| 5 | Desesperados HOJE identificáveis | 🟡 | Case #1 real e alcançável; N=1 → ampliar p/ 3–5 |
| 6 | Oferta non-consensus | ✅ | Cobrança conversacional integrada à emissão; **plataforma inteira já comprada/construída (Beauty)** — vantagem injusta reforçada |
| 7 | Teste de desespero rodado | ❌ | NÃO rodado → gate: compromisso pago do case #1 (contrato/PIX de piloto antes do go-live) |
| 8 | Quem puxa quem | 🟡 | Cedo; demanda inbound interna — insuficiente como prova |
| 9 | O que subtrair | ✅ | §2.3 |
| 10 | Painel de métricas no verde | ❌ | Sem dados (pré-lançamento) → instrumentação abaixo |
| 11 | Nível da escada + alavanca | ✅ | Pré-Nascent → destrava: 1º tenant PAGANTE (case #1) + 2º de OUTRA vertical (cowork) provando horizontalidade (D2) |
| 12 | Power que blinda o fit | 🟡 | Counter-positioning: Asaas não vira CRM conversacional sem canibalizar simplicidade; switching cost: histórico+cadastro+réguas. A provar |

### Painel (Enterprise/B2B — alvos para quando houver dados)
Sales yield >1 · trial 30d → "grito" · NRR ≥100% · payback <18m · inbound espontâneo. **Métricas proibidas como prova**: nº de faturas emitidas (vaidade), signups de trial.

### Antipadrões detectados
1. **#1 Empilhar features (risco, não ocorrência)**: D4 trava v1 com 4 pilares (R11). Defesa: os 4 pilares SÃO o job mínimo completo; qualquer feature além disso antes do piloto pago é violação.
2. **#9 Projetar o próprio gosto (mitigado)**: produto nasce de cliente real com volume real.

### Veredito e plano (checks binários)
**(c) pré-PMF em construção deliberada, Rota A.** Plano:
1. ☐ Compromisso financeiro do case #1 (contrato de piloto pago OU carta de intenção com valor) — **antes** do go-live. Check: documento assinado. **[gate G-PILOTO]**
2. ☐ 3–5 entrevistas JTBD com operadoras de serviço recorrente (500–5.000 cobranças/mês, hoje em Asaas/planilha). Check: 3 gravadas/anotadas.
3. ☐ Piloto: 1 ciclo mensal completo do case #1 (lote→emissão→régua→conversa→conciliação). Check: ≥95% das faturas emitidas sem intervenção manual e régua rodou sozinha.
4. ☐ Teste do grito: fim do piloto, propor voltar ao processo antigo. Check: recusa + assinatura do contrato definitivo.
5. ☐ 2º tenant de vertical diferente (cowork) onboarded sem código novo. Check: onboarding sem migration específica da vertical.

### Instrumentação desde o v1
% faturas pagas sem intervenção humana · % conversas resolvidas pela IA sem handoff · dias-médios-para-pagar antes/depois da régua · retenção mensal de tenant (churn) · NRR · custo variável real por fatura (medido).

---

## 9. Os 3 CRMs que NUNCA se fundem (arquitetura do ecossistema)

> Regra herdada e reforçada: cada CRM atende um público distinto e não se mistura com os outros. Confundi-los é o erro que a separação de esteiras de migrations do Beauty já previne.

| # | CRM | Quem usa | Com quem fala | Onde vive (schema) |
|---|-----|----------|---------------|--------------------|
| **(a)** | **CRM NexvyTech central** | O GRUPO Nexvy | Fala com os **tenants** (canal do grupo p/ vender os SaaS — inclusive o Payments — via `product_id`) | `migrations_platform_crm/` (tenant-of-one, **sem** `organization_id`) + módulo `vendas` |
| **(b)** | **CRM embutido do NexvyPayments** | O tenant (ex.: empresa de água) | Fala com os **PAGADORES** dele (2ª via, status, renegociação) | Núcleo de cobrança em `migrations_cobranca/` (**multi-tenant**, `organization_id`), sobre o CRM herdado do fork Vendus |
| **(c)** | **CRM embutido do NexvyBeauty** | O tenant (salão) | Fala com os **clientes** do salão | `migrations_salao/` (multi-tenant, `organization_id`) — mesma linhagem, já resolvido |

- **(a) é tenant-of-one** (o grupo é o único "dono"): não tem `organization_id` porque não precisa isolar múltiplos tenants — é o backoffice do grupo. **NÃO usar como molde do núcleo de cobrança.**
- **(b) e (c) são multi-tenant**: cada tenant é isolado por `organization_id`. **O núcleo de cobrança do Payments segue este modelo** (`migrations_salao/` como espelho de estrutura).
- O CRM embutido do Payments **JÁ VEM do fork Vendus** — não é construído do zero; herda leads/conversas/omnichannel/IA e é re-apontado para o domínio de pagadores.

---

## 10. Insumos prontos para a Etapa 2 (Blueprint + Roadmap)

- **Problema**: operadoras de serviços recorrentes emitem em um sistema (gateway/fiscal) e cobram em outro (WhatsApp manual) — retrabalho, inadimplência e atendimento repetitivo.
- **Solução**: módulo de cobranças dentro do app NexvyPayments (fork do Beauty) — faturamento em lote + emissão C6/NotaAS + régua e atendimento conversacionais nativos herdados.
- **Vantagem injusta**: plataforma inteira já construída no Beauty (multi-tenant + WhatsApp + cadências + IA + LGPD + CRM multiproduto); C6 adapter pronto (~60% portável); NotaAS já operado pela casa; case #1 com volume real esperando.
- **Decisões que o cofundador (Etapa 2) deve CRAVAR, com conta na mesa**:
  1. Modelo de precificação (assinatura+variável; faixas do §7; **preço = fonte única no DB** `public_plans`).
  2. Arquitetura do cofre de credenciais (envelope `meta-crypto` estendido vs Supabase Vault) p/ C6+NotaAS+A1.
  3. Papel exato do Cakto no v1 (P3) — manter como onboarding do SaaS.
  4. Modelagem `contracts`/`invoice_items` genérica vs campos de vertical (água) — recomendação: genérico + `metadata`.
  5. Estratégia de outbox (pgmq vs tabela+cron) e contrato da máquina de estados da fatura.
  6. Sequência de fases do roadmap: **A0 = PoC mTLS C6 (gate) primeiro**, depois entidade Fatura+Pagador, depois emissão, depois régua-por-vencimento (reconfig).
  7. Reauditoria de segurança do fork Beauty (quais bloqueadores as-is já foram corrigidos na linhagem madura — G12/R1).
- **Gates externos nomeados**: **A0 (PoC mTLS C6)**, G-NOTAAS (6 perguntas ao dono da conta), G-C6 (credenciais sandbox/prod do case #1), G-A1 (certificado do case #1), G-META (aprovação de templates), G-PILOTO (compromisso pago).
- **Receita de adição ao monorepo** (do mapa §4): criar `apps/NexvyPayments/` (`cp -r apps/NexvyBeauty` + limpeza), `.env.production` versionado, `infra/traefik/NexvyPayments.yml.template`; editar `docker-compose.yml` + `Makefile` (`deploy-payments`); rodar `cascade-core.sh` só p/ Fases A+B (schema+edges) mantendo `src/` do Beauty. Deploy: `make deploy-payments`.
