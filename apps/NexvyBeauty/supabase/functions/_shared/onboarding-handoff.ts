// _shared/onboarding-handoff.ts — HANDOFF Duda→CS pós-compra no MESMO thread.
//
// Chamado por cakto-plan-provisioning.ts (provisionFromOrder, gate org_created):
// depois que a compra provisiona a org, localiza a conversa de VENDA da
// compradora no platform_crm e:
//   1. fixa current_agent_id no agente de CS/implantação ("Lia · Implantação",
//      agent_type='support', seedado em 20260714_onboarding_fase_handoff.sql);
//   2. grava provisioned_organization_id (vínculo conversa↔org) — é ESTE campo
//      que liga o modo implantação do platform-sales-brain.
//
// GATE: ONBOARDING_HANDOFF_ENABLED=true no env. Default OFF — deploy sem o
// secret não muda NADA em produção (vendas ao vivo intocadas).
//
// TOLERANTE POR DESIGN (mesmo padrão de sendWelcomeWhatsApp): nunca lança,
// nunca derruba o provisionamento pago. Sem flag/agente/conversa → loga e segue.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { phoneVariantsBR } from './phone.ts';

export interface OnboardingHandoffArgs {
  organizationId: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
}

export interface OnboardingHandoffResult {
  ok: boolean;
  skipped?: string;
  conversation_id?: string;
  cs_agent_id?: string;
}

export async function handoffConversationToOnboarding(
  admin: SupabaseClient,
  args: OnboardingHandoffArgs,
): Promise<OnboardingHandoffResult> {
  const enabled = (Deno.env.get('ONBOARDING_HANDOFF_ENABLED') ?? '').toLowerCase() === 'true';
  if (!enabled) return { ok: false, skipped: 'flag_off' };
  if (!args.organizationId) return { ok: false, skipped: 'no_organization_id' };

  try {
    // 1) Agente CS de implantação (support + "implanta" no nome). Determinístico:
    //    o mais antigo. Sem ele (migration/seed não aplicados), loga e segue.
    const { data: csAgent, error: agentErr } = await admin
      .from('platform_crm_product_agents')
      .select('id, name, product_id')
      .eq('agent_type', 'support')
      .eq('is_active', true)
      .ilike('name', '%implanta%')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (agentErr) {
      console.warn('[onboarding-handoff] busca do agente CS falhou:', agentErr.message);
      return { ok: false, skipped: 'agent_query_failed' };
    }
    if (!csAgent?.id) {
      console.warn('[onboarding-handoff] nenhum agente CS de implantação (support/%implanta%) ativo — handoff pulado.');
      return { ok: false, skipped: 'no_cs_agent' };
    }

    // 2) Conversa da compradora — 1º por telefone normalizado (todas as
    //    variantes BR: com/sem DDI 55, com/sem o 9 extra) contra
    //    visitor_whatsapp/visitor_phone; canal whatsapp; a mais recente.
    let conversationId: string | null = null;
    const variants = phoneVariantsBR(args.customerPhone);
    if (variants.length) {
      // Os webhooks inbound/outbound gravam visitor_whatsapp/visitor_phone como
      // "+E.164" (platform-meta-whatsapp-webhook:185-186); phoneVariantsBR gera
      // só-dígitos. Cobrimos os dois formatos (match .in. é exato).
      const withPlus = variants.map((v) => `+${v}`);
      const list = [...variants, ...withPlus].join(',');
      const { data: convs, error: convErr } = await admin
        .from('platform_crm_conversations')
        .select('id, last_message_at')
        .eq('channel', 'whatsapp')
        .eq('product_id', csAgent.product_id)
        .or(`visitor_whatsapp.in.(${list}),visitor_phone.in.(${list})`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1);
      if (convErr) console.warn('[onboarding-handoff] busca por telefone falhou:', convErr.message);
      conversationId = convs?.[0]?.id ?? null;
    }

    // 3) Fallback por e-mail: lead do platform_crm com esse e-mail → conversa
    //    vinculada; ou visitor_email direto na conversa.
    const email = (args.customerEmail ?? '').trim().toLowerCase();
    if (!conversationId && email) {
      const { data: leads } = await admin
        .from('platform_crm_leads')
        .select('id')
        .ilike('email', email)
        .limit(10);
      const leadIds = (leads ?? []).map((l: { id: string }) => l.id);

      const orParts = [`visitor_email.ilike.${email}`];
      if (leadIds.length) orParts.push(`lead_id.in.(${leadIds.join(',')})`);
      const { data: convs, error: convErr } = await admin
        .from('platform_crm_conversations')
        .select('id, last_message_at')
        .eq('channel', 'whatsapp')
        .eq('product_id', csAgent.product_id)
        .or(orParts.join(','))
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1);
      if (convErr) console.warn('[onboarding-handoff] busca por e-mail falhou:', convErr.message);
      conversationId = convs?.[0]?.id ?? null;
    }

    if (!conversationId) {
      console.log('[onboarding-handoff] conversa da compradora não encontrada (phone/email) — handoff pulado, provisioning segue.');
      return { ok: false, skipped: 'conversation_not_found', cs_agent_id: csAgent.id };
    }

    // 4) Handoff: agente CS assume + vínculo conversa↔org. NÃO toca status —
    //    a conversa segue bot_active (ou o estado em que estiver).
    const { error: updErr } = await admin
      .from('platform_crm_conversations')
      .update({
        current_agent_id: csAgent.id,
        provisioned_organization_id: args.organizationId,
      })
      .eq('id', conversationId);
    if (updErr) {
      // Coluna ainda não migrada, RLS, etc. — loga e segue (deploy-safe).
      console.warn('[onboarding-handoff] update da conversa falhou:', updErr.message);
      return { ok: false, skipped: 'update_failed', conversation_id: conversationId, cs_agent_id: csAgent.id };
    }

    console.log(`[onboarding-handoff] OK: conversa ${conversationId} → agente CS ${csAgent.id} (org ${args.organizationId}).`);
    return { ok: true, conversation_id: conversationId, cs_agent_id: csAgent.id };
  } catch (e) {
    console.warn('[onboarding-handoff] exception (non-fatal):', String(e).slice(0, 300));
    return { ok: false, skipped: 'exception' };
  }
}
