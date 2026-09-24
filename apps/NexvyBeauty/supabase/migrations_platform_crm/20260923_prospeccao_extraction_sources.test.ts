import { assert } from 'jsr:@std/assert@1';

const sql = await Deno.readTextFile(
  new URL('./20260923_prospeccao_extraction_sources.sql', import.meta.url),
);

Deno.test('ingestão aceita Prospectagram sem remover origem Instagram', () => {
  assert(sql.includes('DROP CONSTRAINT IF EXISTS platform_crm_lead_extractions_source_check'));
  assert(sql.includes("CHECK (source IN ('instagram', 'prospectagram', 'video', 'server_api'))"));
});
