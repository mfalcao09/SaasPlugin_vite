-- ─────────────────────────────────────────────────────────────────────────────
-- 20260711_platform_settings_meta_commerce_catalog.sql — catálogo Meta Commerce
--
-- CONTEXTO: go-live "Meta Commerce auto-sync". A edge platform-commerce-sync
-- empurra os planos públicos (full sync idempotente) para o Product Catalog do
-- Meta, para os cards nativos de WhatsApp/Instagram refletirem a gestão. Ela lê
-- o catalog_id e a imagem default a partir de platform_settings.
--
-- ESPELHO: este arquivo versiona o DDL já APLICADO no banco remoto (projeto
-- fzhlbwhdejumkyqosuvq) via MCP. Não roda contra o banco de novo — existe só
-- para evitar drift (a definição da tabela vive no banco; as migrations locais
-- registram as alterações). Idempotente: re-run é seguro.
--
--   meta_commerce_catalog_id        — one-time; criado no Commerce Manager.
--   meta_commerce_default_image_url — imagem de fallback dos itens do catálogo.
--
-- O catalog_id de produção ('975221148843266') é semeado abaixo. O token do
-- catálogo NÃO vive aqui: está isolado no secret META_COMMERCE_TOKEN (vault),
-- consumido server-side pela edge (regra §11.1 — key nunca no client).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.platform_settings
  add column if not exists meta_commerce_catalog_id text,
  add column if not exists meta_commerce_default_image_url text;

comment on column public.platform_settings.meta_commerce_catalog_id is 'Meta Commerce Product Catalog ID (one-time, criado no Commerce Manager). Consumido por platform-commerce-sync.';

update public.platform_settings
  set meta_commerce_catalog_id = '975221148843266',
      updated_at = now()
  where meta_commerce_catalog_id is distinct from '975221148843266';
