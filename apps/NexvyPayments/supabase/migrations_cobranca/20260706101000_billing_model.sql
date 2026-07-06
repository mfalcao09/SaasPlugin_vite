-- ============================================================================
-- MODELO DE DADOS DE COBRANÇA (NexvyPayments) — blueprint §3, esteira NOVA e
-- ISOLADA `migrations_cobranca/`. Espelha `migrations_salao/` (multi-tenant,
-- organization_id, RLS get_user_organization/has_role). É o NÚCLEO greenfield
-- do módulo de dinheiro: pagador → contrato recorrente → fatura → itens →
-- eventos (fila+trilha) → acordo de renegociação.
--
-- ISOLAMENTO (hard fork §0 do blueprint): SÓ CREATE de tabelas/índices NOVOS.
-- ZERO ALTER/DROP em tabela do core. As únicas dependências no core são por
-- REFERENCE (leitura de FK): public.organizations e public.leads — permitido.
-- Estilo espelha migrations_salao/ e a migration A4 (billing_credentials):
-- public., IF NOT EXISTS, gen_random_uuid(), comentários densos, aditiva.
--
-- DECISÃO 4 CRAVADA (anti-Frankenstein / D2 horizontal): genérico + metadata
-- jsonb, ZERO campo de vertical hardcoded (nada de hidrometro/leitura/m3 em
-- coluna). A vertical (água, cowork, mensalidade) vive INTEIRAMENTE em
-- `metadata` (com índice GIN onde a query o justifica). Promover um campo de
-- metadata a coluna é migração tardia e barata; hardcodar vertical agora seria
-- caro e cedo, e travaria o produto horizontal.
--
-- RLS canônica (blueprint §3.1): toda tabela tem RLS ON + policies org-scoped
--   SELECT: qualquer membro da org (organization_id = get_user_organization(...))
--   INSERT/UPDATE/DELETE (gestão): admin OU manager da org (has_role ...::app_role)
--   super-admin do grupo: has_role(auth.uid(), 'super_admin'::app_role) (cross-org)
-- O enum app_role real do core = {admin, manager, seller, super_admin}
-- (verificado em src/integrations/supabase/types.ts). O blueprint §3.1 cita
-- `is_super_admin()` como pseudo-SQL; o helper REAL herdado do core é
-- `has_role(auth.uid(), 'super_admin'::app_role)` — é o que usamos aqui.
--
-- IDEMPOTÊNCIA (blueprint §7 / NFR §6.1): UNIQUE(org, contract, competencia) em
-- invoices impede fatura duplicada ao re-rodar o batch do mês; UNIQUE(org,
-- referencia) em invoices dá a chave de idempotência de emissão externa
-- (gravada ANTES do POST em C6/NotaAS); UNIQUE(org, documento) em payers.
-- ============================================================================


-- ============================================================================
-- 1. PAYERS — pagador (cliente-final do tenant) ─ G1
-- ----------------------------------------------------------------------------
-- O "cliente" que o tenant cobra (o morador do condomínio, o membro do cowork,
-- o aluno da mensalidade). `lead_id` é o vínculo OPCIONAL com o CRM embutido
-- (herdado do fork Vendus/Beauty): quando presente, o pagador herda a conversa
-- omnichannel/régua do lead. `documento` guarda só dígitos (CPF/CNPJ) e é a
-- chave natural do pagador dentro da org. `endereco` jsonb serve à NFS-e
-- (logradouro/numero/bairro/cidade/uf/cep/ibge). `metadata` absorve qualquer
-- campo de vertical sem migration nova.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,   -- vínculo opcional p/ herdar omnichannel/conversa do CRM embutido
  tipo_documento text CHECK (tipo_documento IN ('cpf','cnpj')),
  documento text NOT NULL,                                       -- só dígitos (CPF/CNPJ)
  nome text NOT NULL,
  email text,
  whatsapp text,
  endereco jsonb DEFAULT '{}'::jsonb,                            -- {logradouro,numero,bairro,cidade,uf,cep,ibge} p/ NFS-e
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  metadata jsonb DEFAULT '{}'::jsonb,                            -- vertical vive aqui (D2 horizontal)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Idempotência/chave natural: um pagador por documento dentro da org.
  UNIQUE (organization_id, documento)
);
CREATE INDEX IF NOT EXISTS idx_payers_org ON public.payers (organization_id);
CREATE INDEX IF NOT EXISTS idx_payers_meta_gin ON public.payers USING GIN (metadata);

