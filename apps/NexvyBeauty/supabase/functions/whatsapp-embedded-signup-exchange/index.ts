// whatsapp-embedded-signup-exchange — troca o code do Embedded Signup por um
// token de negócio e grava a conexão Meta ORG-SCOPED do tenant.
//
// Caminho SELF-SERVICE (o dono do salão conecta o próprio número). O irmão
// `platform-meta-whatsapp-connect` é o caminho MANUAL, product-scoped, operado
// pelo super-admin — ator, escopo e tabela diferentes. Os dois coexistem por
// desenho, não por dívida.
//
// ⚠️ TTL DE 30 SEGUNDOS. O code devolvido pelo `FB.login` expira em 30s. Por isso:
//   * a troca é a PRIMEIRA coisa que acontece depois do gate de auth;
//   * não há fila, retry com backoff nem job — não existe "depois";
//   * validação no Graph só DEPOIS do token na mão (validar antes mata o code);
//   * imports mantidos no mínimo — cold start de edge come a janela.
// Por isso também NÃO importamos `_shared/meta-ads-oauth.ts`: ele carrega
// credencial do app de Ads e mantém cache global. A troca é um fetch de ~10
// linhas; acoplar ao módulo de Ads custaria mais do que reimplementar.
//
// ⚠️ AUTORIZAÇÃO É NOSSA. INSERT nesta tabela é `is_super_admin()` only, então
// rodamos com service_role — e com service_role o RLS não protege mais nada. O
// gateway do Supabase aceita a ANON KEY (pública, no bundle JS) como
// Authorization válida: sem `authenticateTenant` aqui, qualquer pessoa da
// internet conectaria um WhatsApp em qualquer org. Ver _shared/tenant-auth.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch } from '../_shared/meta-graph.ts';
import { encryptSecret, generateVerifyToken } from '../_shared/meta-crypto.ts';
import { authenticateTenant, resolveOrgId } from '../_shared/tenant-auth.ts';
import { fetchChannelUsage, channelLimitMessage, type ChannelUsage } from '../_shared/channel-limit.ts';

const GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') || 'v21.0';

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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

    const auth = await authenticateTenant(req, sbAdmin, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await req.json().catch(() => ({}));
    const { code } = body ?? {};

    // resolveOrgId IGNORA o organization_id do body para usuário de tenant e
    // deriva da própria org do JWT. Só service_role/super_admin podem apontar
    // outra org. Nunca confiar em org vinda do cliente.
    const orgId = resolveOrgId(auth, body?.organization_id ?? null);
    if (!orgId) return json({ error: 'organizacao nao resolvida para este usuario' }, 403);

    // ⚠️ `phone_number_id`/`waba_id` NÃO entram mais por aqui. Antes chegavam do
    // `postMessage` do SDK e esta função gravava a conexão inteira num passo. O
    // fluxo virou duas chamadas — esta troca o code e LISTA os ativos; a
    // `-register` grava o que o usuário escolher. Motivos, na ordem em que pesam:
    //
    //   1. O `postMessage` era um SEGUNDO canal assíncrono. Se não chegasse
    //      (bloqueado, popup fechada cedo, sessionInfoVersion divergente), o botão
    //      ficava em "Conectando…" para sempre, sem erro. E havia corrida: o
    //      callback do FB.login podia disparar ANTES do postMessage, mandando ids
    //      vazios. Perguntar ao Graph elimina os dois — é uma requisição que nós
    //      controlamos, não um evento que torcemos para receber.
    //   2. A escolha do número passa a acontecer numa tela NOSSA — que é o que o
    //      analista da Meta pediu para ver ("um usuário fornecendo ao app acesso
    //      ao recurso"). Um postMessage invisível não aparece em vídeo nenhum.
    if (!code) {
      return json({ error: 'code e obrigatorio' }, 400);
    }

    const appId = Deno.env.get('META_WHATSAPP_APP_ID');
    const appSecret = Deno.env.get('META_WHATSAPP_APP_SECRET');
    if (!appId || !appSecret) {
      console.error('[embedded-signup-exchange] META_WHATSAPP_APP_ID/SECRET ausentes');
      return json({ error: 'integracao Meta nao configurada no servidor' }, 500);
    }

    // ── 1. TROCA IMEDIATA (a janela é de 30s; nada antes disto) ──────────────
    const tokenUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('code', String(code));

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenBody = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenBody?.access_token) {
      // Não há segunda chance com o mesmo code: ele já foi consumido ou expirou.
      // A UX correta é "tente conectar de novo", nunca "estamos processando".
      console.error('[embedded-signup-exchange] troca falhou', tokenBody?.error ?? tokenRes.status);
      return json({
        error: 'nao foi possivel concluir a conexao. Tente conectar novamente.',
        detail: tokenBody?.error?.message ?? `graph ${tokenRes.status}`,
        retryable: true,
      }, 400);
    }
    const accessToken = String(tokenBody.access_token);

    // ── 2. LIMITE DE CANAIS DO PLANO ────────────────────────────────────────
    // Slot COMPARTILHADO: `max_connections` conta Evolution (QR) + Meta Cloud
    // somados. Org com limite 1 escolhe um dos dois, nunca os dois.
    //
    // POR QUE DEPOIS DA TROCA, e não antes: o code vale 30s e é perecível. Um
    // gate antes da troca transforma qualquer lentidão do banco em "refaça todo
    // o fluxo da Meta" — UX muito pior que "você atingiu o limite". Se o tenant
    // estiver no limite, perder o code é irrelevante: ele seria recusado de
    // qualquer forma. O risco assimétrico é um só — check lento que PASSA e
    // deixa o code expirar. Por isso a troca vem primeiro e nada a antecede.
    //
    // POR QUE ANTES DO GRAPH: este é RPC local (milissegundos); o bloco 3 é rede
    // externa. Recusar barato antes de gastar caro — e não incomodamos a API da
    // Meta por uma conexão que já sabemos que não vamos gravar.
    //
    // A aritmética NÃO vive aqui nem no helper: vive em `get_org_channel_usage`.
    // O front lê a MESMA função (hook `useOrgChannelUsage`). Reimplementar a
    // contagem em TS criaria a segunda definição da regra — foi exatamente
    // assim que o defeito de 2026-08-01 nasceu: três gates contando uma tabela
    // só, cada um internamente correto, nenhum somando a tabela nova.
    let usage: ChannelUsage;
    try {
      usage = await fetchChannelUsage(sbAdmin, orgId);
    } catch (e) {
      // Falha de LEITURA nunca vira política de negócio. Um `?? 1` aqui capava
      // um cliente Ultra em uma conexão e ainda afirmava isso a ele como se
      // fosse o plano contratado. 503: é indisponibilidade, e é retentável.
      console.error('[embedded-signup-exchange] limites indisponiveis', String(e));
      return json({
        error: (e as Error).message,
        code: 'plan_limits_unavailable',
        retryable: true,
      }, 503);
    }

    if (usage.used >= usage.limit) {
      // Limite atingido é situação PREVISTA — é UX, não erro. A mensagem do
      // helper diz as três coisas necessárias para agir: o que ela já tem, o
      // que liberar, e a alternativa. Sem isso a dona do salão conclui que o
      // produto quebrou — e com slot compartilhado o canal que ocupa a vaga
      // pode ser de um tipo diferente do que ela está tentando conectar.
      return json({
        error: channelLimitMessage(usage, 'meta'),
        code: 'channel_limit_reached',
        limit_reached: true,
        by_type: usage.by_type,
      }, 409);
    }

    // ── 3. RASCUNHO + LISTAGEM DOS ATIVOS ───────────────────────────────────
    // Limpa rascunhos abandonados desta org ANTES de criar o novo. Quem fecha o
    // wizard na etapa de seleção deixa uma linha `pending` com o token dentro;
    // sem esta linha elas se acumulariam para sempre. Autolimpeza no caminho
    // quente dispensa cron — e cron é a coisa que ninguém lembra de criar.
    // Seguro porque o índice UNIQUE de `phone_number_id` é PARCIAL
    // (`WHERE phone_number_id IS NOT NULL`): N rascunhos coexistem sem colidir.
    await sbAdmin
      .from('whatsapp_meta_connections')
      .delete()
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .is('phone_number_id', null);

    const { data: draft, error: draftError } = await sbAdmin
      .from('whatsapp_meta_connections')
      .insert({
        organization_id: orgId,
        display_name: 'Conexão em andamento',      // NOT NULL; vira o nome real no register
        webhook_verify_token: generateVerifyToken(), // NOT NULL
        app_id: appId,
        // Ver o bloco do register para o contrato completo: no self-service o app
        // é NOSSO, então o secret vive em env e esta coluna DECLARA isso. Sem
        // `app_secret_source: 'platform'` o webhook procura o secret na conexão,
        // não acha, e nega todo inbound com 403.
        app_secret_source: 'platform',
        access_token_encrypted: await encryptSecret(accessToken),
        status: 'pending',
        created_by: auth.userId,
      })
      .select('id')
      .single();

    if (draftError) {
      console.error('[embedded-signup-exchange] rascunho falhou', draftError.message);
      return json({ error: draftError.message }, 500);
    }

    // Pergunta ao Graph o que ESTE token alcança. É daqui que sai a lista da
    // etapa 2 — e é o que substitui o `postMessage`.
    //
    // FALHA FECHADA: sem a lista não há o que escolher, então devolvemos erro em
    // vez de uma tela vazia que o usuário leria como "não tenho nenhuma conta".
    let assets: Record<string, unknown>;
    try {
      // graphFetch põe o token no header Authorization. NUNCA na query string —
      // ali ele vaza em log de proxy, CDN, APM e histórico de erro. (O Intentus,
      // de onde esta tela foi portada, monta `...&access_token=${token}` na URL.)
      assets = await graphFetch<Record<string, unknown>>(
        '/me/businesses?fields=id,name,owned_whatsapp_business_accounts{id,name,' +
          'phone_numbers{id,display_phone_number,verified_name,quality_rating}}',
        accessToken,
      );
    } catch (e) {
      console.warn('[embedded-signup-exchange] Graph recusou a listagem', String(e));
      return json({
        error: 'Não foi possível ler as contas de WhatsApp que você autorizou. ' +
          'Refaça a conexão.',
        code: 'assets_unavailable',
      }, 502);
    }

    return json({ connection_id: draft.id, assets });
  } catch (e) {
    console.error('[embedded-signup-exchange] unhandled', e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || 'internal error' }, 500);
  }
});
