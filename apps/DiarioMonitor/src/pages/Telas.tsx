import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download, Loader2, RefreshCw, Search, Check, X, FileText, AlertTriangle, Database,
  ArrowLeft, ExternalLink,
} from 'lucide-react';

// ============================================================================
// Telas do DiárioMonitor — camada de APRESENTAÇÃO (PRD §7.2.3)
//
// Nenhuma query, nenhuma regra de negócio: tudo vem de /api/*, que consulta o
// Postgres sob RLS com a identidade da sessão. O que aparece aqui é o que a
// política do banco permite à instituição de quem está logado — não um filtro
// de front-end, que qualquer um contornaria.
//
// Estilo token-only (bg-primary, text-muted-foreground): o componente nunca
// sabe o hue; o tema entra pela classe no <html>.
// ============================================================================

/** Leitura de API sem biblioteca: useState + AbortController + gatilho. */
function useApi<T>(url: string, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gatilho, setGatilho] = useState(0);

  const recarregar = useCallback(() => setGatilho((n) => n + 1), []);

  useEffect(() => {
    const ac = new AbortController();
    setCarregando(true);
    setErro(null);
    fetch(url, { signal: ac.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro ?? `HTTP ${r.status}`);
        return j as T;
      })
      .then(setDados)
      .catch((e) => { if ((e as Error).name !== 'AbortError') setErro((e as Error).message); })
      .finally(() => setCarregando(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, gatilho, ...deps]);

  return { dados, carregando, erro, recarregar };
}

async function postar<T>(url: string, corpo: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.erro ?? `HTTP ${r.status}`);
  return j as T;
}

