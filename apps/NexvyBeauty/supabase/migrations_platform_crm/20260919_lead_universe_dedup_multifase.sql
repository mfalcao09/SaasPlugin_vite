-- 20260919_lead_universe_dedup_multifase.sql
--
-- PROBLEMA (verificado no código em 2026-09-19)
--   `leads-import-profiles` (e irmãos) deduplicam apenas:
--     (a) por handle DENTRO do batch;
--     (b) contra platform_crm_lead_excluded (lixeira, por handle);
--     (c) contra platform_crm_lead_optout (handle + telefone).
--   NAO cruzam contra leads que já avançaram no funil (derived_stage =
--   preselected / contatado / remarketing / ...). Consequência: um lead já
--   disparado, que saiu da caixa "Lead no DB", é RE-INJETADO como novo na
--   próxima extração — furo de duplicidade.
--
-- SOLUCAO
--   View única `platform_crm_lead_universe` = todo contato já visto, em
--   QUALQUER fase, chaveado por telefone_digits E handle. Os imports passam a
--   consultar `platform_crm_lead_seen()` antes de inserir.
--
-- Somente leitura: não altera dados, não dropa nada.

CREATE OR REPLACE VIEW public.platform_crm_lead_universe AS
-- 1) Leads que entraram no funil, com a fase atual (contatado, remarketing, ...)
SELECT
  l.product_id,
  nullif(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), '') AS telefone_digits,
  NULL::text                                                       AS handle,
  coalesce(s.derived_stage, 'db')                                  AS fase,
  'leads'::text                                                    AS fonte,
  l.id                                                             AS ref_id,
  NULL::uuid                                                       AS extraction_id
FROM public.platform_crm_leads l
LEFT JOIN public.platform_crm_lead_state s
       ON s.lead_id = l.id AND s.product_id = l.product_id

UNION ALL

-- 2) Staging de extração (a caixa "Lead no DB").
--    extraction_id permite ao import IGNORAR a própria extração corrente,
--    preservando a idempotência de reenvio/paginação do mesmo lote.
SELECT
  e.product_id,
  nullif(regexp_replace(coalesce(e.telefone, ''), '\D', '', 'g'), ''),
  nullif(lower(regexp_replace(coalesce(e.handle, ''), '^@', '')), ''),
  'staging'::text,
  'extracted_leads'::text,
  e.id,
  e.extraction_id
FROM public.platform_crm_extracted_leads e

UNION ALL

-- 3) Opt-out (soft/hard) — nunca reentra
SELECT
  o.product_id,
  nullif(o.telefone_digits, ''),
  nullif(lower(regexp_replace(coalesce(o.handle, ''), '^@', '')), ''),
  ('opt_out:' || coalesce(o.kind, 'hard'))::text,
  'lead_optout'::text,
  o.id,
  NULL::uuid
FROM public.platform_crm_lead_optout o
WHERE coalesce(o.active, true)

UNION ALL

-- 4) Lixeira / removidos confirmados — tombstone anti-reinjeção
SELECT
  x.product_id,
  NULL::text,
  nullif(lower(regexp_replace(coalesce(x.handle, ''), '^@', '')), ''),
  'excluido'::text,
  'lead_excluded'::text,
  x.id,
  NULL::uuid
FROM public.platform_crm_lead_excluded x;

COMMENT ON VIEW public.platform_crm_lead_universe IS
  'Todo contato já visto pelo produto, em QUALQUER fase (funil, staging, opt-out, lixeira). '
  'Chaves de dedup: telefone_digits e handle. Usada pelos imports para nao reinjetar duplicados.';

-- ---------------------------------------------------------------------------
-- Helper: "este contato já existe em alguma fase?"
-- 0 linhas  => net-new, pode injetar.
-- 1+ linhas => já visto; a fase/fonte dizem onde (contatado, remarketing, ...).
-- Telefone é a chave forte (cross-fonte); handle é a secundária.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_crm_lead_seen(
  p_product_id          uuid,
  p_phone               text DEFAULT NULL,
  p_handle              text DEFAULT NULL,
  p_exclude_extraction  uuid DEFAULT NULL   -- ignora a extração corrente (idempotência)
)
RETURNS TABLE (fase text, fonte text, match_por text)
LANGUAGE sql
STABLE
AS $$
  WITH alvo AS (
    SELECT
      nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '')    AS tel,
      nullif(lower(regexp_replace(coalesce(p_handle, ''), '^@', '')), '') AS hdl
  )
  SELECT u.fase, u.fonte,
         CASE WHEN a.tel IS NOT NULL AND u.telefone_digits = a.tel THEN 'telefone'
              ELSE 'handle' END AS match_por
  FROM public.platform_crm_lead_universe u, alvo a
  WHERE u.product_id = p_product_id
    AND (p_exclude_extraction IS NULL
         OR u.extraction_id IS NULL
         OR u.extraction_id <> p_exclude_extraction)
    AND (
      (a.tel IS NOT NULL AND u.telefone_digits = a.tel)
      OR
      (a.hdl IS NOT NULL AND u.handle = a.hdl)
    );
$$;

COMMENT ON FUNCTION public.platform_crm_lead_seen(uuid, text, text, uuid) IS
  'Fases/fontes em que o contato já aparece. Vazio = net-new, pode injetar.';

-- Índices de apoio (o dedup roda por telefone e por handle em todo import)
CREATE INDEX IF NOT EXISTS idx_pcrm_extracted_leads_tel_digits
  ON public.platform_crm_extracted_leads
     (product_id, (regexp_replace(coalesce(telefone, ''), '\D', '', 'g')));

CREATE INDEX IF NOT EXISTS idx_pcrm_extracted_leads_handle_lower
  ON public.platform_crm_extracted_leads
     (product_id, (lower(regexp_replace(coalesce(handle, ''), '^@', ''))));

CREATE INDEX IF NOT EXISTS idx_pcrm_leads_phone_digits
  ON public.platform_crm_leads
     (product_id, (regexp_replace(coalesce(phone, ''), '\D', '', 'g')));
