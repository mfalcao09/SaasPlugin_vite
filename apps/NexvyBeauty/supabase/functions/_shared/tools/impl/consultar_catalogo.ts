// Consulta o catálogo REAL do salão — SERVIÇOS + PACOTES + PRODUTOS DE REVENDA
// (nome, preço, tipo) — fonte única de verdade pra preço no chat. Existe pra
// blindar o agente contra invenção de valor: o texto livre injetado no prompt
// (product_prices, ver _shared/agent-prompt-templates.ts) fica desatualizado
// assim que o salão cadastra ou reajusta um item; esta tool lê as 3 tabelas
// REAIS AO VIVO a cada pergunta.
//
// Por que NÃO usa a edge `catalog-search` (RPC search_catalog_smart)?
// Porque essa RPC lê `product_catalog_items` — o catálogo B2B de mídia rica
// (imóveis/produtos, populado via Firecrawl) que é SEMPRE VAZIO num salão.
// Confirmado no próprio código: ver comentário de topo de
// src/hooks/useSalaoCatalogo.ts ("Substitui a leitura de product_catalog_items
// ... sempre vazio num salão") e confirmado ao vivo via MCP Supabase
// (product_catalog_items = 1 linha na org toda).
//
// EXTENSÃO 2026-08-01 — de "só serviços" pra "3 tipos vendáveis do salão".
// A mesma lacuna de preço inventado que existia pra serviço existe pra
// pacote de sessões e pra produto de revenda. Investigação via MCP Supabase
// (information_schema + contagem nas 3 orgs de teste) antes de codar:
//
//   • `servico_catalogo` — catálogo de serviços. FONTE já coberta (ver acima).
//     Populado nas 3 orgs (7/10/10 linhas ativas).
//
//   • `pacotes` — CATÁLOGO de pacotes vendáveis (nome, valor, total_sessoes,
//     validade_dias, servicos_incluidos[], ativo). Isto é o item de venda —
//     NÃO confundir com `pacote_clientes`, que é a COMPRA de um cliente
//     específico (pacote_id + cliente_id + sessoes_usadas + valor_pago) e não
//     tem preço de catálogo, só o valor daquela venda já feita. Coberto aqui.
//     Populado em 1 das 3 orgs de teste (2 pacotes ativos); vazio nas outras
//     2 — não é "sempre vazio", é uso real ainda concentrado numa org, então
//     entra na cobertura (o gate cuida de devolver found=false pras que não
//     têm pacote, sem inventar nada).
//
//   • `products` (tipo='produto') — produtos físicos de revenda (shampoo,
//     esmalte...), preço/estoque/sku dentro de `settings` jsonb. Feature REAL
//     — tem página própria (src/cockpit/ProdutosRevenda.tsx, CRUD completo),
//     não é especulação. MAS: confirmado ao vivo que hoje são 0 linhas com
//     tipo='produto' nas 3 orgs de teste (a tabela `products` só tem linhas
//     tipo='servico'/'pacote'/'oferta', que são espelhos/rascunhos do funil
//     B2B — não confundir com o `tipo='produto'` da revenda do salão).
//     Cobrindo mesmo assim: a UI já grava lá, é questão de tempo até uma org
//     cadastrar o primeiro produto, e o gate de recusa já devolve found=false
//     corretamente pra tabela vazia — não há invenção de cobertura, é
//     cobertura real de uma fonte real que ainda não foi populada.
//
// Por que ESTENDER esta tool em vez de criar tool-irmã por tipo (ex.:
// consultar_pacotes, consultar_produtos)? Porque o próprio frontend já teve
// exatamente esse problema e resolveu assim: `useSalaoCatalogo.ts` (usado no
// CatalogPickerDialog do inbox humano) já unifica as 3 fontes num único array
// com campo `kind`, com o comentário "Normaliza as 3 fontes num shape comum".
// Replicar esse padrão no lado do agente evita duas armadilhas: (1) o LLM
// tendo que ADIVINHAR qual das N tools chamar pra uma pergunta ambígua
// ("vocês têm pacote de massagem?" — serviço? pacote? produto?), quando uma
// query só já cobre os 3; (2) triplicar o gate de recusa (MIN_CONFIDENCE_TO_
// ANSWER) em 3 lugares em vez de manter uma única fonte de verdade do limiar.
// Simplicidade primeiro: 1 tool, 3 fontes, 1 gate.
//
// Registrada no registry, esta tool fica disponível pra QUALQUER agente ativo
// (ver executeRegistryTool/listRegistryTools em webchat-bot/index.ts — não há
// filtro por agent_type na exposição). Não quebra o funil B2B (Duda/Bia/Nina):
// aquele funil vive em `platform_crm_*` (product-scoped, sem organization_id)
// e não tem linhas em `servico_catalogo`/`pacotes`/`products(tipo=produto)`
// — a tool simplesmente devolve found=false pra eles, igual a qualquer org
// sem catálogo de venda direta ao consumidor.

