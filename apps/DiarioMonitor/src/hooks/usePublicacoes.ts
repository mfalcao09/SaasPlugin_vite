import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Ato,
  ConsultaSQL,
  ExecutorConsulta,
  FiltroPublicacoes,
  ResultadoPaginado,
} from '../types/publicacoes';
import { buscarPublicacoes, contarPublicacoes, normalizarPaginacao } from '../services/publicacoes.mjs';

// ============================================================================
// Hook de dados da tela de Publicações (card C1.4a → consumido pelo C1.4b)
//
// O hook NÃO monta SQL — delega inteiramente a `src/services/publicacoes.mjs`
// (que só GERA a consulta) e recebe um `executor` já pronto para RODÁ-la.
//
// POR QUE `executor` é parâmetro, não algo fixo aqui dentro: este app ainda
// não tem nenhum transporte de dados (nem `@supabase/supabase-js`, nem
// `src/lib/supabase.ts` — conferido antes de escrever este hook). A Seção
// 11.1 das regras do produto exige que o frontend NUNCA fale direto com um
// serviço interno — o caminho real será uma Edge Function via fetch(),
// decisão de infra que ainda não foi tomada e não é deste card. Receber o
// executor por injeção de dependência mantém o hook 100% testável hoje (um
// mock) e pronto para o transporte real amanhã, sem precisar mudar 1 linha
// aqui — só quem instancia o hook muda.
// ============================================================================

interface ResultadoUsoPublicacoes {
  readonly dados: ResultadoPaginado<Ato> | null;
  readonly carregando: boolean;
  readonly erro: Error | null;
  readonly recarregar: () => void;
}

interface LinhaContagem {
  readonly total?: number;
}

function paraErro(motivo: unknown): Error {
  return motivo instanceof Error ? motivo : new Error(String(motivo));
}

function ehAbort(motivo: unknown): boolean {
  return motivo instanceof DOMException && motivo.name === 'AbortError';
}

/**
 * @param executor função que executa uma `ConsultaSQL` (ver contrato em
 *   `src/types/publicacoes.ts`) — injetada por quem monta a tela.
 * @param filtros filtros correntes da tela; o hook refaz a busca sempre
 *   que o CONTEÚDO deles muda (serializado — ver `chaveFiltros` abaixo,
 *   evita disparar de novo só porque o chamador passou um objeto novo com
 *   o mesmo conteúdo).
 */
export function usePublicacoes(
  executor: ExecutorConsulta,
  filtros: FiltroPublicacoes,
): ResultadoUsoPublicacoes {
  const [dados, setDados] = useState<ResultadoPaginado<Ato> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<Error | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const controladorRef = useRef<AbortController | null>(null);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  // Dependência serializada de propósito: `filtros` normalmente chega como
  // objeto literal novo a cada render do chamador — usar o objeto direto no
  // array de dependências disparava a busca a cada render, mesmo sem
  // mudança de conteúdo.
  const chaveFiltros = JSON.stringify(filtros);

  useEffect(() => {
    controladorRef.current?.abort();
    const controlador = new AbortController();
    controladorRef.current = controlador;

    setCarregando(true);
    setErro(null);

    const consultaBusca: ConsultaSQL = buscarPublicacoes(filtros);
    const consultaContagem: ConsultaSQL = contarPublicacoes(filtros);
    const { pagina, porPagina } = normalizarPaginacao(filtros.pagina, filtros.porPagina);

    Promise.all([
      executor(consultaBusca, { signal: controlador.signal }),
      executor(consultaContagem, { signal: controlador.signal }),
    ])
      .then(([linhasAtos, linhasContagem]) => {
        if (controlador.signal.aborted) return;
        // Fronteira de confiança: o executor devolve linhas cruas porque
        // `buscarPublicacoes` SELECIONA exatamente as colunas de `Ato` com
        // os mesmos nomes — o formato é garantido pela consulta gerada,
        // não checado em runtime aqui (ver ConsultaSQL no contrato).
        const itens = linhasAtos as unknown as readonly Ato[];
        const total = Number((linhasContagem[0] as LinhaContagem | undefined)?.total ?? 0);
        setDados({ itens, total, pagina, porPagina });
        setCarregando(false);
      })
      .catch((motivo: unknown) => {
        if (controlador.signal.aborted || ehAbort(motivo)) return;
        setErro(paraErro(motivo));
        setCarregando(false);
      });

    return () => controlador.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chaveFiltros substitui filtros de propósito (ver comentário acima)
  }, [executor, chaveFiltros, tentativa]);

  return { dados, carregando, erro, recarregar };
}
