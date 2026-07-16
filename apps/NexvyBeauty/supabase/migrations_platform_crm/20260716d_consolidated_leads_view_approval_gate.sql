-- ════════════════════════════════════════════════════════════════════════════
-- Prospecção Ativa · Portão de Aprovação (Prospecção → Base consolidada)
-- PASSO 2/2 — FLIP DA VIEW: a Base consolidada passa a mostrar SÓ bases aprovadas.
--
-- ⚠️ NÃO APLICAR AGORA. Passo COORDENADO (controladora), executado DEPOIS do merge:
--    aplicar esta migration + deploy do front (VPS) juntos. Se aplicar antes da UI
--    de aprovar estar em produção, a Base consolidada ESVAZIA (clean slate: todas as
--    extrações nascem NÃO-aprovadas) e não há como aprovar pela tela ainda.
--
-- Projeto: fzhlbwhdejumkyqosuvq (PG 17.6).
--
-- O QUE MUDA vs. 20260714_consolidated_leads_view.sql (fonte anterior):
--   ÚNICA diferença → um filtro de aprovação por EXTRAÇÃO, aplicado ANTES das CTEs
--   agg/winner (nas duas). Só entram leads cuja extração-fonte tem approved_at
--   preenchido. Consequência: um @handle aparece na base se ≥1 extração-fonte dele
--   foi aprovada; o merge/COALESCE/origin_count passam a considerar só linhas de
--   extrações aprovadas. TODO o resto (dedup, merge, GRANT, security_invoker) é
--   IDÊNTICO ao anterior.
-- ════════════════════════════════════════════════════════════════════════════

-- Índice funcional que sustenta o GROUP BY / DISTINCT ON por (product_id, lower(handle)).
CREATE INDEX IF NOT EXISTS idx_pcel_product_lower_handle
  ON public.platform_crm_extracted_leads (product_id, lower(handle));

