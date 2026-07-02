-- platform_crm_seller_form_config — config do Formulário de Vendedores do CRM
-- de PLATAFORMA (super_admin).
--
-- Porte 1:1 da tabela `seller_lead_form_config` do CRM Vendus (1 row JSON com
-- os campos do formulário), adaptada ao mundo plataforma: SEM organization_id
-- (dado global da plataforma) → singleton via coluna constante UNIQUE
-- (upsert onConflict singleton, espelhando o onConflict organization_id do
-- original). RLS = super_admin-only, mesmo padrão das irmãs platform_crm_*.
--
-- Substitui o armazenamento derivado provisório em platform_crm_custom_fields
-- (prefixo sellerform_) — ver header de usePlatformCrmSellerFormConfig.ts.

create table if not exists public.platform_crm_seller_form_config (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_crm_seller_form_config_singleton unique (singleton),
  constraint platform_crm_seller_form_config_singleton_true check (singleton)
);

alter table public.platform_crm_seller_form_config enable row level security;

drop policy if exists platform_crm_seller_form_config_super_admin_only
  on public.platform_crm_seller_form_config;
create policy platform_crm_seller_form_config_super_admin_only
  on public.platform_crm_seller_form_config
  for all
  using (has_role(auth.uid(), 'super_admin'::app_role))
  with check (has_role(auth.uid(), 'super_admin'::app_role));
