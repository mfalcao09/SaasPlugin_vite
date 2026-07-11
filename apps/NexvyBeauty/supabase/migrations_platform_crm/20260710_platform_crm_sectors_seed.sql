-- ─────────────────────────────────────────────────────────────────────────────
-- 20260710_platform_crm_sectors_seed.sql — A1.3 (seed de setores base)
--
-- ENTREGA 3: semeia os setores de atendimento base do CRM da plataforma.
-- Idempotente via ON CONFLICT (name) DO NOTHING — a tabela platform_crm_sectors
-- tem UNIQUE (name) (constraint platform_crm_sectors_name_uniq, namespace global
-- single-tenant). Reaplicar não duplica nem sobrescreve edições manuais.
--
-- Colunas usadas (shape de platform_crm_sectors, 20260702_platform_crm_setores.sql):
--   name (unique), color (hex), icon (lucide-react), description, bot_order, is_active.
-- created_by fica NULL de propósito (seed do sistema, sem autor humano).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.platform_crm_sectors (name, color, icon, description, bot_order, is_active)
VALUES
  ('Vendas',              '#10B981', 'ShoppingCart',   'Atendimento comercial e fechamento de vendas.', 1, true),
  ('Suporte Técnico',     '#3B82F6', 'LifeBuoy',       'Dúvidas técnicas, configuração e uso do produto.', 2, true),
  ('Financeiro',          '#F59E0B', 'DollarSign',     'Cobrança, pagamentos, boletos e notas fiscais.', 3, true),
  -- 3 setores adicionais aprovados pelo Marcelo (2026-07-10, AskUserQuestion):
  ('Sucesso do Cliente',  '#8B5CF6', 'HeartHandshake', 'Onboarding e adoção pós-venda — ativar o tenant que comprou.', 4, true),
  ('Retenção/Churn',      '#EF4444', 'Undo2',          'Reversão de churn, win-back e prevenção de cancelamento.', 5, true),
  ('Parcerias/Afiliados', '#0EA5E9', 'Handshake',      'Gestão de afiliados e parceiros do grupo.', 6, true)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMO ADICIONAR MAIS SETORES (Marcelo decide — ex.: Sucesso do Cliente, Retenção):
--   Acrescente linhas ao VALUES acima seguindo bot_order sequencial (4, 5, ...) e
--   uma cor distinta. Ex.:
--     ('Sucesso do Cliente', '#8B5CF6', 'HeartHandshake', 'Onboarding e adoção pós-venda.', 4, true),
--     ('Retenção',           '#EF4444', 'Undo2',          'Reversão de churn e win-back.',    5, true)
--   O ON CONFLICT (name) DO NOTHING garante que reaplicar é seguro.
-- ─────────────────────────────────────────────────────────────────────────────
