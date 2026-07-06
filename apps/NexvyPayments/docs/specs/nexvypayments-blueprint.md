# BLUEPRINT — NexvyPayments (app embutido no ecossistema NexvyTech)

> Etapa 2 da esteira de produto · reassentado 2026-07-06 · slug `nexvypayments` (era `gestao-cobrancas`)
> **Base:** forka do **NexvyBeauty embutido** (`apps/NexvyBeauty/`), não do Vendus clonado. Beauty *É* Vendus (provado byte-a-byte em `.vendus-src-reference/`), só que mais maduro e já no monorepo `SaasPlugin_vite`.
> Insumo travado: `nexvypayments-as-is-to-be.md` (D1..D6, P1..P5, G1..G15, R1..R11) — reassentado em paralelo.
> Fontes de verdade do código: mapa de reassentamento `scratchpad/saasplugin-beauty-map.md` (file:line do Beauty), `scratchpad/vendus-artefatos/monorepo-c6-report.md` (C6/ERP), `scratchpad/vendus-artefatos/notaas-report.md` (API fiscal).
> Consumidores: planner adversarial da Etapa 3, o loop de implementação do NexvyPayments e Marcelo. **Modo Consolidação** — decisões travadas não reabrem; onde discordo, registro na §11 e executo mesmo assim.
> Câmbio-premissa em todo o documento: **R$5,40 = US$1,00**.

---

## 0. Isolamento (hard fork gerenciado) — regra-mãe da arquitetura

> **[Certo] O módulo de cobrança nasce 100% ISOLADO do core Vendus/Beauty.** Beauty é a base-mãe própria; futuros snapshots do upstream Vendus (V6+) viram fonte de **patches seletivos** (diff, não merge cego — o snapshot Lovable não tem histórico comum). Três disciplinas são obrigatórias e atravessam todo este blueprint:

1. **Mods de cobrança em arquivos/migrations PRÓPRIOS e ADITIVOS.** Nunca editar o core. Concretamente:
   - **Edge functions:** todas as funções de dinheiro (`c6-billing`, `c6-webhook`, `notaas-emit`, `notaas-webhook`, `invoice-batch-generate`, `billing-dispatch-worker`, `cobranca-onboarding`) são **arquivos novos** em `supabase/functions/`. O `_shared/` do core é **consumido, não modificado** (importa `meta-crypto.ts`, `ai-router.ts`, `orchestrator.ts` sem tocá-los).
   - **Schema:** núcleo de cobrança vive na esteira NOVA `migrations_cobranca/` (§3), que **espelha** `migrations_salao/` (multi-tenant, `organization_id`). Nenhuma tabela do core recebe coluna de cobrança.
   - **Tools IA:** as 4 tools novas entram por **1 import + 1 linha** no array `ALL_TOOLS` (`apps/NexvyBeauty/supabase/functions/_shared/tools/registry.ts:11`) — sem tocar `orchestrator.ts`.
2. **Todo "delta no core" registrado em `docs/CORE-DELTA.md`.** Quando uma edição de arquivo do core for inevitável (ex.: `src/main.tsx` para branding host-aware, `src/config/brand.ts` para a marca, `adminMenu.ts`/`modules.ts` para a seção Cobranças), a linha exata vai para o registro de deltas — para que o próximo diff seletivo do upstream saiba onde vai colidir.
3. **Atualização futura do upstream = diff seletivo, nunca merge automático.** O core não se re-mergeia do Vendus; entra por cherry-pick consciente contra o registro de deltas.

**Consequência prática:** o núcleo de dinheiro (pagador/fatura/boleto/PIX/NFS-e/conciliação) é greenfield e vive em ilhas próprias — se um patch do Vendus reescrever o CRM inteiro, o módulo de cobrança sobrevive porque nunca dependeu de detalhes internos do core, só de contratos (`_shared/*`, RLS por `organization_id`, `cadence-*`).

---

## 1. Visão (lente do dono)

Operadoras de serviço recorrente B2B2C (medição de água, cowork, mensalidades, condomínios) hoje **emitem em um sistema e cobram em outro**: gera boleto/nota no Asaas/gateway, depois persegue o inadimplente à mão no WhatsApp. Duas ferramentas, dois logins, retrabalho todo mês, inadimplência que só cai com esforço humano.

**O produto fecha o ciclo emissão↔conversa num lugar só.** O tenant cadastra pagadores e contratos recorrentes; o sistema gera as faturas do mês em lote, emite boleto/PIX (C6) e NFS-e (NotaAS), dispara a régua pelo WhatsApp oficial e **conversa** com o pagador via IA (2ª via, status, comprovante, renegociação) — tudo dentro do CRM embutido (que já vem do fork Vendus/Beauty e faz o relacionamento).

**A vantagem injusta:** o motor de conversa (cadências + agentes IA + omnichannel dual-provider) **já está pronto e provado no Beauty**, não comprado à parte. O adapter C6 já existe (60% portável do ERP-Educacional). O NotaAS já é operado pela casa (org Nexvy Tech em plano SaaS Pro). Não estamos construindo um gateway — estamos plugando emissão real num CRM conversacional que já existe no monorepo. Gateway não conversa; CRM não emite. Este produto faz os dois.

**North Star:** % de faturas do ciclo que fecham (emitidas + cobradas + pagas) **sem intervenção humana**. Tudo o mais é meio.

**MVP (a feature que, removida, mata o propósito):** o ciclo mensal fechado do case #1 — lote → boleto+nota → régua WhatsApp → conversa IA → conciliação. Remover qualquer um dos 4 pilares degrada o produto a "mais um gateway" ou "mais um CRM". Os 4 pilares SÃO o job mínimo (D4).

### 1.1 Os 3 CRMs que nunca se fundem
- **(a) CRM NexvyTech central** (`gestao.*`, tenant-of-one, `migrations_platform_crm/`): canal do GRUPO para vender os SaaS aos tenants. Vende o NexvyPayments via `product_id`. **Não** é embutido no app do tenant.
- **(b) CRM embutido do NexvyPayments** (herdado do fork Vendus/Beauty): o tenant (ex.: empresa de água) fala com os **pagadores** dele. Multi-tenant, `organization_id`.
- **(c) CRM embutido do Beauty** (o salão fala com clientes): idêntica linhagem, produto irmão.
Máxima cravada (`platform-shell/registry.tsx:33-38`): **CRM ≠ ERP, nunca duplicar.**

