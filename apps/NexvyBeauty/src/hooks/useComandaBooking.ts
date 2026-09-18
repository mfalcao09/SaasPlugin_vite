// Estado da comanda (cesta de serviços) do agendamento público /s/:slug.
// Só o que tem regra de negócio mora aqui — totais e sugestão de cross-sell.
// O estado de navegação do wizard (passo, data, dados do cliente) fica na página.
import { useCallback, useMemo, useState } from 'react';

export type ServicoPublico = {
  id: string;
  nome: string;
  categoria: string | null;
  duracao_minutos: number | null;
  valor: number | null;
  tipo?: 'principal' | 'extra' | null;
  /** Quando existe, é o preço cobrado; `valor` vira o "de" riscado. */
  preco_promocional?: number | null;
  imagem_url?: string | null;
  /** Combo: ids dos serviços que ele inclui (exibição; não expande na agenda). */
  combo_servico_ids?: string[] | null;
  descricao?: string | null;
};

export type ProdutoPublico = {
  id: string;
  nome: string;
  categoria: string | null;
  preco: number;
  estoque: number;
  imagem_url: string | null;
};

/** Preço que o cliente realmente paga — a promoção manda quando existe. */
export function precoEfetivo(s: ServicoPublico): number {
  return Number(s.preco_promocional ?? s.valor ?? 0);
}

export type ProfissionalPublico = {
  id: string;
  nome: string;
  especialidades: string[] | null;
  hora_inicio: string | null;
  hora_fim: string | null;
};

export type RegraCrossSell = {
  servico_origem_id: string;
  servico_sugerido_id: string;
  prioridade: number;
};

export type ItemRoteiro = {
  servico_id: string;
  nome: string;
  profissional_id: string;
  profissional_nome: string;
  inicio: string;
  fim: string;
  execution_order: number;
};

export type Roteiro = {
  tipo: 'continuo' | 'sequencial' | 'fracionado';
  inicio: string;
  fim: string;
  espera_minutos: number;
  duracao_total_minutos: number;
  valor_total: number;
  profissionais_ids: string[];
  itens: ItemRoteiro[];
};

export type ModoAtendimento = 'unico' | 'preferido' | 'auto';

const DURACAO_PADRAO = 60;

export function useComandaBooking(
  catalogo: ServicoPublico[],
  regras: RegraCrossSell[],
  produtosCatalogo: ProdutoPublico[] = [],
) {
  const [ids, setIds] = useState<string[]>([]);
  const [dispensados, setDispensados] = useState<string[]>([]);
  /** produto_id -> quantidade */
  const [produtos, setProdutos] = useState<Record<string, number>>({});

  const porId = useMemo(() => new Map(catalogo.map((s) => [s.id, s])), [catalogo]);

  /** Itens na ordem em que o cliente adicionou — a precedência técnica é aplicada no servidor. */
  const itens = useMemo(
    () => ids.map((id) => porId.get(id)).filter(Boolean) as ServicoPublico[],
    [ids, porId],
  );

  const duracaoTotal = useMemo(
    () => itens.reduce((acc, s) => acc + (s.duracao_minutos ?? DURACAO_PADRAO), 0),
    [itens],
  );
  // Soma pelo preço EFETIVO: com promoção ativa, o total tem que bater com o
  // que a RPC cobra — senão a tela promete um valor e o salão cobra outro.
  const valorServicos = useMemo(
    () => itens.reduce((acc, s) => acc + precoEfetivo(s), 0),
    [itens],
  );

  const produtosPorId = useMemo(
    () => new Map(produtosCatalogo.map((p) => [p.id, p])),
    [produtosCatalogo],
  );

  const itensProduto = useMemo(
    () => Object.entries(produtos)
      .map(([id, qtd]) => {
        const p = produtosPorId.get(id);
        return p ? { produto: p, quantidade: qtd } : null;
      })
      .filter(Boolean) as Array<{ produto: ProdutoPublico; quantidade: number }>,
    [produtos, produtosPorId],
  );

  const valorProdutos = useMemo(
    () => itensProduto.reduce((acc, i) => acc + i.produto.preco * i.quantidade, 0),
    [itensProduto],
  );

  const valorTotal = valorServicos + valorProdutos;

  const temItem = useCallback((id: string) => ids.includes(id), [ids]);

  const adicionar = useCallback((id: string) => {
    setIds((atual) => (atual.includes(id) ? atual : [...atual, id]));
  }, []);

  const remover = useCallback((id: string) => {
    setIds((atual) => atual.filter((x) => x !== id));
  }, []);

  const alternar = useCallback((id: string) => {
    setIds((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }, []);

  const limpar = useCallback(() => {
    setIds([]);
    setDispensados([]);
    setProdutos({});
  }, []);

  /** Ajusta quantidade do produto; 0 (ou menos) remove da comanda. */
  const definirProduto = useCallback((id: string, quantidade: number, estoque: number) => {
    setProdutos((atual) => {
      const qtd = Math.max(0, Math.min(quantidade, Math.max(0, estoque)));
      if (qtd === 0) {
        const { [id]: _, ...resto } = atual;
        return resto;
      }
      return { ...atual, [id]: qtd };
    });
  }, []);

  const dispensar = useCallback((id: string) => {
    setDispensados((atual) => (atual.includes(id) ? atual : [...atual, id]));
  }, []);

  /**
   * Sugestões vindas das regras que o salão configurou ("quem faz X também leva Y").
   * Fora: o que já está na cesta e o que o cliente dispensou. Mais prioridade primeiro.
   */
  const sugestoes = useMemo(() => {
    if (ids.length === 0) return [];
    const pontuacao = new Map<string, number>();
    for (const r of regras) {
      if (!ids.includes(r.servico_origem_id)) continue;
      if (ids.includes(r.servico_sugerido_id)) continue;
      if (dispensados.includes(r.servico_sugerido_id)) continue;
      const atual = pontuacao.get(r.servico_sugerido_id) ?? -Infinity;
      pontuacao.set(r.servico_sugerido_id, Math.max(atual, r.prioridade ?? 0));
    }
    return [...pontuacao.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => porId.get(id))
      .filter(Boolean) as ServicoPublico[];
  }, [ids, regras, dispensados, porId]);

  return {
    ids, itens, duracaoTotal, valorTotal, valorServicos, valorProdutos, sugestoes,
    itensProduto, produtos,
    temItem, adicionar, remover, alternar, limpar, dispensar, definirProduto,
  };
}

export function formatarDuracao(minutos: number): string {
  if (minutos <= 0) return '0 min';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function formatarMoeda(valor: number | null): string {
  if (valor == null) return '—';
  return `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}