ALTER TABLE public.payers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view payers" ON public.payers
  FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org admin/manager can insert payers" ON public.payers
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can update payers" ON public.payers
  FOR UPDATE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can delete payers" ON public.payers
  FOR DELETE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "super admin manage payers" ON public.payers
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));


-- ============================================================================
-- 2. BILLING_GROUPS — agrupador (condomínio, prédio de cowork...) ─ G2
-- ----------------------------------------------------------------------------
-- Agrupa pagadores/contratos numa unidade lógica (condomínio → apto, prédio de
-- cowork → sala). `tipo` é RÓTULO LIVRE (não enum), justamente para não travar
-- verticais. O vínculo pagador↔grupo é feito por `contracts.group_id`
-- (um pagador tem N contratos; a unidade física do contrato aponta o grupo);
-- o pagador em si também pode registrar o grupo/unidade em `payers.metadata`.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text,                                                    -- 'condominio'|'cowork'|... rótulo livre, NÃO enum
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Nome único de grupo dentro da org (evita duplicar "Condomínio X" no cadastro).
  UNIQUE (organization_id, nome)
);
CREATE INDEX IF NOT EXISTS idx_billing_groups_org ON public.billing_groups (organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_groups_meta_gin ON public.billing_groups USING GIN (metadata);

ALTER TABLE public.billing_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view billing_groups" ON public.billing_groups
  FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org admin/manager can insert billing_groups" ON public.billing_groups
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can update billing_groups" ON public.billing_groups
  FOR UPDATE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can delete billing_groups" ON public.billing_groups
  FOR DELETE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "super admin manage billing_groups" ON public.billing_groups
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));


-- ============================================================================
-- 3. CONTRACTS — contrato recorrente (pagador↔valor↔dia_venc↔ciclo↔status) ─ G2
-- ----------------------------------------------------------------------------
-- A recorrência que o batch mensal materializa em faturas. `modo_valor`:
-- 'fixo' (mensalidade — usa `valor_fixo`) ou 'variavel' (leitura/consumo do
-- mês — valor entra via readings no batch). `dia_vencimento` 1..28 (evita
-- meses curtos). `codigo_servico_nfse`/`aliquota_iss` alimentam a NFS-e (se
-- null, o projeto NotaAS usa o padrão). A VERTICAL (unidade, hidrômetro, sala)
-- vive em `metadata` — NUNCA em coluna (decisão 4).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES public.payers(id) ON DELETE RESTRICT,
  group_id uuid REFERENCES public.billing_groups(id) ON DELETE SET NULL,   -- unidade dentro do grupo/condomínio
  descricao text NOT NULL,
  modo_valor text NOT NULL DEFAULT 'fixo' CHECK (modo_valor IN ('fixo','variavel')),  -- fixo=mensalidade; variavel=leitura/mês
  valor_fixo numeric(12,2),                                     -- usado quando modo_valor='fixo'
  dia_vencimento int CHECK (dia_vencimento BETWEEN 1 AND 28),
  codigo_servico_nfse text,                                     -- cTribNac; se null usa padrão do projeto NotaAS
  aliquota_iss numeric(5,2),
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','pausado','encerrado')),
  metadata jsonb DEFAULT '{}'::jsonb,                           -- {unidade:'apto 101', hidrometro:'X'} — vertical vive aqui
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contracts_org ON public.contracts (organization_id);
-- Índice de trabalho do batch: contratos ativos por dia de vencimento na org.
CREATE INDEX IF NOT EXISTS idx_contracts_org_status_venc
  ON public.contracts (organization_id, status, dia_vencimento);
