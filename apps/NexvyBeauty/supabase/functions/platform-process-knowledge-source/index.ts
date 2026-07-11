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
  sourceType: 'website' | 'youtube';
  url: string;
  productId: string;
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
