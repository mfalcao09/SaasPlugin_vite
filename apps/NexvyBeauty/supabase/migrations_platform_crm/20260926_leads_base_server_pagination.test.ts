import { assert } from "jsr:@std/assert@1";

const sql = await Deno.readTextFile(
  new URL("./20260926_leads_base_server_pagination.sql", import.meta.url),
);

Deno.test("Base de Leads filtra e pagina no banco", () => {
  assert(sql.includes("FUNCTION public.platform_crm_leads_base_page"));
  assert(sql.includes("LIMIT least(greatest(coalesce(p_limit, 25), 1), 100)"));
  assert(sql.includes("OFFSET greatest(coalesce(p_offset, 0), 0)"));
  assert(sql.includes("'filtered_total', (SELECT count(*) FROM filtered)"));
  assert(sql.includes("p_filters->'triagem' ? 'principal'"));
  assert(sql.includes("p_filters->'derived_stage'"));
});

Deno.test("consulta paginada não interpola filtros e RPC fica restrita", () => {
  assert(!/EXECUTE\s+format|\|\|\s*p_filters/i.test(sql));
  assert(sql.includes("SECURITY INVOKER"));
  assert(sql.includes("FROM PUBLIC, anon, authenticated"));
  assert(sql.includes("TO service_role"));
});
