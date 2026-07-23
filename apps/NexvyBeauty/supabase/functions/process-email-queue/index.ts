import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sendTelegramAlert } from '../_shared/platform-alerts.ts'

interface OutboundEmail {
  run_id?: string
  to: string
  from: string
  sender_domain?: string
  subject: string
  html: string
  text?: string
  purpose?: string
  label?: string
  idempotency_key?: string
  unsubscribe_token?: string
  message_id?: string
}

// Provedor ÚNICO de envio: Resend. O envio real só acontece quando RESEND_API_KEY
// existe — o gate de dry-run (ver Deno.serve) garante que esta função só é chamada
// com a chave presente. Idempotency-Key evita duplicidade em retry/replay.
async function sendEmail(email: OutboundEmail, resendApiKey: string): Promise<void> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
      ...(email.idempotency_key ? { 'Idempotency-Key': email.idempotency_key } : {}),
    },
    body: JSON.stringify({
      from: email.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      ...(email.text ? { text: email.text } : {}),
    }),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    const err = new Error(`Resend ${resp.status}: ${body.slice(0, 300)}`) as Error & { status: number }
    err.status = resp.status
    throw err
  }
}

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60

// Check if an error is a rate-limit (429) response.
// Uses the .status set by sendEmail on the thrown Resend error; falls back to
// parsing the message for '429'.
function isRateLimited(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return error instanceof Error && error.message.includes('429')
}

// Check if an error is a forbidden (403) response. Retrying won't help.
// Move straight to DLQ.
function isForbidden(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 403
  }
  return error instanceof Error && error.message.includes('403')
}

// Extract Retry-After seconds from a structured error when present, or default to 60s.
function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60
  }
  return 60
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')

    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

// Aceita autenticação service-role em DOIS formatos:
//  • Chave nova opaca "sb_secret_..." (server-side, equivalente a service_role). NÃO é
//    um JWT — parseJwtClaims falharia. O gateway (verify_jwt=true) já validou a chave
//    contra o projeto antes de chegar aqui, então o prefixo confirma o tier de segredo.
//    (O cron do dispatcher usa exatamente esta chave via vault → sem isto, dava 403.)
//  • JWT legado com claim role=service_role.
// Rejeita anon/publishable ("sb_publishable_...") e qualquer JWT sem role=service_role.
function isServiceRoleAuth(token: string): boolean {
  if (token.startsWith('sb_secret_')) return true
  return parseJwtClaims(token)?.role === 'service_role'
}

// Move a message to the dead letter queue and log the reason.
async function moveToDlq(
  supabase: SupabaseClient,
  queue: string,
  msg: { msg_id: number; message: Record<string, unknown> },
  reason: string
): Promise<void> {
  const payload = msg.message
  await supabase.from('email_send_log').insert({
    message_id: payload.message_id,
    template_name: (payload.label || queue) as string,
    recipient_email: payload.to,
    status: 'dlq',
    error_message: reason,
  })
  const { error } = await supabase.rpc('move_to_dlq', {
    source_queue: queue,
    dlq_name: `${queue}_dlq`,
    message_id: msg.msg_id,
    payload,
  })
  if (error) {
    console.error('Failed to move message to DLQ', { queue, msg_id: msg.msg_id, reason, error })
  }

  // Venda não pode falhar em silêncio. Um e-mail na DLQ significa que alguém não
  // recebeu o que devia — no pior caso, o link de acesso da compradora (o
  // welcome-admin-access morreu 7x na DLQ sem ninguém saber). Aciona o operador na
  // hora. Non-fatal por design: sendTelegramAlert degrada gracioso sem os secrets.
  const critico = String(payload.label || queue).includes('welcome-admin')
  await sendTelegramAlert(
    `${critico ? '🔴 ACESSO DA COMPRADORA' : '⚠️ E-mail'} na DLQ (${queue})\n` +
    `template: ${payload.label || queue}\n` +
    `para: ${payload.to ?? '?'}\n` +
    `motivo: ${reason}`
  ).catch(() => {})
}

