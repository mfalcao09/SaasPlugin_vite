// ============================================================================
// _shared/platform-crm-webchat.ts
//
// Helpers do WEBCHAT do CRM de PLATAFORMA (super_admin) — porte 1:1 do lado
// público do webchat do CRM Vendus, DESACOPLADO do tenant.
//
// 🔒 REGRA MÁXIMA: este arquivo NÃO referencia nenhuma tabela do tenant
// (webchat_*, organizations, profiles, leads, products...). Só helpers puros
// (gateway de IA env-driven, broadcast realtime, name-utils) usados pelos
// edges `platform-webchat-api` e `platform-webchat-bot`.
//
// Gateway de IA (mesmo padrão de `_shared/ai.ts` do tenant, replicado aqui de
// propósito para manter o CRM de plataforma 100% independente):
//   AI_GATEWAY_URL → base do gateway (default: https://openrouter.ai/api/v1)
//   AI_API_KEY     → chave do provedor (fallback LOVABLE_API_KEY p/ compat)
//   AI_MODEL       → modelo default (fallback google/gemini-3-flash-preview,
//                    o DEFAULT_MODEL do webchat-bot original)
// ============================================================================

/** CORS aberto — o widget público chama de qualquer origem (1:1 com o original). */
export const platformCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// ─── Gateway de IA (env-driven, shape OpenAI) ───────────────────────────────

/** Modelo default do bot — 1:1 com o DEFAULT_MODEL do webchat-bot original. */
export const PLATFORM_AI_DEFAULT_MODEL = 'google/gemini-3-flash-preview';

/** Base do gateway de IA (sem barra final). Default: OpenRouter. */
export function aiGatewayUrl(): string {
  const raw = Deno.env.get('AI_GATEWAY_URL') ?? 'https://openrouter.ai/api/v1';
  return raw.replace(/\/+$/, '');
}

/** Chave do gateway — AI_API_KEY com fallback LOVABLE_API_KEY (compat migração). */
export function aiApiKey(): string {
  return Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY') ?? '';
}

/** Modelo efetivo — env AI_MODEL sobrepõe o default. */
export function aiModel(): string {
  return Deno.env.get('AI_MODEL') ?? PLATFORM_AI_DEFAULT_MODEL;
}

/**
 * Chama o endpoint de chat completions do gateway configurado.
 * `body` segue o shape OpenAI (model, messages, max_tokens, temperature...).
 * Retorna o `Response` cru — o caller parseia JSON / trata erro.
 */
export async function aiChatCompletions(body: Record<string, unknown>): Promise<Response> {
  return await fetch(`${aiGatewayUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiApiKey()}`,
    },
    body: JSON.stringify(body),
  });
}

// ─── Broadcast realtime ─────────────────────────────────────────────────────

/**
 * Emite o broadcast `new_message` no canal `platform-conversation:{id}` —
 * EXATAMENTE o canal/evento que `usePlatformCrmMessages` (front super_admin)
 * já escuta. Payload = a linha completa de `platform_crm_messages` (o front
 * deduplica pelo `id`). Non-fatal por design (mesmo padrão do webchat-inbox).
 */
export async function broadcastPlatformNewMessage(
  supabase: any,
  conversationId: string,
  message: Record<string, unknown> | null,
): Promise<void> {
  if (!message) return;
  try {
    const channel = supabase.channel(`platform-conversation:${conversationId}`);
    await channel.send({
      type: 'broadcast',
      event: 'new_message',
      payload: message,
    });
    await supabase.removeChannel(channel);
  } catch (broadcastError) {
    console.error('[platform-webchat] broadcast error (non-fatal):', broadcastError);
  }
}

// ─── Name utils (cópia 1:1 de _shared/name-utils.ts, sem dependência) ───────

const COMPANY_TOKENS = [
  'agencia', 'agência', 'marketing', 'digital', 'studio', 'ltda', 'me',
  'eireli', 'consultoria', 'tecnologia', 'solutions', 'company', 'co.',
  'inc', 'corp', 'group', 'grupo', 'holding', 'oficial', 'enterprise',
  'tech', 'labs', 'lab', 'systems', 'system', 'comercio', 'comércio',
  'industria', 'indústria', 'servicos', 'serviços', 'imobiliaria',
  'imobiliária', 'construtora', 'logistica', 'logística', 'editora',
];

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function looksLikeCompany(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  // Tem dígito → quase sempre razão social ("Acesso Digital 360", "AG7")
  if (/\d/.test(t)) return true;
  const norm = stripDiacritics(t.toLowerCase());
  const tokens = norm.split(/\s+/).filter(Boolean);
  if (tokens.some((tok) => COMPANY_TOKENS.includes(tok))) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.every((w) => w === w.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(w))) {
    return true;
  }
  if (words.length === 1 && words[0].length > 18) return true;
  return false;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Retorna o primeiro nome do lead (capitalizado), ou null se o input
 * parecer nome de empresa / razão social / lixo.
 */
export function extractFirstName(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = String(raw).trim();
  if (!cleaned) return null;
  // Telefone puro / só dígitos
  if (/^[+\d\s().-]+$/.test(cleaned)) return null;
  if (looksLikeCompany(cleaned)) return null;
  const first = cleaned.split(/\s+/)[0].replace(/[^\p{L}\-']/gu, '');
  if (!first || first.length < 2) return null;
  return capitalize(first);
}

/** Retorna nome para exibir no prompt — "" quando não confiável. */
export function safeFirstName(raw?: string | null): string {
  return extractFirstName(raw) ?? '';
}
