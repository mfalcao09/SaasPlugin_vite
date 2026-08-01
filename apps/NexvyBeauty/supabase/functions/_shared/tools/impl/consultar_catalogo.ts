// Consulta o catálogo REAL de serviços do salão (nome, preço, duração) —
// fonte única de verdade pra preço no chat. Existe pra blindar o agente
// contra invenção de valor: o texto livre injetado no prompt (product_prices,
// ver _shared/agent-prompt-templates.ts) fica desatualizado assim que o salão
// cadastra ou reajusta um serviço; esta tool lê `servico_catalogo` AO VIVO a
// cada pergunta.
//
// Por que NÃO usa a edge `catalog-search` (RPC search_catalog_smart)?
// Porque essa RPC lê `product_catalog_items` — o catálogo B2B de mídia rica
// (imóveis/produtos, populado via Firecrawl) que é SEMPRE VAZIO num salão.
// Confirmado no próprio código: ver comentário de topo de
// src/hooks/useSalaoCatalogo.ts ("Substitui a leitura de product_catalog_items
// ... sempre vazio num salão") e confirmado ao vivo via MCP Supabase
// (product_catalog_items = 1 linha na org toda; servico_catalogo = 27 linhas
// ativas). A fonte real de preço/duração de SERVIÇO do salão é
// `servico_catalogo` (nome, preco_base, duracao_minutos, categoria).
//
// Registrada no registry, esta tool fica disponível pra QUALQUER agente ativo
// (ver executeRegistryTool/listRegistryTools em webchat-bot/index.ts — não há
// filtro por agent_type na exposição). Não quebra o funil B2B (Duda/Bia/Nina):
// aquele funil vive em `platform_crm_*` (product-scoped, sem organization_id)
// e não tem linhas em `servico_catalogo` — a tool simplesmente devolve
// found=false pra eles, igual a qualquer org sem catálogo de serviços.

import type { ToolDefinition } from '../types.ts';

interface ServicoRow {
  id: string;
  nome: string | null;
  preco_base: number | null;
  duracao_minutos: number | null;
  categoria: string | null;
  descricao: string | null;
}

// GATE DE RECUSA — limiar mínimo de confiança pra considerar um item
// "encontrado" e o agente poder citar preço. `servico_catalogo` não tem
// search_vector/trigram (não existe uma RPC de score pra essa tabela, ao
// contrário de product_catalog_items/search_catalog_smart), então o score
// aqui é calculado em memória (ver `matchScore` abaixo): 1.0 = nome idêntico,
// 0.9 = substring direta, 0.75 = bateu na categoria, senão = fração de
// palavras da busca encontradas no item (0..1). Abaixo do limiar = trata
// como "não encontrado" e a tool devolve instrução explícita pro agente NÃO
// inventar preço. Ajustável aqui, num único lugar nomeado.
const MIN_CONFIDENCE_TO_ANSWER = 0.34;

// Teto defensivo de linhas buscadas por vez (catálogo de salão é pequeno —
// dezenas de serviços; isto só evita custo em caso de org fora do padrão).
const MAX_ROWS_FETCHED = 300;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .trim();
}

function matchScore(query: string, item: ServicoRow): number {
  const q = normalize(query);
  if (!q) return 1; // sem query = modo "listar tudo", tudo "bate"

  const nome = normalize(item.nome);
  const categoria = normalize(item.categoria);
  const descricao = normalize(item.descricao);

  if (!nome && !categoria && !descricao) return 0;
  if (nome === q) return 1;
  if (nome.includes(q) || (q.length >= 4 && nome.length > 0 && q.includes(nome))) return 0.9;
  if (categoria.includes(q)) return 0.75;

  const qWords = q.split(/\s+/).filter((w) => w.length >= 3);
  if (qWords.length === 0) return 0;

  const hitWords = qWords.filter(
    (w) => nome.includes(w) || categoria.includes(w) || descricao.includes(w),
  );
  return hitWords.length / qWords.length;
}

export const consultarCatalogoTool: ToolDefinition = {
  name: 'consultar_catalogo',
  description:
    'Consulta o catálogo REAL de serviços do salão (nome, preço, duração) — FONTE ÚNICA DE VERDADE para preço. ' +
    'OBRIGATÓRIO chamar esta tool ANTES de informar preço, duração ou disponibilidade de qualquer serviço ao cliente. ' +
    'NUNCA informe preço de memória — se o serviço não vier com found=true nesta tool, diga que vai confirmar, não invente valor. ' +
    'Deixe "query" vazio para listar o catálogo ativo inteiro.',
  categories: ['crm'],
  estimated_cost_cents: 0,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Nome, categoria ou descrição do serviço buscado (ex: "escova", "botox capilar", "manicure"). Vazio = lista tudo.',
      },
      limit: {
        type: 'number',
        description: `Máximo de itens retornados (1-${MAX_LIMIT}, padrão ${DEFAULT_LIMIT}).`,
      },
    },
    required: [],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    const limit = Math.min(Math.max(Number(input?.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const rawQuery = typeof input?.query === 'string' ? input.query.trim() : '';

    const { data, error } = await ctx.supabase
      .from('servico_catalogo')
      .select('id, nome, preco_base, duracao_minutos, categoria, descricao')
      .eq('organization_id', ctx.organizationId)
      .eq('ativo', true)
      .order('nome')
      .limit(MAX_ROWS_FETCHED);

    if (error) {
      return { success: false, error: `Erro ao consultar catálogo de serviços: ${error.message}` };
    }

    const rows = (data ?? []) as ServicoRow[];

    const scored = rows
      .map((row) => ({ row, score: matchScore(rawQuery, row) }))
      .filter((r) => r.score >= MIN_CONFIDENCE_TO_ANSWER)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (scored.length === 0) {
      // GATE DE RECUSA: nada bateu com confiança suficiente. Devolve
      // resultado EXPLÍCITO de "não encontrado" — é isto que impede o
      // agente de inventar preço quando a pergunta não casa com nada real.
      return {
        success: true,
        data: {
          found: false,
          query: rawQuery || null,
          items: [],
          agent_instruction:
            'NENHUM serviço encontrado no catálogo com esse termo (ou catálogo vazio pra esta organização). ' +
            'NÃO invente nome, preço ou duração de serviço. Diga ao cliente que vai confirmar esse valor específico ' +
            'com a equipe do salão e, se fizer sentido, ofereça falar com uma pessoa do espaço.',
        },
      };
    }

    return {
      success: true,
      data: {
        found: true,
        query: rawQuery || null,
        count: scored.length,
        items: scored.map(({ row, score }) => ({
          id: row.id,
          nome: row.nome,
          preco: row.preco_base,
          duracao_minutos: row.duracao_minutos,
          categoria: row.categoria,
          descricao: row.descricao,
          confidence: Number(score.toFixed(2)),
        })),
        agent_instruction:
          'Use SOMENTE os preços e durações retornados aqui. Se o cliente pediu um serviço específico que NÃO está ' +
          'nesta lista, trate como não encontrado — não generalize o preço de um item parecido para outro.',
      },
    };
  },
};
