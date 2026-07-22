-- GATE 1 — vazamento de faturamento por seller para ANÔNIMO.
-- Aplicada em prod como `b7_fecha_vazamento_vendas_por_seller_anon`.
-- SUCEDE: 20260706_sellers_e_relatorio_vendas.sql (onde a view foi criada).
--
-- `platform_vendas_por_seller` agrega cakto_orders (receita, ticket médio, nome do
-- afiliado, data da primeira/última venda) e era SELECT-ável por `anon`. Como a chave
-- anon vive dentro do bundle JS público, qualquer pessoa na internet conseguia ler o
-- faturamento da plataforma.
--
-- PROVA ANTES (curl sem login, só com a apikey anon):
--   GET /rest/v1/platform_vendas_por_seller?select=*
--   [{"vendas":2,"receita_total":100.99,"ticket_medio":50.50,
--     "primeira_venda":"2026-07-11T09:35:21Z","ultima_venda":"2026-07-21T01:39:16Z"}]
--
-- PROVA DEPOIS (mesma requisição):
--   {"code":"42501","message":"permission denied for view platform_vendas_por_seller"}
--
-- Hoje são pedidos de teste. No dia em que o anúncio rodar, publica a receita real
-- e a comissão por afiliado. Por isso é bloqueador de GATE 1, não dívida técnica.
--
-- CAUSA: view sem `security_invoker` executa com os privilégios do dono (postgres),
-- ignorando a RLS de quem consulta — o SECURITY DEFINER implícito de views.
--
-- FIX: security_invoker = on, e a RLS das tabelas-base passa a valer para o chamador.
-- Seguro porque as bases já têm a policy certa ("Super admins view platform cakto
-- orders", "affiliate reads own links", "affiliate reads self"): super admin continua
-- lendo tudo, afiliado enxerga só o próprio. E a view não tem NENHUM consumidor no
-- front nem em edge function (grep vazio) — risco de regressão de UI é zero.
--
-- NOTA sobre a irmã `public_plans`: o advisor também a marca como security_definer_view,
-- mas ali é INTENCIONAL — ela expõe só `is_active AND is_public` de platform_plans
-- (a página de preços), e o definer é justamente o que permite ler sem conceder acesso
-- à tabela base. Mantida como está.
alter view public.platform_vendas_por_seller set (security_invoker = on);

revoke all on public.platform_vendas_por_seller from public, anon;
grant select on public.platform_vendas_por_seller to authenticated, service_role;

comment on view public.platform_vendas_por_seller is
  'Receita por seller/afiliado. security_invoker: herda a RLS de cakto_orders. NUNCA conceder a anon.';