---

## 2. Arquitetura completa

### 2.1 Camadas e princípio de isolamento

```
┌──────────────────────────────────────────────────────────────────────┐
│ FRONTEND (Vite5+React18+SWC+shadcn) — só JWT Supabase, ZERO credencial │
│  1 SPA em 3 classes de host (app./gestao./apex) decididas em runtime   │
│  Módulo "Cobranças" no /admin: Pagadores · Contratos · Faturas ·       │
│  Régua · Notas · Conciliação · Onboarding financeiro (wizard)          │
└──────────────────────────────────────────────────────────────────────┘
             │ JWT (RLS por organization_id)      │ JWT → Edge proxy
             ▼                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│ EDGE FUNCTIONS (Deno) — service_role server-side, cofre cifrado        │
│  ARQUIVOS NOVOS, aditivos ao core (§0):                                │
│  c6-billing · c6-webhook · notaas-emit · notaas-webhook ·              │
│  invoice-batch-generate · billing-dispatch-worker · cobranca-onboarding│
│  + 4 tools IA novas no registry existente (1 import + 1 linha)         │
└──────────────────────────────────────────────────────────────────────┘
             │                                     │
             ▼                                     ▼
┌────────────────────────┐          ┌──────────────────────────────────┐
│ POSTGRES (Supabase)    │          │ SERVIÇOS EXTERNOS                 │
│  migrations_cobranca/  │          │  C6 Bank (mTLS OAuth2)            │
│  payers · contracts ·  │  dispatch│  NotaAS (x-api-key por projeto)  │
│  invoices ·            │  worker  │  Meta WhatsApp Cloud (template)  │
│  invoice_items ·       │◄────────►│  Cakto (checkout/cartão — P3)    │
│  billing_events ·      │  pg_cron │  Lovable AI Gateway (gemini)     │
│  billing_credentials   │          │                                   │
│  (cifrado v1:)         │          │                                   │
└────────────────────────┘          └──────────────────────────────────┘
```

**Princípio de isolamento (anti-Frankenstein + hard fork §0):** os dois adapters de dinheiro (`c6-billing`, `notaas-emit`) são **módulos com contrato claro** (§2.3), sem acoplar ao CRM — porque o ERP-Educacional (FIC) vai precisar de NFS-e Cassilândia-MS e o C6 fica com manutenção dupla Python/Deno (R8). Contrato de interface publicado permite reuso futuro sem copiar-colar. **A ilha de cobrança consome o `_shared/` do core, mas nunca o edita.**

### 2.2 Edge functions novas — nomes, rotas, payloads

Todas seguem o padrão do repo Beauty: `Deno.serve`, CORS, `createServiceClient()`, authz por caller (corrigindo D-3, ver §6). Rotas são `POST {SUPABASE_URL}/functions/v1/<nome>`. **Todas são arquivos novos (§0).**

| Função | Gatilho | Payload resumido | Faz |
|---|---|---|---|
| `cobranca-onboarding` | Frontend (JWT admin) | `{action:'connect_c6'\|'create_notaas_project'\|'upload_a1'\|'submit_meta_templates', ...creds}` | Conecta C6 (client_id/secret + cert mTLS), cria Projeto NotaAS (`POST /org/projects`) + upload A1 (`POST /org/projects/{id}/certificate`, .pfx≤50KB+senha), submete templates Meta. Cifra tudo via `encryptSecret` (`_shared/meta-crypto.ts:25`) antes de gravar. |
| `invoice-batch-generate` | Frontend (JWT admin) OU cron mensal | `{organization_id, competencia:'2026-07', contract_ids?, readings?:[{contract_id, valor}]}` | Materializa `invoices` + `invoice_items` da competência (valor fixo ou por leitura). Idempotente por `(organization_id, contract_id, competencia)`. Estado inicial `rascunho`. |
| `billing-dispatch-worker` | pg_cron (30s) | — (lê `billing_events` pendentes + `billing_credentials`) | Consome a fila de intenção de emissão: para cada fatura aprovada, chama C6 (boleto/PIX) e NotaAS (NFS-e lote ≤100). Escreve `referencia` única ANTES do POST. Retry backoff + status. Ver §7 (o Beauty NÃO tem pgmq — a fila é tabela+claim, não `pgmq.read`). |
| `c6-billing` | `billing-dispatch-worker` (interno) | `{invoice_id, tipo:'bolepix'\|'pix', ...}` | Porta de `c6.py` (Deno). Emite boleto+PIX híbrido; devolve linha digitável, QR, `nosso_numero`. Cancela/consulta idempotente. |
| `c6-webhook` | C6 (inbound) | payload C6 (string JSON duplo-escape) | Recebe liquidação; valida por GET de confirmação (sem assinatura documentada — R5); dá baixa na fatura; emite `billing_events(pago)`. |
| `notaas-emit` | `billing-dispatch-worker` (interno) | `{invoice_ids[], referencia por item}` | Monta payload NFS-e; `POST /api/v1/emitir/batch` (≤100); grava `notaas_invoice_id`+`referencia`. |
| `notaas-webhook` | NotaAS (inbound) | envelope `{event, deliveryId, data}` | Valida HMAC-SHA256 (`X-Notaas-Signature`, timing-safe) + dedup `X-Notaas-Delivery`; atualiza estado fiscal da fatura (`nfse.issued/error/cancelled/documents_ready`). |
| `billing-cadence-enroll` | `c6-webhook`/`billing-dispatch-worker` por evento | `{invoice_id, event:'emitida'\|'vencendo'\|'vencida'\|'paga'}` | Adapter fino: traduz evento de fatura → `cadence-enroll`/`cadence-stop` existentes (ver §2.4 e decisão 7). |

**Tools IA novas** (adição ao `apps/NexvyBeauty/supabase/functions/_shared/tools/registry.ts:11`, padrão trivial): `consultar_fatura`, `segunda_via`, `enviar_comprovante`, `renegociar` (com alçada de desconto + handoff). Registro = 1 import + 1 linha no array `ALL_TOOLS`. O `gerarLinkPagamentoTool` (`registry.ts:6`) é o **esqueleto** da futura `consultar_fatura` — mas NÃO é emissor (só anexa lead a checkout Cakto, ver §4).

