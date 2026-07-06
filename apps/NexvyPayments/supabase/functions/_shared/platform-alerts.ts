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
