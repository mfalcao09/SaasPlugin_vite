/**
 * Extrai texto de chat/completions (OpenRouter / OpenAI-compatible).
 * Alguns modelos (Claude via OR) devolvem content como array de partes.
 */
export function extractChatCompletionContent(completion: unknown): string {
  const content = (completion as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          if (typeof p.text === "string") return p.text;
          if (typeof p.content === "string") return p.content;
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}