### 2.3 Contrato de interface dos adapters (para reuso ERP/FIC — R8)

```
// c6-billing (módulo isolável)
emitirCobranca(cred: C6Credential, req: {valor, vencimento, pagador, referencia}) → {nossoNumero, linhaDigitavel, pixCopiaCola, qrBase64, status}
consultarCobranca(cred, nossoNumero) → {status, pdfBase64, pagoEm?}
cancelarCobranca(cred, nossoNumero) → {status}
parseWebhook(rawBody) → {evento, nossoNumero, valorPago, pagoEm}   // puro, 100% reuso c6.py:917-1069

// notaas-emit (módulo isolável)
emitirLote(projectKey, items: Array<{tomador, servico, valores, referencia}>) → {batchId, status}
consultarStatus(projectKey, invoiceId) → {status, chNFSe, numeroNfe, pdfUrl, xmlUrl}
cancelar(projectKey, invoiceId, motivo?) → {status}
```

### 2.4 Trigger da régua sobre o motor cadence-* / salon-automation (ver decisão 7)

O motor de régua **já existe no Beauty** em duas formas, ambas herdadas intactas:
- **`cadence-*`** (`apps/NexvyBeauty/supabase/functions/cadence-tick`, `cadence-enroll`, `cadence-on-response`, `cadence-stop`): dispara por `cadence_step_runs` vencidos + filtros de CRM, MAX_PER_TICK=50, `withinWindow`, **nunca** por `due_date`.
- **`salon-automation-run`** (`apps/NexvyBeauty/supabase/functions/salon-automation-run/index.ts`): cron diário, **`dry_run=true` por padrão** (`:76-79`, só detecta sem enviar quando não-cron), idempotência via **unique index em `salon_automation_log`** (`:60-62`, não pgmq), TZ `America/Sao_Paulo` (`:25`), evento `pacote_vencendo` (`:22`) — que é o **análogo mais próximo de "fatura vencendo"**.

Não se reescreve o motor: adiciona-se um **trigger por evento de fatura**. `billing-cadence-enroll` traduz `billing_events(emitida|vencendo|vencida|paga)` em `POST cadence-enroll {cadence_id, lead_ids:[payer.lead_id]}`. O stop-por-pagamento reusa o padrão de `cadence-on-response`/`cadence-stop` (que hoje para a cadência quando o lead responde): `billing_events(paga)` chama a mesma mecânica de stop para encerrar o enrollment da fatura paga. O molde da **1ª mensagem conversacional** vem de `cakto-recovery-trigger/index.ts` (`STATUS_TO_EVENT:46`, cria conversa + envia 1ª msg IA `:2`).

---

## 3. Modelo de dados (DDL-nível com RLS) — esteira `migrations_cobranca/`

> **Esteira NOVA e isolada (§0/D2):** `apps/NexvyPayments/supabase/migrations_cobranca/` **espelha** `apps/NexvyBeauty/supabase/migrations_salao/` (multi-tenant, `organization_id` preservado, RLS `get_user_organization`/`has_role`). **NÃO** usa `migrations_platform_crm/` — essa é tenant-of-one, "SEM organization_id" (`apps/NexvyBeauty/supabase/migrations_platform_crm/20260701_platform_crm_schema.sql:7`), e é o CRM que o GRUPO usa para vender o Payments, não o núcleo que cobra clientes-finais de vários tenants.

**Decisão 4 cravada — genérico + `metadata jsonb`, NUNCA campos de vertical.** A conta: hardcodar `hidrometro`, `leitura`, `unidade`, `m3_agua` em colunas travaria D2 (horizontal). Case #2 (cowork) não tem hidrômetro; teria migration por vertical = Frankenstein. Genérico com `metadata` custa **1 coluna jsonb + 1 índice GIN** e cobre água, cowork, mensalidade e qualquer recorrência. Reversão: se uma vertical explodir em volume e precisar de query estruturada num campo de metadata, promove-se aquele campo a coluna — barato e tardio. Campos de vertical agora = caro e cedo.

Todas as tabelas: `organization_id uuid NOT NULL`, RLS ON, timestamps `created_at/updated_at`. Índice em `organization_id` sempre.

