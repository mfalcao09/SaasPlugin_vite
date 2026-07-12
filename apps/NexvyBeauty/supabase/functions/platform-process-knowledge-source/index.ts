// platform-process-knowledge-source — TWIN product-scoped (super_admin) da
// `process-knowledge-source` do tenant.
//
// Porte 1:1 da org-scoped: extrai conteúdo de uma fonte de conhecimento
// (website | youtube) e DEVOLVE o resultado — a persistência em
// `platform_crm_product_knowledge_sources` é responsabilidade do chamador
// (a org-scoped também é stateless; NÃO escreve em tabela nem faz embedding).
//
// Único delta vs. a org-scoped = o GATE DE ESCOPO:
//   * org-scoped: edge aberta (verify_jwt), sem checagem de papel.
//   * twin:       super_admin obrigatório via authenticatePlatformAgent
//                 (JWT do usuário OU service_role+actorUserId no body). O
//                 escopo é o produto (`productId`), nunca organization_id.
//
// Observações fiéis ao original (NÃO simplificar / NÃO inventar):
//   * A org-scoped roteia SÓ 'website' e 'youtube'. Os demais source_type do
//     CHECK da tabela ('file','faq','data','training') NÃO são processados por
//     esta edge no tenant — logo também não aqui. Nada foi acrescentado.
//   * NÃO há embedding/chunking na org-scoped, e a tabela product-scoped NÃO
//     possui coluna de embedding/vector (colunas de texto: extracted_content,
//     raw_content, transcript). Portanto não há lógica de vetor a portar.
//   * YouTube: mesmo caminho da org-scoped — oEmbed p/ metadados + template de
//     resumo via gateway de IA (AI_API_KEY/LOVABLE_API_KEY + AI_GATEWAY_URL).

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

interface ProcessRequest {
  sourceType: 'website' | 'youtube' | 'file';
  // website/youtube: obrigatório. file: ausente (usa filePath/fileUrl).
  url?: string;
  productId: string;
  // ── Campos exclusivos do ramo 'file' (ADITIVO — website/youtube ignoram) ──
  /** Título da fonte; default = nome do arquivo. */
  title?: string;
  /** Caminho no bucket `product-documents` (preferido p/ download via SERVICE_ROLE). */
  filePath?: string;
  /** URL pública do arquivo (persistida em file_url; fallback de download). */
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
  /** Chamada interna via SERVICE_ROLE atua em nome deste usuário (opcional). */
  actorUserId?: string;
  created_by?: string;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Extract YouTube video ID from URL
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetch YouTube video info using oEmbed
async function fetchYouTubeInfo(videoId: string) {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

  try {
    const response = await fetch(oembedUrl);
    if (!response.ok) throw new Error('Failed to fetch video info');
    return await response.json();
  } catch (error) {
    console.error('Error fetching YouTube info:', error);
    return null;
  }
}

// Simple website content extraction
async function extractWebsiteContent(url: string): Promise<{ title: string; content: string; description: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KnowledgeBot/1.0)',
      },
    });

    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Remove scripts and styles
    let content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Extract text from body
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      content = bodyMatch[1];
    }

    // Remove all HTML tags and clean up whitespace
    content = content
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    // Limit content length
    const maxLength = 50000;
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '...';
    }

    return { title, content, description };
  } catch (error) {
    console.error('Error extracting website content:', error);
    throw error;
  }
}

