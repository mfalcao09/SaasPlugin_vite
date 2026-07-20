import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateTenant, resolveOrgId } from "../_shared/tenant-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportBody {
  organization_id: string;
  product_id?: string | null;
  // Array de itens já parseados no frontend (CSV/XLSX)
  items: Array<{
    title: string;
    description?: string;
    price?: number | null;
    url?: string;
    thumbnail_url?: string;
    images?: string[];
    tags?: string[];
    attributes?: Record<string, any>;
    external_id?: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth OBRIGATÓRIA (P1): a anon key pública chamava esta edge e inseria em
    // qualquer org via organization_id do body. Agora reautentica SEMPRE e a org
    // do usuário de tenant IGNORA o body (só service_role/super_admin operam em
    // org arbitrária).
    const auth = await authenticateTenant(req, supabase, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;

    const body = (await req.json()) as ImportBody;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return new Response(JSON.stringify({ error: "items required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const organizationId = resolveOrgId(auth, body.organization_id);
    if (!organizationId) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = body.items.slice(0, 1000).map((it) => ({
      organization_id: organizationId,
      product_id: body.product_id ?? null,
      title: it.title,
      description: it.description ?? null,
      price: it.price ?? null,
      currency: "BRL",
      url: it.url ?? null,
      thumbnail_url: it.thumbnail_url ?? null,
      images: it.images ?? [],
      tags: it.tags ?? [],
      attributes: it.attributes ?? {},
      external_id: it.external_id ?? null,
      source_type: "csv",
    }));

    const { data, error } = await supabase
      .from("product_catalog_items")
      .insert(rows)
      .select("id");

    if (error) {
      console.error("[catalog-import-csv] error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, inserted: data?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[catalog-import-csv] exception:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
