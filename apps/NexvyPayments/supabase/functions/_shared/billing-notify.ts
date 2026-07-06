// _shared/billing-notify.ts
//
// FALLBACK DE CANAL da régua de cobrança (NexvyPayments) — Entregável E1 / §3.2.
//
// Problema: a régua de cobrança (billing-cadence.ts, D1-D3) decide QUANDO e O QUÊ
// notificar. Este arquivo decide POR ONDE — o canal — com FALLBACK. O canal
// PRIMÁRIO é o WhatsApp (via billing_events, que o billing-dispatch-worker
// consome e envia pelo Evolution). MAS nem todo pagador tem WhatsApp —
// condomínio/cowork/mensalidade têm gente que só deixou e-mail. Sem fallback,
// essas notificações se perdem em silêncio (o pior modo de falha de uma
// cobrança). O critério §3.2 E1: payer SEM whatsapp -> a mensagem vai para a
// FILA DE E-MAIL pgmq (a mesma que o `process-email-queue` do Beauty consome),
// em vez do WhatsApp.
//
// SEPARAÇÃO DE CAMADAS (não duplica billing-cadence.ts): cadence = agenda + copy;
// notify = canal + fallback. As edges billing-cadence-tick/-enroll produzem o
// conteúdo (renderFirstMessageContext) e chamam ESTA função para despachar.
//
// COMO decidimos o canal (nesta ordem):
//   1) payer.whatsapp presente  -> billing_events(origem='regua', canal='whatsapp'):
//      o dispatch-worker envia pelo Evolution (fluxo WhatsApp já existente).
//   2) senão, payer.email presente -> enqueue_email('transactional_emails', ...):
//      enfileira na fila pgmq de e-mail. O `process-email-queue` do Beauty
//      (functions/process-email-queue/index.ts:194-199) lê ESSA fila via
//      read_email_batch e dispara o envio (Resend/Lovable) com retry/backoff.
//   3) sem whatsapp E sem email -> falha explícita (unreachable): não engolimos —
//      o gestor precisa saber que o pagador não tem canal (CLAUDE.md §5).
//
// MOLDE DO ENQUEUE (byte-a-byte): send-transactional-email/index.ts:311-327
//   supabase.rpc('enqueue_email', { queue_name: 'transactional_emails', payload: {
//     message_id, to, from, sender_domain, subject, html, text, purpose, label,
//     idempotency_key, queued_at } }).
// O `process-email-queue` consome exatamente esses campos (index.ts:306-323).
//
// ISOLAMENTO (hard fork): NÃO editamos o process-email-queue nem qualquer core
// do Beauty — apenas ENFILEIRAMOS na fila `transactional_emails` que ele já drena.
// Reuso puro do consumidor existente.
//
// Injeção de dependência: client Supabase por parâmetro -> testes 100% offline.

export type CanalNotificacao = 'whatsapp' | 'email';

// Tipo de evento de cobrança que a régua dispara. Vira `billing_events.tipo` no
// caminho WhatsApp e o `label`/assunto no caminho e-mail.
export type TipoNotificacaoCobranca =
  | 'fatura_emitida'
  | 'fatura_vencendo'
  | 'fatura_vencida'
  | 'comprovante';

export interface PayerCanal {
  id: string;
  nome?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}

export interface NotificacaoCobranca {
  invoiceId: string;
  tipo: TipoNotificacaoCobranca;
  /** Assunto/1ª linha da mensagem. */
  assunto: string;
  /** Corpo em texto (usado como text do e-mail e como base do html simples). */
  corpoTexto: string;
  /** Corpo HTML pronto (opcional). Se ausente, derivamos um <div> do corpoTexto. */
  corpoHtml?: string;
  /** Contexto extra para a trilha WhatsApp (linha digitável, pix, url...). */
  payload?: Record<string, unknown>;
}

export interface NotifyResult {
  success: boolean;
  error?: string;
  /** Canal efetivamente usado. */
  canal?: CanalNotificacao;
  /** msg_id da fila pgmq (caminho e-mail) — bigint serializado. */
  email_msg_id?: number | null;
  /** id do billing_events (caminho WhatsApp). */
  event_id?: string | null;
  /** message_id de idempotência do e-mail. */
  message_id?: string | null;
}

