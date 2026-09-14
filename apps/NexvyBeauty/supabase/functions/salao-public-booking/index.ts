// salao-public-booking — confirma a COMANDA (1..N serviços) do agendamento público.
// Público (verify_jwt=false).
//
// A gravação é ATÔMICA via RPC `fn_confirmar_comanda`: 1 linha em `comandas` +
// N linhas em `agendamentos` sob a mesma transação. Se qualquer item colidir com
// a trava de sobreposição, a comanda inteira desfaz — nunca sobra meia comanda.
// Preço e duração são lidos do banco DENTRO da RPC; o que vem do navegador é
// apenas quem/quando, nunca quanto.
//
// DOIS consumidores: o wizard público e o agente de IA (webchat-bot:3953), que
// manda 1 serviço no formato antigo. Ambos são normalizados para `itens[]`.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { attributeTenantReferralCommission } from '../_shared/affiliate-onda3.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PAGAMENTOS = ['pix', 'cartao_credito', 'cartao_debito', 'dinheiro'];

function normalizePhone(raw: string): string {
  let d = String(raw).replace(/\D/g, '');
  if (d.length >= 8 && !d.startsWith('55')) d = '55' + d;
  return d;
}
function formatBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '');
}

type ItemEntrada = {
  servico_id: string;
  profissional_id: string;
  data: string;
  hora: string;
  execution_order: number;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const b = await req.json().catch(() => ({}));

    const slug = String(b?.slug ?? '').trim().slice(0, 120);
    const cliente_nome = String(b?.cliente_nome ?? '').trim().slice(0, 120);
    const cliente_telefone = String(b?.cliente_telefone ?? '').trim().slice(0, 20);
    const cliente_email = String(b?.cliente_email ?? '').trim().slice(0, 160) || null;
    const observacoes = String(b?.observacoes ?? '').slice(0, 500) || null;
    const tracking = (b?.tracking ?? {}) as Record<string, string>;
    const ref = String(tracking?.ref ?? b?.ref ?? '').trim();

    const formaPagamento = PAGAMENTOS.includes(String(b?.forma_pagamento))
      ? String(b.forma_pagamento)
      : null;

    // Formato antigo (agente de IA e wizard atual) = comanda de 1 item.
    const itens: ItemEntrada[] = Array.isArray(b?.itens) && b.itens.length > 0
      ? b.itens.map((it: any, i: number) => ({
        servico_id: String(it?.servico_id ?? ''),
        profissional_id: String(it?.profissional_id ?? ''),
        data: String(it?.data ?? ''),
        hora: String(it?.hora ?? '').slice(0, 5),
        execution_order: Number.isInteger(it?.execution_order) ? it.execution_order : i + 1,
      }))
      : [{
        servico_id: String(b?.servico_id ?? ''),
        profissional_id: String(b?.profissional_id ?? ''),
        data: String(b?.data ?? ''),
        hora: String(b?.hora ?? '').slice(0, 5),
        execution_order: 1,
      }];

    const itensValidos = itens.length > 0 && itens.length <= 12 && itens.every((it) =>
      UUID_RE.test(it.servico_id) && UUID_RE.test(it.profissional_id) &&
      /^\d{4}-\d{2}-\d{2}$/.test(it.data) && /^\d{2}:\d{2}$/.test(it.hora));

    if (!slug || !itensValidos || cliente_nome.length < 2
      || cliente_telefone.replace(/\D/g, '').length < 8) {
      return json({ error: 'parâmetros inválidos' }, 400);
    }

    const { data: org } = await sb.from('organizations').select('id').eq('slug', slug).maybeSingle();
    if (!org) return json({ error: 'Espaço não encontrado' }, 404);

    // Telefone é CHAVE de identificação do cliente: precisa de forma canônica
    // (só dígitos, com DDI). O wizard manda mascarado "(11) 90000-0003" e o
    // agente de IA manda cru — sem normalizar aqui, o mesmo cliente vira dois
    // cadastros e o histórico dele se parte ao meio.
    const telefoneCanonico = normalizePhone(cliente_telefone);

    // upsert cliente por telefone (fora da transação: o lead vale mesmo se o
    // horário cair, e é assim que já funcionava)
    const { data: existente } = await sb.from('clientes').select('id')
      .eq('organization_id', org.id).eq('telefone', telefoneCanonico).maybeSingle();
    let cliente_id = existente?.id;
    if (!cliente_id) {
      const { data: novo, error: cErr } = await sb.from('clientes')
        .insert({ organization_id: org.id, nome: cliente_nome, telefone: telefoneCanonico, email: cliente_email, status: 'ativo' })
        .select('id').single();
      if (cErr) return json({ error: 'falha ao registrar cliente: ' + cErr.message }, 500);
      cliente_id = novo.id;
    }

    // Gravação atômica. A RPC valida serviço/profissional contra a org e usa
    // preço e duração do banco.
    const { data: res, error: rpcErr } = await sb.rpc('fn_confirmar_comanda', {
      payload: {
        organization_id: org.id,
        cliente_id,
        cliente_nome,
        cliente_telefone: telefoneCanonico,
        cliente_email,
        forma_pagamento: formaPagamento,
        origem: 'publico',
        observacoes,
        utm_source: tracking?.utm_source ?? null,
        utm_medium: tracking?.utm_medium ?? null,
        utm_campaign: tracking?.utm_campaign ?? null,
        itens,
      },
    });

    if (rpcErr) {
      const msg = String(rpcErr.message ?? '');
      if (msg.includes('HORARIO_INDISPONIVEL')) {
        return json({ error: 'Horário indisponível — acabou de ser reservado.' }, 409);
      }
      if (msg.includes('SERVICO_INVALIDO') || msg.includes('PROFISSIONAL_INVALIDO')) {
        return json({ error: 'profissional ou serviço não encontrado' }, 422);
      }
      if (msg.includes('COMANDA_VAZIA')) return json({ error: 'comanda vazia' }, 400);
      return json({ error: 'falha ao agendar: ' + msg }, 500);
    }

    const comandaId = (res as any)?.comanda_id as string;
    const agIds = ((res as any)?.agendamento_ids ?? []) as string[];
    const valorTotal = Number((res as any)?.valor_total ?? 0);

    // Rótulos dos serviços para as mensagens (a RPC devolve só ids).
    const { data: agRows } = await sb.from('agendamentos')
      .select('id, servico_nome, profissional_nome, data, hora, execution_order')
      .eq('comanda_id', comandaId).order('execution_order');
    const linhas = (agRows ?? []) as Array<{
      servico_nome: string; profissional_nome: string; data: string; hora: string;
    }>;
    const primeiro = linhas[0];
    const resumo = linhas
      .map((l) => `• ${l.servico_nome} com ${l.profissional_nome} às ${String(l.hora).slice(0, 5)}`)
      .join('\n');

    // MOAT WhatsApp (fire-and-forget — não derruba o agendamento)
    let whatsapp_enviado = false;
    try {
      const texto = linhas.length === 1
        ? `Olá ${cliente_nome}! Seu agendamento de ${primeiro?.servico_nome} foi confirmado para ${formatBR(primeiro?.data)} às ${String(primeiro?.hora).slice(0, 5)}. Até lá! 💅`
        : `Olá ${cliente_nome}! Sua comanda foi confirmada para ${formatBR(primeiro?.data)}:\n${resumo}\n\nTotal: R$ ${valorTotal.toFixed(2).replace('.', ',')}. Até lá! 💅`;
      const { error: wErr } = await sb.functions.invoke('evolution-send', {
        body: { type: 'text', organization_id: org.id, to: telefoneCanonico, payload: { text: texto } },
      });
      whatsapp_enviado = !wErr;
    } catch (_) { /* sem instância Evolution → ignora */ }

    // Notificação in-app para admins/managers (fire-and-forget)
    try {
      const { data: profs } = await sb.from('profiles').select('id').eq('organization_id', org.id);
      const ids = (profs ?? []).map((p: { id: string }) => p.id);
      if (ids.length) {
        const { data: roleRows } = await sb.from('user_roles')
          .select('user_id').in('user_id', ids).in('role', ['admin', 'manager']);
        const adminIds = [...new Set((roleRows ?? []).map((r: { user_id: string }) => r.user_id))];
        if (adminIds.length) {
          const titulo = linhas.length === 1
            ? `Novo agendamento — ${cliente_nome}`
            : `Nova comanda (${linhas.length} serviços) — ${cliente_nome}`;
          const corpo = linhas.length === 1
            ? `${primeiro?.servico_nome} · ${formatBR(primeiro?.data)} às ${String(primeiro?.hora).slice(0, 5)}`
            : `${formatBR(primeiro?.data)} a partir das ${String(primeiro?.hora).slice(0, 5)} · R$ ${valorTotal.toFixed(2).replace('.', ',')}`;
          await sb.from('notifications').insert(adminIds.map((user_id) => ({
            user_id,
            organization_id: org.id,
            title: titulo,
            message: corpo,
            type: 'opportunity',
            action_url: '/agenda',
            metadata: { comanda_id: comandaId, agendamento_id: agIds[0], origem: 'publico' },
          })));
        }
      }
    } catch (_) { /* fire-and-forget: nunca derruba o agendamento */ }

    // Onda 3: atribuição de comissão no booking do salão. Fire-and-forget.
    if (ref) {
      try {
        await attributeTenantReferralCommission(sb as any, {
          ownerOrganizationId: org.id,
          refCode: ref,
          bookingId: agIds[0],
          amountReais: valorTotal,
          buyerClienteId: cliente_id,
          buyerEmail: cliente_email,
        });
      } catch (_) { /* atribuição não pode impedir o horário */ }
    }

    // `id`/`data`/`hora` mantidos para o agente de IA e o wizard atual.
    return json({
      id: agIds[0],
      comanda_id: comandaId,
      data: primeiro?.data,
      hora: primeiro?.hora,
      valor_total: valorTotal,
      itens: linhas,
      whatsapp_enviado,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