// Use Lovable AI to generate transcript summary for YouTube (since we can't get actual transcript)
async function generateYouTubeSummary(videoInfo: any, videoId: string): Promise<string> {
  const LOVABLE_API_KEY = (Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY'));

  if (!LOVABLE_API_KEY) {
    return `Vídeo: ${videoInfo.title}\nAutor: ${videoInfo.author_name}\n\nNota: Transcrição automática não disponível. Adicione manualmente os pontos-chave do vídeo.`;
  }

  try {
    const response = await fetch(`${Deno.env.get('AI_GATEWAY_URL') ?? 'https://openrouter.ai/api/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente que ajuda a criar resumos de vídeos do YouTube para treinar uma IA de vendas. Baseado nas informações do vídeo, crie um template estruturado para que o usuário possa preencher com os pontos-chave.'
          },
          {
            role: 'user',
            content: `Crie um template de resumo para o seguinte vídeo do YouTube:

Título: ${videoInfo.title}
Autor: ${videoInfo.author_name}
URL: https://www.youtube.com/watch?v=${videoId}

Crie seções para:
1. Resumo geral do conteúdo
2. Pontos-chave principais
3. Argumentos de venda mencionados
4. Objeções e como foram tratadas
5. Insights úteis para vendedores

Formate de forma clara e estruturada para fácil edição.`
          }
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error('AI request failed');
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || `Vídeo: ${videoInfo.title}\nAutor: ${videoInfo.author_name}`;
  } catch (error) {
    console.error('Error generating summary:', error);
    return `Vídeo: ${videoInfo.title}\nAutor: ${videoInfo.author_name}\n\nNota: Adicione manualmente os pontos-chave do vídeo.`;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse do body ANTES do gate — authenticatePlatformAgent lê actorUserId
    // quando o token é a SERVICE_ROLE (chamada interna/sistema).
    let bodyParsed: any = {};
    try {
      bodyParsed = await req.clone().json();
    } catch (_) {
      /* no body or invalid json */
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // GATE DE ESCOPO — super_admin (o CRM da plataforma é product-scoped e
    // exclusivo do time da plataforma). Único delta vs. a org-scoped.
    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      supabaseKey,
      bodyParsed,
    );
    if (errorResponse) return errorResponse;
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // A partir daqui, lógica IDÊNTICA à org-scoped (verbatim).
    const { sourceType, url, productId }: ProcessRequest = bodyParsed;

    // ── RAMO 'file' — ADITIVO ──────────────────────────────────────────────
    // Extrai PDF/DOCX/TXT (mesmo padrão de platform-process-training-material)
    // e PERSISTE a fonte em platform_crm_product_knowledge_sources (source_type
    // 'file'). Não toca os caminhos website/youtube abaixo — retorna antes deles.
    // O ramo 'file' faz o insert aqui (a extração é pesada e melhor server-side),
    // diferente de website/youtube que devolvem o conteúdo p/ o chamador persistir.
    if (sourceType === 'file') {
      return await handleFileSource(bodyParsed as ProcessRequest, supabase, user);
    }

    if (!sourceType || !url) {
      return new Response(
        JSON.stringify({ success: false, error: 'sourceType and url are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result: {
      title: string;
      content: string;
      description?: string;
      videoId?: string;
      thumbnail?: string;
      author?: string;
    };

    if (sourceType === 'youtube') {
      const videoId = extractYouTubeId(url);
      if (!videoId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid YouTube URL' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const videoInfo = await fetchYouTubeInfo(videoId);
      if (!videoInfo) {
        return new Response(
          JSON.stringify({ success: false, error: 'Could not fetch video information' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const summary = await generateYouTubeSummary(videoInfo, videoId);

      result = {
        title: videoInfo.title,
        content: summary,
        description: `Vídeo por ${videoInfo.author_name}`,
        videoId,
        thumbnail: videoInfo.thumbnail_url,
        author: videoInfo.author_name,
      };
    } else if (sourceType === 'website') {
      // Validate URL
      let validUrl: URL;
      try {
        validUrl = new URL(url);
      } catch {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid URL format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const extracted = await extractWebsiteContent(url);
      result = {
        title: extracted.title,
        content: extracted.content,
        description: extracted.description || `Conteúdo extraído de ${validUrl.hostname}`,
      };
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid sourceType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: result, productId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing knowledge source:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process source'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ─── RAMO 'file' — extração + persistência ────────────────────────────────────
// Baixa o arquivo (bucket `product-documents` via filePath, ou fetch via fileUrl),
// extrai o texto com o MESMO pipeline de platform-process-training-material
// (PDF via IA gemini-2.5-flash, DOCX via parse ZIP/XML, texto as-is) e insere a
// fonte em platform_crm_product_knowledge_sources com source_type='file'.
async function handleFileSource(
  body: ProcessRequest,
  supabase: any,
  user: { id: string },
): Promise<Response> {
  const productId = body.productId;
  const filePath = body.filePath;
  const fileUrl = body.fileUrl;
  const title = body.title?.trim();

  if (!productId) {
    return jsonResponse({ success: false, error: 'productId is required' }, 400);
  }
  if (!filePath && !fileUrl) {
    return jsonResponse({ success: false, error: 'filePath or fileUrl is required' }, 400);
  }

  // Download — filePath (SERVICE_ROLE, funciona mesmo com bucket privado) tem
  // preferência; fileUrl é fallback.
  let fileData: Blob | null = null;
  try {
    if (filePath) {
      const { data, error: downloadError } = await supabase.storage
        .from('product-documents')
        .download(filePath);
      if (downloadError) throw new Error(`Storage download failed: ${downloadError.message}`);
      fileData = data;
    } else {
      const response = await fetch(fileUrl!);
      if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
      fileData = await response.blob();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[platform-process-knowledge-source] file download error:', e);
    return jsonResponse({ success: false, error: `Erro ao baixar arquivo: ${msg}` }, 500);
  }

  if (!fileData) {
    return jsonResponse({ success: false, error: 'No file data received' }, 500);
  }

  const contentType = fileData.type || '';
  const fileName = fileUrl || filePath || '';
  const isPdf = contentType.includes('pdf') || fileName.endsWith('.pdf');
  const isDocx = contentType.includes('wordprocessingml') || contentType.includes('msword') || fileName.endsWith('.docx') || fileName.endsWith('.doc');

  let fileContent = '';
  try {
    if (isPdf) {
      // PDF: use AI for faithful OCR/text extraction
      fileContent = await extractDocumentFaithfully(fileData, 'application/pdf', 'document.pdf');
    } else if (isDocx) {
      // DOCX: parse XML from ZIP archive
      fileContent = await extractDocxText(fileData);
    } else if (contentType.includes('text/') || contentType.includes('application/json')) {
      // Text/JSON: store as-is
      fileContent = await fileData.text();
    } else {
      // Unknown binary: try AI extraction as fallback
      const rawText = await fileData.text();
      const nonPrintable = (rawText.match(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g) || []).length;
      if (nonPrintable > rawText.length * 0.05) {
        fileContent = await extractDocumentFaithfully(fileData, 'application/pdf', 'document.pdf');
      } else {
        fileContent = rawText;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[platform-process-knowledge-source] file extraction error:', e);
    return jsonResponse({ success: false, error: `Erro ao extrair conteúdo: ${msg}` }, 500);
  }

  if (!fileContent || fileContent.length < 10) {
    return jsonResponse({ success: false, error: 'Arquivo vazio ou não legível' }, 400);
  }

  // Store faithfully - remove null bytes and truncate at 50k chars for DB safety
  const extractedContent = fileContent.replace(/\u0000/g, '').substring(0, 50000);
  const resolvedTitle = title || (fileName.split('/').pop() || 'Arquivo');

  const { data: inserted, error: insertError } = await supabase
    .from('platform_crm_product_knowledge_sources')
    .insert({
      product_id: productId,
      source_type: 'file',
      title: resolvedTitle,
      file_url: fileUrl ?? null,
      file_type: body.fileType ?? contentType ?? null,
      file_size: body.fileSize ?? fileData.size ?? null,
      source_url: fileUrl ?? null,
      raw_content: extractedContent,
      extracted_content: extractedContent,
      processing_status: 'completed',
      processed_at: new Date().toISOString(),
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[platform-process-knowledge-source] insert error:', insertError);
    return jsonResponse({ success: false, error: insertError.message }, 500);
  }

  return jsonResponse({ success: true, data: inserted, productId }, 200);
}

/**
 * Extract text from documents (PDF, DOCX, DOC) faithfully using AI - no summarization.
 * CÓPIA FIEL de platform-process-training-material.
 */
async function extractDocumentFaithfully(fileData: Blob, mimeType: string, filename: string): Promise<string> {
  const arrayBuffer = await fileData.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Convert to base64 in chunks
  let base64 = '';
  const chunkSize = 32768;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    base64 += String.fromCharCode.apply(null, [...chunk]);
  }
  base64 = btoa(base64);

  console.log('[platform-process-knowledge-source] Document base64 length:', base64.length, 'type:', mimeType);

  const apiKey = (Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY'));

  const aiResponse = await fetch(`${Deno.env.get('AI_GATEWAY_URL') ?? 'https://openrouter.ai/api/v1'}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `Você é um extrator de texto de documentos.

REGRAS ABSOLUTAS:
1. Extraia TODO o texto do documento de forma FIEL e COMPLETA
2. Mantenha a estrutura original (títulos, subtítulos, parágrafos, listas, tabelas)
3. NÃO resuma, NÃO altere, NÃO omita NENHUMA parte do texto
4. NÃO adicione comentários, interpretações ou análises
5. NÃO reorganize o conteúdo - mantenha a ordem original
6. Se houver tabelas, reproduza-as em formato legível
7. Se houver imagens com texto (OCR), extraia o texto fielmente
8. Retorne APENAS o texto extraído, nada mais`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extraia TODO o texto deste documento de forma fiel e completa:'
            },
            {
              type: 'file',
              file: {
                filename: filename,
                file_data: `data:${mimeType};base64,${base64}`
              }
            }
          ]
        }
      ],
      max_tokens: 16000,
      temperature: 0.1,
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error('[platform-process-knowledge-source] AI extraction failed:', errorText);
    throw new Error(`Failed to extract document content with AI: ${errorText.substring(0, 200)}`);
  }

  const aiData = await aiResponse.json();
  const content = aiData.choices?.[0]?.message?.content || '';
  console.log('[platform-process-knowledge-source] Faithful extraction complete, length:', content.length);
  return content;
}