Deno.serve(async (req) => {
  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  // GATE de go-live (req #4): o envio real exige, CUMULATIVAMENTE, três condições:
  //   (1) RESEND_API_KEY presente;
  //   (2) EMAIL_SEND_ENABLED='true' — switch de go-live EXPLÍCITO;
  //   (3) EMAIL_DRY_RUN != 'true'.
  // Default = DRY-RUN (seguro): sem o switch explícito, o dispatcher drena a fila e
  // registra cada mensagem como 'dry_run' no email_send_log, mas NÃO chama a Resend
  // (não envia). Assim, deployar este dispatcher NUNCA liga envio real sozinho — mesmo
  // com a RESEND_API_KEY já configurada — e o cron não quebra nem entope a fila.
  // Go-live: Marcelo seta EMAIL_SEND_ENABLED=true (a RESEND_API_KEY já existe em prod)
  // após confirmar SPF/DKIM/DMARC do domínio na Resend.
  const sendEnabled = Deno.env.get('EMAIL_SEND_ENABLED') === 'true'
  const dryRun =
    Deno.env.get('EMAIL_DRY_RUN') === 'true' || !sendEnabled || !resendApiKey

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required Supabase environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (dryRun) {
    console.log(
      'process-email-queue em DRY-RUN (falta EMAIL_SEND_ENABLED=true, ou RESEND_API_KEY ausente, ou EMAIL_DRY_RUN=true) — vai drenar e registrar, sem enviar'
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Defense in depth: verify_jwt=true already requires a valid JWT at the
  // gateway layer. This adds an explicit role check so only service-role
  // callers can trigger queue processing.
  const token = authHeader.slice('Bearer '.length).trim()
  if (!isServiceRoleAuth(token)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1. Check rate-limit cooldown and read queue config
  const { data: state } = await supabase
    .from('email_send_state')
    .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
    .single()

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'rate_limited' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  }

  let totalProcessed = 0

  // 2. Process auth_emails first (priority), then transactional_emails
  for (const queue of ['auth_emails', 'transactional_emails']) {
    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError) {
      console.error('Failed to read email batch', { queue, error: readError })
      continue
    }

    if (!messages?.length) continue

    // Retry budget is based on real send failures, not pgmq read_ct.
    // read_ct increments for every message in a claimed batch, including
    // messages not attempted when a 429 stops processing early.
    const messageIds = Array.from(
      new Set(
        messages
          .map((msg: { message?: { message_id?: unknown } }) =>
            msg?.message?.message_id && typeof msg.message.message_id === 'string'
              ? msg.message.message_id
              : null
          )
          .filter((id: string | null): id is string => Boolean(id))
      )
    )
    const failedAttemptsByMessageId = new Map<string, number>()
    if (messageIds.length > 0) {
      const { data: failedRows, error: failedRowsError } = await supabase
        .from('email_send_log')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('status', 'failed')

      if (failedRowsError) {
        console.error('Failed to load failed-attempt counters', {
          queue,
          error: failedRowsError,
        })
      } else {
        for (const row of failedRows ?? []) {
          const messageId = row?.message_id
          if (typeof messageId !== 'string' || !messageId) continue
          failedAttemptsByMessageId.set(
            messageId,
            (failedAttemptsByMessageId.get(messageId) ?? 0) + 1
          )
        }
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const payload = msg.message
      const failedAttempts =
        payload?.message_id && typeof payload.message_id === 'string'
          ? (failedAttemptsByMessageId.get(payload.message_id) ?? 0)
          : msg.read_ct ?? 0

      // Drop expired messages (TTL exceeded).
      // Prefer payload.queued_at when present; fall back to PGMQ's enqueued_at
      // which is always set by the queue.
      const queuedAt = payload.queued_at ?? msg.enqueued_at
      if (queuedAt) {
        const ageMs = Date.now() - new Date(queuedAt).getTime()
        const maxAgeMs = ttlMinutes[queue] * 60 * 1000
        if (ageMs > maxAgeMs) {
          console.warn('Email expired (TTL exceeded)', {
            queue,
            msg_id: msg.msg_id,
            queued_at: queuedAt,
            ttl_minutes: ttlMinutes[queue],
          })
          await moveToDlq(supabase, queue, msg, `TTL exceeded (${ttlMinutes[queue]} minutes)`)
          continue
        }
      }

      // Move to DLQ if max failed send attempts reached.
      if (failedAttempts >= MAX_RETRIES) {
        await moveToDlq(supabase, queue, msg, `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`)
        continue
      }

      // Guard: skip if another worker already sent this message (VT expired race)
      if (payload.message_id) {
        const { data: alreadySent } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', payload.message_id)
          .eq('status', 'sent')
          .maybeSingle()

        if (alreadySent) {
          console.warn('Skipping duplicate send (already sent)', {
            queue,
            msg_id: msg.msg_id,
            message_id: payload.message_id,
          })
          const { error: dupDelError } = await supabase.rpc('delete_email', {
            queue_name: queue,
            message_id: msg.msg_id,
          })
          if (dupDelError) {
            console.error('Failed to delete duplicate message from queue', { queue, msg_id: msg.msg_id, error: dupDelError })
          }
          continue
        }
      }

      try {
        if (dryRun) {
          console.log('DRY-RUN: e-mail não enviado', {
            queue,
            msg_id: msg.msg_id,
            to: payload.to,
            label: payload.label,
          })
        } else {
          await sendEmail(
            {
              run_id: payload.run_id,
              to: payload.to,
              from: payload.from,
              sender_domain: payload.sender_domain,
              subject: payload.subject,
              html: payload.html,
              text: payload.text,
              purpose: payload.purpose,
              label: payload.label,
              idempotency_key: payload.idempotency_key,
              unsubscribe_token: payload.unsubscribe_token,
              message_id: payload.message_id,
            },
            resendApiKey
          )
        }

        // Registra o desfecho: 'sent' (envio real) ou 'dry_run' (gated, sem enviar).
        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: dryRun ? 'dry_run' : 'sent',
        })

        // Remove da fila (drena mesmo em dry-run p/ a fila não entupir).
        const { error: delError } = await supabase.rpc('delete_email', {
          queue_name: queue,
          message_id: msg.msg_id,
        })
        if (delError) {
          console.error('Failed to delete processed message from queue', { queue, msg_id: msg.msg_id, error: delError })
        }
        totalProcessed++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('Email send failed', {
          queue,
          msg_id: msg.msg_id,
          read_ct: msg.read_ct,
          failed_attempts: failedAttempts,
          error: errorMsg,
        })

        if (isRateLimited(error)) {
          await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'rate_limited',
            error_message: errorMsg.slice(0, 1000),
          })

          const retryAfterSecs = getRetryAfterSeconds(error)
          await supabase
            .from('email_send_state')
            .update({
              retry_after_until: new Date(
                Date.now() + retryAfterSecs * 1000
              ).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', 1)

          // Stop processing — remaining messages stay in queue (VT expires, retried next cycle)
          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'rate_limited' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        // 403s are permanent configuration or authorization failures for this
        // message, so move straight to DLQ and stop processing the rest of the batch.
        if (isForbidden(error)) {
          await moveToDlq(supabase, queue, msg, errorMsg.slice(0, 1000))
          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'forbidden' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        // Log non-429 failures to track real retry attempts.
        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'failed',
          error_message: errorMsg.slice(0, 1000),
        })
        if (payload?.message_id && typeof payload.message_id === 'string') {
          failedAttemptsByMessageId.set(payload.message_id, failedAttempts + 1)
        }

        // Non-429 errors: message stays invisible until VT expires, then retried
      }

      // Small delay between sends to smooth bursts
      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }
  }

  return new Response(
    JSON.stringify({ processed: totalProcessed, dry_run: dryRun }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
