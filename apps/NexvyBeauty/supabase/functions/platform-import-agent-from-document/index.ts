// platform-import-agent-from-document — GERA um rascunho de agente do CRM de
// PLATAFORMA (super_admin, product-scoped) A PARTIR DE UM DOCUMENTO (PDF/DOCX/
// TXT/MD).
//
// Compõe DUAS capacidades já existentes, sem reescrever nenhuma delas:
//   (a) EXTRAÇÃO de texto do documento — CÓPIA FIEL das funções de
//       `platform-process-training-material` (extractDocumentFaithfully via IA
//       gemini-2.5-flash p/ PDF; extractDocxText via parse ZIP/XML p/ DOCX;
//       texto as-is p/ TXT/MD). São funções puras, sem dependência de tenant.
//   (b) GERAÇÃO do draft de agente — REUSA o prompt/tool-schema de
//       `platform-generate-agent-ai` chamando-a INTERNAMENTE (service_role +
//       actorUserId), o mesmo padrão de invocação edge→edge já usado em
//       platform-campaign-dispatcher → platform-cadence-enroll. O texto extraído
//       vira o `custom_context` (briefing) da geração. A edge de geração fica
//       INTOCADA — este edge é 100% aditivo.
//
//   * Gate: authenticatePlatformAgent (super_admin via JWT do usuário OU
//     SERVICE_ROLE + actorUserId no body) — idêntico às demais twins platform-*.
//     O actorUserId repassado à geração é o próprio super_admin já validado aqui.
//   * Escopo: product_id (null = agente global) repassado 1:1 à geração.
//   * Sem escrita em banco — o front recebe `{ agent }` e abre o editor p/ revisão
//     antes de salvar (mesmo fluxo do import por JSON).

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";

interface ImportRequest {
  /** Conteúdo do documento em base64 (sem prefixo `data:`). */
  file_base64: string;
  /** Nome original — decide o formato quando o mime não é conclusivo. */
  file_name: string;
  /** Content-Type do arquivo (opcional; complementa a detecção por extensão). */
  mime_type?: string;
  /** Tipo do agente a criar (sdr/closer/support/...). */
  agent_type: string;
  /** Produto ao qual vincular (null = agente global). */
  product_id: string | null;
  /** Chamada interna via SERVICE_ROLE atua em nome deste usuário (opcional). */
  actorUserId?: string;
  created_by?: string;
}