CREATE INDEX IF NOT EXISTS idx_contracts_payer ON public.contracts (payer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_meta_gin ON public.contracts USING GIN (metadata);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view contracts" ON public.contracts
  FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org admin/manager can insert contracts" ON public.contracts
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can update contracts" ON public.contracts
  FOR UPDATE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can delete contracts" ON public.contracts
  FOR DELETE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "super admin manage contracts" ON public.contracts
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));


-- ============================================================================
-- 4. BILLING_AGREEMENTS — acordo de renegociação ─ (blueprint §3 / tool renegociar)
-- ----------------------------------------------------------------------------
-- Criado ANTES de invoices porque invoices.agreement_id o referencia (FK
-- nullable). Um acordo renegocia dívida de um pagador e GERA N faturas-parcela
-- (cada parcela é uma `invoices` com `agreement_id` apontando de volta). Guarda
-- as CONDIÇÕES do acordo (valor total renegociado, entrada, nº de parcelas,
-- desconto concedido pela alçada da IA/atendente) em colunas + `condicoes`
-- jsonb livre. `status` cobre o ciclo do acordo (proposto→aceito→quitado/
-- quebrado/cancelado). É genérico: serve a qualquer vertical.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES public.payers(id) ON DELETE RESTRICT,
  descricao text,
  valor_original numeric(12,2),                                 -- soma da dívida renegociada
  valor_acordado numeric(12,2) NOT NULL,                        -- total do acordo (pós-desconto/encargos)
  desconto_pct numeric(5,2) DEFAULT 0,                          -- alçada de desconto concedida
  entrada numeric(12,2) DEFAULT 0,                              -- valor de entrada, se houver
  num_parcelas int NOT NULL DEFAULT 1 CHECK (num_parcelas >= 1),
  condicoes jsonb DEFAULT '{}'::jsonb,                          -- {dia_venc, juros_parcela, ...} — condições livres
  status text NOT NULL DEFAULT 'proposto'
    CHECK (status IN ('proposto','aceito','quitado','quebrado','cancelado')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_agreements_org ON public.billing_agreements (organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_agreements_payer ON public.billing_agreements (payer_id);
CREATE INDEX IF NOT EXISTS idx_billing_agreements_org_status
  ON public.billing_agreements (organization_id, status);

ALTER TABLE public.billing_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view billing_agreements" ON public.billing_agreements
  FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org admin/manager can insert billing_agreements" ON public.billing_agreements
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can update billing_agreements" ON public.billing_agreements
  FOR UPDATE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can delete billing_agreements" ON public.billing_agreements
  FOR DELETE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "super admin manage billing_agreements" ON public.billing_agreements
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));


