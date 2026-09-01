// ─────────────────────────────────────────────────────────────────────────────
// Variantes de telefone para casar contra colunas na convenção "+E.164".
// Ponto ÚNICO dessa convenção.
//
// ⚠️ A convenção é POR COLUNA, não por "lado plataforma vs lado tenant".
//    Há tabelas `platform_crm_*` nas DUAS convenções — ver as listas abaixo.
//    Aplicar este helper contra uma coluna de DÍGITOS PUROS QUEBRA o casamento
//    que hoje funciona lá.
//
// ── USAR este helper para casar contra ───────────────────────────────────────
//   platform_crm_leads.phone
//   platform_crm_conversations.visitor_phone
//   platform_crm_conversations.visitor_whatsapp
//     convenção "+E.164" — medido: platform_crm_leads.phone, 8 linhas com
//     telefone, 8/8 com "+" (0 sem). Ex.: "+5511999887766".
//
// ── NÃO usar contra (convenção de DÍGITOS PUROS; `phoneVariantsBR` CRU é o
//    correto lá) ─────────────────────────────────────────────────────────────
//   platform_crm_extracted_leads.telefone       medido: 13.736 linhas, 0 com "+"
//   platform_crm_cold_outreach_queue.telefone   copiado de extracted_leads
//   API do provedor Evolution / JID:
//       platform-check-whatsapp-number/index.ts:51
//           manda a variante para a API do PROVEDOR, que não aceita "+".
//       evolution-webhook/index.ts:1138   ← TENANT
//           o telefone nasce do JID da Evolution, que já é dígitos puros.
//           ⚠️ `evolution-webhook` (tenant) ≠ `platform-whatsapp-qr-webhook`
//              (plataforma). São duas funções distintas; só a de tenant está aqui.
//
// ── Por que este arquivo existe ──────────────────────────────────────────────
// `phoneVariantsBR` (_shared/phone.ts) devolve SÓ DÍGITOS. Está CORRETA e NÃO
// deve ser alterada — as colunas e APIs da lista "NÃO usar" dependem desse
// comportamento. O que faltava era o adaptador para as colunas "+E.164": um
// `.in('phone', phoneVariantsBR(x))` contra `platform_crm_leads.phone` casa
// ZERO linhas, porque toda linha lá tem "+".
//
// Hoje 4 chamadores escreveram esse mesmo ajuste por conta própria; devem passar
// a importar daqui:
//   platform-meta-whatsapp-send/index.ts:112-113
//   platform-start-whatsapp-conversation/index.ts:152-153
//   _shared/whatsapp-connection.ts:182
//   _shared/onboarding-handoff.ts:279-282   (o comentário de lá já descreve o furo)
// ─────────────────────────────────────────────────────────────────────────────

import { phoneVariantsBR } from './phone.ts';

/**
 * Todas as formas sob as quais uma coluna na convenção "+E.164" pode ter
 * armazenado um telefone: as variantes de dígitos de `phoneVariantsBR` MAIS as
 * mesmas com o prefixo "+".
 *
 * O match usado pelos chamadores (`.in(...)` / `.or('col.in.(...)')`) é EXATO —
 * daí enumerar os dois formatos em vez de normalizar para um só.
 *
 * Sem duplicatas, sem strings vazias. Ordem: todos os dígitos, depois todos os
 * "+".
 */
export function phoneVariantsWithPlusBR(input: unknown): string[] {
  const digits = phoneVariantsBR(input).filter(Boolean);
  if (digits.length === 0) return [];

  const out = new Set<string>(digits);
  for (const d of digits) out.add(`+${d}`);
  return Array.from(out);
}

// ── Extensão futura: desreferência de `platform_crm_leads.merged_into` ────────
//
// Quando dois leads são deduplicados, o perdedor deveria apontar para o vencedor
// via `merged_into`, e uma busca por telefone que caia no perdedor precisaria
// seguir esse ponteiro para devolver o lead vivo.
//
// O CORPO NÃO ESTÁ ESCRITO DE PROPÓSITO: a coluna `platform_crm_leads.merged_into`
// AINDA NÃO EXISTE. Ela nasce numa PR futura que precisa de aprovação separada.
// Escrever a implementação agora só produziria (a) código que quebra no primeiro
// SELECT, ou (b) um fallback silencioso que esconde a ausência da coluna — pior,
// porque passa a impressão de que a desreferência está funcionando.
// Por isso: sem flag, sem try/catch engolindo erro, sem consulta à coluna.
//
// O que entra depois: uma função com a assinatura reservada abaixo, implementada
// NESTE arquivo — a convenção de formato e a desreferência são o mesmo assunto
// ("como se identifica um lead por telefone nas colunas +E.164"):
//
//   export const resolvePlatformLeadIdByPhone: ResolvePlatformLeadIdByPhone =
//     async (supabase, input) => { /* SELECT id, merged_into … seguir o ponteiro */ };

/**
 * Assinatura reservada (TIPO apenas — implementação pendente da migration que
 * cria `platform_crm_leads.merged_into`). Ver o bloco de comentário acima.
 *
 * Devolveria o id do lead VIVO para o telefone dado: acha o lead via
 * `phoneVariantsWithPlusBR` contra `platform_crm_leads.phone` e, se ele estiver
 * marcado como fundido, segue `merged_into` até o lead final. `null` quando não
 * há lead.
 */
export type ResolvePlatformLeadIdByPhone = (
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: unknown,
) => Promise<string | null>;
