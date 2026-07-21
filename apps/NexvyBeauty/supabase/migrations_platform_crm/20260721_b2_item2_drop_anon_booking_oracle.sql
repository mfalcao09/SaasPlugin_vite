-- B2 ITEM 2 — Fecha o ORÁCULO de user_id (auditoria GO LIVE 2026-07-21).
-- APLICADA via apply_migration 2026-07-21. A policy anon USING true em
-- platform_crm_seller_booking expunha user_id, armando o exploit do
-- accept_invitation e a enumeração de roles. Verificado: row_count=0 e nenhum
-- caller anon lê a tabela direto (vitrine/agendamento via edge service-role).
-- super_admin permanece via platform_crm_seller_booking_super_admin_only.
DROP POLICY IF EXISTS "platform_crm_seller_booking_public_read"
  ON public.platform_crm_seller_booking;