-- ============================================================================
-- 5. INVOICES — fatura (o coração do módulo) ─ G3
-- ----------------------------------------------------------------------------
-- Materializada pelo invoice-batch-generate por competência. `status` é a
-- máquina de estados única (blueprint §5). `c6_*` são o sub-estado do trilho
-- boleto/PIX (C6); `notaas_*`/`nfse_status` o sub-estado do trilho fiscal —
-- ambos evoluem independentes do `status` principal. `referencia` é a chave de
-- IDEMPOTÊNCIA de emissão externa (única por org), gravada ANTES do POST em
-- C6/NotaAS (blueprint §7: NotaAS não tem idempotência → nunca reenviar sem
-- consultar por referencia).
--
-- CAMPOS DE CORREÇÃO (adversarial) — obrigatórios:
--   multa_pct, juros_pct        → percentuais aplicáveis em atraso
--   valor_multa, valor_juros    → valores calculados de multa/juros
--   valor_original              → valor da fatura ANTES de encargos
--   agreement_id (FK nullable)  → se esta fatura é parcela de um acordo
--   iss_retido (bool)           → retenção de ISS na fonte (tomador retém)
--   retencoes (jsonb)           → demais retenções (IR, PIS, COFINS, CSLL, INSS)
-- Estado 'substituida' incluído no CHECK de status (nota cancelada+reemitida).
-- Ciclo: rascunho→aprovada→emitindo→emitida→enviada→paga/vencida/cancelada/substituida
-- (blueprint §5; 'enviada' = régua disparada; 'substituida' = terminal fiscal).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
  payer_id uuid NOT NULL REFERENCES public.payers(id) ON DELETE RESTRICT,
  agreement_id uuid REFERENCES public.billing_agreements(id) ON DELETE SET NULL,  -- parcela de acordo (nullable)
  competencia text NOT NULL,                                    -- 'YYYY-MM'
  referencia text NOT NULL,                                     -- chave de idempotência de emissão (única por org)
  -- Valores (com encargos de atraso — campos de correção do adversarial)
  valor_original numeric(12,2) NOT NULL,                        -- valor ANTES de multa/juros
  multa_pct numeric(5,2) NOT NULL DEFAULT 0,                    -- % de multa por atraso
  juros_pct numeric(5,2) NOT NULL DEFAULT 0,                    -- % de juros (ao mês/dia, conforme metadata)
  valor_multa numeric(12,2) NOT NULL DEFAULT 0,                 -- multa calculada
  valor_juros numeric(12,2) NOT NULL DEFAULT 0,                 -- juros calculado
  valor_total numeric(12,2) NOT NULL,                           -- valor_original + valor_multa + valor_juros
  vencimento date NOT NULL,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aprovada','emitindo','emitida','enviada',
                      'paga','vencida','cancelada','substituida')),   -- máquina de estados §5 (+ substituida)
  -- Retenções fiscais (campos de correção do adversarial)
  iss_retido boolean NOT NULL DEFAULT false,                    -- ISS retido na fonte pelo tomador
  retencoes jsonb DEFAULT '{}'::jsonb,                          -- {ir, pis, cofins, csll, inss, ...}
  -- Trilho boleto/PIX (C6) — sub-estado
  c6_nosso_numero text,
  c6_linha_digitavel text,
  c6_pix_copia_cola text,
  c6_status text,                                               -- registrado|liquidado|cancelado
  -- Trilho fiscal (NotaAS) — sub-estado
  notaas_invoice_id text,
  notaas_ch_nfse text,
  notaas_numero text,
  nfse_status text,                                             -- pendente|emitida|erro|cancelada
  -- Documentos gerados
  pdf_boleto_url text,
  pdf_nfse_url text,
  xml_nfse_url text,
  -- Baixa
  pago_em timestamptz,
  valor_pago numeric(12,2),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Idempotência de GERAÇÃO: re-rodar o batch do mês nunca duplica a fatura.
  UNIQUE (organization_id, contract_id, competencia),
  -- Idempotência de EMISSÃO externa: uma referência por org (grava antes do POST).
  UNIQUE (organization_id, referencia)
);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices (organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON public.invoices (organization_id, status);
-- Índice parcial p/ o tick de vencimento (só faturas ainda cobráveis).
CREATE INDEX IF NOT EXISTS idx_invoices_org_venc
  ON public.invoices (organization_id, vencimento)
  WHERE status NOT IN ('paga','cancelada','substituida');
CREATE INDEX IF NOT EXISTS idx_invoices_contract ON public.invoices (contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payer ON public.invoices (payer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_agreement ON public.invoices (agreement_id);
CREATE INDEX IF NOT EXISTS idx_invoices_meta_gin ON public.invoices USING GIN (metadata);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view invoices" ON public.invoices
  FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org admin/manager can insert invoices" ON public.invoices
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can update invoices" ON public.invoices
  FOR UPDATE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can delete invoices" ON public.invoices
  FOR DELETE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "super admin manage invoices" ON public.invoices
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));


-- ============================================================================
-- 6. INVOICE_ITEMS — linha da fatura (linha, leitura, consumo) ─ G3
-- ----------------------------------------------------------------------------
-- N itens por fatura (ON DELETE CASCADE: apagar a fatura leva os itens).
-- A MEDIÇÃO/leitura da vertical água ({leitura_anterior, leitura_atual, m3})
-- vive em `metadata` — SEM coluna de vertical (decisão 4). `valor_unitario` ×
-- `quantidade` compõe o subtotal do item.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  quantidade numeric(12,4) NOT NULL DEFAULT 1,
  valor_unitario numeric(12,2) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,                           -- {leitura_anterior, leitura_atual, m3} — vertical água aqui
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_org ON public.invoice_items (organization_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_org_invoice
  ON public.invoice_items (organization_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_meta_gin
  ON public.invoice_items USING GIN (metadata);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view invoice_items" ON public.invoice_items
  FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "org admin/manager can insert invoice_items" ON public.invoice_items
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can update invoice_items" ON public.invoice_items
  FOR UPDATE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can delete invoice_items" ON public.invoice_items
  FOR DELETE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "super admin manage invoice_items" ON public.invoice_items
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));


-- ============================================================================
-- 7. BILLING_EVENTS — trilha de eventos + FILA de emissão ─ G7/G9
-- ----------------------------------------------------------------------------
-- Dupla função (blueprint §7): (a) TRILHA/auditoria de tudo que acontece com a
-- fatura (emitida|vencendo|vencida|paga|nfse_emitida|nfse_erro|cancelada) e a
-- fonte da régua; (b) FILA leve de emissão — o billing-dispatch-worker consome
-- eventos com `processed_at IS NULL` via SELECT ... FOR UPDATE SKIP LOCKED
-- (NÃO há pgmq no Beauty; a fila é tabela+claim). `payload` jsonb carrega o
-- contexto do evento. `origem` registra quem gerou o evento. Índice parcial
-- sobre processed_at = a fila.
--
-- Nota: NÃO tem updated_at (evento é imutável append-only; só `processed_at`
-- muda quando o worker faz o claim).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  tipo text NOT NULL,                                           -- emitida|vencendo|vencida|paga|nfse_emitida|nfse_erro|cancelada
  origem text,                                                  -- 'batch'|'dispatch-worker'|'c6-webhook'|'notaas-webhook'|'cron'|'admin'
  payload jsonb DEFAULT '{}'::jsonb,
  processed_at timestamptz,                                     -- claim do dispatch-worker; NULL = pendente na fila
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_events_org ON public.billing_events (organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_org_invoice_tipo
  ON public.billing_events (organization_id, invoice_id, tipo);
-- Índice parcial = a fila leve (só eventos pendentes). Sem pgmq (blueprint §7).
CREATE INDEX IF NOT EXISTS idx_billing_events_pending
  ON public.billing_events (processed_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
-- Leitura: qualquer membro da org (auditoria/trilha visível no painel).
CREATE POLICY "org members can view billing_events" ON public.billing_events
  FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
-- Escrita de gestão (o worker escreve por service_role, que bypassa RLS; estas
-- policies cobrem ações manuais de admin/manager pela UI, ex.: reprocessar).
CREATE POLICY "org admin/manager can insert billing_events" ON public.billing_events
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can update billing_events" ON public.billing_events
  FOR UPDATE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "org admin/manager can delete billing_events" ON public.billing_events
  FOR DELETE USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
CREATE POLICY "super admin manage billing_events" ON public.billing_events
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));


-- ============================================================================
-- 8. GRANTs — mesmo padrão do core (migrations_salao/).
-- ----------------------------------------------------------------------------
-- authenticated: acesso mediado por RLS (as policies acima decidem o que enxerga
-- por org/papel). service_role: BYPASSRLS (Edge Functions do fluxo de dinheiro).
-- Diferente de billing_credentials (A4), estas tabelas SÃO visíveis ao client
-- sob RLS — o front lista pagadores/faturas/eventos da própria org.
-- ============================================================================
GRANT ALL ON public.payers               TO authenticated, service_role;
GRANT ALL ON public.billing_groups       TO authenticated, service_role;
GRANT ALL ON public.contracts            TO authenticated, service_role;
GRANT ALL ON public.billing_agreements   TO authenticated, service_role;
GRANT ALL ON public.invoices             TO authenticated, service_role;
GRANT ALL ON public.invoice_items        TO authenticated, service_role;
GRANT ALL ON public.billing_events       TO authenticated, service_role;