// Remetente do e-mail de cobrança. Env-driven com defaults seguros — espelha o
// padrão de SITE_NAME/FROM_DOMAIN do send-transactional-email (sem hardcode de
// segredo; só rótulos públicos).
function fromHeader(): { from: string; senderDomain: string } {
  const site = Deno.env.get('BILLING_EMAIL_SITE_NAME') ?? 'NexvyPayments';
  const domain =
    Deno.env.get('BILLING_EMAIL_FROM_DOMAIN') ?? Deno.env.get('FROM_DOMAIN') ?? 'nexvy.tech';
  return { from: `${site} <cobranca@${domain}>`, senderDomain: domain };
}

// HTML mínimo a partir do texto quando o caller não fornece um template. Escapa
// o básico para não injetar markup a partir de dado do pagador.
function textToHtml(texto: string): string {
  const esc = texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return `<div style="font-family:sans-serif;white-space:pre-wrap;line-height:1.5">${esc}</div>`;
}

/**
 * Notifica o pagador pelo canal disponível, com FALLBACK para e-mail (pgmq)
 * quando não há WhatsApp. É a função da régua/notificação de cobrança do E1.
 *
 * @param supabase        client (service_role em produção; mock nos testes).
 * @param organizationId  org do tenant (escopo das gravações).
 * @param payer           dados de canal do pagador (whatsapp/email).
 * @param notif           conteúdo da notificação.
 */
export async function notificarCobranca(
  supabase: any,
  organizationId: string,
  payer: PayerCanal,
  notif: NotificacaoCobranca,
): Promise<NotifyResult> {
  if (!organizationId) return { success: false, error: 'organizationId obrigatório' };
  if (!payer?.id) return { success: false, error: 'payer inválido' };
  if (!notif?.invoiceId) return { success: false, error: 'invoiceId obrigatório' };

  const temWhatsapp = Boolean(payer.whatsapp && String(payer.whatsapp).trim());
  const temEmail = Boolean(payer.email && String(payer.email).trim());

  // -------------------------------------------------------------- WHATSAPP
  // Canal primário: enfileira em billing_events; o dispatch-worker envia pelo
  // Evolution (fluxo já existente). Mesmo append-only de enviar_comprovante.ts.
  if (temWhatsapp) {
    const { data: evt, error: eErr } = await supabase
      .from('billing_events')
      .insert({
        organization_id: organizationId,
        invoice_id: notif.invoiceId,
        tipo: notif.tipo,
        origem: 'regua',
        payload: {
          canal: 'whatsapp',
          payer_id: payer.id,
          whatsapp: payer.whatsapp,
          assunto: notif.assunto,
          texto: notif.corpoTexto,
          ...(notif.payload ?? {}),
        },
      })
      .select('id')
      .single();

    if (eErr) return { success: false, error: eErr.message };
    return { success: true, canal: 'whatsapp', event_id: evt.id, email_msg_id: null };
  }

  // ------------------------------------------------------------------ E-MAIL
  // FALLBACK do E1: sem WhatsApp -> fila pgmq de e-mail (a que process-email-queue
  // drena). Enfileira via enqueue_email('transactional_emails', payload) — molde
  // send-transactional-email/index.ts:311-327.
  if (temEmail) {
    const { from, senderDomain } = fromHeader();
    // message_id determinístico por (invoice,tipo) -> idempotência: reenfileirar
    // a mesma notificação não duplica o envio (o dispatcher deduplica por
    // message_id em email_send_log; process-email-queue/index.ts:281-303).
    const messageId = `billing:${notif.invoiceId}:${notif.tipo}`;
    const html = notif.corpoHtml ?? textToHtml(notif.corpoTexto);

    const { data: msgId, error: qErr } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: payer.email,
        from,
        sender_domain: senderDomain,
        subject: notif.assunto,
        html,
        text: notif.corpoTexto,
        purpose: 'transactional',
        label: `cobranca_${notif.tipo}`,
        idempotency_key: messageId,
        queued_at: new Date().toISOString(),
      },
    });

    if (qErr) return { success: false, error: qErr.message };
    return {
      success: true,
      canal: 'email',
      email_msg_id: (msgId as number) ?? null,
      message_id: messageId,
      event_id: null,
    };
  }

  // -------------------------------------------------------------- SEM CANAL
  // Nem whatsapp nem email: falha explícita (nunca silenciar — CLAUDE.md §5).
  return {
    success: false,
    error: `Pagador ${payer.id} não tem WhatsApp nem e-mail: notificação de cobrança não pôde ser enfileirada.`,
  };
}
