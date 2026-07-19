import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Video, Upload, Loader2, Sparkles, CheckCircle2, AlertTriangle, Phone, PhoneOff,
  RotateCcw, Film, Wand2,
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

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Video className="h-6 w-6 text-primary" /> Importação por vídeo
        </h1>
        <p className="text-muted-foreground mt-1">
          Suba uma <b>gravação de tela</b> rolando o Instagram (perfis, seguidores, comentários). A IA assiste o vídeo,
          extrai os <b>@perfis</b> que aparecem, remove duplicados da sua base e enriquece cada um no Apify.
          O resultado cai em duas buscas do dia: <b>c/ WhatsApp</b> e <b>sem WhatsApp</b>.
        </p>
      </div>

      {!productId && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Selecione um produto</AlertTitle>
          <AlertDescription>Escolha o produto no seletor da plataforma para importar leads.</AlertDescription>
        </Alert>
      )}

      {/* Passo 1 — escolher vídeo */}
      <div className="rounded-lg border border-border p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Film className="h-4 w-4 text-primary" /> 1. Escolha o vídeo
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setPhase('idle');
            setResult(null);
            setErrorMsg(null);
          }}
          disabled={busy || !productId}
        />

        {!file ? (
          <Button variant="outline" className="gap-2" onClick={() => inputRef.current?.click()} disabled={!productId}>
            <Upload className="h-4 w-4" /> Selecionar vídeo (.mp4, .mov…)
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="outline" className="gap-1 bg-muted text-foreground border-border">
              <Film className="h-3 w-3" /> {file.name}
            </Badge>
            <span className="text-muted-foreground">{fmtMB(file.size)}</span>
            {!busy && phase !== 'enriching' && (
              <Button variant="ghost" size="sm" onClick={reset}>Trocar</Button>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Amostragem: 1 quadro a cada <b className="text-foreground">{intervalSec}s</b></span>
            <span>mais denso = pega mais perfis no scroll · menos denso = mais barato</span>
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

      {/* Progresso: upload do vídeo (path nativo) */}
      {phase === 'uploading' && (
        <div className="rounded-lg border border-border p-4 flex items-center gap-2 text-sm text-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Enviando o vídeo para a IA assistir por completo…
        </div>
      )}

      {/* Progresso: extração de quadros */}
      {phase === 'extracting' && (
        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Lendo quadros do vídeo… {frameProgress.done}/{frameProgress.total}
          </div>
          <Progress value={framePct} />
        </div>
      )}

      {/* Progresso: enviando à IA */}
      {phase === 'sending' && (
        <div className="rounded-lg border border-border p-4 flex items-center gap-2 text-sm text-foreground">
          <Sparkles className="h-4 w-4 animate-pulse text-primary" /> A IA está assistindo o vídeo e identificando os @perfis…
        </div>
      )}

      {/* Erro */}
      {phase === 'error' && errorMsg && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não deu certo</AlertTitle>
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {/* Resultado da extração + enriquecimento */}
      {result && (phase === 'enriching' || phase === 'done') && (
        <div className="rounded-lg border border-border p-5 space-y-4">
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
  );
}

export default ProspeccaoVideoImport;
