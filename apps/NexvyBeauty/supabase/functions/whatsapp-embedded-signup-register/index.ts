// whatsapp-embedded-signup-register — segunda metade do Embedded Signup.
//
// A `-exchange` trocou o code, gravou um RASCUNHO com o token e devolveu a lista
// de ativos. Aqui o usuário já escolheu um número e esta função COMPLETA a
// linha. Depois disto a conexão está ativa e o webhook roteia por ela.
//
// ⚠️ NÃO CONFUNDIR com `platform-meta-whatsapp-register`: aquele é o caminho
// MANUAL, product-scoped, operado pelo super-admin sobre outra tabela. Ator,
// escopo e tabela diferentes. Os dois coexistem por desenho, não por dívida.
//
// ⚠️ ESTA É A FUNÇÃO ONDE A ESCOLHA DO CLIENTE VIRA FATO — e por isso é onde a
// autorização tem que morar. `waba_id`/`phone_number_id` chegam do BODY,
// escolhidos no navegador. Um tenant com um rascunho legítimo pode mandar o
// número de OUTRO negócio; como `phone_number_id` tem UNIQUE parcial, isso não
// vaza dado — faz pior: TRAVA o dono real fora, que passa a receber "já está
// conectado em outra conta" sem nenhum rastro de que o número foi tomado.
//
// O árbitro é o Graph, consultado com o token DO PRÓPRIO RASCUNHO: ele só
// responde por um asset se aquele token o alcança. Falha fechada de propósito —
// se o Graph estiver fora, um tenant legítimo é recusado e tenta de novo.
// Recusa é reversível; squat não.
//
// (O `hunion_register_channel` do Intentus, de onde este fluxo foi portado,
// grava `waba_id`/`phone_number_id` do body SEM validar. É a mesma falha que
// esta trilha já corrigiu uma vez — não foi portada junto.)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { authenticateTenant, resolveOrgId } from '../_shared/tenant-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const sbAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Mesma razão da irmã: UPDATE nesta tabela é `is_super_admin()` only, então
    // rodamos com service_role — e com service_role o RLS não protege mais nada.
    // O gateway aceita a ANON KEY (pública, no bundle JS) como Authorization
    // válida. Sem este gate, qualquer pessoa da internet completaria conexões.
    const auth = await authenticateTenant(req, sbAdmin, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await req.json().catch(() => ({}));
    const { connection_id, waba_id, phone_number_id, display_name } = body ?? {};

    const orgId = resolveOrgId(auth, body?.organization_id ?? null);
    if (!orgId) return json({ error: 'organizacao nao resolvida para este usuario' }, 403);

    if (!connection_id || !waba_id || !phone_number_id) {
      return json({ error: 'connection_id, waba_id e phone_number_id sao obrigatorios' }, 400);
    }

    // ── 1. O RASCUNHO PRECISA SER DESTA ORG ─────────────────────────────────
    // `.eq('organization_id', orgId)` não é filtro de conveniência: é o que
    // impede completar o rascunho de outro tenant com um connection_id chutado.
    const { data: draft, error: draftErr } = await sbAdmin
      .from('whatsapp_meta_connections')
      .select('id, access_token_encrypted, status')
      .eq('id', connection_id)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (draftErr || !draft) {
      return json({ error: 'conexao nao encontrada', code: 'draft_not_found' }, 404);
    }
    if (draft.status !== 'pending') {
      // Já completado (duplo clique, retry, aba duplicada). Não é erro do
      // usuário, não deve virar 500 e não deve gravar de novo.
      return json({ error: 'esta conexao ja foi concluida', code: 'already_registered' }, 409);
    }

    const accessToken = await decryptSecret(draft.access_token_encrypted ?? '');
    if (!accessToken) {
      // `decryptSecret` devolve '' para entrada vazia SEM lançar (~35 call sites
      // no repo dependem disso para credencial opcional). Aqui vazio significa
      // rascunho corrompido — e seguir adiante mandaria um Bearer vazio ao Graph,
      // que responderia 401 e viraria "asset não autorizado", culpando o usuário
      // por um defeito nosso.
      console.error('[embedded-signup-register] rascunho sem token utilizavel', connection_id);
      return json({ error: 'conexao invalida, refaca o processo', code: 'draft_corrupt' }, 409);
    }

    // ── 2. O GRAPH CONFIRMA A ESCOLHA (gate, não enriquecimento) ────────────
    let phoneInfo: Record<string, unknown>;
    let wabaInfo: Record<string, unknown>;
    try {
      // Token no header, via graphFetch. NUNCA na query string — ali vaza em log
      // de proxy, CDN, APM e histórico de erro.
      [phoneInfo, wabaInfo] = await Promise.all([
        graphFetch<Record<string, unknown>>(
          `/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`,
          accessToken,
        ),
        graphFetch<Record<string, unknown>>(`/${waba_id}?fields=name,id`, accessToken),
      ]);
    } catch (e) {
      // graphFetch lança GraphError em qualquer não-2xx, então este catch vê erro
      // da API e não só falha de rede (`fetch` sozinho resolve normalmente em 4xx).
      console.warn('[embedded-signup-register] Graph recusou os assets', String(e));
      return json({
        error: 'Não foi possível confirmar este número na conta que você autorizou. ' +
          'Refaça a conexão e selecione um número da sua própria conta.',
        code: 'asset_not_authorized',
      }, 403);
    }

    // Defesa em profundidade: 2xx com corpo vazio não é confirmação.
    if (!phoneInfo?.display_phone_number || String(wabaInfo?.id ?? '') !== String(waba_id)) {
      console.warn('[embedded-signup-register] assets nao confirmados', { phone_number_id, waba_id });
      return json({
        error: 'Este número não pertence à conta que você autorizou.',
        code: 'asset_not_authorized',
      }, 403);
    }

    // ── 3. COMPLETA A LINHA ─────────────────────────────────────────────────
    // `status: 'active'` só é honesto porque o bloco 2 falha fechado: chegar aqui
    // já implica que o Graph confirmou os dois assets contra o token DESTE
    // rascunho. Se aquele gate virar degradação silenciosa, este 'active' passa a
    // mentir e o resolvedor roteia uma conexão não-confirmada.
    const finalName =
      (typeof display_name === 'string' && display_name.trim()) ||
      (phoneInfo?.verified_name as string) ||
      (wabaInfo?.name as string) ||
      'WhatsApp Oficial';

    const { error: updErr } = await sbAdmin
      .from('whatsapp_meta_connections')
      .update({
        display_name: finalName,
        phone_number_id: String(phone_number_id),
        waba_id: String(waba_id),
        phone_number: (phoneInfo?.display_phone_number as string) ?? null,
        business_account_name: (wabaInfo?.name as string) ?? null,
        quality_rating: (phoneInfo?.quality_rating as string) ?? null,
        messaging_limit_tier: (phoneInfo?.messaging_limit_tier as string) ?? null,
        status: 'active',
        last_health_check_at: new Date().toISOString(),
      })
      .eq('id', connection_id)
      .eq('organization_id', orgId);

    if (updErr) {
      // 23505 = unique_violation no índice PARCIAL de `phone_number_id`
      // (`WHERE phone_number_id IS NOT NULL`, conferido no banco). Situação
      // PREVISTA — o número já está em outra org —, logo erro de NEGÓCIO, não 500.
      if ((updErr as { code?: string }).code === '23505') {
        return json({
          error: 'Este número de WhatsApp já está conectado a outra conta. ' +
            'Desconecte-o de lá antes de conectar aqui.',
          code: 'phone_already_connected',
        }, 409);
      }
      console.error('[embedded-signup-register] update falhou', updErr.message);
      return json({ error: updErr.message }, 500);
    }

    return json({
      connection_id,
      phone_number: (phoneInfo?.display_phone_number as string) ?? null,
      business_account_name: (wabaInfo?.name as string) ?? null,
      display_name: finalName,
    });
  } catch (e) {
    console.error('[embedded-signup-register] unhandled', e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || 'internal error' }, 500);
  }
});