```sql
-- PAGADOR (cliente-final do tenant) ─ G1
CREATE TABLE payers (
  id uuid PK DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations,
  lead_id uuid NULL REFERENCES leads,          -- vínculo opcional p/ herdar omnichannel/conversa do CRM embutido
  tipo_documento text CHECK (tipo_documento IN ('cpf','cnpj')),
  documento text NOT NULL,                      -- só dígitos
  nome text NOT NULL,
  email text, whatsapp text,
  endereco jsonb,                               -- {logradouro,numero,bairro,cidade,uf,cep,ibge} p/ NFS-e
  status text DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  metadata jsonb DEFAULT '{}',
  UNIQUE (organization_id, documento)
);
CREATE INDEX ON payers (organization_id);
CREATE INDEX payers_meta_gin ON payers USING GIN (metadata);

-- GRUPO (condomínio, prédio de cowork...) ─ G2
CREATE TABLE billing_groups (
  id uuid PK, organization_id uuid NOT NULL REFERENCES organizations,
  nome text NOT NULL, tipo text,                -- 'condominio'|'cowork'|... (rótulo livre, não enum)
  metadata jsonb DEFAULT '{}'
);
CREATE INDEX ON billing_groups (organization_id);

-- CONTRATO recorrente ─ G2
CREATE TABLE contracts (
  id uuid PK, organization_id uuid NOT NULL REFERENCES organizations,
  payer_id uuid NOT NULL REFERENCES payers,
  group_id uuid NULL REFERENCES billing_groups, -- unidade dentro do condomínio
  descricao text NOT NULL,
  modo_valor text CHECK (modo_valor IN ('fixo','variavel')),  -- fixo=mensalidade; variavel=leitura/mês
  valor_fixo numeric(12,2),                     -- usado se modo_valor='fixo'
  dia_vencimento int CHECK (dia_vencimento BETWEEN 1 AND 28),
  codigo_servico_nfse text,                     -- cTribNac; se null usa padrão do projeto NotaAS
  aliquota_iss numeric(5,2),
  status text DEFAULT 'ativo' CHECK (status IN ('ativo','pausado','encerrado')),
  metadata jsonb DEFAULT '{}'                   -- {unidade:'apto 101', hidrometro:'X'} — vertical vive aqui
);
CREATE INDEX ON contracts (organization_id);
CREATE INDEX ON contracts (organization_id, status, dia_vencimento);

-- FATURA ─ G3 (molde de schema: billing_history da plataforma, mas eixo tenant→cliente)
CREATE TABLE invoices (
  id uuid PK, organization_id uuid NOT NULL REFERENCES organizations,
  contract_id uuid NOT NULL REFERENCES contracts,
  payer_id uuid NOT NULL REFERENCES payers,
  competencia text NOT NULL,                    -- 'YYYY-MM'
  valor_total numeric(12,2) NOT NULL,
  vencimento date NOT NULL,
  status text NOT NULL DEFAULT 'rascunho',      -- máquina de estados §5
  -- trilho boleto/PIX (C6)
  c6_nosso_numero text, c6_linha_digitavel text, c6_pix_copia_cola text,
  c6_status text,                               -- registrado|liquidado|cancelado
  -- trilho fiscal (NotaAS)
  notaas_invoice_id text, notaas_ch_nfse text, notaas_numero text,
  nfse_status text,                             -- pendente|emitida|erro|cancelada
  pdf_boleto_url text, pdf_nfse_url text, xml_nfse_url text,
  pago_em timestamptz, valor_pago numeric(12,2),
  metadata jsonb DEFAULT '{}',
  UNIQUE (organization_id, contract_id, competencia)   -- idempotência de geração
);
CREATE INDEX ON invoices (organization_id, status);
CREATE INDEX ON invoices (organization_id, vencimento) WHERE status NOT IN ('paga','cancelada');

-- ITENS ─ G3 (linha, leitura, consumo)
CREATE TABLE invoice_items (
  id uuid PK, organization_id uuid NOT NULL REFERENCES organizations,
  invoice_id uuid NOT NULL REFERENCES invoices ON DELETE CASCADE,
  descricao text NOT NULL,
  quantidade numeric(12,4) DEFAULT 1,
  valor_unitario numeric(12,2) NOT NULL,
  metadata jsonb DEFAULT '{}'                   -- {leitura_anterior, leitura_atual, m3} — vertical água aqui
);
CREATE INDEX ON invoice_items (organization_id, invoice_id);

-- EVENTOS de fatura (fonte da régua + conciliação + auditoria + FILA de emissão) ─ G7/G9
CREATE TABLE billing_events (
  id uuid PK, organization_id uuid NOT NULL REFERENCES organizations,
  invoice_id uuid NOT NULL REFERENCES invoices,
  tipo text NOT NULL,                           -- emitida|vencendo|vencida|paga|nfse_emitida|nfse_erro|cancelada
  payload jsonb DEFAULT '{}',
  processed_at timestamptz NULL,                -- claim do dispatch-worker (§7); NULL = pendente
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON billing_events (organization_id, invoice_id, tipo);
CREATE INDEX ON billing_events (processed_at) WHERE processed_at IS NULL;  -- fila leve, sem pgmq

-- COFRE de credenciais (decisão 2) ─ NFR §11 CLAUDE.md
CREATE TABLE billing_credentials (
  id uuid PK, organization_id uuid NOT NULL REFERENCES organizations,
  provider text NOT NULL,                       -- 'c6'|'notaas'|'a1_cert'
  cred_cifrada text NOT NULL,                   -- 'v1:'+base64 (AES-256-GCM, meta-crypto)
  metadata jsonb DEFAULT '{}',                  -- {keyPrefix, cnpj, a1_valid_until, subjectCN} — NUNCA segredo
  status text DEFAULT 'ativo',
  UNIQUE (organization_id, provider)
);
CREATE INDEX ON billing_credentials (organization_id);
```

### 3.1 RLS (pseudo-SQL, padrão canônico `get_user_organization`/`has_role`)

Aplicado a **todas** as tabelas acima (padrão do Beauty, `migrations_salao/*` + `has_role` helper já herdado do core Vendus — `migrations_platform_crm/20260701_platform_crm_schema.sql:603` "has_role já existe"). Exemplo para `invoices`; idêntico em estrutura para as demais:

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro da org
CREATE POLICY invoices_select ON invoices FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

