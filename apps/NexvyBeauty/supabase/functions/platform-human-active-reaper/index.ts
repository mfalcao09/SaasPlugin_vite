// ============================================================================
// platform-human-active-reaper — devolve ao bot a conversa que um humano assumiu
// e abandonou.
//
// ── POR QUE EXISTE (medido, não suposto) ────────────────────────────────────
// 06/08: 7 conversas do canal oficial em `human_active`, TODAS paradas entre 57
// e 68 horas. Uma delas tem a ÚLTIMA MENSAGEM INBOUND: a lead escreveu e ninguém
// respondeu por 2 dias e meio. O brain tem early return duro em
// `status !== 'bot_active'`, então a partir do momento em que alguém aceita a
// conversa e não volta, ela morre em silêncio — sem alarme, sem fila, sem nada
// que denuncie.
//
// Com anúncio no ar isso deixa de ser 7 leads e vira vazamento contínuo: cada
// conversa que um humano tocar e largar é dinheiro de tráfego virando silêncio.
//
// ── O QUE FAZ, E O QUE DELIBERADAMENTE NÃO FAZ ──────────────────────────────
// FAZ:    status 'human_active' → 'bot_active' após HUMAN_RETURN_HOURS sem
//         NENHUMA mensagem na conversa. Só estado.
// NÃO FAZ: não envia mensagem nenhuma — nem para quem está esperando resposta.
//         Gerar texto para lead real é ato de comunicação, e isso é decisão do
//         dono do negócio, não de um cron. O reaper restaura a CAPACIDADE de
//         responder; quem decide falar é gente.
//
// Consequência honesta e declarada: a lead que escreveu e está esperando NÃO
// recebe resposta por causa deste cron. Ela volta a ser atendida quando escrever
// de novo. Por isso o retorno separa `aguardando_resposta` — para esse
// subconjunto ficar VISÍVEL e alguém decidir sobre ele, em vez de sumir na média.
//
// ── GUARDAS ─────────────────────────────────────────────────────────────────
// · flag HUMAN_RETURN_ENABLED (default 'false'): nasce desligado. Código que
//   escreve em produção não se liga sozinho.
// · janela por INATIVIDADE TOTAL, não por "tempo desde que virou human_active":
//   se o humano respondeu há 10 minutos, a conversa está VIVA e não se toca.
// · UPDATE condicional (status ainda = 'human_active') + select: se alguém mudou
//   o estado entre a leitura e a escrita, a linha não é tocada.
// · contadores separados: devolvidas / aguardando_resposta / vivas / conflito.
//   `devolvidas=0` sozinho seria indistinguível entre "não havia nada" e "o
//   filtro comeu tudo" — a diferença que custou o dia inteiro nesta frente.
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

/** Horas de silêncio TOTAL na conversa antes de devolver ao bot. */
const RETURN_HOURS = Number(Deno.env.get('HUMAN_RETURN_HOURS') ?? '6');
/** Teto por execução: um bug de janela não deve virar varredura da base inteira. */
const MAX_POR_RODADA = 50;

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!bearer || bearer !== SERVICE) return json({ error: 'unauthorized' }, 401);

    // Nasce DESLIGADO. Mesma disciplina do INACTIVITY_SWEEPER_ENABLED — a flag é
    // o que separa "construído" de "atuando em produção".
    if ((Deno.env.get('HUMAN_RETURN_ENABLED') ?? 'false').toLowerCase() !== 'true') {
      return json({ skipped: 'flag_off', hint: 'defina HUMAN_RETURN_ENABLED=true para ativar' });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);
    const corteIso = new Date(Date.now() - RETURN_HOURS * 3600 * 1000).toISOString();

    const { data: candidatas, error: selErr } = await admin
      .from('platform_crm_conversations')
      .select('id, visitor_phone, visitor_whatsapp')
      .eq('status', 'human_active')
      .not('visitor_id', 'like', 'wa:eval-%')
      .limit(MAX_POR_RODADA);
    if (selErr) return json({ error: 'select_failed', detail: selErr.message }, 500);

    let devolvidas = 0;
    let aguardando = 0;   // a lead falou por último: alguém precisa saber
    let vivas = 0;        // atividade dentro da janela → não se toca
    let semMensagem = 0;  // conversa sem mensagem nenhuma
    let conflito = 0;     // status mudou entre a leitura e a escrita
    const devolvidasIds: string[] = [];
    const aguardandoTelefones: string[] = [];

    for (const c of (candidatas ?? [])) {
      // Última mensagem — QUALQUER direção. A janela mede silêncio real; medir só
      // "desde que virou human_active" devolveria ao bot uma conversa em que o
      // humano respondeu há 5 minutos.
      const { data: ultima } = await admin
        .from('platform_crm_messages')
        .select('created_at, direction')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!ultima) { semMensagem++; continue; }
      const u = ultima as Record<string, any>;
      if (String(u.created_at) > corteIso) { vivas++; continue; }

      // UPDATE condicional: só devolve se AINDA estiver human_active. Sem isto,
      // um humano que assumiu no intervalo entre a leitura e a escrita perderia
      // a conversa para o bot no meio do atendimento.
      const { data: alterada, error: updErr } = await admin
        .from('platform_crm_conversations')
        .update({ status: 'bot_active' })
        .eq('id', c.id)
        .eq('status', 'human_active')
        .select('id');
      if (updErr || !alterada || alterada.length === 0) { conflito++; continue; }

      devolvidas++;
      devolvidasIds.push(String(c.id));

      // A lead falou por último = está esperando. Este cron NÃO responde por ela;
      // só torna a conversa atendível de novo. Contar à parte existe para que
      // esse caso apareça em vez de diluir no total.
      if (String(u.direction) === 'inbound') {
        aguardando++;
        aguardandoTelefones.push(String(c.visitor_phone ?? c.visitor_whatsapp ?? '?'));
      }
    }

    const resumo = {
      ok: true,
      janela_horas: RETURN_HOURS,
      candidatas: (candidatas ?? []).length,
      devolvidas,
      aguardando_resposta: aguardando,
      aguardando_telefones: aguardandoTelefones,
      vivas_dentro_da_janela: vivas,
      sem_mensagem: semMensagem,
      conflito_de_estado: conflito,
      devolvidas_ids: devolvidasIds,
    };
    console.log('[human-active-reaper]', JSON.stringify(resumo));
    return json(resumo);
  } catch (err: any) {
    console.error('[human-active-reaper] error:', err?.message || String(err));
    return json({ error: err?.message || 'internal_error' }, 500);
  }
});
