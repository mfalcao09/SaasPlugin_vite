// WS3 — Reativação · util de envio compartilhado.
//
// Espelha EXATAMENTE o padrão provado em LeadNbaCard.apply():
//   supabase.functions.invoke('evolution-send', { body: { type:'text', to, payload:{ text } } })
// Recomendação → ação: a mensagem pronta da IA vira disparo real no WhatsApp.
//
// Nunca lança. Sempre resolve em um ReactivationOutcome.
import { supabase } from '@/integrations/supabase/client'
import type { OpportunityCardData, ReactivationOutcome } from '@/cockpit/types'
import { normalizeBrPhone } from '@/cockpit/types'

/** Heurística leve: o erro do Evolution indica que não há instância conectada? */
function looksLikeNoInstance(raw: unknown): boolean {
  const msg = String(
    (raw as { message?: string; error?: string })?.message ??
      (raw as { error?: string })?.error ??
      raw ??
      '',
  ).toLowerCase()
  return (
    msg.includes('no evolution instance') ||
    msg.includes('instance') ||
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('disconnected') ||
    msg.includes('not connected')
  )
}

export async function sendReactivation(item: OpportunityCardData): Promise<ReactivationOutcome> {
  const phone = normalizeBrPhone(item.phone)
  if (!phone) return 'no_phone'
  if (!item.followupMessage) return 'error'

  try {
    const { data, error } = await supabase.functions.invoke('evolution-send', {
      body: { type: 'text', to: phone, payload: { text: item.followupMessage } },
    })

    if (error) {
      // O erro pode trazer detalhe no .context (FunctionsHttpError) além da .message.
      const ctx = (error as { context?: unknown })?.context
      return looksLikeNoInstance(error) || looksLikeNoInstance(ctx) ? 'no_instance' : 'error'
    }
    if ((data as { error?: unknown })?.error) return 'error'
    if ((data as { ok?: boolean })?.ok === false) return 'error'

    // Sucesso → marca a oportunidade como acionada (best-effort, nunca derruba o envio).
    try {
      await supabase
        .from('opportunity_scan_items')
        .update({ action_applied: true, action_applied_at: new Date().toISOString() })
        .eq('id', item.id)
    } catch {
      // silêncio proposital: a marcação é secundária; o que importa é que enviou.
    }

    // Trilha do "R$ recuperado" (F2.1): registra o disparo em reactivation_log —
    // é ela que permite atribuir agendamentos concluídos à reativação (view
    // recovered_agendamentos). organization_id tem DEFAULT no servidor
    // (get_user_organization), então o insert não envia tenant. Best-effort.
    try {
      await (supabase as any).from('reactivation_log').insert({
        phone,
        deal_value: Number.isFinite(item.dealValue) ? item.dealValue : null,
        message: item.followupMessage,
        source: 'reactivation',
      })
    } catch {
      // best-effort: a trilha não pode derrubar o envio.
    }

    return 'sent'
  } catch (e) {
    return looksLikeNoInstance(e) ? 'no_instance' : 'error'
  }
}