import type { ToolDefinition } from '../types.ts';

type CatalogKind = 'servico' | 'pacote' | 'produto';

// Shape comum pós-normalização das 3 tabelas — espelha o mesmo formato que
// src/hooks/useSalaoCatalogo.ts já usa no frontend (kind/title→nome/price→preco).
interface CatalogItem {
  kind: CatalogKind;
  id: string;
  nome: string | null;
  preco: number | null;
  categoria: string | null;
  descricao: string | null;
  // campos extras — só populados quando fazem sentido pro tipo
  duracao_minutos?: number | null; // servico
  total_sessoes?: number | null; // pacote
  validade_dias?: number | null; // pacote
  servicos_incluidos?: string[] | null; // pacote
  estoque?: number | null; // produto
  sku?: string | null; // produto
  // texto extra usado só pro score de busca (não vai na resposta ao agente)
  _searchExtra?: string;
}

interface ServicoRow {
  id: string;
  nome: string | null;
  preco_base: number | null;
  duracao_minutos: number | null;
  categoria: string | null;
  descricao: string | null;
}

interface PacoteRow {
  id: string;
  nome: string | null;
  valor: number | null;
  descricao: string | null;
  total_sessoes: number | null;
  validade_dias: number | null;
  servicos_incluidos: string[] | null;
}

interface ProdutoRow {
  id: string;
  name: string | null;
  category: string | null;
  settings: { preco?: number; estoque?: number; sku?: string } | null;
}

// GATE DE RECUSA — limiar mínimo de confiança pra considerar um item
// "encontrado" e o agente poder citar preço. Nenhuma das 3 tabelas tem
// search_vector/trigram (não existe RPC de score pra elas, ao contrário de
// product_catalog_items/search_catalog_smart), então o score é calculado em
// memória (ver `matchScore` abaixo): 1.0 = nome idêntico, 0.9 = substring
// direta, 0.75 = bateu na categoria, senão = fração de palavras da busca
// encontradas no item (0..1). Abaixo do limiar = trata como "não encontrado"
// e a tool devolve instrução explícita pro agente NÃO inventar preço.
// Ajustável aqui, num único lugar nomeado — vale pros 3 tipos igualmente.
const MIN_CONFIDENCE_TO_ANSWER = 0.34;

// Teto defensivo de linhas buscadas por vez, POR TABELA (catálogo de salão é
// pequeno — dezenas de itens; isto só evita custo em caso de org fora do padrão).
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

function matchScore(query: string, item: CatalogItem): number {
  const q = normalize(query);
  if (!q) return 1; // sem query = modo "listar tudo", tudo "bate"

  const nome = normalize(item.nome);
  const categoria = normalize(item.categoria);
  const descricao = normalize(item.descricao);
  const extra = normalize(item._searchExtra);

  if (!nome && !categoria && !descricao && !extra) return 0;
  if (nome === q) return 1;
  if (nome.includes(q) || (q.length >= 4 && nome.length > 0 && q.includes(nome))) return 0.9;
  if (categoria.includes(q)) return 0.75;

  const qWords = q.split(/\s+/).filter((w) => w.length >= 3);
  if (qWords.length === 0) return 0;

  const hitWords = qWords.filter(
    (w) => nome.includes(w) || categoria.includes(w) || descricao.includes(w) || extra.includes(w),
  );
  return hitWords.length / qWords.length;
}

