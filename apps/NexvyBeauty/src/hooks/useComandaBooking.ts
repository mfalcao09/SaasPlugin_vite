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
};

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

export function useComandaBooking(catalogo: ServicoPublico[], regras: RegraCrossSell[]) {
  const [ids, setIds] = useState<string[]>([]);
  const [dispensados, setDispensados] = useState<string[]>([]);

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
  const valorTotal = useMemo(
    () => itens.reduce((acc, s) => acc + Number(s.valor ?? 0), 0),
    [itens],
  );

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
    ids, itens, duracaoTotal, valorTotal, sugestoes,
    temItem, adicionar, remover, alternar, limpar, dispensar,
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
