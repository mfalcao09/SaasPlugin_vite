// Env-driven AI gateway helper.
//
// Desacopla as edge functions do Lovable AI Gateway: a URL base e a chave de API
// passam a vir de variáveis de ambiente, com o gateway OpenRouter (compatível com
// a API da OpenAI) como padrão. Mantém o mesmo shape OpenAI que as edges já usam.
//
// Variáveis de ambiente:
//   AI_GATEWAY_URL  → base do gateway (default: https://openrouter.ai/api/v1)
//   AI_API_KEY      → chave do provedor (fallback para LOVABLE_API_KEY enquanto a
//                     key nova não estiver setada, pra não quebrar o runtime)
//
// Os modelos continuam os mesmos (ex.: google/gemini-2.5-flash) — OpenRouter aceita
// os identificadores no formato `provider/model`, então NÃO há remapeamento aqui.

/** Base do gateway de IA (sem barra final). Default: OpenRouter. */
export function aiGatewayUrl(): string {
  const raw = Deno.env.get('AI_GATEWAY_URL') ?? 'https://openrouter.ai/api/v1';
  return raw.replace(/\/+$/, '');
}

/**
 * Chave de API do gateway de IA.
 * Fallback para LOVABLE_API_KEY enquanto a key nova (AI_API_KEY) não estiver
 * configurada, evitando quebra de runtime durante a migração.
 */
export function aiApiKey(): string {
  return Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY') ?? '';
}

/** URL completa do endpoint de chat completions. */
export function aiChatCompletionsUrl(): string {
  return `${aiGatewayUrl()}/chat/completions`;
}

/** URL completa do endpoint de embeddings. */
export function aiEmbeddingsUrl(): string {
  return `${aiGatewayUrl()}/embeddings`;
}

export interface AIRequestOptions {
  /** Sobrescreve a chave de API (ex.: chave da org resolvida pelo router). */
  apiKey?: string;
  /** Headers extras a mesclar no request. */
  headers?: Record<string, string>;
  /** AbortSignal opcional. */
  signal?: AbortSignal;
}

function buildHeaders(opts?: AIRequestOptions): Record<string, string> {
  const key = opts?.apiKey ?? aiApiKey();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    ...(opts?.headers ?? {}),
  };
}

/**
 * Chama o endpoint de chat completions do gateway configurado.
 * `body` segue o shape OpenAI (model, messages, tools, response_format, etc.).
 * Retorna o `Response` cru — o caller parseia JSON / trata streaming.
 */
export async function aiChatCompletions(
  body: Record<string, unknown>,
  opts?: AIRequestOptions,
): Promise<Response> {
  return await fetch(aiChatCompletionsUrl(), {
    method: 'POST',
    headers: buildHeaders(opts),
    body: JSON.stringify(body),
    signal: opts?.signal,
  });
}

/**
 * Chama o endpoint de embeddings do gateway configurado.
 * `body` segue o shape OpenAI (model, input, etc.).
 */
export async function aiEmbeddings(
  body: Record<string, unknown>,
  opts?: AIRequestOptions,
): Promise<Response> {
  return await fetch(aiEmbeddingsUrl(), {
    method: 'POST',
    headers: buildHeaders(opts),
    body: JSON.stringify(body),
    signal: opts?.signal,
  });
}
