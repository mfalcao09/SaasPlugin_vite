/**
 * Identidade do visitante na inbox do CRM de PLATAFORMA (U3 — fallback de
 * identidade). Muitas conversas de WhatsApp chegam com `visitor_name` inútil
 * ("~", "." ou 1-2 caracteres). Nesses casos o TELEFONE formatado vira a
 * identidade primária e o nome (se existir) vira secundário.
 *
 * Helpers puros (sem React) — compartilhados por PlatformCrmConversationList,
 * PlatformCrmChatArea e PlatformCrmLeadContextPanel.
 */

export interface VisitorIdentity {
  /** Texto principal exibido (nome útil OU telefone formatado). */
  primary: string;
  /** Texto secundário (o nome "inútil" original, quando existir). */
  secondary: string | null;
  /** true quando o visitor_name é utilizável como identidade. */
  usefulName: boolean;
}

/**
 * Um nome é "útil" quando tem 3+ caracteres E contém ao menos uma letra ou
 * dígito (descarta "~", "...", "--" e afins).
 */
export function isUsefulVisitorName(name: string | null | undefined): boolean {
  const trimmed = (name ?? '').trim();
  if (trimmed.length < 3) return false;
  return /[\p{L}\p{N}]/u.test(trimmed);
}

/**
 * Formata um telefone BR para exibição: "+5511955021205" → "(11) 95502-1205".
 * Aceita e164 com/sem `+`, com/sem DDI 55, celular (11 díg.) ou fixo (10 díg.).
 * Qualquer outro formato retorna o valor original como estiver (e164 cru).
 */
export function formatVisitorPhone(phone: string | null | undefined): string | null {
  const raw = (phone ?? '').trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');
  let local = digits;
  if ((local.length === 12 || local.length === 13) && local.startsWith('55')) {
    local = local.slice(2);
  }
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}

/**
 * Resolve a identidade exibível do visitante:
 * - nome útil → primary = nome (telefone segue nos campos usuais);
 * - nome inútil/vazio → primary = telefone formatado, secondary = nome cru
 *   (se existir), para não perder a pista do canal.
 */
export function resolveVisitorIdentity(
  name: string | null | undefined,
  phone: string | null | undefined,
): VisitorIdentity {
  const trimmedName = (name ?? '').trim();

  if (isUsefulVisitorName(trimmedName)) {
    return { primary: trimmedName, secondary: null, usefulName: true };
  }

  const formattedPhone = formatVisitorPhone(phone);
  return {
    primary: formattedPhone || trimmedName || 'Visitante',
    secondary: trimmedName || null,
    usefulName: false,
  };
}

/** Iniciais para o avatar — nome útil → 2 iniciais; senão → 2 últimos dígitos. */
export function visitorInitials(
  name: string | null | undefined,
  phone: string | null | undefined,
): string {
  const trimmed = (name ?? '').trim();
  if (isUsefulVisitorName(trimmed)) {
    return trimmed
      .split(/\s+/)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits) return digits.slice(-2);
  return 'V';
}