-- Escrita/gestão: admin ou manager da org
CREATE POLICY invoices_write ON invoices FOR ALL
  USING (organization_id = get_user_organization(auth.uid())
         AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  WITH CHECK (organization_id = get_user_organization(auth.uid()));

-- Override cross-org (super-admin do grupo)
CREATE POLICY invoices_super ON invoices FOR ALL
  USING (is_super_admin(auth.uid()));
```

**`billing_credentials` é mais restrita:** SELECT/ALL **negados a todos** via RLS (nenhuma policy permissiva para o client) — acesso exclusivo por `service_role` dentro das edge functions. O front nunca lê essa tabela; recupera só `metadata` (keyPrefix mascarado, validade do A1) via edge function `cobranca-onboarding?action=status`.

---

## 4. Mapa de reuso anti-Frankenstein (origem → destino, paths REAIS do Beauty)

> **Correção de reassentamento:** o as-is Vendus apontava `supabase/migrations/` e `_shared/whatsapp-router.ts` (coordenadas do repo Vendus solto). No Beauty embutido esses paths mudaram — abaixo estão **re-mapeados e verificados** contra `apps/NexvyBeauty/`. Dois achados corrigem o blueprint original: (a) **não há `pgmq`/`email_infra` no Beauty** — a idempotência de disparo vive em unique-index + log; (b) **não há `_shared/whatsapp-router.ts` no Beauty** — o roteamento Meta↔Evolution vive em `_shared/post-sale-engine.ts`/`_shared/admin-send.ts`.

| Necessidade | Origem (path REAL no Beauty) | Destino | Veredito |
|---|---|---|---|
| Cofre de credenciais | `apps/NexvyBeauty/supabase/functions/_shared/meta-crypto.ts:25` (`encryptSecret`), `:41` (`decryptSecret`), `:52` (`maskSecret`), AES-256-GCM prefixo `v1:` (`:38`), chave-mestra `get_or_create_meta_master_key` (`:11`) | `billing_credentials.cred_cifrada` | **REUSA** (byte-idêntico ao Vendus) — envelope real. Ver decisão 2 + desafio §11.4. |
| Fila/outbox de emissão | **NÃO existe pgmq no Beauty.** Padrão análogo: `salon-automation-run/index.ts:60-62` (unique index em `salon_automation_log` como idempotência de disparo) | `billing_events` com `processed_at` NULL + `SELECT ... FOR UPDATE SKIP LOCKED` (claim) | **REUSA o PADRÃO de idempotência**, NÃO o pgmq (que não veio p/ o Beauty). Ver decisão 5 + §7. |
| Emissão boleto/PIX | `ecossistema-monorepo` `c6.py:217-515` (payload puro) + `:917-1069` (parser) | `supabase/functions/c6-billing/` (Deno, arquivo novo) | **PORTA** — ~60% cópia, esforço núcleo 2-3h; parser 100% puro. |
| Emissão NFS-e | NotaAS API (externo, D6) | `supabase/functions/notaas-emit/` (arquivo novo) | **NOVO cliente** (não há emissor no monorepo — `monorepo-c6-report.md §C`). |
| Motor da régua | `apps/NexvyBeauty/supabase/functions/cadence-tick`, `cadence-enroll`, `cadence-on-response`, `cadence-stop`, **+ `salon-automation-run`** (`pacote_vencendo` = análogo "fatura vencendo") | `billing-cadence-enroll` (adapter) | **REUSA o motor** (intacto); adiciona trigger por evento de fatura. Ver decisão 7. |
| Stop-por-pagamento | `cadence-on-response`/`cadence-stop` (stop por resposta) | mesmo padrão, disparado por `billing_events(paga)` | **REUSA o padrão** de stop. |
| Régua conversacional (molde) | `apps/NexvyBeauty/supabase/functions/cakto-recovery-trigger/index.ts:2,46` (`STATUS_TO_EVENT`, cria conversa + 1ª msg IA) | referência da régua de inadimplência | **MOLDE** — copia a mecânica, não o código. |
| Agente IA + intenção financeira | `_shared/orchestrator.ts:7` (Intent inclui `financeiro`), `:50` (prompt `financeiro → boleto, reembolso, cobrança, nota fiscal`) | roteamento das 4 tools | **REUSA** — intenção `financeiro` já nativa, não se toca no orchestrator. |
| Roteamento de config IA | `_shared/ai-router.ts:84` `resolveAIConfig(supabase, org, capability)` (3 args; lê `org_ai_routing` por capability, fallback Lovable) | edges de conversa | **REUSA** — contrato verificado (corrige a nota "ai-router divergiu": o contrato real é `resolveAIConfig(supabase, org, capability)`). |
| Tools do agente IA | `_shared/tools/registry.ts:6` (`gerarLinkPagamentoTool` esqueleto), `:11` (`ALL_TOOLS`) | 4 tools novas de cobrança | **ESTENDE** — 1 import + 1 linha por tool (sem tocar orchestrator). |
| Canal WhatsApp dual-provider | **NÃO é `_shared/whatsapp-router.ts` (ausente no Beauty).** Roteamento Meta↔Evolution vive em `_shared/post-sale-engine.ts` + `_shared/admin-send.ts`; disparo em `evolution-send` + `platform-meta-whatsapp-webhook`; assinatura em `_shared/meta-crypto.ts` | disparo da régua | **REUSA** — P1: Meta oficial em produção. **VERIFICAR** contrato exato antes de codar o adapter. |
| Multi-host / branding | `src/lib/publicUrl.ts:54` (`APEX_BASE`), `src/hooks/usePlatformBranding.ts:151` (3-modos), `src/main.tsx:14` (tema host-aware), `src/components/auth/HostConfinementGuard.tsx:28` | ajuste de marca (§ multi-host) | **REUSA** (delta no core registrado em CORE-DELTA.md). |
| UI do módulo | `src/config/adminMenu.ts` + `Admin.tsx` (`renderSection`) + moldes `LeadsManager`, `Financeiro.tsx` (salão), `CaktoAdminPanel`, `CadenceWizard`, `WizardCadastroContaBancaria` (ERP) | seção "Cobranças" | **REUSA cascas** — miolo novo, casca barata. |
| Schema de fatura (molde) | `billing_history` da plataforma (`migrations_platform_crm/*`) | referência de colunas de `invoices` | **MOLDE de schema** — eixo diferente (plataforma→tenant), só inspira colunas. |
| Cakto | `cakto-webhook/index.ts` (echo boleto/pix), `cakto-recovery-trigger` (recovery), `_shared/cakto-plan-provisioning.ts` (onboarding SaaS) | cartão/checkout/recuperação + onboarding-ao-pagar | **RESTRINGE** — não é motor de boleto do produto. Ver decisão 3. |

**O que NÃO reusar (desaconselhado com fato):**
- `packages/billing` do monorepo ecossistema (cliente **Inter**, 0 imports ativos, `monorepo-c6-report.md §B`) → não serve; só referência de idempotency pattern.
- Régua-config da plataforma (`platform_email_settings.reminder_days_before`) → **é config sem executor** no as-is Vendus; serve de blueprint conceitual, não de código.
- `gerar_link_pagamento.ts` como emissor de boleto → só anexa lead a checkout_url Cakto, NÃO emite (`registry.ts:6`). Não confundir com trilho registrado.
- `financeiro.*` do ERP-Educacional (schema Supabase `ifdnjieklngcfodmtied`) → **referência de modelo**, não import cross-repo. Dependência cruzada entre repos = acoplamento indevido.

---

## 5. Máquina de estados da fatura (decisão 6 — cravada)

Uma máquina **única** cobrindo boleto + nota + régua. Estado da fatura é o `status` principal; `c6_status` e `nfse_status` são sub-estados dos trilhos (uma fatura pode ter boleto liquidado e nota ainda pendente).

```
                    invoice-batch-generate
                              │
                              ▼
                        ┌──────────┐  aprovar (admin)   ┌──────────┐
                        │ rascunho │──────────────────► │ aprovada │
                        └──────────┘                    └────┬─────┘
                                                             │ enfileira (billing_events, processed_at=NULL)
                                                             ▼
                                                      ┌──────────────┐
                          erro C6/NotaAS (retry)      │  emitindo    │
                              ┌────────────────────── └──────┬───────┘
                              ▼                              │ boleto OK + NFS-e queued
                        ┌──────────┐                         ▼
                        │   erro   │                   ┌──────────┐  régua dispara
                        └────┬─────┘                   │ emitida  │──────────────►(cadence/salon-automation)
                             │ reprocessa              └────┬─────┘
                             └────────────────────────────►│
                                                   webhook C6 pago │  │ due_date passou
                                                            ▼      │  ▼
                                                     ┌──────────┐  │ ┌──────────┐
                                                     │   paga   │  │ │ vencida  │
                                                     └──────────┘  │ └────┬─────┘
                                                       (stop régua)│      │ pago em atraso
                                                                   │      ▼
                                                                   │  ┌──────────┐
                                                    cancelamento   │  │   paga   │
                                                    formal         ▼  └──────────┘
                                                            ┌────────────┐
                                                            │ cancelada  │ (imutável fiscal §9)
                                                            └────────────┘
```

**Transições permitidas (as demais são rejeitadas):**
- `rascunho → aprovada` (admin) | `rascunho → cancelada`
- `aprovada → emitindo` (dispatch-worker pega o `billing_events` pendente)
- `emitindo → emitida` (boleto+PIX OK) | `emitindo → erro` (falha C6/NotaAS)
- `erro → emitindo` (reprocessa)
- `emitida → paga` (webhook C6) | `emitida → vencida` (due_date + tick) | `emitida → cancelada`
- `vencida → paga` (pago em atraso com multa/juros) | `vencida → cancelada`
- `paga` e `cancelada` são **terminais** (nota emitida nunca deleta — §9).

Sub-estado fiscal (`nfse_status`) evolui independente por webhook NotaAS: `pendente → emitida | erro`; `emitida → cancelada`. Uma fatura `paga` no boleto pode ter `nfse_status=erro` — flag no painel, não bloqueia a baixa.

---

## 6. Segurança (CLAUDE.md §11 — obrigatório)

### 6.1 Chaves nunca no front (§11.1)
- C6 (client_id/secret/cert mTLS), NotaAS (`ntaas_`/`ntaas_org_`), A1 (.pfx+senha) **nunca** em `VITE_*`/bundle/localStorage. Ficam em `billing_credentials.cred_cifrada` (cifrado) e Org Token NotaAS em `Deno.env` server-side.
- Fluxo: Frontend → JWT Supabase → edge function proxy (`cobranca-onboarding`, `billing-dispatch-worker`) → serviço externo com credencial decifrada só na memória da função. Resposta ao front nunca carrega segredo (só `metadata` mascarado).

### 6.2 Cofre cifrado (decisão 2)
Envelope `meta-crypto` (`apps/NexvyBeauty/supabase/functions/_shared/meta-crypto.ts:25-52`, byte-idêntico ao Vendus). Hash/bcrypt não se aplica (precisamos **decifrar** para chamar C6/NotaAS, não só comparar) → cifra reversível AES-256-GCM é o correto. **Reuso, não reescrita** (§0: consome o `_shared/` do core sem tocá-lo).

### 6.3 Correção D-2 / D-3 no caminho do dinheiro (bloqueador — G12/R1, Fase 0)
- **D-2**: garantir que nenhuma edge sem-auth herdada (padrão `admin-provision-users` do as-is Vendus) exista no fluxo — deletar/não portar, não patchar.
- **D-3**: **toda** edge function nova de dinheiro valida vínculo do caller ANTES de agir: extrai `organization_id` do JWT via `get_user_organization`, **ignora** `organization_id` do body. Padrão de referência correto já no Beauty: `super-admin-manage-user/index.ts`. As funções legadas com IDOR não são pré-requisito do go-live do módulo, MAS nenhuma função do fluxo financeiro pode nascer com o defeito.
- **D-4**: nunca gravar segredo em plaintext. Todo secret passa por `encryptSecret`.
- **JWT anon hardcoded** em migration de cron → os crons novos usam secret via Vault/`Deno.env`, nunca literal versionado (CLAUDE.md §7).

### 6.4 Camadas §11.2 (Fase 0)
CSP restrito, `build.sourcemap:false`, `X-Frame-Options: DENY`, honeytoken `/api/trap`, CORS não-`*` nas funções de dinheiro. Prompt-injection shield (§11.3) nas 4 tools IA e no webchat (limite de chars, blocklist, log com hash).

---

## 7. Escala (D5: 500–5.000 faturas/mês) + fila sem pgmq

**A conta do pico (decisão 5):** 5.000 faturas × 2 trilhos (boleto + nota) = 10.000 operações/mês. NotaAS em lote ≤100 → **50 chamadas** de batch para as notas. C6 é 1 chamada/boleto (5.000), respeitando rate por fila. Distribuído no fechamento mensal (não instantâneo): mesmo concentrado em 1 dia, 10.000 ops/24h ≈ 7 ops/min — trivial.

> **Correção de reassentamento (fila):** o blueprint Vendus assumia `pgmq` (via `email_infra.sql`). **Esse mecanismo não veio para o Beauty** (grep `pgmq`/`email_infra` em `migrations_salao/` e `migrations_platform_crm/` = zero). Portanto a fila do `billing-dispatch-worker` é **tabela-como-fila**: `billing_events` com `processed_at IS NULL` + índice parcial, consumo via `SELECT ... FOR UPDATE SKIP LOCKED` num cron de 30s. Simples, transacional, suficiente para 7 ops/min. Se o volume crescer, promover para pgmq é migração tardia e barata. **Idempotência de disparo herda o padrão de `salon-automation-run` (unique-index/log), provado no Beauty.**

**Idempotência ponta a ponta (NFR §6.1 + R3):**
- `invoices UNIQUE(organization_id, contract_id, competencia)` → re-rodar `invoice-batch-generate` do mês nunca duplica fatura.
- `referencia` única por `(invoice_id, trilho)` gravada **antes** do POST. NotaAS **não tem idempotência** (`notaas-report.md §D/H.3`) → retry cego = nota duplicada real (custo fiscal). O worker **nunca** reenvia sem antes consultar status por `referencia`/`invoiceId`.
- C6 tem retry 422 idempotente nativo (`c6.py:288-323`).
- Backoff exponencial + status de erro na `billing_events`.

**Timezone** America/Sao_Paulo em vencimento e régua (`withinWindow` em `cadence-tick`; `brToday()` em `salon-automation-run:25`). Emissão tolerante a indisponibilidade municipal (NotaAS é assíncrona por natureza — `202 queued`).

---

## 8. Unit economics completa (faixas + premissas; câmbio R$5,40/US$)

### 8.1 Custo variável por fatura cobrada

| Componente | Custo/fatura | Premissa (declarada) |
|---|---|---|
| Boleto C6 liquidado (Bolepix) | R$0,80–2,50 | tarifa BaaS a negociar no contrato C6 — **VERIFICAR (G-C6)**. Só paga se liquidar. |
| PIX C6 (alternativa ao boleto) | R$0,00–0,60 | faixa de mercado PIX cobrança |
| NFS-e NotaAS | R$0,20–0,60 | sistema de cotas por plano (org Nexvy Tech = SaaS Pro, **2.000 notas/mês** — `notaas-report.md §H.1`); preço em R$ ainda não capturado — **VERIFICAR (G-NOTAAS)**. Pode ser custo interno da casa. |
| WhatsApp Meta utility (3–6 msgs de régua) | R$0,13–0,26 | ~US$0,008/msg BR × 3–6 msgs = US$0,024–0,048 → ×5,40. Conversa na janela de serviço (24h) não paga template. |
| IA atendimento (gemini-flash via gateway) | R$0,01–0,10/conversa | só faturas que geram conversa; a maioria não gera |
| **Total variável / fatura** | **≈ R$1,00–3,50** | dominado pela tarifa do boleto; **PIX derruba para <R$1,00** |

### 8.2 Margem por cenário (pricing cravado — decisão 1)

**Pricing cravado:** assinatura por tenant **R$297/mês** (faixa §7: R$197–597) + variável por fatura emitida **R$1,49** (faixa: R$0,99–1,99). Justificativa: R$297 fica abaixo do custo de manter Asaas + operador manual de WhatsApp (o valor real é a régua+IA, não o boleto); R$1,49 fica **dentro** do que o mercado já paga por boleto no Asaas (R$1,99–3,49) mas entregando CRM+régua+IA junto — âncora de valor, não de custo.

Premissa de custo por fatura nos cenários: **boleto = R$1,80** (meio da faixa C6) e **PIX = R$0,40**. Mix: cenário conservador 100% boleto; cenário PIX 100% PIX.

| Cenário | Faturas/mês | Receita variável (R$1,49) | Receita total (+R$297) | Custo var. (boleto R$1,80) | **Margem boleto** | Custo var. (PIX R$0,40) | **Margem PIX** |
|---|---|---|---|---|---|---|---|
| Pequeno | 500 | R$745 | R$1.042 | R$900 | **R$142 (14%)** | R$200 | **R$842 (81%)** |
| Médio | 2.000 | R$2.980 | R$3.277 | R$3.600 | **−R$323 (−10%)** | R$800 | **R$2.477 (76%)** |
| Grande | 5.000 | R$7.450 | R$7.747 | R$9.000 | **−R$1.253 (−16%)** | R$2.000 | **R$5.747 (74%)** |

**A verdade desconfortável da conta:** com boleto a R$1,80 e preço a R$1,49, a margem variável é **negativa** em volume. Duas saídas, ambas cravadas:
1. **PIX é o trilho-padrão da régua** (margem 74–81% em qualquer volume). Boleto vira opção premium ou repassa-se a tarifa cheia. O produto **empurra PIX** por design (QR na 1ª mensagem).
2. **Boleto só sustenta R$1,49 se a tarifa C6 negociada ficar ≤ R$1,20** (G-C6 é gate de viabilidade, não detalhe). Acima disso, boleto é cobrado à parte (pass-through) — a assinatura R$297 é a margem de base, o variável cobre o custo.

**Conclusão de pricing:** fecha **positivo em todos os cenários com PIX** e com a assinatura cobrindo o CAC. Boleto é feature, não motor de margem. Alavanca dominante = **mix PIX vs boleto**, não o preço de tabela.

### 8.3 Custo fixo por tenant
≈ R$0 marginal na infra Supabase compartilhada do app embutido. **Ponto novo (embutido no monorepo):** o deploy é `make deploy-payments` (Traefik file-provider, VPS Hostinger), não Lovable Cloud standalone — o teto de escala é do VPS/Supabase do projeto novo, medido por invocations/pgmq-throughput/storage-PDF. LLM só consome em conversa real (pool/BYO via `ai-router.ts`).

---

## 9. Compliance

### 9.1 LGPD mínimo viável (G13 — dado sensível: CPF/CNPJ + dívida + conversa)
> **Ponto de reassentamento:** o Beauty já resolveu o gap de LGPD-consents que o as-is Vendus marcava como zero (`apps/NexvyBeauty/supabase/migrations_salao/20260619_lgpd_consents.sql`). Payments **parte disso**, não recria.
- **Base legal**: execução de contrato (cobrança) + legítimo interesse (recuperação de crédito). Registrar por tenant.
- **Retenção**: política por tabela (`payers`, `invoices`, `billing_events`, transcrições). Fiscal segue prazo legal (5 anos); conversa de cobrança prazo menor definido.
- **Audit de PII**: toda operação CRUD em `payers` e leitura de documento fiscal loga em `platform_audit_logs`.
- **Erasure de pagador**: endpoint que anonimiza `payers` (mantém fatura por obrigação fiscal, remove PII de contato) — direito do titular.
- **Atenção CDN NotaAS**: `pdfUrl`/`xmlUrl` são **públicas sem auth e imutáveis** (`notaas-report.md §E.13/H.2`) → nunca expor a URL crua ao pagador sem camada própria; considerar `storageBaseUrl` (white-label de storage, CNAME → `backbone.notaas.com.br`) ou proxy assinado.

### 9.2 Imutabilidade fiscal (NFR §6.4)
Nota emitida **nunca** é deletada. Cancelamento é operação formal com trilha (`billing_events` + `notaas.cancelled`). Numeração por Projeto NotaAS (guard `GREATEST`, números nunca diminuem — `notaas-report.md §B`). NotaAS **não tem substituição** de nota → cancelar + reemitir é o caminho (registrar no runbook).

---

## 10. Riscos com mitigação (herda R1..R11; destaca os do caminho do dinheiro)

| Risco | Mitigação cravada |
|---|---|
| R1 Segurança as-is bloqueia produção | Fase 0 de hardening ANTES de dinheiro (§6.3). Gate de segurança. |
| R3 NotaAS sem idempotência | Fila `billing_events` com `referencia` única + consulta-antes-de-reenviar (§7). |
| R4 Custódia A1 (.pfx+senha) | Cofre cifrado server-only + monitor `daysUntilExpiration` + checklist de onboarding. |
| R5 C6 nunca em produção; webhook sem assinatura | Piloto sandbox→prod com CNPJ case #1; validação por GET de confirmação. Gate G-C6. A0=PoC mTLS gate é **pré-requisito bloqueante** no topo do roadmap. |
| R6 Cakto fora do desenho como trilho de fatura | Decisão 3: Cakto restrito a cartão/checkout/recuperação + onboarding-ao-pagar SaaS. |
| **Margem boleto negativa** (da §8.2) | PIX como trilho-padrão; boleto só ≤R$1,20 tarifa ou pass-through. Instrumentar custo real por fatura desde o v1. |
| R8 Manutenção dupla C6 Python/Deno + NFS-e FIC | Adapters isoláveis com contrato (§2.3) para reuso no ERP. |
| **Deriva do fork (novo)** | §0: mods aditivos, `CORE-DELTA.md`, diff seletivo. Sem isso, patch do Vendus V6 quebra o módulo de cobrança. |
| R10 Conflito upstream × local | Hard fork gerenciado (§0): Beauty é a base-mãe; upstream vira patch seletivo, nunca merge cego. |

---

## 11. Desafios do cofundador (máx 5 — discordâncias registradas; EXECUTO mesmo assim)

**1. [Provável] Boleto como trilho não fecha a conta no preço travado — PIX tem que ser o default, não uma opção.**
A §8.2 mostra margem variável **negativa** com boleto a R$1,80 e preço R$1,49 em volume médio/grande. A decisão D3 trata C6-boleto e C6-PIX como iguais. Discordo da simetria: são economicamente opostos. O que eu faria: **produto empurra PIX por design** (QR na 1ª msg da régua, boleto como fallback premium com tarifa repassada). Risco de ignorar: escalar volume com boleto default = queimar caixa por fatura. **Executo D3 (mantenho os 2 trilhos), mas o roadmap prioriza o trilho PIX e a UI empurra PIX.**

**2. [Provável] D4 (v1 all-in, 4 pilares) é o maior risco de cronograma — o piloto pago (G-PILOTO) deveria vir no meio, não depois do 4º pilar.**
D4 trava emissão+boleto+régua+IA como "tudo fundamental". Concordo que os 4 são o job mínimo, mas construir os 4 antes de qualquer receita é o antipadrão de empilhar features. O que eu faria: sequenciar para que o **1º ciclo real do case #1** (fatura+boleto+nota+régua básica) rode e cobre valor ANTES de polir o pilar IA de renegociação. Risco: gastar semanas no pilar 4 antes de provar que 1-3 retém. **Executo D4 completo, mas o roadmap coloca marco de valor pago no meio.**

**3. [Palpite] "NexvyPayments" horizontal (D2) com água + cowork simultâneos dilui o foco do piloto.**
D2 é acertada como tese (o modelo genérico §3 sustenta). Mas provar horizontalidade com 2 verticais ao mesmo tempo no v1 arrisca não fazer nenhuma direito. O que eu faria: case #1 (água) é o piloto único até fechar 1 ciclo 100% sem humano; cowork entra como **prova de horizontalidade** (onboarding sem migration nova) só depois. Risco: 2 clientes insatisfeitos > 1 encantado. **Executo D2 (produto horizontal), mas o roadmap trata cowork como validação, não piloto paralelo.**

**4. [Provável] Chave-mestra única do meta-crypto é aceitável no v1, mas é dívida — o A1 do tenant merece isolamento por-org no médio prazo.**
`meta-crypto.ts:11` usa uma chave-mestra global da plataforma (`get_or_create_meta_master_key`, verificado no Beauty). Cifrar A1 de N tenants com a mesma chave: vazou a master, vazou todos os certificados. Para credencial de cartão/API é aceitável; para **certificado digital A1** (que assina nota em nome do tenant) o blast radius é maior. O que eu faria no futuro: derivação de chave por-org (HKDF com salt por tenant). Risco: incidente único compromete todos os A1. **Executo com meta-crypto no v1 (não reinventar cofre agora, §0 manda reusar o core), mas registro a derivação por-org como dívida de segurança nomeada.**

**5. [Provável] O maior risco novo não é infra — é deriva do fork. Sem disciplina de isolamento, o próximo snapshot do Vendus quebra o módulo de cobrança.**
O reassentamento troca "Lovable Cloud vira gargalo" por um risco mais real: como o core vem de snapshot Lovable sem histórico comum (§0), qualquer edição de cobrança dentro do core cria colisão silenciosa no próximo diff seletivo. O que eu faria (e travei na §0): mods 100% aditivos, `CORE-DELTA.md` obrigatório para toda edição inevitável de core, diff seletivo em vez de merge. Risco de ignorar: retrabalho de merge a cada atualização + regressão no motor de dinheiro. **Executo o hard fork gerenciado como cláusula de arquitetura, não como boa intenção — é a §0 deste blueprint.**

---

## 12. Handoff

Com este blueprint reassentado + o roadmap pareado (`nexvypayments-roadmap.md`) + o as-is reassentado (`nexvypayments-as-is-to-be.md`), a Etapa 3 (planner adversarial) recebe: modelo de dados DDL-nível em `migrations_cobranca/` (espelha `migrations_salao/`), contratos de edge function (arquivos novos, aditivos), máquina de estados, mapa de reuso com paths REAIS re-verificados contra `apps/NexvyBeauty/`, economics com a conta na mesa, os gates externos nomeados (A0 mTLS C6, G-C6, G-NOTAAS, G-PILOTO) e a disciplina de isolamento do hard fork (§0). Próximo passo: SPDD por módulo (cofre → C6 → NotaAS → dispatch-worker → régua → IA → UI), cada um com spec verificável incremental — e cada delta no core registrado em `docs/CORE-DELTA.md`.
