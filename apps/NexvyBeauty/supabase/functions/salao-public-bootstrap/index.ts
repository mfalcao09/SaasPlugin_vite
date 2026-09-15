// salao-public-bootstrap — Onda 2 (port de getPublicSalao do CBA)
// Público (verify_jwt=false). Resolve o salão por slug e devolve serviços,
// profissionais e pacotes ativos pra montar o wizard de agendamento.
// service_role só aqui dentro (nunca no bundle). Re-home: salao->organizations,
// preco_base aliasado como `valor`.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const slug = String(body?.slug ?? '').trim().slice(0, 120);
    if (!slug) return json({ error: 'slug obrigatório' }, 400);

    // colunas seguras pra público (NUNCA settings/cnpj/cakto_*/plan_*)
    const { data: org } = await sb
      .from('organizations')
      .select('id, name, logo_url, phone, address, slug')
      .eq('slug', slug)
      .maybeSingle();
    if (!org) return json({ error: 'Espaço não encontrado' }, 404);

    const [servicos, profissionais, pacotes, crossSell, produtos] = await Promise.all([
      sb.from('servico_catalogo')
        .select('id, nome, categoria, duracao_minutos, valor:preco_base, tipo, preco_promocional, imagem_url, combo_servico_ids, descricao')
        .eq('organization_id', org.id).eq('ativo', true).order('nome'),
      sb.from('profissionais')
        .select('id, nome, especialidades, hora_inicio, hora_fim, intervalo_inicio, intervalo_fim')
        .eq('organization_id', org.id).eq('ativo', true).order('nome'),
      sb.from('pacotes')
        .select('id, nome, descricao, total_sessoes, valor, validade_dias')
        .eq('organization_id', org.id).eq('ativo', true).order('valor'),
      // Regras de cross-sell do tenant ("quem faz X também leva Y"). Configuração
      // por salão — não heurística de nome de categoria, que varia entre tenants.
      sb.from('servico_cross_sell')
        .select('servico_origem_id, servico_sugerido_id, prioridade')
        .eq('organization_id', org.id).eq('ativo', true)
        .order('prioridade', { ascending: false }),
      // Produtos de revenda (shampoo, óleo...). Vendidos junto da comanda, mas
      // NÃO ocupam agenda. Preço e estoque vivem em settings (ProdutosRevenda.tsx).
      sb.from('products')
        .select('id, name, category, settings, product_image_url')
        .eq('organization_id', org.id).eq('tipo', 'produto').eq('status', 'published')
        .order('name'),
    ]);

    // Só oferece o que tem estoque — prometer produto esgotado queima a loja.
    const produtosDisponiveis = (produtos.data ?? [])
      .map((p: any) => ({
        id: p.id,
        nome: p.name,
        categoria: p.category ?? null,
        preco: Number(p.settings?.preco ?? 0),
        estoque: Number(p.settings?.estoque ?? 0),
        imagem_url: p.product_image_url ?? null,
      }))
      .filter((p: { estoque: number; preco: number }) => p.estoque > 0 && p.preco > 0);

    return json({
      org,
      servicos: servicos.data ?? [],
      profissionais: profissionais.data ?? [],
      pacotes: pacotes.data ?? [],
      cross_sell: crossSell.data ?? [],
      produtos: produtosDisponiveis,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
