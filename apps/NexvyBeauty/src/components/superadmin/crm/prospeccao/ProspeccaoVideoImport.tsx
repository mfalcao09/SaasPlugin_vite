import { useEffect, useRef, useState, type ReactNode, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Video, Upload, Loader2, Sparkles, CheckCircle2, AlertTriangle, Phone, PhoneOff,
  RotateCcw, Wand2, Film, Copy, Zap, Info, FileVideo,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import {
  extractVideoFrames,
  uploadVideoToStorage,
  useImportVideo,
  useVideoEnrichmentStatus,
  NATIVE_MAX_BYTES,
  MAX_VIDEO_FRAMES,
  type VideoImportResult,
} from './useVideoImport';

type Phase = 'idle' | 'uploading' | 'extracting' | 'sending' | 'enriching' | 'done' | 'error';

const fmtMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const NATIVE_MB = Math.round(NATIVE_MAX_BYTES / 1024 / 1024);

/** Cabeçalho de passo numerado (bolinha + título + dica). */
function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

/** Item do pipeline "Como funciona" (ícone + título + descrição). */
function PipeStep({ n, icon, title, desc }: { n: number; icon: ReactNode; title: string; desc: string }) {
  return (
    <li className="flex gap-3">
      <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">{icon}</span>
      <div className="text-sm">
        <div className="font-medium text-foreground">{n}. {title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </li>
  );
}

/**
 * IMPORTAÇÃO POR VÍDEO (Prospecção Ativa).
 *
 * Fluxo: escolhe um vídeo (gravação de tela rolando o Instagram) → o navegador
 * amostra quadros → a edge `leads-import-video` manda os quadros ao Gemini (visão),
 * extrai os @handles, deduplica globalmente e dispara o Apify → os leads caem em 2
 * buscas do dia: "c/ wpp" e "s/ wpp". Progresso: extraindo → enviando → enriquecendo
 * → contagens.
 */
export function ProspeccaoVideoImport() {
  const { effectiveProductId } = useActivePlatformProduct();
  const productId = effectiveProductId ?? null;
  const qc = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [intervalSec, setIntervalSec] = useState(0.75);
  const [phase, setPhase] = useState<Phase>('idle');
  const [frameProgress, setFrameProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<VideoImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const importVideo = useImportVideo();

  const cwppId = result?.extraction_id ?? null;
  const swppId = result?.swpp_extraction_id ?? null;
  const enrichEnabled = phase === 'enriching' || phase === 'done';
  const { data: status } = useVideoEnrichmentStatus(cwppId, swppId, enrichEnabled);

  const enrichmentDone = status?.cwpp?.status === 'done';
  const enrichmentError = status?.cwpp?.status === 'error';
  const comWpp = status?.cwpp?.total_found ?? null;
  const semWpp = status?.swpp?.total_found ?? null;

  const busy = phase === 'uploading' || phase === 'extracting' || phase === 'sending';

  // Fecha o fluxo quando o enriquecimento termina.
  useEffect(() => {
    if (phase === 'enriching' && (enrichmentDone || enrichmentError)) {
      setPhase('done');
      qc.invalidateQueries({ queryKey: ['platform-lead-extractions', productId] });
      qc.invalidateQueries({ queryKey: ['platform-consolidated-leads'] });
    }
  }, [phase, enrichmentDone, enrichmentError, productId, qc]);

  const reset = () => {
    setFile(null);
    setPhase('idle');
    setFrameProgress({ done: 0, total: 0 });
    setResult(null);
    setErrorMsg(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const acceptFile = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setPhase('idle');
    setResult(null);
    setErrorMsg(null);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!busy && productId) setDragActive(true);
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (busy || !productId) return;
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('video/')) acceptFile(f);
    else if (f) setErrorMsg('Arquivo ignorado: envie um vídeo (.mp4, .mov, .webm…).');
  };

  const run = async () => {
    if (!file || !productId) return;
    setErrorMsg(null);
    setResult(null);
    try {
      let res: VideoImportResult | null = null;

      // 1) PATH NATIVO — sobe o vídeo inteiro (Gemini Files API) se couber no limite.
      //    Elimina o buraco de amostragem dos frames (assiste o vídeo todo).
      if (file.size <= NATIVE_MAX_BYTES) {
        try {
          setPhase('uploading');
          const videoPath = await uploadVideoToStorage(file, productId);
          setPhase('sending');
          const r = await importVideo.mutateAsync({ product_id: productId, video_path: videoPath });
          if (r?.fallback === 'frames') res = null; // nativo pediu p/ cair pra frames
          else res = r;
        } catch {
          res = null; // qualquer falha no nativo → tenta frames
        }
      }

      // 2) FALLBACK / vídeo grande → FRAMES (amostragem no navegador).
      if (!res) {
        setPhase('extracting');
        setFrameProgress({ done: 0, total: 0 });
        const { frames } = await extractVideoFrames(
          file,
          { intervalSec, maxFrames: MAX_VIDEO_FRAMES, maxWidth: 640, quality: 0.6 },
          (done, total) => setFrameProgress({ done, total }),
        );
        if (frames.length === 0) throw new Error('Não consegui extrair quadros legíveis do vídeo.');
        setPhase('sending');
        res = await importVideo.mutateAsync({ product_id: productId, frames });
      }

      setResult(res);
      if (!res.net_new || res.net_new === 0) {
        setPhase('done');
      } else {
        setPhase('enriching');
        qc.invalidateQueries({ queryKey: ['platform-lead-extractions', productId] });
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Falha inesperada');
      setPhase('error');
    }
  };

  const framePct = frameProgress.total > 0 ? Math.round((frameProgress.done / frameProgress.total) * 100) : 0;
  const nativo = file ? file.size <= NATIVE_MAX_BYTES : true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Video className="h-6 w-6 text-primary" /> Importação por vídeo
        </h1>
        <p className="text-muted-foreground mt-1">
          Suba uma <b>gravação de tela</b> rolando o Instagram (perfis, seguidores, comentários). A IA assiste o vídeo,
          extrai os <b>@perfis</b> que aparecem, remove duplicados da sua base e enriquece cada um no Apify.
        </p>
      </div>

      {!productId && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Selecione um produto</AlertTitle>
          <AlertDescription>Escolha o produto no seletor da plataforma para importar leads.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── COLUNA DE TRABALHO ─────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Passo 1 — dropzone */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <StepHeader n={1} title="Escolha o vídeo" hint="gravação de tela rolando o Instagram" />

            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
              disabled={busy || !productId}
            />

            {!file ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                disabled={!productId}
                className={`w-full rounded-xl border-2 border-dashed p-8 flex flex-col items-center justify-center gap-2 text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div className="text-sm font-medium text-foreground">
                  Arraste o vídeo aqui ou <span className="text-primary">clique para escolher</span>
                </div>
                <div className="text-xs text-muted-foreground">.mp4, .mov, .webm — gravação da tela rolando o feed/seguidores</div>
              </button>
            ) : (
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`rounded-xl border p-4 flex items-center gap-3 transition-colors ${
                  dragActive ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileVideo className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">{file.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtMB(file.size)} · {nativo ? 'a IA assiste o vídeo completo' : `acima de ${NATIVE_MB}MB → amostragem por quadros`}
                  </div>
                </div>
                {!busy && phase !== 'enriching' && (
                  <Button variant="ghost" size="sm" onClick={reset} className="gap-1 shrink-0">
                    <RotateCcw className="h-3.5 w-3.5" /> Trocar
                  </Button>
                )}
              </div>
            )}

            {/* Amostragem (quadros) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Amostragem: <b className="text-foreground">1 quadro a cada {intervalSec}s</b>
                  {file && nativo ? ' · usada só se cair pra quadros' : ''}
                </span>
                <span className="text-muted-foreground">mais denso = + perfis · menos denso = + barato</span>
              </div>
              <Slider
                value={[intervalSec]}
                min={0.25}
                max={3}
                step={0.25}
                onValueChange={(v) => setIntervalSec(v[0])}
                disabled={busy || phase === 'enriching'}
              />
            </div>
          </div>

          {/* Passo 2 — extrair */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <StepHeader n={2} title="Extrair e enriquecer" hint="IA lê os @perfis → Apify busca o telefone" />

            <div className="flex items-center gap-3">
              <Button className="gap-2" onClick={run} disabled={!file || !productId || busy || phase === 'enriching'}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {phase === 'uploading' ? 'Enviando vídeo…' : phase === 'extracting' ? 'Extraindo quadros…' : phase === 'sending' ? 'Analisando com IA…' : 'Extrair @perfis do vídeo'}
              </Button>
              {(phase === 'done' || phase === 'error') && (
                <Button variant="outline" className="gap-1" onClick={reset}>
                  <RotateCcw className="h-4 w-4" /> Nova importação
                </Button>
              )}
            </div>

            {phase === 'uploading' && (
              <div className="rounded-md border border-border bg-muted/30 p-3 flex items-center gap-2 text-sm text-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Enviando o vídeo para a IA assistir por completo…
              </div>
            )}
            {phase === 'extracting' && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Lendo quadros do vídeo… {frameProgress.done}/{frameProgress.total}
                </div>
                <Progress value={framePct} />
              </div>
            )}
            {phase === 'sending' && (
              <div className="rounded-md border border-border bg-muted/30 p-3 flex items-center gap-2 text-sm text-foreground">
                <Sparkles className="h-4 w-4 animate-pulse text-primary" /> A IA está assistindo o vídeo e identificando os @perfis…
              </div>
            )}
            {phase === 'error' && errorMsg && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Não deu certo</AlertTitle>
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}
            {phase === 'idle' && !busy && !result && (
              <p className="text-xs text-muted-foreground">Nada é enviado até você clicar. O vídeo é processado e descartado — guardamos só os @perfis.</p>
            )}
          </div>

          {/* Resultado da extração + enriquecimento */}
          {result && (phase === 'enriching' || phase === 'done') && (
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Perfis extraídos do vídeo
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="bg-muted text-foreground border-border">
                  {result.handles_extracted} @perfis lidos · {result.mode === 'video' ? 'vídeo completo' : `${result.frames} quadros`}
                </Badge>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  {result.net_new} novos enviados
                </Badge>
                {result.duplicates > 0 && (
                  <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                    {result.duplicates} já na base (ignorados)
                  </Badge>
                )}
                {!!result.overflow && result.overflow > 0 && (
                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                    +{result.overflow} além do limite de 200 — divida o vídeo
                  </Badge>
                )}
              </div>

              {result.message && (
                <Alert>
                  <AlertTitle>Aviso</AlertTitle>
                  <AlertDescription>{result.message}</AlertDescription>
                </Alert>
              )}

              {result.net_new > 0 && (
                <>
                  {!enrichmentDone && !enrichmentError && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      O Apify está detalhando os {result.net_new} perfis (telefone, categoria, seguidores)… ~1-2 min.
                    </div>
                  )}

                  {enrichmentError && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Enriquecimento falhou</AlertTitle>
                      <AlertDescription>Veja o status na aba <b>Buscas</b> (a busca do dia ficou com erro).</AlertDescription>
                    </Alert>
                  )}

                  {enrichmentDone && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3">
                        <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                          <Phone className="h-4 w-4" /> Com WhatsApp
                        </div>
                        <div className="text-2xl font-bold text-foreground tabular-nums mt-1">{comWpp ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">Extração vídeo {result.day} - c/ wpp</div>
                      </div>
                      <div className="rounded-md border border-border bg-muted/30 p-3">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                          <PhoneOff className="h-4 w-4" /> Sem WhatsApp
                        </div>
                        <div className="text-2xl font-bold text-foreground tabular-nums mt-1">{semWpp ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">Extração vídeo {result.day} - s/ wpp</div>
                      </div>
                    </div>
                  )}

                  {enrichmentDone && (
                    <p className="text-xs text-muted-foreground">
                      Os leads já estão nas <b>Buscas</b> do dia e na <b>Base consolidada</b> (deduplicados por @handle).
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── COLUNA LATERAL: como funciona + dicas ──────────────────────── */}
        <aside className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Info className="h-4 w-4 text-primary" /> Como funciona
            </h3>
            <ol className="space-y-3">
              <PipeStep n={1} icon={<Film className="h-4 w-4" />} title="Você grava a tela" desc="rolando o Instagram (feed, seguidores, comentários)" />
              <PipeStep n={2} icon={<Sparkles className="h-4 w-4" />} title="A IA lê os @perfis" desc="assiste o vídeo e extrai todos os @handles que aparecem" />
              <PipeStep n={3} icon={<Copy className="h-4 w-4" />} title="Remove duplicados" desc="dedup global contra toda a sua base" />
              <PipeStep n={4} icon={<Zap className="h-4 w-4" />} title="Apify enriquece" desc="telefone, seguidores, categoria — cai em 2 buscas: c/ e sem WhatsApp" />
            </ol>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1.5 text-xs text-muted-foreground">
            <div className="font-medium text-foreground mb-0.5">Dicas</div>
            <p>• Até <b>{NATIVE_MB}MB</b>: a IA assiste o <b>vídeo completo</b> (mais preciso). Acima, cai pra amostragem por quadros.</p>
            <p>• Teto de <b>200 @perfis</b> por vídeo — se passar, divida em partes.</p>
            <p>• O enriquecimento usa a conta <b>Apify</b> do projeto (~US$0,0026/perfil).</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default ProspeccaoVideoImport;
