import { useCallback, useEffect, useState } from 'react';
import {
  Download, Loader2, RefreshCw, Search, Check, X, FileText, AlertTriangle,
} from 'lucide-react';

// ============================================================================
// Telas do DiárioMonitor — camada de APRESENTAÇÃO (PRD §7.2.3)
//
// Nenhuma query, nenhuma regra de negócio: tudo vem de /api/*, que em produção
// vira Edge Function. Estilo token-only (bg-primary, text-muted-foreground) —
// o componente nunca sabe o hue; o tema entra pela classe no <html>.
// ============================================================================

/** Leitura de API sem biblioteca: useState + AbortController + gatilho de recarga. */
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

// ---------------------------------------------------------------------------
// 1. FONTES — onde a captura é disparada
// ---------------------------------------------------------------------------
type Fonte = {
  sigla: string; nome: string; parser_key: string; modo: string;
  esfera: string; uf: string;
  operacional: boolean; bloqueio?: string;
  edicoes_ingeridas: number; atos_extraidos: number;
  ultima_edicao: string | null; validadas: number;
};

type Ingestao = {
  fonte: string; encontradas: number; baixadas: number; jaExistiam: number;
  atosExtraidos?: number;
  edicoes: { id: string; status: string; data: string; bytes?: number; hash?: string }[];
};

