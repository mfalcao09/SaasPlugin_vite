// Alertas operacionais críticos da plataforma via Telegram (canal dedicado).
// Usado quando uma venda paga falha ou desvia do caminho feliz — o operador
// precisa ser acionado na hora (venda não pode falhar em silêncio).
//
// Segurança: NUNCA logar o token. Se as env vars não existirem, degrada
// graciosamente (console.warn + retorno) — nunca lança.
//   - TELEGRAM_ALERT_BOT_TOKEN — bot do canal de alertas
//   - TELEGRAM_ALERT_CHAT_ID   — chat/canal de destino

/**
 * Envia um alerta curto e acionável ao canal de alertas da plataforma.
 * Non-fatal por design: qualquer falha é engolida (console.warn) para não
 * derrubar o fluxo chamador (ex.: webhook de venda).
 */
export async function sendTelegramAlert(text: string): Promise<{ ok: boolean; skipped?: boolean }> {
  const token = Deno.env.get('TELEGRAM_ALERT_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_ALERT_CHAT_ID');

  if (!token || !chatId) {
    // Sem canal configurado — não é erro fatal, apenas não há para onde alertar.
    console.warn('[platform-alerts] TELEGRAM_ALERT_BOT_TOKEN/CHAT_ID ausentes — alerta ignorado');
    return { ok: false, skipped: true };
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    const j = await resp.json().catch(() => ({}));
    if (!j?.ok) console.warn('[platform-alerts] telegram não ok:', j?.description ?? `status ${resp.status}`);
    return { ok: !!j?.ok };
  } catch (err) {
    console.warn('[platform-alerts] falha no envio:', err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// THROTTLE (anti-flood) — pra alertas que podem repetir a CADA mensagem de uma
// mesma conversa (ex.: roteamento órfão com tráfego pago rodando). Guarda o
// último envio por chave, em memória do ISOLATE.
//
// HONESTIDADE SOBRE O LIMITE: edge functions são isolates efêmeros — um cold
// start zera o mapa e o alerta sai de novo. Isto AMORTECE rajada (a mesma
// conversa martelando o mesmo isolate), NÃO é um mutex distribuído. É de
// propósito: dedup forte exigiria tabela/estado, e o custo de um alerta a mais
// é MUITO menor que o de um alerta a menos.
// ───────────────────────────────────────────────────────────────────────────
const DEFAULT_ALERT_THROTTLE_MS = 15 * 60 * 1000; // 15 min por chave
const lastAlertAt = new Map<string, number>();

/**
 * Igual ao sendTelegramAlert, mas no máximo 1 envio por `key` a cada `windowMs`
 * (default 15 min). Use a chave mais específica que fizer sentido — ex.:
 * `orphan-pin:<conversation_id>`.
 */
export async function sendTelegramAlertThrottled(
  key: string,
  text: string,
  windowMs: number = DEFAULT_ALERT_THROTTLE_MS,
): Promise<{ ok: boolean; skipped?: boolean; throttled?: boolean }> {
  const now = Date.now();
  const prev = lastAlertAt.get(key);
  if (prev !== undefined && now - prev < windowMs) {
    return { ok: false, throttled: true };
  }
  lastAlertAt.set(key, now);

  // Poda barata: sem isto o mapa cresceria com o volume de conversas do isolate.
  if (lastAlertAt.size > 500) {
    for (const [k, t] of lastAlertAt) {
      if (now - t >= windowMs) lastAlertAt.delete(k);
    }
  }

  return await sendTelegramAlert(text);
}
