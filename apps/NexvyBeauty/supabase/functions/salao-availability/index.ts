// salao-availability — motor de horários da COMANDA multi-serviço.
// Público (verify_jwt=false). Recebe a comanda inteira (N serviços) + o modo de
// preferência e devolve ROTEIROS candidatos (contínuo / sequencial / fracionado),
// em vez de uma lista solta de horários.
//
// A aritmética vive em _shared/comanda-roteiro.ts (pura e testada); aqui só
// buscamos dados e traduzimos formato. TZ America/Sao_Paulo fixo (Deno roda UTC).
//
// DOIS consumidores, não um: o wizard público (PublicSalaoBooking.tsx) e o agente
// de IA (webchat-bot/index.ts:3632), que manda {servico_id, profissional_id} e lê
// `slots`. Por isso o formato antigo continua atendido — não é dívida transitória,
// é contrato vivo de outro chamador.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  horaParaMinutos,
  minutosParaHora,
  montarRoteiros,
  type ModoPreferencia,
  type ProfissionalAgenda,
  type ServicoComanda,
} from '../_shared/comanda-roteiro.ts';

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

const DIA_MAP: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
const UUID_RE = /^[0-9a-f-]{36}$/i;

function atendeNoDia(dias: unknown, dow: number): boolean {
  const lista = (Array.isArray(dias) ? dias : [])
    .map((d: unknown) => (typeof d === 'number' ? d : DIA_MAP[String(d).toLowerCase().slice(0, 3)]))
    .filter((d: number) => Number.isInteger(d));
  return lista.length === 0 || lista.includes(dow);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));

    const slug = String(body?.slug ?? '').trim().slice(0, 120);
    const data = String(body?.data ?? '');
    const legado = !Array.isArray(body?.servico_ids);
    const servicoIds: string[] = legado
      ? [String(body?.servico_id ?? '')].filter(Boolean)
      : body.servico_ids.map((s: unknown) => String(s));
    const profIdPedido = body?.profissional_id ? String(body.profissional_id) : null;
    const modo: ModoPreferencia = ['unico', 'preferido', 'auto'].includes(String(body?.modo))
      ? String(body.modo) as ModoPreferencia
      : 'auto';

    if (!slug || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return json({ error: 'parâmetros inválidos' }, 400);
    if (servicoIds.length === 0 || servicoIds.length > 12) return json({ error: 'comanda inválida' }, 400);
    if (!servicoIds.every((id) => UUID_RE.test(id))) return json({ error: 'serviço inválido' }, 400);
    if (profIdPedido && !UUID_RE.test(profIdPedido)) return json({ error: 'profissional inválido' }, 400);

    const { data: org } = await sb.from('organizations').select('id').eq('slug', slug).maybeSingle();
    if (!org) return json({ error: 'Espaço não encontrado' }, 404);

    const [servRes, profRes] = await Promise.all([
      sb.from('servico_catalogo')
        .select('id, nome, categoria, duracao_minutos, preco_base, preco_promocional')
        .eq('organization_id', org.id).eq('ativo', true).in('id', servicoIds),
      sb.from('profissionais')
        .select('id, nome, especialidades, hora_inicio, hora_fim, dias_atendimento, intervalo_inicio, intervalo_fim')
        .eq('organization_id', org.id).eq('ativo', true),
    ]);

    const encontrados = servRes.data ?? [];
    if (encontrados.length !== new Set(servicoIds).size) {
      return json({ error: 'serviço não encontrado ou inativo' }, 422);
    }

    // Preserva a ordem em que o cliente montou a comanda (desempate da precedência).
    const porId = new Map(encontrados.map((s: any) => [s.id, s]));
    const servicos: ServicoComanda[] = servicoIds.map((id) => {
      const s: any = porId.get(id);
      return {
        servico_id: s.id,
        nome: s.nome,
        categoria: s.categoria ?? null,
        duracao_minutos: s.duracao_minutos ?? 60,
      };
    });
    // Promoção manda: precisa bater com o que a RPC cobra, senão o roteiro
    // anuncia um valor e a comanda grava outro.
    const valorTotal = servicoIds.reduce((acc, id) => {
      const s: any = porId.get(id);
      return acc + Number(s?.preco_promocional ?? s?.preco_base ?? 0);
    }, 0);

    const dow = new Date(data + 'T00:00:00Z').getUTCDay();
    let doDia = (profRes.data ?? []).filter((p: any) => atendeNoDia(p.dias_atendimento, dow));

    // Chamada antiga (agente de IA) já escolheu a pessoa: restringir o universo a
    // ela reproduz o comportamento anterior — inclusive ignorando especialidade,
    // que o fluxo antigo nunca checou. Sem isso, o bot receberia horário de outro
    // profissional e agendaria com quem o cliente não pediu.
    if (legado && profIdPedido) doDia = doDia.filter((p: any) => p.id === profIdPedido);

    if (doDia.length === 0) return json({ roteiros: [], slots: [], aviso: 'sem_profissional_no_dia' });

    const { data: ocup } = await sb.from('agendamentos')
      .select('profissional_id, hora, duracao_minutos')
      .eq('organization_id', org.id).eq('data', data)
      .in('profissional_id', doDia.map((p: any) => p.id))
      .in('status', ['agendado', 'confirmado', 'chegou']);

    const ocupadosPorProf = new Map<string, Array<{ inicio: number; fim: number }>>();
    for (const a of (ocup ?? []) as any[]) {
      const ini = horaParaMinutos(a.hora);
      const lista = ocupadosPorProf.get(a.profissional_id) ?? [];
      lista.push({ inicio: ini, fim: ini + (a.duracao_minutos ?? 60) });
      ocupadosPorProf.set(a.profissional_id, lista);
    }

    const profissionais: ProfissionalAgenda[] = doDia.map((p: any) => ({
      id: p.id,
      nome: p.nome,
      especialidades: Array.isArray(p.especialidades) ? p.especialidades : [],
      inicio: horaParaMinutos(p.hora_inicio ?? '09:00'),
      fim: horaParaMinutos(p.hora_fim ?? '18:00'),
      intervalo: p.intervalo_inicio && p.intervalo_fim
        ? { inicio: horaParaMinutos(p.intervalo_inicio), fim: horaParaMinutos(p.intervalo_fim) }
        : null,
      ocupados: ocupadosPorProf.get(p.id) ?? [],
    }));

    const sp = nowSP();
    const minimo = data === sp.ymd ? sp.minutes : 0;

    const roteiros = montarRoteiros({
      servicos,
      profissionais,
      modo,
      profissional_preferido_id: legado ? null : profIdPedido,
      minimo,
    });

    // "Tudo com a mesma pessoa" sem ninguém que cubra a comanda inteira: a UI
    // precisa disso para sugerir dividir entre especialistas.
    if (roteiros.length === 0 && modo === 'unico') {
      return json({ roteiros: [], slots: [], aviso: 'nenhum_profissional_cobre_tudo' });
    }

    const saida = roteiros.map((r) => ({
      tipo: r.tipo,
      inicio: minutosParaHora(r.inicio),
      fim: minutosParaHora(r.fim),
      espera_minutos: r.espera_minutos,
      duracao_total_minutos: r.itens.reduce((acc, i) => acc + (i.fim - i.inicio), 0),
      valor_total: valorTotal,
      profissionais_ids: r.profissionais_ids,
      itens: r.itens.map((i) => ({
        servico_id: i.servico_id,
        nome: i.nome,
        profissional_id: i.profissional_id,
        profissional_nome: i.profissional_nome,
        inicio: minutosParaHora(i.inicio),
        fim: minutosParaHora(i.fim),
        execution_order: i.execution_order,
      })),
    }));

    // Contrato do agente de IA e do wizard atual: lista de horários de início.
    const slots = servicos.length === 1
      ? [...new Set(saida.filter((r) => r.espera_minutos === 0).map((r) => r.inicio))].sort()
      : [];

    return json({ roteiros: saida, slots });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
