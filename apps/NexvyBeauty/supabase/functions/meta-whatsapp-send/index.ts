// meta-whatsapp-send
//
// AUTH (adaptação declarada do porte): o original tinha `if (!auth) return 401`,
// que só verifica se o header EXISTE — a anon key pública (que vai no bundle do
// front) passava, e daí em diante o service_role operava sobre QUALQUER
// connection_id de QUALQUER org. Trocado por authenticateTenant + gate de org
// contra a org DA CONEXÃO. A versão de plataforma já havia corrigido isto
// (authenticatePlatformAgent); o Vendus, não.
// Envia mensagem via Cloud API. Detecta janela 24h:
//  - dentro: texto/mídia livre
//  - fora: exige template HSM aprovado

import { createClient } from 'npm:@supabase/supabase-js@2';
import { GRAPH_BASE, graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { normalizePhoneBR } from '../_shared/phone.ts';
import { canSendWhatsAppToPhone } from '../_shared/optin-guard.ts';
import { authenticateTenant, assertOrgAccess } from '../_shared/tenant-auth.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);


  const sbAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Auth real (adaptação do porte): rejeita a anon key — que não é sessão de
  // usuário — e resolve a org do chamador a partir de profiles. Esta é a função
  // mais sensível das 9: ela DISPARA mensagem de WhatsApp. No original a única
  // barreira era `if (!authHeader) return 401`, que a anon key do bundle passava.
  const auth = await authenticateTenant(req, sbAdmin, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;

  const body = await req.json().catch(() => ({}));
  const {
    connection_id,
    organization_id,
    to,                        // telefone destino
    conversation_id,           // opcional: para gravar mensagem + checar janela
    type = 'text',             // text | template | image | audio | video | document
    text,                      // string
    media,                     // { id?, link?, caption?, filename? }
    template,                  // { name, language, components? }  OR { template_id, variable_mapping, lead_id, context }
  } = body ?? {};


  if (!connection_id || !to) return json({ error: 'missing connection_id or to' }, 400);

  const { data: conn, error: connErr } = await sbAdmin
    .from('whatsapp_meta_connections')
    .select('*')
    .eq('id', connection_id)
    .maybeSingle();
  if (connErr || !conn) return json({ error: 'connection not found' }, 404);

  // Gate de org contra a org DA CONEXÃO. A linha `organization_id && ...` abaixo
  // é verificação de CONSISTÊNCIA, não de autorização: ela só roda se o chamador
  // ENVIAR organization_id no body — bastava omitir para pular o gate. Mantida
  // (pega inconsistência de chamador honesto), mas o gate de verdade é este.
  const denied = assertOrgAccess(auth, conn.organization_id as string, corsHeaders);
  if (denied) return denied;

  if (organization_id && conn.organization_id !== organization_id) return json({ error: 'org mismatch' }, 403);
  {
    const { assertOrgActive } = await import('../_shared/org-status.ts');
    const guard = await assertOrgActive(sbAdmin, conn.organization_id);
    if (!guard.ok) return json(guard.body, guard.status);
  }
  if (conn.status !== 'active') return json({ error: `connection status=${conn.status}` }, 422);

  // janela 24h
  if (conversation_id && type !== 'template') {
    const { data: ok } = await sbAdmin.rpc('is_within_24h_window', { _conversation_id: conversation_id });
    if (!ok) {
      return json({ error: 'OUT_OF_WINDOW', message: 'Fora da janela 24h — envie um template HSM aprovado.' }, 422);
    }
  }

  const accessToken = await decryptSecret(conn.access_token_encrypted);
  const toNorm = (normalizePhoneBR(to) ?? String(to)).replace(/^\+/, '');

  // opt-in guard: bloqueia envios para leads que pediram para sair
  const allowed = await canSendWhatsAppToPhone(sbAdmin, conn.organization_id, toNorm);
  if (!allowed) {
    return json({ error: 'OPTED_OUT', message: 'Lead optou por sair da lista de WhatsApp.' }, 422);
  }


  // build payload
  const payload: any = { messaging_product: 'whatsapp', to: toNorm, type };
  if (type === 'text') {
    payload.text = { body: text ?? '', preview_url: true };
  } else if (type === 'template') {
    // Modo A: chamada já traz {name, language, components}
    // Modo B: chamada traz {template_id, variable_mapping, lead_id, context} → resolvemos aqui
    let tplName = template?.name;
    let tplLang = template?.language;
    let tplComponents = template?.components;
    let resolvedPreview: string | null = text ?? null;
    let resolvedTplRow: any = null;

    if (!tplName && template?.template_id) {
      const { data: row } = await sbAdmin.from('whatsapp_meta_templates')
        .select('id, name, language, status, components, header_media_id, header_media_url, header_media_uploaded_at, header_media_storage_path, header_media_mime, header_media_filename, usage_count')
        .eq('id', template.template_id).maybeSingle();
      if (!row) return json({ error: 'template not found' }, 404);
      if (row.status !== 'APPROVED') return json({ error: `template status=${row.status}` }, 422);
      resolvedTplRow = row;
      tplName = row.name;
      tplLang = row.language;

      const { resolveVariableValues, buildSendComponents, renderTemplatePreview } =
        await import('../_shared/meta-template-builder.ts');

      // Header de mídia obrigatório: se template requer e não tem nada, falha cedo
      const headerComp = (row.components as any[])?.find((c: any) => c?.type === 'HEADER');
      const needsMedia = headerComp?.format && headerComp.format !== 'TEXT';
      if (needsMedia && !row.header_media_id && !row.header_media_url) {
        return json({
          error: 'MISSING_HEADER_MEDIA',
          message: 'Template com header de vídeo/imagem sem mídia configurada. Edite o template em Conexões → API Oficial → Templates.',
        }, 422);
      }

      // Refresh do media_id quando >25 dias (Meta expira em ~30)
      if (needsMedia && row.header_media_storage_path) {
        const uploadedAt = row.header_media_uploaded_at ? new Date(row.header_media_uploaded_at).getTime() : 0;
        const ageDays = uploadedAt ? (Date.now() - uploadedAt) / (1000 * 60 * 60 * 24) : 999;
        if (ageDays > 25) {
          try {
            const refreshRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-whatsapp-media-upload`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                connection_id,
                storage_path: row.header_media_storage_path,
                template_id: row.id,
                mime_type: row.header_media_mime,
                filename: row.header_media_filename,
              }),
            });
            const refreshed = await refreshRes.json().catch(() => null);
            if (refreshed?.media_id) {
              row.header_media_id = refreshed.media_id;
              row.header_media_url = refreshed.public_url ?? row.header_media_url;
              row.header_media_uploaded_at = refreshed.uploaded_at;
            }
          } catch (e) {
            console.warn('[meta-send] refresh media_id falhou', e);
          }
        }
      }

      let lead: any = null;
      if (template.lead_id) {
        const { data: ld } = await sbAdmin.from('leads')
          .select('id, name, email, phone, temperature, metadata').eq('id', template.lead_id).maybeSingle();
        lead = ld;
      }
      const mappingWithTpl = { ...(template.variable_mapping ?? {}), __template: row };
      try {
        const values = await resolveVariableValues({
          sb: sbAdmin,
          organizationId: conn.organization_id,
          components: row.components as any[],
          mapping: mappingWithTpl,
          lead,
          context: template.context ?? '',
        });
        tplComponents = buildSendComponents({ components: row.components as any[], values });
        resolvedPreview = renderTemplatePreview(row.components as any[], values);
      } catch (e: any) {
        if (String(e?.message ?? '').includes('MISSING_HEADER_MEDIA')) {
          return json({
            error: 'MISSING_HEADER_MEDIA',
            message: 'Template com header de vídeo/imagem sem mídia configurada. Edite o template em Conexões → API Oficial → Templates.',
          }, 422);
        }
        throw e;
      }
    }

    if (!tplName || !tplLang) return json({ error: 'template.name e template.language obrigatórios' }, 400);
    payload.template = {
      name: tplName,
      language: { code: tplLang },
      ...(tplComponents ? { components: tplComponents } : {}),
    };
    // Sobrescreve text para que o registro no inbox mostre a preview real
    if (resolvedPreview) (body as any)._preview = resolvedPreview;
    if (resolvedTplRow) (body as any)._tplRow = resolvedTplRow;
  } else if (['image', 'audio', 'video', 'document', 'sticker'].includes(type)) {

    payload[type] = { ...(media ?? {}) };
  } else {
    return json({ error: `tipo ${type} não suportado` }, 400);
  }

  // send
  let res: any;
  try {
    res = await graphFetch(`/${conn.phone_number_id}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const ge = e as GraphError;
    if (conversation_id) {
      await sbAdmin.from('webchat_messages').insert({
        conversation_id,
        direction: 'outbound',
        sender_type: 'agent',
        content: text ?? `[${type}]`,
        content_type: 'text',
        delivery_status: 'failed',
        metadata: { error: ge.graph?.message ?? String(e), payload },
      });
    }
    return json({ error: ge.graph?.message ?? String(e) }, ge.status ?? 500);
  }

  const metaMsgId = res?.messages?.[0]?.id ?? null;
  const previewText = (body as any)?._preview ?? text ?? `[${type}]`;
  const tplRow = (body as any)?._tplRow ?? null;

  if (conversation_id) {
    await sbAdmin.from('webchat_messages').insert({
      conversation_id,
      direction: 'outbound',
      sender_type: 'agent',
      content: previewText,
      content_type: type === 'text' || type === 'template' ? 'text' : (type === 'image' ? 'image' : type === 'audio' ? 'audio' : 'file'),
      message_type: type,
      meta_message_id: metaMsgId,
      delivery_status: 'sent',
      metadata: { meta_send_payload_type: type, ...(template ? { template } : {}), ...(media ? { media } : {}) },
    });
    await sbAdmin.from('webchat_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation_id);
  }

  if (type === 'template' && tplRow?.id) {
    await sbAdmin.from('whatsapp_meta_templates').update({
      usage_count: (tplRow.usage_count ?? 0) + 1,
      last_send_at: new Date().toISOString(),
      last_send_error: null,
    }).eq('id', tplRow.id);
  }

  return json({ ok: true, meta_message_id: metaMsgId });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