/**
 * Extract text from DOCX by parsing the ZIP archive and reading word/document.xml
 * DOCX is a ZIP containing XML files. Main text is in word/document.xml
 * CÓPIA FIEL de platform-process-training-material.
 */
async function extractDocxText(fileData: Blob): Promise<string> {
  const arrayBuffer = await fileData.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Find all local file headers in ZIP
  const files = parseZipEntries(uint8Array);

  // Find word/document.xml
  const docEntry = files.find(f => f.name === 'word/document.xml');
  if (!docEntry) {
    throw new Error('Invalid DOCX: word/document.xml not found');
  }

  // Decompress the entry
  const xmlContent = await decompressEntry(docEntry, uint8Array);

  // Parse XML to extract text
  const text = extractTextFromDocXml(xmlContent);

  console.log('[platform-process-knowledge-source] DOCX text extracted, length:', text.length);
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
    const ds = new DecompressionStream('deflate-raw');
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
  let currentParagraph = '';

  // Split by paragraph tags <w:p ...>...</w:p>
  const paragraphs = xml.split(/<w:p[\s>]/);

  for (const para of paragraphs) {
    if (!para) continue;

    // Extract all text runs <w:t ...>text</w:t>
    const textMatches = para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (textMatches) {
      currentParagraph = textMatches
        .map(m => {
          const match = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
          return match ? match[1] : '';
        })
        .join('');
    }

    // Check for line breaks <w:br/>
    if (para.includes('<w:br')) {
      if (currentParagraph.trim()) {
        lines.push(currentParagraph.trim());
      }
      currentParagraph = '';
    }

    if (currentParagraph.trim()) {
      lines.push(currentParagraph.trim());
      currentParagraph = '';
    }
  }

  // Clean up: remove excessive blank lines
  return lines.filter(l => l.length > 0).join('\n');
}
