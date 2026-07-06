// salao-buy-pacote — Onda 2 (port do comprarPacote do CBA)
// Público (verify_jwt=false). Registra a compra de um pacote pré-pago.
// Caminho A (fiel ao CBA): grava pacote_clientes status='ativo' (salão confirma
// pagamento depois). Caminho B (Cakto checkout) = enhancement futuro via flag.
// Validade: epoch+ms (NÃO new Date(iso)+setDate — bug de TZ, lição MEMORY).
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
    const b = await req.json().catch(() => ({}));

    const slug = String(b?.slug ?? '').trim().slice(0, 120);
    const pacote_id = String(b?.pacote_id ?? '');
    const cliente_nome = String(b?.cliente_nome ?? '').trim().slice(0, 120);
    const cliente_telefone = String(b?.cliente_telefone ?? '').trim().slice(0, 20);
    const cliente_email = String(b?.cliente_email ?? '').trim().slice(0, 160) || null;

    if (!slug || !/^[0-9a-f-]{36}$/i.test(pacote_id)
      || cliente_nome.length < 2 || cliente_telefone.replace(/\D/g, '').length < 8) {
      return json({ error: 'parâmetros inválidos' }, 400);
    }

    const { data: org } = await sb.from('organizations').select('id').eq('slug', slug).maybeSingle();
    if (!org) return json({ error: 'Salão não encontrado' }, 404);

    const { data: pac } = await sb.from('pacotes')
      .select('id, nome, total_sessoes, valor, validade_dias')
      .eq('organization_id', org.id).eq('id', pacote_id).eq('ativo', true).maybeSingle();
    if (!pac) return json({ error: 'Pacote não encontrado ou inativo' }, 422);

    // upsert cliente por telefone
    const { data: existente } = await sb.from('clientes').select('id')
      .eq('organization_id', org.id).eq('telefone', cliente_telefone).maybeSingle();
    let cliente_id = existente?.id;
    if (!cliente_id) {
      const { data: novo, error: cErr } = await sb.from('clientes')
        .insert({ organization_id: org.id, nome: cliente_nome, telefone: cliente_telefone, email: cliente_email, status: 'ativo' })
        .select('id').single();
      if (cErr) return json({ error: 'falha ao registrar cliente: ' + cErr.message }, 500);
      cliente_id = novo.id;
    }

    const dataInicio = new Date().toISOString().slice(0, 10);
    const validade = new Date(Date.now() + (pac.validade_dias ?? 90) * 86400000).toISOString().slice(0, 10);

    const { data: pc, error: pcErr } = await sb.from('pacote_clientes').insert({
      organization_id: org.id,
      pacote_id: pac.id, pacote_nome: pac.nome,
      cliente_id, cliente_nome,
      total_sessoes: pac.total_sessoes, sessoes_usadas: 0,
      valor_pago: pac.valor,
      data_inicio: dataInicio, data_validade: validade,
      status: 'ativo', pagamento_status: 'pendente',
    }).select('id, data_inicio, data_validade').single();
    if (pcErr) return json({ error: 'falha ao registrar pacote: ' + pcErr.message }, 500);

    return json({ ok: true, id: pc.id, data_inicio: pc.data_inicio, data_validade: pc.data_validade });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