-- View consolidada. `security_invoker=on` (PG15+) → a RLS super_admin_only da
-- tabela base vale para o CALLER (senão a view vazaria para não-super-admin).
CREATE OR REPLACE VIEW public.platform_crm_consolidated_leads
WITH (security_invoker = on) AS
WITH agg AS (
  SELECT
    product_id,
    lower(handle)                                                  AS handle_key,
    count(*)                                                        AS origin_count,
    array_agg(DISTINCT extraction_id)                              AS extraction_ids,
    bool_or(excluded_at IS NOT NULL)                               AS any_excluded,
    bool_or(coalesce(qualified,false))                             AS any_qualified,
    bool_or(coalesce(is_seed,false))                               AS any_seed,
    bool_or(coalesce(is_verified,false))                           AS any_verified,
    bool_or(coalesce(is_infoproduto,false))                        AS any_infoproduto,
    -- "campo de quem tiver": qualquer não-nulo, determinístico (min).
    min(telefone)      FILTER (WHERE telefone      IS NOT NULL AND telefone      <> '') AS any_telefone,
    min(whatsapp_link) FILTER (WHERE whatsapp_link IS NOT NULL AND whatsapp_link <> '') AS any_whatsapp,
    min(email)         FILTER (WHERE email         IS NOT NULL AND email         <> '') AS any_email,
    min(categoria)     FILTER (WHERE categoria     IS NOT NULL AND categoria     <> '') AS any_categoria,
    min(website)       FILTER (WHERE website       IS NOT NULL AND website       <> '') AS any_website,
    min(name)          FILTER (WHERE name          IS NOT NULL AND name          <> '') AS any_name,
    max(seguidores)    FILTER (WHERE seguidores    IS NOT NULL)                          AS max_seguidores
  FROM public.platform_crm_extracted_leads
  WHERE handle IS NOT NULL AND handle <> ''
    -- PORTÃO: só linhas de extrações APROVADAS entram na base consolidada.
    AND extraction_id IN (SELECT id FROM public.platform_crm_lead_extractions WHERE approved_at IS NOT NULL)
  GROUP BY product_id, lower(handle)
),
winner AS (
  -- A linha "vencedora" (identidade/segment/id estável por handle).
  SELECT DISTINCT ON (product_id, lower(handle))
    id, product_id, handle, name, primeiro_nome, seguidores, seguindo, posts,
    telefone, whatsapp_link, email, instagram_url, website, categoria, bio,
    segment, qualified, is_seed, is_infoproduto, is_verified, is_private,
    geo_country, bio_lang, filter_verdicts, excluded_at, created_at
  FROM public.platform_crm_extracted_leads
  WHERE handle IS NOT NULL AND handle <> ''
    -- PORTÃO: idem — o vencedor sai só de extrações aprovadas.
    AND extraction_id IN (SELECT id FROM public.platform_crm_lead_extractions WHERE approved_at IS NOT NULL)
  ORDER BY
    product_id, lower(handle),
    (telefone IS NOT NULL AND telefone <> '') DESC,      -- 1) tem telefone vence (enrich + override manual)
    coalesce(qualified,false) DESC,                      -- 2) override humano promove qualified
    CASE segment                                         -- 3) classificação mais avançada
      WHEN 'salao_cliente'              THEN 5
      WHEN 'acionamento_via_instagram'  THEN 4
      WHEN 'afiliado_infoproduto'       THEN 3
      WHEN 'revisao'                    THEN 2
      WHEN 'descarte'                   THEN 1 ELSE 0 END DESC,
    ( (telefone IS NOT NULL)::int + (email IS NOT NULL)::int
    + (name IS NOT NULL)::int + (categoria IS NOT NULL)::int
    + (website IS NOT NULL)::int + (bio IS NOT NULL)::int ) DESC,   -- 4) completude
    created_at DESC                                      -- 5) desempate por recência
)
SELECT
  w.id,                                       -- id da linha vencedora = chave estável do handle
  w.product_id,
  lower(w.handle)                        AS handle_key,   -- chave de dedup / ações globais
  w.handle,
  COALESCE(w.name,          a.any_name)       AS name,
  w.primeiro_nome,
  COALESCE(w.seguidores,    a.max_seguidores) AS seguidores,
  w.seguindo, w.posts,
  COALESCE(w.telefone,      a.any_telefone)   AS telefone,      -- telefone de QUEM TIVER
  COALESCE(w.whatsapp_link, a.any_whatsapp)   AS whatsapp_link,
  COALESCE(w.email,         a.any_email)      AS email,
  w.instagram_url,
  COALESCE(w.website,       a.any_website)    AS website,
  COALESCE(w.categoria,     a.any_categoria)  AS categoria,
  w.bio,
  w.segment,                                                   -- segmento do vencedor (preserva acionamento_via_instagram)
  COALESCE(w.qualified,      a.any_qualified, false)     AS qualified,
  COALESCE(w.is_seed,        a.any_seed,      false)     AS is_seed,       -- semente se QUALQUER origem marcou
  COALESCE(w.is_infoproduto, a.any_infoproduto, false)   AS is_infoproduto,
  COALESCE(w.is_verified,    a.any_verified,  false)     AS is_verified,
  w.is_private, w.geo_country, w.bio_lang, w.filter_verdicts,
  a.any_excluded                          AS is_excluded,   -- lixeira: excluído em QUALQUER origem
  w.created_at,
  a.origin_count,                          -- em quantas linhas/extrações aparece
  a.extraction_ids                         -- todas as origens (filtro por extração)
FROM winner w
JOIN agg a ON a.product_id = w.product_id AND a.handle_key = lower(w.handle);

COMMENT ON VIEW public.platform_crm_consolidated_leads IS
  'Prospecção Ativa · Base consolidada. 1 linha por (product_id, lower(handle)) com merge por COALESCE (nada se descarta). PORTÃO DE APROVAÇÃO: só entram leads de extrações com approved_at preenchido (aprovadas na aba Buscas). security_invoker=on herda a RLS super_admin_only da tabela base. Read-only; ações globais gravam direto em platform_crm_extracted_leads por (product_id, handle).';

-- GRANT obrigatório: o PostgREST acessa via role `authenticated`. Sem isto,
-- `.from('platform_crm_consolidated_leads')` retorna 42501 (permission denied)
-- MESMO para super_admin. `security_invoker=on` cuida da RLS, NÃO do privilégio de
-- tabela. (CREATE OR REPLACE VIEW pode dropar grants — reafirmar sempre.)
GRANT SELECT ON public.platform_crm_consolidated_leads TO authenticated;
