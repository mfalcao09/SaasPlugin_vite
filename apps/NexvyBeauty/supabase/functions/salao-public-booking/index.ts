// salao-public-booking — Onda 2 (port do createPublicAgendamento do CBA)
// Público (verify_jwt=false). Re-valida conflito server-side, faz upsert do
// cliente por telefone, cria o agendamento na Agenda REAL (origem='publico') e
// dispara confirmação no WhatsApp via evolution-send (MOAT do NX — fire-and-forget).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const toMin = (t: string) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
function normalizePhone(raw: string): string {
  let d = String(raw).replace(/\D/g, '');
  if (d.length >= 8 && !d.startsWith('55')) d = '55' + d;
  return d;
}
function formatBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const b = await req.json().catch(() => ({}));

    const slug = String(b?.slug ?? '').trim().slice(0, 120);
    const servico_id = String(b?.servico_id ?? '');
    const profissional_id = String(b?.profissional_id ?? '');
    const data = String(b?.data ?? '');
    const hora = String(b?.hora ?? '');
    const cliente_nome = String(b?.cliente_nome ?? '').trim().slice(0, 120);
    const cliente_telefone = String(b?.cliente_telefone ?? '').trim().slice(0, 20);
    const cliente_email = String(b?.cliente_email ?? '').trim().slice(0, 160) || null;
    const observacoes = String(b?.observacoes ?? '').slice(0, 500) || null;
    const tracking = (b?.tracking ?? {}) as Record<string, string>;

    if (!slug || !/^[0-9a-f-]{36}$/i.test(servico_id) || !/^[0-9a-f-]{36}$/i.test(profissional_id)
      || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)
      || cliente_nome.length < 2 || cliente_telefone.replace(/\D/g, '').length < 8) {
      return json({ error: 'parâmetros inválidos' }, 400);
    }

    const { data: org } = await sb.from('organizations').select('id').eq('slug', slug).maybeSingle();
    if (!org) return json({ error: 'Espaço não encontrado' }, 404);

    const [servRes, profRes] = await Promise.all([
      sb.from('servico_catalogo').select('id, nome, preco_base, duracao_minutos')
        .eq('organization_id', org.id).eq('id', servico_id).maybeSingle(),
      sb.from('profissionais').select('id, nome')
        .eq('organization_id', org.id).eq('id', profissional_id).maybeSingle(),
    ]);
    const serv = servRes.data, prof = profRes.data;
    if (!serv || !prof) return json({ error: 'profissional ou serviço não encontrado' }, 422);

    // re-checa conflito (overlap) server-side
    const novoIni = toMin(hora);
    const novoFim = novoIni + (serv.duracao_minutos ?? 60);
    const { data: ocup } = await sb.from('agendamentos')
      .select('hora, duracao_minutos')
      .eq('organization_id', org.id).eq('profissional_id', profissional_id).eq('data', data)
      .in('status', ['agendado', 'confirmado', 'chegou']);
    const conflito = (ocup ?? []).some((o: { hora: string; duracao_minutos: number | null }) => {
      const ini = toMin(o.hora);
      return novoIni < ini + (o.duracao_minutos ?? 60) && ini < novoFim;
    });
    if (conflito) return json({ error: 'Horário indisponível — já existe um agendamento neste intervalo.' }, 409);

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

    // cria o agendamento na Agenda real
    const { data: ag, error: aErr } = await sb.from('agendamentos').insert({
      organization_id: org.id,
      cliente_id, cliente_nome,
      servico_id: serv.id, servico_nome: serv.nome,
      profissional_id: prof.id, profissional_nome: prof.nome,
      data, hora,
      duracao_minutos: serv.duracao_minutos,
      valor: serv.preco_base,
      status: 'agendado',
      origem: 'publico',
      utm_source: tracking?.utm_source ?? null,
      utm_medium: tracking?.utm_medium ?? null,
      utm_campaign: tracking?.utm_campaign ?? null,
      observacoes,
    }).select('id, data, hora').single();
    if (aErr) {
      // 23505 = corrida no índice único anti-double-booking
      if (String(aErr.code) === '23505') return json({ error: 'Horário indisponível — acabou de ser reservado.' }, 409);
      return json({ error: 'falha ao agendar: ' + aErr.message }, 500);
    }

    // MOAT WhatsApp (fire-and-forget — não derruba o agendamento)
    let whatsapp_enviado = false;
    try {
      const to = normalizePhone(cliente_telefone);
      const { error: wErr } = await sb.functions.invoke('evolution-send', {
        body: {
          type: 'text', organization_id: org.id, to,
          payload: { text: `Olá ${cliente_nome}! Seu agendamento de ${serv.nome} foi confirmado para ${formatBR(data)} às ${hora}. Até lá! 💅` },
        },
      });
      whatsapp_enviado = !wErr;
    } catch (_) { /* sem instância Evolution → ignora */ }

    // Notificação in-app para admins/managers do salão (fire-and-forget — nunca derruba o agendamento)
    try {
      const { data: profs } = await sb.from('profiles').select('id').eq('organization_id', org.id);
      const ids = (profs ?? []).map((p: { id: string }) => p.id);
      if (ids.length) {
        const { data: roleRows } = await sb.from('user_roles')
          .select('user_id').in('user_id', ids).in('role', ['admin', 'manager']);
        const adminIds = [...new Set((roleRows ?? []).map((r: { user_id: string }) => r.user_id))];
        if (adminIds.length) {
          const rows = adminIds.map((user_id) => ({
            user_id,
            organization_id: org.id,
            title: `Novo agendamento — ${cliente_nome}`,
            message: `${serv.nome} · ${formatBR(data)} às ${hora}`,
            type: 'opportunity',
            action_url: '/agenda',
            metadata: { agendamento_id: ag.id, origem: 'publico' },
          }));
          await sb.from('notifications').insert(rows);
        }
      }
    } catch (_) { /* fire-and-forget: nunca derruba o agendamento */ }

    return json({ id: ag.id, data: ag.data, hora: ag.hora, whatsapp_enviado });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