// ---------------------------------------------------------------------------
// Peças compartilhadas
// ---------------------------------------------------------------------------
function Cabecalho({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-lg font-semibold text-foreground">{titulo}</h1>
      {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

const Carregando = ({ texto = 'Carregando…' }: { texto?: string }) => (
  <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" /> {texto}
  </div>
);

const Erro = ({ mensagem }: { mensagem: string }) => (
  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
    <span>{mensagem}</span>
  </div>
);

/** "12228 · supl. 2" — sem isto três edições do mesmo dia ficam idênticas. */
const rotuloEdicao = (numero: string, suplemento: number | null) =>
  suplemento ? `${numero} · supl. ${suplemento}` : numero;

// ---------------------------------------------------------------------------
// 1. FONTES — onde a captura é disparada
// ---------------------------------------------------------------------------
type Fonte = {
  sigla: string; nome: string; parser_key: string; modo: string;
  esfera: string; uf: string | null;
  operacional: boolean; bloqueio: string | null;
  edicoes_ingeridas: number; atos_extraidos: number;
  ultima_edicao: string | null; validadas: number;
};

type Ingestao = {
  fonte: string; encontradas: number; baixadas: number; jaExistiam: number;
  atosExtraidos: number;
  gravado?: { edicoes: number; atos: number };
  edicoes: { id: string; status: string; data: string; bytes?: number; hash?: string }[];
};

export function TelaFontes() {
  const { dados, carregando, erro, recarregar } = useApi<Fonte[]>('/api/fontes');
  const [rodando, setRodando] = useState<string | null>(null);
  const [saida, setSaida] = useState<Record<string, Ingestao | string>>({});

  async function executar(f: Fonte) {
    setRodando(f.parser_key);
    setSaida((s) => { const { [f.sigla]: _descartado, ...resto } = s; return resto; });
    try {
      const r = await postar<Ingestao>('/api/ingest', { parserKey: f.parser_key, datas: 3 });
      setSaida((s) => ({ ...s, [f.sigla]: r }));
      recarregar();
    } catch (e) {
      setSaida((s) => ({ ...s, [f.sigla]: `Falhou: ${(e as Error).message}` }));
    } finally {
      setRodando(null);
    }
  }

  if (carregando) return <Carregando />;
  if (erro) return <Erro mensagem={erro} />;

  return (
    <div>
      <Cabecalho
        titulo="Fontes de Diários"
        sub="Cada fonte tem um módulo de captura próprio. Executar aqui roda exatamente a mesma rotina que o agendamento diário vai disparar sozinho."
      />
      <div className="space-y-3">
        {dados?.map((f) => {
          const r = saida[f.sigla];
          return (
            <div key={f.sigla} className="surface-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-primary px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary-foreground">
                      {f.sigla}
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">{f.nome}</h3>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {f.parser_key} · {f.modo} · {f.esfera}{f.uf ? `/${f.uf}` : ''}
                    {f.ultima_edicao && ` · última: ${f.ultima_edicao}`}
                  </p>
                  {!f.operacional && f.bloqueio && (
                    <p className="mt-1.5 text-[12px] text-muted-foreground">⚠ {f.bloqueio}</p>
                  )}
                </div>

                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums text-foreground">{f.edicoes_ingeridas}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">edições</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums text-foreground">{f.atos_extraidos}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">atos</div>
                  </div>
                  <button
                    disabled={!f.operacional || rodando !== null}
                    onClick={() => executar(f)}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {rodando === f.parser_key
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Capturando…</>
                      : <><Download className="h-4 w-4" /> Executar ingestão</>}
                  </button>
                </div>
              </div>

              {typeof r === 'string' && <p className="mt-3 text-[13px] text-destructive">{r}</p>}
              {r && typeof r !== 'string' && (
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-[13px] text-foreground">
                    <b className="tabular-nums">{r.baixadas}</b> nova(s) ·{' '}
                    <b className="tabular-nums">{r.jaExistiam}</b> já ingerida(s) de{' '}
                    <b className="tabular-nums">{r.encontradas}</b> encontrada(s) ·{' '}
                    <b className="tabular-nums">{r.atosExtraidos}</b> ato(s) extraído(s)
                  </p>
                  {r.gravado && (
                    <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Database className="h-3 w-3" />
                      gravado no acervo: {r.gravado.edicoes} edição(ões), {r.gravado.atos} ato(s)
                    </p>
                  )}
                  <ul className="mt-2 space-y-0.5">
                    {r.edicoes.map((e) => (
                      <li key={e.id} className="font-mono text-[11px] text-muted-foreground">
                        {e.status === 'baixada' ? '↓' : '·'} {e.id} — {e.data}
                        {e.bytes ? ` · ${Math.round(e.bytes / 1024)} KB` : ''}
                        {e.hash ? ` · sha256:${e.hash}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. PUBLICAÇÕES — o acervo, com busca full-text do Postgres
// ---------------------------------------------------------------------------
type Ato = {
  id: string; fonte: string; edicao: string; data_publicacao: string; arquivo: string;
  tipo: string; numero: string; ano: number; data_ato: string | null;
  orgao_emissor: string | null;
  ementa: string | null; trecho_original: string | null;
  pagina: string | null;
  confianca: number | null; status: string; julgamento: string | null;
};

export function TelaPublicacoes() {
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [fonte, setFonte] = useState('');
  const { dados, carregando, erro } = useApi<{ itens: Ato[]; total: number }>(
    `/api/atos?q=${encodeURIComponent(busca)}&fonte=${fonte}&porPagina=60`, [busca, fonte],
  );
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <div>
      <Cabecalho
        titulo="Publicações"
        sub="Atos normativos extraídos das edições capturadas. A busca usa o índice full-text em português do banco."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setBusca(termo)}
            placeholder="Buscar no texto do ato…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={fonte}
          onChange={(e) => setFonte(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todas as fontes</option>
          <option value="DJMS">DJMS — Tribunal</option>
          <option value="DOMS">DOMS — Estado</option>
        </select>
        <button
          onClick={() => setBusca(termo)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Search className="h-4 w-4" /> Buscar
        </button>
      </div>

      {carregando && <Carregando />}
      {erro && <Erro mensagem={erro} />}

      {dados && (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            <b className="tabular-nums text-foreground">{dados.total}</b> ato(s)
            {busca && <> para “{busca}”</>}
          </p>
          <div className="surface-card divide-y divide-border overflow-hidden">
            {dados.itens.map((a) => (
              <div key={a.id} className="p-4">
                <button onClick={() => setAberto(aberto === a.id ? null : a.id)} className="w-full text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] font-bold text-secondary-foreground">
                      {a.fonte}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {a.tipo} n. {a.numero}/{a.ano}
                    </span>
                    {a.julgamento === 'ok' && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                        conferido
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
                      ed. {a.edicao} · {a.data_publicacao}
                    </span>
                  </div>
                  {a.ementa && (
                    <p className="mt-1.5 line-clamp-2 text-[13px] text-muted-foreground">{a.ementa}</p>
                  )}
                </button>
                {aberto === a.id && (
                  <div className="mt-3 rounded-lg border-l-2 border-primary bg-muted/40 p-3 text-[13px] leading-relaxed text-foreground">
                    <div className="mb-1.5 font-mono text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground">
                      texto no diário · {a.arquivo}
                    </div>
                    {a.trecho_original ?? a.ementa ?? '(sem texto capturado)'}
                  </div>
                )}
              </div>
            ))}
            {dados.itens.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nenhum ato encontrado. Capture uma edição em <b>Fontes de Diários</b>.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. FILA DE REVISÃO — a validação acontece aqui dentro
// ---------------------------------------------------------------------------
type EdicaoRevisao = {
  id: string; fonte: string; edicao: string; data_publicacao: string;
  numero_suplemento: number | null; arquivo: string;
  total: number; julgados: number;
  atos: Ato[];
};

// Um ato na coluna de validação: o que a máquina extraiu + ✓/✗. O operador
// confere contra o PDF do diário renderizado ao lado. CLICAR no card leva o
// PDF à página do ato — sem isso, validar num diário de 178 páginas é caça
// ao tesouro, não trabalho assistido.
function AtoParaJulgar({ a, selecionado, aoVer, onJulgar }: {
  a: Ato; selecionado: boolean;
  aoVer: () => void;
  onJulgar: (id: string, d: 'ok' | 'descartado') => void;
}) {
  const tom =
    a.julgamento === 'ok' ? 'border-primary/40 bg-primary/5'
    : a.julgamento === 'descartado' ? 'border-destructive/40 bg-destructive/5 opacity-70'
    : 'border-border';
  return (
    <div
      onClick={aoVer}
      className={`cursor-pointer rounded-lg border p-3 transition-shadow ${tom} ${
        selecionado ? 'ring-2 ring-ring' : 'hover:border-primary/40'}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            {a.tipo} n. {a.numero}/{a.ano}
            {a.pagina && (
              <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold text-secondary-foreground">
                pág. {a.pagina}
              </span>
            )}
            {a.confianca !== null && a.confianca < 0.5 && (
              <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-destructive">
                confiança baixa
              </span>
            )}
          </div>
          {a.ementa && (
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{a.ementa}</p>
          )}
          {a.trecho_original && (
            <details className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              <summary className="cursor-pointer select-none font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                trecho extraído
              </summary>
              <div className="mt-1 max-h-28 overflow-y-auto rounded border-l-2 border-primary bg-muted/40 p-2 text-[12.5px] leading-relaxed text-foreground">
                {a.trecho_original}
              </div>
            </details>
          )}
        </div>
        <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            title="Confere com o diário ao lado"
            onClick={() => onJulgar(a.id, 'ok')}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
              a.julgamento === 'ok'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:border-primary'}`}
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            title="Falso positivo — não confere com o diário"
            onClick={() => onJulgar(a.id, 'descartado')}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
              a.julgamento === 'descartado'
                ? 'border-destructive bg-destructive text-destructive-foreground'
                : 'border-border hover:border-destructive'}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

type Caixa = { x: number; y: number; w: number; h: number };

// Página do diário renderizada como IMAGEM (servida pelo Poppler) em vez do
// visualizador nativo em <iframe>. Dois motivos, ambos pedidos do operador:
// 1. Visual limpo — sem toolbar nem painel de miniaturas, zoom de encaixe
//    por CSS (width:100%), leitura imediata.
// 2. A CAMADA DE DESTAQUE: o visualizador nativo é caixa-preta (não aceita
//    overlay); sobre uma imagem, as caixas vindas do /destaque (frações 0–1
//    calculadas do bbox-layout do Poppler) viram divs absolutas.
function VisorDiario({ edicaoId, pagina, atoId }: {
  edicaoId: string; pagina: string; atoId: string | null;
}) {
  const [caixas, setCaixas] = useState<Caixa[]>([]);
  const rolagem = useRef<HTMLDivElement>(null);
  const imagem = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setCaixas([]);
    if (!atoId) return;
    const ac = new AbortController();
    fetch(`/api/edicoes/${edicaoId}/destaque?ato=${atoId}&pagina=${pagina}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((j) => setCaixas(j.caixas ?? []))
      .catch(() => { /* sem destaque é estado válido — nunca destacar errado */ });
    return () => ac.abort();
  }, [edicaoId, atoId, pagina]);

  // Leva a rolagem até o destaque assim que imagem E caixas existirem.
  const rolarAteDestaque = useCallback(() => {
    if (!rolagem.current || !imagem.current || !caixas.length) return;
    const topo = caixas[0].y * imagem.current.clientHeight - 120;
    rolagem.current.scrollTo({ top: Math.max(0, topo), behavior: 'smooth' });
  }, [caixas]);
  useEffect(rolarAteDestaque, [rolarAteDestaque]);

  return (
    <div ref={rolagem} className="h-[60vh] overflow-auto rounded-lg border border-border bg-muted/30 lg:h-[80vh]">
      <div className="relative">
        <img
          ref={imagem}
          src={`/api/edicoes/${edicaoId}/pagina/${pagina}/imagem`}
          onLoad={rolarAteDestaque}
          alt={`Página ${pagina} do diário`}
          className="w-full bg-white"
        />
        {caixas.map((c, i) => (
          <div
            key={i}
            className="pointer-events-none absolute rounded-[2px] bg-accent/30 ring-1 ring-accent"
            style={{
              left: `${c.x * 100}%`, top: `${c.y * 100}%`,
              width: `${c.w * 100}%`, height: `${c.h * 100}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Revisão LADO A LADO: PDF do diário à esquerda, atos extraídos à direita.
// É o coração da fase de validação — o operador lê a fonte e valida cada
// portaria sem sair do sistema. O `#view=FitH` pede ao visualizador nativo do
// navegador para ajustar a largura da página.
function RevisaoLadoALado({ ed, onVoltar, onJulgar, onConcluir }: {
  ed: EdicaoRevisao;
  onVoltar: () => void;
  onJulgar: (id: string, d: 'ok' | 'descartado') => void;
  onConcluir: (ed: EdicaoRevisao) => void;
}) {
  const pdfUrl = `/api/edicoes/${ed.id}/pdf`;

  // Ato selecionado -> página exibida + destaque do trecho dele.
  const [atoVisto, setAtoVisto] = useState<string | null>(null);
  const paginaVista = ed.atos.find((a) => a.id === atoVisto)?.pagina ?? null;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onVoltar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/40"
        >
          <ArrowLeft className="h-4 w-4" /> Fila
        </button>
        <span className="rounded bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">
          {ed.fonte}
        </span>
        <h1 className="text-base font-semibold text-foreground">
          Edição {rotuloEdicao(ed.edicao, ed.numero_suplemento)}
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground">{ed.data_publicacao}</span>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
          {ed.julgados}/{ed.total} julgados
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ESQUERDA — o diário oficial, fonte da verdade */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              diário oficial — fonte
              {paginaVista && <span className="ml-2 text-foreground">· página {paginaVista}</span>}
            </span>
            <a
              href={paginaVista ? `${pdfUrl}#page=${paginaVista}` : pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> abrir em nova aba
            </a>
          </div>
          <VisorDiario
            edicaoId={ed.id}
            pagina={paginaVista ?? '1'}
            atoId={atoVisto}
          />
        </div>

        {/* DIREITA — os atos extraídos, para validar contra o diário */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              atos extraídos — valide contra o diário
            </span>
          </div>
          <div className="rounded-lg border border-accent/40 bg-accent/5 p-2.5 text-[12px] leading-snug text-muted-foreground">
            Confira cada ato no PDF ao lado: número, tipo e ano batem? <b className="text-foreground">✓</b>.
            É falso positivo? <b className="text-foreground">✗</b>. E se houver um ato no diário que
            <b className="text-foreground"> não está</b> nesta lista, me avise — é falso negativo.
          </div>

          {ed.atos.map((a) => (
            <AtoParaJulgar
              key={a.id}
              a={a}
              selecionado={a.id === atoVisto}
              aoVer={() => setAtoVisto(a.id)}
              onJulgar={onJulgar}
            />
          ))}

          <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/95 p-3 backdrop-blur">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-[12.5px] text-muted-foreground">
              Validada quando os {ed.total} atos forem julgados.
            </span>
            <button
              onClick={() => onConcluir(ed)}
              disabled={ed.julgados < ed.total}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="h-4 w-4" /> Concluir validação
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TelaRevisao() {
  const { dados, carregando, erro, recarregar } = useApi<EdicaoRevisao[]>('/api/revisao');
  const [aberta, setAberta] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');

  const julgar = async (atoId: string, decisao: 'ok' | 'descartado') => {
    await postar('/api/revisao/julgar', { atoId, decisao });
    recarregar();
  };

  async function concluir(ed: EdicaoRevisao) {
    const r = await postar<{ ok: boolean; motivo?: string; mantidos?: number; descartados?: number }>(
      '/api/revisao/concluir', { edicaoId: ed.id },
    );
    setAviso(r.ok
      ? `Edição ${ed.edicao} validada: ${r.mantidos} ato(s) confirmados, ${r.descartados} descartado(s).`
      : `Ainda não: ${r.motivo}`);
    if (r.ok) setAberta(null);   // some da fila; volta para a lista
    recarregar();
  }

  if (carregando) return <Carregando />;
  if (erro) return <Erro mensagem={erro} />;

  const pendentes = dados ?? [];
  const edSel = pendentes.find((e) => e.id === aberta) ?? null;

  // MODO REVISÃO — lado a lado
  if (edSel) {
    return (
      <RevisaoLadoALado ed={edSel} onVoltar={() => setAberta(null)} onJulgar={julgar} onConcluir={concluir} />
    );
  }

  // MODO LISTA
  return (
    <div>
      <Cabecalho
        titulo="Fila de Revisão"
        sub="A extração propõe; a pessoa decide. Abra uma edição para validar cada ato com o diário oficial ao lado."
      />

      {aviso && (
        <div className="surface-card mb-4 p-4 text-[13px] text-foreground">{aviso}</div>
      )}

      {pendentes.length === 0 && (
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma edição pendente de validação.
        </div>
      )}

      <div className="space-y-3">
        {pendentes.map((ed) => (
          <button
            key={ed.id}
            onClick={() => setAberta(ed.id)}
            className="surface-card flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
          >
            <span className="rounded bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">
              {ed.fonte}
            </span>
            <span className="text-sm font-semibold text-foreground">
              Edição {rotuloEdicao(ed.edicao, ed.numero_suplemento)}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">{ed.data_publicacao}</span>
            <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
              {ed.julgados}/{ed.total} julgados
            </span>
            <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
          </button>
        ))}
      </div>

      <button
        onClick={recarregar}
        className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Atualizar
      </button>
    </div>
  );
}
