-- ============================================================================
-- ALTER ADITIVA em public.invoices — coluna notaas_batch_id (Entregável C1).
--
-- A emissão em LOTE (POST /api/v1/emitir/batch) retorna um `batchId` por LOTE
-- (report §18/§95: 202 {batchId}), não um invoiceId por item — o invoiceId de
-- cada nota chega DEPOIS, assíncrono, pelo webhook C2. Precisamos guardar o
-- `batchId` na fatura para: (a) rastrear a qual lote a nota pertence; (b) o gate
-- de idempotência "não reenvia sem consultar status por referencia" (notaas-emit
-- reconhece "já submetida" quando notaas_batch_id != null, mesmo antes do
-- notaas_invoice_id chegar pelo webhook).
--
-- ISOLAMENTO (hard fork §0 do blueprint): invoices é tabela do DOMÍNIO DE
-- COBRANÇA (criada em migrations_cobranca/20260706101000_billing_model.sql:271),
-- NÃO do core do Beauty. ALTER da própria tabela de cobrança é PERMITIDO (a regra
-- proíbe ALTER/DROP de tabela do CORE — esta não é). Os demais campos notaas_*
-- (notaas_invoice_id, notaas_ch_nfse, notaas_numero, nfse_status) já nasceram no
-- billing_model.sql:298-302; esta migration só ACRESCENTA o batch_id que faltava.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS — re-rodar a esteira é no-op. Sem DROP,
-- sem backfill (coluna nullable; faturas antigas ficam com NULL, que o núcleo
-- trata como "sem lote" — reconsulta status normalmente).
--
-- SEM impacto em RLS/GRANTs: a policy/grant de invoices (billing_model.sql:329-349,
-- 470) cobre a tabela inteira; adicionar coluna nullable não muda o perímetro.
-- O trigger de imutabilidade fiscal C3 (20260706103000) barra edição de dados
-- FISCAIS em estado fiscal; notaas_batch_id é gravado no estado 'emitindo'
-- (pré-fiscal, editável) — coerente com o guard (fiscal_imutabilidade.sql:30).
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS notaas_batch_id text;

COMMENT ON COLUMN public.invoices.notaas_batch_id IS
  'batchId do POST /api/v1/emitir/batch do NotaAS (C1). Lote ao qual a NFS-e pertence; o notaas_invoice_id por fatura chega depois pelo webhook C2. Usado no gate de idempotencia (nao reenviar sem consultar status).';
