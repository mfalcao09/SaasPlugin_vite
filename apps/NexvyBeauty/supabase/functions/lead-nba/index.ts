// ─── lead-nba — Next-Best-Action generativo por lead ──────────────────
// Coleta o contexto do lead (etapa, temperatura, BANT, dias sem contato,
// últimas mensagens) → LLM (via gateway de IA da plataforma) → recomenda a
// próxima melhor ação + uma MENSAGEM PRONTA pra disparar no WhatsApp.
// Grava em lead_nba_sugestao. Suporta { dry_run:true } para verificação.
//
// Diferencial vs concorrentes "que só sugerem": a mensagem_sugerida +
// canal_sugerido são acionáveis — o botão "Aplicar" (UI) dispara via
// evolution-send (WhatsApp real).
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MODEL = 'google/gemini-2.5-flash';

function json(o: any, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function normPrio(p: any): string {
  const s = String(p || '').toLowerCase();
  if (s.startsWith('alt') || s === 'high') return 'alta';
  if (s.startsWith('baix') || s === 'low') return 'baixa';
  return 'media';
}

async function nbaSuggest(apiKey: string, ctx: any): Promise<any | null> {
  const system =
    'Voce e um SDR/closer especialista em vendas para saloes de beleza. Dado o contexto do lead ' +
    '(etapa, temperatura, BANT, dias sem contato, ultimas mensagens), recomende a PROXIMA MELHOR ACAO ' +
    'concreta e uma mensagem pronta para enviar. A mensagem deve ser curta, calorosa, personalizada, ' +
    'em portugues do Brasil, pronta pra WhatsApp. Nao invente dados que nao estao no contexto. ' +
    'Responda APENAS via tool call suggest_next_action.';
  const user = `Contexto do lead (JSON):\n${JSON.stringify(ctx)}`;
  try {
    const resp = await fetch(
      `${Deno.env.get('AI_GATEWAY_URL') ?? 'https://openrouter.ai/api/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'suggest_next_action',
                description: 'Recomenda a proxima melhor acao para o lead.',
                parameters: {
                  type: 'object',
                  properties: {
                    acao: { type: 'string', description: 'A proxima acao concreta (1 frase).' },
                    motivo: { type: 'string', description: 'Por que essa acao agora.' },
                    prioridade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
                    canal_sugerido: { type: 'string', enum: ['whatsapp', 'email', 'ligacao'] },
                    mensagem_sugerida: { type: 'string', description: 'Mensagem pronta pra enviar (WhatsApp, pt-BR, curta).' },
                  },
                  required: ['acao', 'prioridade', 'canal_sugerido', 'mensagem_sugerida'],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: 'function', function: { name: 'suggest_next_action' } },
        }),
      },
    );
    if (!resp.ok) {
      console.error('nba llm error', resp.status, await resp.text());
      return null;
    }
    const j = await resp.json();
    const tc = j?.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) return null;
    return JSON.parse(tc.function.arguments);
  } catch (e) {
    console.error('nba exception', e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const apiKey = Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY');
    const body = (await req.json().catch(() => ({}))) as any;

    // dry_run: usa um lead-amostra, chama o LLM e RETORNA (sem gravar).
    if (body?.dry_run) {
      const ctx = {
        lead: { nome: 'Marina Lopes', empresa: 'Studio Marina', temperatura: 'warm', dias_sem_contato: 6, etapa: 'Proposta enviada', bant: { budget: 'ok', authority: 'decisora', need: 'alta', timing: '30 dias' }, valor_estimado: 397 },
        ultimas_mensagens: [
          { de: 'cliente', txt: 'Recebi a proposta, vou analisar com calma' },
          { de: 'agente', txt: 'Perfeito! Qualquer duvida estou a disposicao' },
        ],
      };
      let mode = 'sem_chave';
      let sug = null;
      if (apiKey) { sug = await nbaSuggest(apiKey, ctx); if (sug) mode = 'llm'; }
      return json({ dry_run: true, apiKeyPresent: !!apiKey, mode, sugestao: sug });
    }

    const leadId = body?.lead_id;
    if (!leadId) return json({ error: 'lead_id obrigatorio (ou {dry_run:true})' }, 400);
    if (!apiKey) return json({ error: 'IA nao configurada (AI_API_KEY ausente)' }, 503);

    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
    if (!lead) return json({ error: 'lead nao encontrado' }, 404);

    let stage: any = null;
    if (lead.current_stage_id) {
      const { data } = await supabase.from('pipeline_stages').select('name,is_won,is_lost').eq('id', lead.current_stage_id).maybeSingle();
      stage = data;
    }

    let messages: any[] = [];
    const { data: conv } = await supabase.from('webchat_conversations').select('id').eq('lead_id', leadId).order('last_message_at', { ascending: false }).limit(1).maybeSingle();
    if (conv) {
      const { data: msgs } = await supabase.from('webchat_messages').select('direction,content,created_at').eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(8);
      messages = (msgs || []).reverse().map((m: any) => ({ de: m.direction === 'inbound' ? 'cliente' : 'agente', txt: (m.content || '').slice(0, 400) }));
    }

    const dias = lead.last_contact_at ? Math.floor((Date.now() - new Date(lead.last_contact_at).getTime()) / 86400000) : null;
    const ctx = {
      lead: {
        nome: lead.name, empresa: lead.company, temperatura: lead.temperature, dias_sem_contato: dias,
        etapa: stage?.name ?? null, ganho: stage?.is_won ?? false, perdido: stage?.is_lost ?? false,
        bant: { budget: lead.bant_budget, authority: lead.bant_authority, need: lead.bant_need, timing: lead.bant_timing },
        valor_estimado: lead.deal_value, proxima_acao: lead.next_action, notas: (lead.notes || '').slice(0, 500),
      },
      ultimas_mensagens: messages,
    };

    const sug = await nbaSuggest(apiKey, ctx);
    if (!sug) return json({ error: 'IA nao retornou sugestao (sem credito ou erro)' }, 502);

    const { data: inserted, error: iErr } = await supabase
      .from('lead_nba_sugestao')
      .insert({
        organization_id: lead.organization_id,
        lead_id: leadId,
        acao: sug.acao,
        motivo: sug.motivo ?? null,
        prioridade: normPrio(sug.prioridade),
        canal_sugerido: sug.canal_sugerido ?? null,
        mensagem_sugerida: sug.mensagem_sugerida ?? null,
        model: MODEL,
        status: 'pendente',
      })
      .select('id')
      .single();
    if (iErr) return json({ error: iErr.message }, 500);

    return json({ ok: true, sugestao_id: inserted.id, sugestao: sug });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
