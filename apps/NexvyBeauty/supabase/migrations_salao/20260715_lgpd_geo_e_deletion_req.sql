-- ============================================================================
-- ESTEIRA F3 — pedido de exclusão + reuso do geo existente no consent.
--
-- DESCOBERTA (recon): lgpd_consents JÁ tem country/region/city no live — a
-- prova de geolocalização aproximada (resolvida do IP via GeoLite2 LOCAL, sem
-- API 3ª) grava NESSAS colunas. Não criamos geo_city/geo_region (seriam
-- redundantes / drift). ip e user_agent também já existem.
--
-- Este migration:
--   1. Remove geo_city/geo_region caso um passo anterior as tenha criado
--      (idempotente — reverte a redundância; colunas vazias).
--   2. organizations.deletion_requested_at timestamptz NULL — quando a lead
--      clicou "Excluir meus dados". Só trilha de auditoria; NÃO antecipa o wipe
--      (que é o TTL de 72h via demo-reaper).
-- ============================================================================

-- 1) O consent grava geo em lgpd_consents.city/region/country (já existentes).
--    Remove qualquer geo_city/geo_region redundante.
alter table public.lgpd_consents drop column if exists geo_city;
alter table public.lgpd_consents drop column if exists geo_region;

-- 2) Pedido de exclusão (art. 18) — trilha; o wipe efetivo é o TTL 72h.
alter table public.organizations
  add column if not exists deletion_requested_at timestamptz;

comment on column public.organizations.deletion_requested_at is
  'Esteira demo: quando a lead pediu "Excluir meus dados". Só auditoria — NÃO antecipa o wipe (roda no fim das 72h via demo-reaper).';
