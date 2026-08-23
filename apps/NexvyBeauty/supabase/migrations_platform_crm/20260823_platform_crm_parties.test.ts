// deno test — contrato da Fase 2 (party: um contato, N produtos SaaS).
//   cd apps/NexvyBeauty && deno test --frozen --allow-read=supabase/migrations_platform_crm \
//     supabase/migrations_platform_crm/20260823_platform_crm_parties.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const MIGRATION_URL = new URL('./20260823_platform_crm_parties.sql', import.meta.url);
const SEED_SISTER = '20260823_group_operations_nexvy_saas.sql';
const CNPJ_DIGITS = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;

const sql = await Deno.readTextFile(MIGRATION_URL);

Deno.test('Fase 2: cria platform_crm_parties idempotente', () => {
  assertEquals(/CREATE TABLE IF NOT EXISTS\s+public\.platform_crm_parties/i.test(sql), true);
  assertEquals(/display_name\s+text\s+NOT NULL/i.test(sql), true);
});

Deno.test('Fase 2: junction party×produto com product_id nullable e unique parcial', () => {
  assertEquals(/CREATE TABLE IF NOT EXISTS\s+public\.platform_crm_party_products/i.test(sql), true);
  assertEquals(/\bproduct_id\s+uuid\b/i.test(sql), true);
  assertEquals(/product_id\s+uuid\s+NOT NULL/i.test(sql), false);
  assertEquals(/WHERE\s+product_id\s+IS NOT NULL/i.test(sql), true);
  assertEquals(/REFERENCES\s+public\.platform_crm_products\s*\(\s*id\s*\)/i.test(sql), true);
  assertEquals(/REFERENCES\s+public\.platform_crm_parties\s*\(\s*id\s*\)/i.test(sql), true);
});

Deno.test('Fase 2: party_id opcional em platform_crm_leads — sem NOT NULL', () => {
  assertEquals(/ADD COLUMN IF NOT EXISTS\s+party_id\s+uuid/i.test(sql), true);
  assertEquals(/REFERENCES\s+public\.platform_crm_parties\s*\(\s*id\s*\)/i.test(sql), true);
  assertEquals(/ADD COLUMN IF NOT EXISTS\s+party_id\s+uuid\s+NOT NULL/i.test(sql), false);
});

Deno.test('Fase 2: RLS super_admin-only no padrão das irmãs (ambas as tabelas)', () => {
  assertEquals(/ENABLE ROW LEVEL SECURITY/i.test(sql), true);
  assertEquals(/platform_crm_parties_super_admin_only/i.test(sql), true);
  assertEquals(/platform_crm_party_products_super_admin_only/i.test(sql), true);
  assertEquals(/has_role\(\s*auth\.uid\(\)\s*,\s*'super_admin'::app_role\s*\)/i.test(sql), true);
  assertEquals(/FOR ALL TO authenticated/i.test(sql), true);
  assertEquals(
    /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.platform_crm_parties TO authenticated/i.test(sql),
    true,
  );
  assertEquals(
    /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.platform_crm_party_products TO authenticated/i.test(sql),
    true,
  );
  assertEquals(/GRANT ALL ON public\.platform_crm_parties TO service_role/i.test(sql), true);
  assertEquals(/GRANT ALL ON public\.platform_crm_party_products TO service_role/i.test(sql), true);
});

Deno.test('Fase 2: migration nova — não mistura seed CNPJ nem lente de operação', () => {
  assertEquals(sql.includes(SEED_SISTER), false);
  assertEquals(/group_operations/i.test(sql), false);
  assertEquals(/operation_id/i.test(sql), false);
  assertEquals(CNPJ_DIGITS.test(sql), false);
  assertEquals(sql.includes('64930755'), false);
});