export function TelaFontes() {
  const { dados, carregando, erro, recarregar } = useApi<Fonte[]>('/api/fontes');
  const [rodando, setRodando] = useState<string | null>(null);
  const [saida, setSaida] = useState<Record<string, Ingestao | string>>({});

  async function executar(f: Fonte) {
    setRodando(f.parser_key);
    setSaida((s) => { const { [f.sigla]: _, ...resto } = s; return resto; });
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
                    {f.parser_key} · {f.modo} · {f.esfera}/{f.uf}
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

              {typeof r === 'string' && (
                <p className="mt-3 text-[13px] text-destructive">{r}</p>
              )}
              {r && typeof r !== 'string' && (
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-[13px] text-foreground">
                    <b className="tabular-nums">{r.baixadas}</b> nova(s) ·{' '}
                    <b className="tabular-nums">{r.jaExistiam}</b> já ingerida(s) de{' '}
                    <b className="tabular-nums">{r.encontradas}</b> encontrada(s)
                    {typeof r.atosExtraidos === 'number' && <> · <b className="tabular-nums">{r.atosExtraidos}</b> ato(s) extraído(s)</>}
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {r.edicoes.map((e) => (
                      <li key={e.id} className="font-mono text-[11px] text-muted-foreground">
                        {e.status === 'baixada' ? '↓' : '·'} {e.id} — {e.data}
                        {e.bytes && ` · ${Math.round(e.bytes / 1024)} KB`}
                        {e.hash && ` · sha256:${e.hash}`}
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
// 2. PUBLICAÇÕES — o resultado da captura
// ---------------------------------------------------------------------------
type Ato = {
  id: string; fonte: string; edicao: string; data_publicacao: string; arquivo: string;
  tipo: string; numero: string; ano: number; data_ato: string | null;
  orgao_emissor?: string;
  ementa: string | null; trecho_original: string | null;
  status?: string; julgamento?: string | null;
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
      <Cabecalho titulo="Publicações" sub="Atos normativos extraídos das edições já capturadas." />

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
// 3. FILA DE REVISÃO — a validação acontece aqui dentro, não em planilha
// ---------------------------------------------------------------------------
type EdicaoRevisao = {
  fonte: string; edicao: string; data_publicacao: string; arquivo: string;
  total: number; julgados: number;
  atos: (Ato & { indice: number; confianca_heuristica?: string })[];
};

export function TelaRevisao() {
  const { dados, carregando, erro, recarregar } = useApi<EdicaoRevisao[]>('/api/revisao');
  const [aberta, setAberta] = useState<string | null>(null);
  const [quem, setQuem] = useState('');
  const [aviso, setAviso] = useState('');

  const julgar = async (ed: EdicaoRevisao, indice: number, decisao: 'ok' | 'descartado') => {
    await postar('/api/revisao/julgar', { arquivo: ed.arquivo, indice, decisao });
    recarregar();
  };

  async function concluir(ed: EdicaoRevisao) {
    if (!quem.trim()) { setAviso('Informe seu nome — o gabarito precisa de autoria.'); return; }
    const r = await postar<{ ok: boolean; motivo?: string; mantidos?: number; descartados?: number }>(
      '/api/revisao/concluir', { arquivo: ed.arquivo, validadoPor: quem.trim() },
    );
    setAviso(r.ok
      ? `Edição ${ed.edicao} validada: ${r.mantidos} ato(s) confirmados, ${r.descartados} descartado(s).`
      : `Ainda não: ${r.motivo}`);
    recarregar();
  }

  if (carregando) return <Carregando />;
  if (erro) return <Erro mensagem={erro} />;

  const pendentes = dados ?? [];

  return (
    <div>
      <Cabecalho
        titulo="Fila de Revisão"
        sub="A extração propõe; a pessoa decide. Nenhum ato entra no acervo ou no boletim sem passar por aqui."
      />

      <div className="surface-card mb-4 flex flex-wrap items-center gap-3 p-4">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Validado por
        </label>
        <input
          value={quem}
          onChange={(e) => setQuem(e.target.value)}
          placeholder="seu nome"
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
        {aviso && <span className="text-[13px] text-foreground">{aviso}</span>}
      </div>

      {pendentes.length === 0 && (
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma edição pendente de validação.
        </div>
      )}

      <div className="space-y-3">
        {pendentes.map((ed) => {
          const aberto = aberta === ed.arquivo;
          return (
            <div key={ed.arquivo} className="surface-card overflow-hidden">
              <button
                onClick={() => setAberta(aberto ? null : ed.arquivo)}
                className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-muted/40"
              >
                <span className="rounded bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">
                  {ed.fonte}
                </span>
                <span className="text-sm font-semibold text-foreground">Edição {ed.edicao}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{ed.data_publicacao}</span>
                <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
                  {ed.julgados}/{ed.total} julgados
                </span>
              </button>

              {aberto && (
                <div className="divide-y divide-border border-t border-border">
                  {ed.atos.map((a) => (
                    <div
                      key={a.id}
                      className={
                        a.julgamento === 'ok' ? 'bg-primary/5 p-4'
                        : a.julgamento === 'descartado' ? 'bg-destructive/5 p-4 opacity-60'
                        : 'p-4'
                      }
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-foreground">
                            {a.tipo} n. {a.numero}/{a.ano}
                            {a.confianca_heuristica === 'baixa' && (
                              <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-destructive">
                                confiança baixa
                              </span>
                            )}
                          </div>
                          <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border-l-2 border-primary bg-muted/40 p-3 text-[13px] leading-relaxed text-foreground">
                            <div className="mb-1 font-mono text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground">
                              texto no diário oficial
                            </div>
                            {a.trecho_original ?? a.ementa ?? '(sem texto capturado — verificar parser)'}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            title="Confere com o texto publicado"
                            onClick={() => julgar(ed, a.indice, 'ok')}
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                              a.julgamento === 'ok'
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border hover:border-primary'}`}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            title="Falso positivo — não é um ato publicado hoje"
                            onClick={() => julgar(ed, a.indice, 'descartado')}
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
                  ))}

                  <div className="flex flex-wrap items-center gap-3 bg-muted/30 p-4">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-[13px] text-muted-foreground">
                      A edição só é validada quando os {ed.total} atos forem julgados.
                    </span>
                    <button
                      onClick={() => concluir(ed)}
                      disabled={ed.julgados < ed.total}
                      className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" /> Concluir validação
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
