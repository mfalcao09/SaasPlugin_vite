/** Chamada nativa Gemini (GEMINI_API_KEY). Sem OpenRouter. */

export const GEMINI_FLASH_MODEL = "gemini-3.6-flash";

const GEMINI_GENERATE_PATH =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

export type GeminiTurn = { role: "user" | "assistant"; content: string };

export function buildGeminiGenerateBody(input: {
  system: string;
  messages: readonly GeminiTurn[];
  maxOutputTokens: number;
  temperature?: number;
}): Record<string, unknown> {
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const message of input.messages) {
    const text = String(message.content ?? "").trim();
    if (!text) continue;
    const role = message.role === "assistant" ? "model" : "user";
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) {
      prev.parts[0].text = `${prev.parts[0].text}\n${text}`;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }
  if (contents.length === 0 || contents[0].role !== "user") {
    contents.unshift({
      role: "user",
      parts: [{ text: "Escreva a próxima mensagem para a cliente, seguindo as instruções." }],
    });
  }
  return {
    systemInstruction: { parts: [{ text: input.system }] },
    contents,
    generationConfig: {
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature ?? 0.4,
      thinkingConfig: { thinkingLevel: "MINIMAL" },
    },
  };
}

/** Ignora partes de pensamento. Só o texto que pode ir ao WhatsApp. */
export function extractGeminiText(payload: unknown): string {
  const parts = (payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }>;
  })?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => part && typeof part.text === "string" && part.thought !== true)
    .map((part) => String(part.text))
    .join("")
    .trim();
}

export async function generateGeminiText(input: {
  apiKey: string;
  system: string;
  messages: readonly GeminiTurn[];
  maxOutputTokens: number;
  temperature?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  const key = input.apiKey.trim();
  if (!key) return { ok: false, status: 0, error: "missing_gemini_key" };
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${GEMINI_GENERATE_PATH}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildGeminiGenerateBody(input)),
  });
  const raw = await response.text();
  if (!response.ok) {
    return { ok: false, status: response.status, error: raw.slice(0, 200) };
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, status: response.status, error: "unreadable_gemini_body" };
  }
  const text = extractGeminiText(payload);
  if (!text) return { ok: false, status: response.status, error: "empty_gemini_text" };
  return { ok: true, text };
}