function mapServico(row: ServicoRow): CatalogItem {
  return {
    kind: 'servico',
    id: row.id,
    nome: row.nome,
    preco: row.preco_base,
    categoria: row.categoria,
    descricao: row.descricao,
    duracao_minutos: row.duracao_minutos,
  };
}

function mapPacote(row: PacoteRow): CatalogItem {
  const incl = Array.isArray(row.servicos_incluidos) ? row.servicos_incluidos : null;
  return {
    kind: 'pacote',
    id: row.id,
    nome: row.nome,
    preco: row.valor,
    categoria: null,
    descricao: row.descricao,
    total_sessoes: row.total_sessoes,
    validade_dias: row.validade_dias,
    servicos_incluidos: incl,
    _searchExtra: incl ? incl.join(' ') : undefined,
  };
}

function mapProduto(row: ProdutoRow): CatalogItem {
  return {
    kind: 'produto',
    id: row.id,
    nome: row.name,
    preco: row.settings?.preco ?? null,
    categoria: row.category,
    descricao: null,
    estoque: row.settings?.estoque ?? null,
    sku: row.settings?.sku ?? null,
    _searchExtra: row.settings?.sku ?? undefined,
  };
}

export const consultarCatalogoTool: ToolDefinition = {
  name: 'consultar_catalogo',
  description:
    'Consulta o catálogo REAL do salão — SERVIÇOS, PACOTES de sessões e PRODUTOS de revenda (nome, preço) — ' +
    'FONTE ÚNICA DE VERDADE para preço. OBRIGATÓRIO chamar esta tool ANTES de informar preço, duração, ' +
    'validade ou disponibilidade de qualquer serviço, pacote ou produto ao cliente. ' +
    'NUNCA informe preço de memória — se o item não vier com found=true nesta tool, diga que vai confirmar, não invente valor. ' +
    'Cada item volta com "tipo" (servico | pacote | produto): NÃO confunda um com outro (ex: preço de pacote de 5 sessões ' +
    'não é o preço do serviço avulso). ' +
    'Deixe "query" vazio para listar o catálogo ativo inteiro; use "tipo" para restringir a um tipo só.',
  categories: ['crm'],
  estimated_cost_cents: 0,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Nome, categoria ou descrição do serviço/pacote/produto buscado (ex: "escova", "pacote manicure", "shampoo"). Vazio = lista tudo.',
      },
      tipo: {
        type: 'string',
        enum: ['servico', 'pacote', 'produto'],
        description: 'Restringe a busca a um tipo só. Vazio = busca nos 3 (serviço, pacote e produto).',
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
    const tipoFilter =
      input?.tipo === 'servico' || input?.tipo === 'pacote' || input?.tipo === 'produto'
        ? (input.tipo as CatalogKind)
        : null;

    const wantServico = !tipoFilter || tipoFilter === 'servico';
    const wantPacote = !tipoFilter || tipoFilter === 'pacote';
    const wantProduto = !tipoFilter || tipoFilter === 'produto';

    // As 3 fontes são buscadas em paralelo, isoladas por organization_id (não
    // afrouxa o isolamento da versão anterior — cada query mantém seu próprio
    // .eq('organization_id', ...)). Falha de UMA fonte não derruba as outras:
    // loga o erro (nunca silencia — Seção 5) e segue com o que deu certo. Só
    // falha a tool inteira se TODAS as fontes pedidas derem erro.
    const [servicoRes, pacoteRes, produtoRes] = await Promise.all([
      wantServico
        ? ctx.supabase
            .from('servico_catalogo')
            .select('id, nome, preco_base, duracao_minutos, categoria, descricao')
            .eq('organization_id', ctx.organizationId)
            .eq('ativo', true)
            .order('nome')
            .limit(MAX_ROWS_FETCHED)
        : Promise.resolve({ data: [], error: null }),
      wantPacote
        ? ctx.supabase
            .from('pacotes')
            .select('id, nome, valor, descricao, total_sessoes, validade_dias, servicos_incluidos')
            .eq('organization_id', ctx.organizationId)
            .eq('ativo', true)
            .order('nome')
            .limit(MAX_ROWS_FETCHED)
        : Promise.resolve({ data: [], error: null }),
      wantProduto
        ? ctx.supabase
            .from('products')
            .select('id, name, category, settings')
            .eq('organization_id', ctx.organizationId)
            .eq('tipo', 'produto')
            .eq('status', 'published')
            .order('name')
            .limit(MAX_ROWS_FETCHED)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const errors: string[] = [];
    if (servicoRes.error) {
      console.error('[consultar_catalogo] falha ao ler servico_catalogo:', servicoRes.error.message);
      errors.push(`serviços: ${servicoRes.error.message}`);
    }
    if (pacoteRes.error) {
      console.error('[consultar_catalogo] falha ao ler pacotes:', pacoteRes.error.message);
      errors.push(`pacotes: ${pacoteRes.error.message}`);
    }
    if (produtoRes.error) {
      console.error('[consultar_catalogo] falha ao ler products (revenda):', produtoRes.error.message);
      errors.push(`produtos: ${produtoRes.error.message}`);
    }

    const sourcesRequested = [wantServico, wantPacote, wantProduto].filter(Boolean).length;
    if (errors.length > 0 && errors.length === sourcesRequested) {
      return { success: false, error: `Erro ao consultar catálogo: ${errors.join('; ')}` };
    }

    const items: CatalogItem[] = [
      ...((servicoRes.data ?? []) as ServicoRow[]).map(mapServico),
      ...((pacoteRes.data ?? []) as PacoteRow[]).map(mapPacote),
      ...((produtoRes.data ?? []) as ProdutoRow[]).map(mapProduto),
    ];

    const scored = items
      .map((item) => ({ item, score: matchScore(rawQuery, item) }))
      .filter((r) => r.score >= MIN_CONFIDENCE_TO_ANSWER)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (scored.length === 0) {
      // GATE DE RECUSA: nada bateu com confiança suficiente em nenhum dos 3
      // tipos buscados. Devolve resultado EXPLÍCITO de "não encontrado" — é
      // isto que impede o agente de inventar preço quando a pergunta não
      // casa com nada real (seja serviço, pacote ou produto).
      return {
        success: true,
        data: {
          found: false,
          query: rawQuery || null,
          tipo: tipoFilter,
          items: [],
          agent_instruction:
            'NENHUM serviço, pacote ou produto encontrado no catálogo com esse termo (ou catálogo vazio pra esta ' +
            'organização/tipo). NÃO invente nome, preço, validade ou duração. Diga ao cliente que vai confirmar esse ' +
            'valor específico com a equipe do salão e, se fizer sentido, ofereça falar com uma pessoa do espaço.',
        },
      };
    }

    return {
      success: true,
      data: {
        found: true,
        query: rawQuery || null,
        tipo: tipoFilter,
        count: scored.length,
        items: scored.map(({ item, score }) => ({
          id: item.id,
          tipo: item.kind,
          nome: item.nome,
          preco: item.preco,
          categoria: item.categoria,
          descricao: item.descricao,
          ...(item.kind === 'servico' ? { duracao_minutos: item.duracao_minutos } : {}),
          ...(item.kind === 'pacote'
            ? {
                total_sessoes: item.total_sessoes,
                validade_dias: item.validade_dias,
                servicos_incluidos: item.servicos_incluidos,
              }
            : {}),
          ...(item.kind === 'produto' ? { estoque: item.estoque, sku: item.sku } : {}),
          confidence: Number(score.toFixed(2)),
        })),
        agent_instruction:
          'Use SOMENTE os preços, tipos e durações/validades retornados aqui. Cada item tem "tipo" (servico | pacote | ' +
          'produto) — NÃO troque o preço de um tipo pelo de outro (ex: cliente perguntou o pacote de 5 sessões, não o ' +
          'serviço avulso). Se o cliente pediu um item específico que NÃO está nesta lista, trate como não encontrado ' +
          '— não generalize o preço de um item parecido para outro.',
      },
    };
  },
};
