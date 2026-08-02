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
    const { code, phone_number_id, waba_id, business_name } = body ?? {};

    // resolveOrgId IGNORA o organization_id do body para usuário de tenant e
    // deriva da própria org do JWT. Só service_role/super_admin podem apontar
    // outra org. Nunca confiar em org vinda do cliente.
    const orgId = resolveOrgId(auth, body?.organization_id ?? null);
    if (!orgId) return json({ error: 'organizacao nao resolvida para este usuario' }, 403);

    if (!code || !phone_number_id || !waba_id) {
      return json({ error: 'code, phone_number_id e waba_id sao obrigatorios' }, 400);
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

    // ── 3. AUTORIZAÇÃO DO RECURSO (não é enriquecimento — é gate) ────────────
    // `phone_number_id` e `waba_id` chegam do BODY, escolhidos pelo cliente.
    // Validar o organization_id não basta: sem checar estes dois, um tenant com
    // um code legítimo do PRÓPRIO WABA pode gravar o número de OUTRO negócio.
    // Como `phone_number_id` tem UNIQUE parcial, isso não vaza dado — faz pior:
    // trava o dono real fora, que passa a receber o 409 "já está em outra conta"
    // sem nenhum rastro de que o número foi tomado.
    //
    // O Graph é o árbitro: ele só responde por um asset se o token tiver acesso
    // a ele. Como o token veio do code que ESTE usuário autorizou, "o Graph
    // respondeu" é prova de que o asset pertence a quem está conectando.
    //
    // FALHA FECHADA, de propósito: se o Graph estiver fora, um tenant legítimo
    // é recusado e tenta de novo. O inverso — aceitar sem confirmar — grava um
    // squat permanente. Recusa é reversível; squat não.
    let phoneInfo: Record<string, unknown>;
    let wabaInfo: Record<string, unknown>;
    try {
      // graphFetch põe o token no header Authorization. Nunca na query string,
      // que vaza em log de proxy, CDN, APM e histórico de erro.
      [phoneInfo, wabaInfo] = await Promise.all([
        graphFetch<Record<string, unknown>>(
          `/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`,
          accessToken,
        ),
        graphFetch<Record<string, unknown>>(`/${waba_id}?fields=name,id`, accessToken),
      ]);
    } catch (e) {
      // graphFetch lança GraphError em qualquer não-2xx, então este catch vê
      // erro da API da Meta e não só falha de rede (`fetch` sozinho resolve
      // normalmente em 4xx — foi assim que a versão anterior deste bloco
      // prometia um tratamento que nunca executava).
      console.warn('[embedded-signup-exchange] Graph recusou os assets', String(e));
      return json({
        error: 'Nao foi possivel confirmar este numero na conta que voce autorizou. ' +
          'Refaca a conexao e selecione um numero da sua propria conta.',
        code: 'asset_not_authorized',
      }, 403);
    }

    // Defesa em profundidade: 2xx com corpo vazio não é confirmação.
    if (!phoneInfo?.display_phone_number || String(wabaInfo?.id ?? '') !== String(waba_id)) {
      console.warn('[embedded-signup-exchange] assets nao confirmados', { phone_number_id, waba_id });
      return json({
        error: 'Este numero nao pertence a conta que voce autorizou.',
        code: 'asset_not_authorized',
      }, 403);
    }

    // ── 3. INSERT ÚNICO E COMPLETO ──────────────────────────────────────────
    // INVARIANTE: este fluxo NUNCA grava conexão parcial. Ou a linha fecha com
    // token + waba_id + phone_number_id, ou não existe. Ao contrário do wizard
    // manual (humano preenchendo em minutos, precisa de rascunho), aqui tudo
    // chega junto e o code morre em 30s — não há estado intermediário legítimo.
    // Conexão órfã sem phone_number_id nesta tabela não veio deste caminho.
    //
    // `status: 'active'` só é honesto porque o bloco 2 falha fechado: chegar
    // aqui já implica que o Graph confirmou os dois assets contra o token. Se
    // aquele gate um dia virar degradação silenciosa, este 'active' passa a
    // mentir e o resolvedor unificado roteia uma conexão não-confirmada.
    const displayName =
      (typeof business_name === 'string' && business_name.trim()) ||
      (wabaInfo?.name as string) ||
      (phoneInfo?.verified_name as string) ||
      'WhatsApp Oficial';

    const { data: row, error } = await sbAdmin
      .from('whatsapp_meta_connections')
      .insert({
        organization_id: orgId,
        display_name: displayName,                   // NOT NULL
        webhook_verify_token: generateVerifyToken(), // NOT NULL
        app_id: appId,
        // No self-service o app é NOSSO: existe UM secret, em env do servidor.
        // Cifrar por conexão replicaria N vezes o mesmo segredo — mais
        // superfície, zero ganho. Daí as duas decisões abaixo, pelo mesmo motivo:
        //
        //   * `app_secret_source: 'platform'` DECLARA onde o webhook busca o
        //     secret. Sem esta linha o default é 'connection', o webhook procura
        //     na conexão, não acha, e NEGA todo inbound com 403. É a linha que
        //     faz o WhatsApp do salão receber mensagem.
        //   * `app_secret_encrypted` fica NULL — e agora NULL significa só "não
        //     tem", não "adivinhe o modelo". O contrato entre o caminho manual
        //     (app do cliente) e o self-service (app nosso) está declarado na
        //     coluna, não implícito na ausência de dado.
        app_secret_source: 'platform',
        access_token_encrypted: await encryptSecret(accessToken),
        phone_number_id: String(phone_number_id),
        waba_id: String(waba_id),
        phone_number: (phoneInfo?.display_phone_number as string) ?? null,
        business_account_name: (wabaInfo?.name as string) ?? null,
        quality_rating: (phoneInfo?.quality_rating as string) ?? null,
        messaging_limit_tier: (phoneInfo?.messaging_limit_tier as string) ?? null,
        status: 'active',
        last_health_check_at: new Date().toISOString(),
        created_by: auth.userId,
      })
      .select('id')
      .single();

    if (error) {
      // 23505 = unique_violation. `phone_number_id` tem UNIQUE parcial para
      // impedir no banco a ambiguidade cross-tenant que o webhook resolveria
      // errado. É situação prevista, logo é erro de NEGÓCIO — não 500.
      if ((error as { code?: string }).code === '23505') {
        return json({
          error: 'Este numero de WhatsApp ja esta conectado a outra conta. ' +
            'Desconecte-o de la antes de conectar aqui.',
          code: 'phone_already_connected',
        }, 409);
      }
      console.error('[embedded-signup-exchange] insert falhou', error.message);
      return json({ error: error.message }, 500);
    }

    return json({
      connection_id: row.id,
      phone_number: (phoneInfo?.display_phone_number as string) ?? null,
      business_account_name: (wabaInfo?.name as string) ?? null,
    });
  } catch (e) {
    console.error('[embedded-signup-exchange] unhandled', e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || 'internal error' }, 500);
  }
});
