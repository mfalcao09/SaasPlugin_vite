// deno test — contrato da Fase 3 (seed silencioso nexvy-saas + FK operation_id).
//   cd apps/NexvyBeauty && deno test --frozen --allow-read=supabase/migrations_platform_crm \
//     supabase/migrations_platform_crm/20260823_group_operations_nexvy_saas.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const MIGRATION_URL = new URL(
  './20260823_group_operations_nexvy_saas.sql',
  import.meta.url,
);

const CNPJ_DIGITS = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;

const sql = await Deno.readTextFile(MIGRATION_URL);

Deno.test('Fase 3: cria group_operations idempotente com slug nexvy-saas e document nullable', () => {
  assertEquals(/CREATE TABLE IF NOT EXISTS\s+public\.group_operations/i.test(sql), true);
  assertEquals(/slug\s+text\s+NOT NULL/i.test(sql), true);
  assertEquals(/UNIQUE\s*\(\s*slug\s*\)/i.test(sql), true);
  assertEquals(/operation_type/i.test(sql), true);
  assertEquals(/'saas'/i.test(sql) && /'real_estate'/i.test(sql) && /'franchise'/i.test(sql), true);
  assertEquals(/\bdocument\s+text\b/i.test(sql), true);
  assertEquals(/document\s+text\s+NOT NULL/i.test(sql), false);
  assertEquals(/INSERT INTO\s+public\.group_operations/i.test(sql), true);
  assertEquals(/'nexvy-saas'/i.test(sql), true);
  assertEquals(/ON CONFLICT\s*\(\s*slug\s*\)\s+DO NOTHING/i.test(sql), true);
});

Deno.test('Fase 3: FK opcional operation_id em platform_crm_products + backfill', () => {
  assertEquals(/ADD COLUMN IF NOT EXISTS\s+operation_id/i.test(sql), true);
  assertEquals(/REFERENCES\s+public\.group_operations\s*\(\s*id\s*\)/i.test(sql), true);
  assertEquals(
    /UPDATE\s+public\.platform_crm_products[\s\S]*operation_id[\s\S]*nexvy-saas/i.test(sql),
    true,
  );
  assertEquals(/WHERE\s+operation_id\s+IS NULL/i.test(sql), true);
  assertEquals(/operation_id\s+uuid\s+NOT NULL/i.test(sql), false);
});

Deno.test('Fase 3: RLS super_admin-only no padrão das irmãs', () => {
  assertEquals(/ENABLE ROW LEVEL SECURITY/i.test(sql), true);
  assertEquals(/group_operations_super_admin_only/i.test(sql), true);
  assertEquals(/has_role\(\s*auth\.uid\(\)\s*,\s*'super_admin'::app_role\s*\)/i.test(sql), true);
  assertEquals(/FOR ALL TO authenticated/i.test(sql), true);
  assertEquals(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.group_operations TO authenticated/i.test(sql), true);
  assertEquals(/GRANT ALL ON public\.group_operations TO service_role/i.test(sql), true);
});

Deno.test('Fase 3: seed não materializa dígitos de CNPJ', () => {
  assertEquals(CNPJ_DIGITS.test(sql), false);
  assertEquals(sql.includes('64930755'), false);
  assertEquals(sql.includes('64.930.755'), false);
});
