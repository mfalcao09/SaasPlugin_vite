// salao-availability — Onda 2 (port do algoritmo de slots do CBA)
// Público (verify_jwt=false). Gera horários disponíveis = jornada do profissional
// − duração do serviço, descontando os já ocupados. STEP=30 fixo (fiel ao CBA).
// TZ America/Sao_Paulo fixo (Deno roda em UTC) — D7 do spec.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const TZ = 'America/Sao_Paulo';
function nowSP(): { ymd: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date())) p[part.type] = part.value;
  return { ymd: `${p.year}-${p.month}-${p.day}`, minutes: (+p.hour) * 60 + (+p.minute) };
}
const toMin = (t: string) => {
  const [h, m] = String(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const DIA_MAP: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const slug = String(body?.slug ?? '').trim().slice(0, 120);
    const servico_id = String(body?.servico_id ?? '');
    const profissional_id = String(body?.profissional_id ?? '');
    const data = String(body?.data ?? '');
    if (!slug || !/^[0-9a-f-]{36}$/i.test(servico_id) || !/^[0-9a-f-]{36}$/i.test(profissional_id) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return json({ error: 'parâmetros inválidos' }, 400);
    }

    const { data: org } = await sb.from('organizations').select('id').eq('slug', slug).maybeSingle();
    if (!org) return json({ error: 'Salão não encontrado' }, 404);

    const [profRes, servRes] = await Promise.all([
      sb.from('profissionais').select('id, hora_inicio, hora_fim, dias_atendimento')
        .eq('organization_id', org.id).eq('id', profissional_id).maybeSingle(),
      sb.from('servico_catalogo').select('duracao_minutos')
        .eq('organization_id', org.id).eq('id', servico_id).maybeSingle(),
    ]);
    const prof = profRes.data, serv = servRes.data;
    if (!prof || !serv) return json({ error: 'profissional ou serviço não encontrado' }, 422);

    // dia da semana (data pura → UTCDay pra não deslocar)
    const dow = new Date(data + 'T00:00:00Z').getUTCDay();
    const dias: number[] = (Array.isArray(prof.dias_atendimento) ? prof.dias_atendimento : [])
      .map((d: unknown) => typeof d === 'number' ? d : DIA_MAP[String(d).toLowerCase().slice(0, 3)])
      .filter((d: number) => Number.isInteger(d));
    if (dias.length > 0 && !dias.includes(dow)) return json({ slots: [] });

    const inicio = toMin(prof.hora_inicio ?? '09:00');
    const fim = toMin(prof.hora_fim ?? '18:00');
    const dur = serv.duracao_minutos ?? 60;
    const STEP = 30;

    const { data: ocup } = await sb.from('agendamentos')
      .select('hora, duracao_minutos')
      .eq('organization_id', org.id).eq('profissional_id', profissional_id).eq('data', data)
      .in('status', ['agendado', 'confirmado', 'chegou']);
    const intervals = (ocup ?? []).map((a: { hora: string; duracao_minutos: number | null }) => {
      const ini = toMin(a.hora);
      return { ini, fim: ini + (a.duracao_minutos ?? 60) };
    });

    const sp = nowSP();
    const isToday = data === sp.ymd;
    const slots: string[] = [];
    for (let t = inicio; t + dur <= fim; t += STEP) {
      if (isToday && t <= sp.minutes) continue;
      const conflito = intervals.some((o) => t < o.fim && o.ini < t + dur);
      if (!conflito) {
        const hh = String(Math.floor(t / 60)).padStart(2, '0');
        const mm = String(t % 60).padStart(2, '0');
        slots.push(`${hh}:${mm}`);
      }
    }
    return json({ slots });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