// Teto de caracteres do briefing injetado no prompt de geração. A extração
// preserva até 50k (como o material de treino), mas o prompt de geração não
// precisa do documento inteiro — 16k cobre briefings densos sem estourar contexto.
const MAX_BRIEFING_CHARS = 16000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = (await req.json()) as ImportRequest;

    console.log(
      "[platform-import-agent-from-document] file:",
      body.file_name,
      "type:",
      body.agent_type,
      "product:",
      body.product_id,
    );

    // ── Gate super_admin (JWT do usuário) OU SERVICE_ROLE + actorUserId. ──
    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      supabaseKey,
      body,
    );
    if (errorResponse) return errorResponse;
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.file_base64 || !body.file_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: file_base64, file_name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!body.agent_type) {
      return new Response(
        JSON.stringify({ error: "Missing required field: agent_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Decodifica o base64 em bytes e monta um Blob para as funções de extração. ──
    let fileData: Blob;
    try {
      const binary = atob(body.file_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      fileData = new Blob([bytes], { type: body.mime_type || "" });
    } catch (_e) {
      return new Response(
        JSON.stringify({ error: "Invalid base64 file content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── (a) Extração de texto — mesma trilha de decisão do process-training-material. ──
    let fileContent = "";
    try {
      const contentType = body.mime_type || fileData.type || "";
      const fileName = body.file_name || "";
      const isPdf = contentType.includes("pdf") || fileName.endsWith(".pdf");
      const isDocx =
        contentType.includes("wordprocessingml") ||
        contentType.includes("msword") ||
        fileName.endsWith(".docx") ||
        fileName.endsWith(".doc");

      if (isPdf) {
        fileContent = await extractDocumentFaithfully(fileData, "application/pdf", body.file_name || "document.pdf");
      } else if (isDocx) {
        fileContent = await extractDocxText(fileData);
      } else if (
        contentType.includes("text/") ||
        contentType.includes("application/json") ||
        fileName.endsWith(".txt") ||
        fileName.endsWith(".md")
      ) {
        fileContent = await fileData.text();
      } else {
        // Binário desconhecido: tenta como PDF via IA se não for texto legível.
        const rawText = await fileData.text();
        const nonPrintable = (rawText.match(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g) || []).length;
        if (nonPrintable > rawText.length * 0.05) {
          fileContent = await extractDocumentFaithfully(fileData, "application/pdf", body.file_name || "document.pdf");
        } else {
          fileContent = rawText;
        }
      }
    } catch (extractError: unknown) {
      const msg = extractError instanceof Error ? extractError.message : "Unknown error";
      console.error("[platform-import-agent-from-document] extraction error:", extractError);
      return new Response(
        JSON.stringify({ error: "Failed to extract document content", details: msg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Limpa null bytes e valida legibilidade (mesmo critério do material de treino).
    fileContent = (fileContent || "").replace(/\u0000/g, "");
    if (fileContent.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "Documento vazio ou não legível" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const briefing = fileContent.substring(0, MAX_BRIEFING_CHARS);
    console.log(
      "[platform-import-agent-from-document] extracted chars:",
      fileContent.length,
      "briefing chars:",
      briefing.length,
    );

    // ── (b) Geração do draft — REUSA o prompt/tool-schema de platform-generate-agent-ai. ──
    // O documento entra como custom_context/briefing; a geração já sabe incorporá-lo.
    const customContext =
      `BRIEFING EXTRAÍDO DO DOCUMENTO "${body.file_name}" — use este conteúdo como base ` +
      `PRIMÁRIA para construir a identidade, missão, regras, tom e gatilhos do agente. ` +
      `Priorize o que está escrito aqui sobre suposições genéricas:\n\n${briefing}`;

    const genResponse = await fetch(`${supabaseUrl}/functions/v1/platform-generate-agent-ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        product_id: body.product_id ?? null,
        agent_type: body.agent_type,
        custom_context: customContext,
        scope: body.product_id ? "product" : "organization",
        // Repassa o super_admin já validado como ator da chamada service-role.
        actorUserId: user.id,
      }),
    });

    if (!genResponse.ok) {
      // Propaga status/erro da geração (429/402/500) de forma transparente ao front.
      let errBody: { error?: string } = {};
      try {
        errBody = await genResponse.json();
      } catch {
        /* corpo não-JSON */
      }
      console.error(
        "[platform-import-agent-from-document] generation failed:",
        genResponse.status,
        errBody,
      );
      return new Response(
        JSON.stringify({ error: errBody.error || "Falha ao gerar agente a partir do documento" }),
        { status: genResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const genData = await genResponse.json();
    if (!genData?.agent) {
      return new Response(
        JSON.stringify({ error: "Geração não retornou um agente" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ agent: genData.agent, extracted_length: fileContent.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[platform-import-agent-from-document] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Extração — CÓPIA FIEL de platform-process-training-material (funções puras).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract text from documents (PDF, DOCX, DOC) faithfully using AI - no summarization.
 */
async function extractDocumentFaithfully(fileData: Blob, mimeType: string, filename: string): Promise<string> {
  const arrayBuffer = await fileData.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Convert to base64 in chunks
  let base64 = "";
  const chunkSize = 32768;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    base64 += String.fromCharCode.apply(null, [...chunk]);
  }
  base64 = btoa(base64);

  console.log("[platform-import-agent-from-document] Document base64 length:", base64.length, "type:", mimeType);

  const apiKey = (Deno.env.get("AI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));

  const aiResponse = await fetch(`${Deno.env.get("AI_GATEWAY_URL") ?? "https://openrouter.ai/api/v1"}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Você é um extrator de texto de documentos.

REGRAS ABSOLUTAS:
1. Extraia TODO o texto do documento de forma FIEL e COMPLETA
2. Mantenha a estrutura original (títulos, subtítulos, parágrafos, listas, tabelas)
3. NÃO resuma, NÃO altere, NÃO omita NENHUMA parte do texto
4. NÃO adicione comentários, interpretações ou análises
5. NÃO reorganize o conteúdo - mantenha a ordem original
6. Se houver tabelas, reproduza-as em formato legível
7. Se houver imagens com texto (OCR), extraia o texto fielmente
8. Retorne APENAS o texto extraído, nada mais`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extraia TODO o texto deste documento de forma fiel e completa:",
            },
            {
              type: "file",
              file: {
                filename: filename,
                file_data: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 16000,
      temperature: 0.1,
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error("[platform-import-agent-from-document] AI extraction failed:", errorText);
    throw new Error(`Failed to extract document content with AI: ${errorText.substring(0, 200)}`);
  }

  const aiData = await aiResponse.json();
  const content = aiData.choices?.[0]?.message?.content || "";
  console.log("[platform-import-agent-from-document] Faithful extraction complete, length:", content.length);
  return content;
}

/**
 * Extract text from DOCX by parsing the ZIP archive and reading word/document.xml
 * DOCX is a ZIP containing XML files. Main text is in word/document.xml
 */
async function extractDocxText(fileData: Blob): Promise<string> {
  const arrayBuffer = await fileData.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Find all local file headers in ZIP
  const files = parseZipEntries(uint8Array);

  // Find word/document.xml
  const docEntry = files.find((f) => f.name === "word/document.xml");
  if (!docEntry) {
    throw new Error("Invalid DOCX: word/document.xml not found");
  }

  // Decompress the entry
  const xmlContent = await decompressEntry(docEntry, uint8Array);

  // Parse XML to extract text
  const text = extractTextFromDocXml(xmlContent);

  console.log("[platform-import-agent-from-document] DOCX text extracted, length:", text.length);
  return text;
}

interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  dataOffset: number;
}

function parseZipEntries(data: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset < data.length - 4) {
    // Local file header signature = 0x04034b50
    if (data[offset] === 0x50 && data[offset + 1] === 0x4b &&
        data[offset + 2] === 0x03 && data[offset + 3] === 0x04) {

      const compressionMethod = data[offset + 8] | (data[offset + 9] << 8);
      const compressedSize = data[offset + 18] | (data[offset + 19] << 8) | (data[offset + 20] << 16) | (data[offset + 21] << 24);
      const uncompressedSize = data[offset + 22] | (data[offset + 23] << 8) | (data[offset + 24] << 16) | (data[offset + 25] << 24);
      const nameLength = data[offset + 26] | (data[offset + 27] << 8);
      const extraLength = data[offset + 28] | (data[offset + 29] << 8);

      const nameBytes = data.slice(offset + 30, offset + 30 + nameLength);
      const name = new TextDecoder().decode(nameBytes);

      const dataOffset = offset + 30 + nameLength + extraLength;

      entries.push({ name, compressedSize, uncompressedSize, compressionMethod, dataOffset });

      offset = dataOffset + compressedSize;
    } else {
      offset++;
    }
  }

  return entries;
}

async function decompressEntry(entry: ZipEntry, data: Uint8Array): Promise<string> {
  const compressedData = data.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    // Stored (no compression)
    return new TextDecoder().decode(compressedData);
  }

  if (entry.compressionMethod === 8) {
    // Deflate
    // Create a raw deflate stream (no header)
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    const chunks: Uint8Array[] = [];

    const writePromise = writer.write(compressedData).then(() => writer.close());

    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    })();

    await Promise.all([writePromise, readPromise]);

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }

    return new TextDecoder().decode(result);
  }

  throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
}

function extractTextFromDocXml(xml: string): string {
  const lines: string[] = [];
  let currentParagraph = "";

  // Split by paragraph tags <w:p ...>...</w:p>
  const paragraphs = xml.split(/<w:p[\s>]/);

  for (const para of paragraphs) {
    if (!para) continue;

    // Extract all text runs <w:t ...>text</w:t>
    const textMatches = para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (textMatches) {
      currentParagraph = textMatches
        .map((m) => {
          const match = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
          return match ? match[1] : "";
        })
        .join("");
    }

    // Check for line breaks <w:br/>
    if (para.includes("<w:br")) {
      if (currentParagraph.trim()) {
        lines.push(currentParagraph.trim());
      }
      currentParagraph = "";
    }

    if (currentParagraph.trim()) {
      lines.push(currentParagraph.trim());
      currentParagraph = "";
    }
  }

  // Clean up: remove excessive blank lines
  return lines.filter((l) => l.length > 0).join("\n");
}
