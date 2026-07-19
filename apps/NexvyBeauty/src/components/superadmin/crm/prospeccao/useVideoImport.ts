import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Extração de quadros do vídeo NO NAVEGADOR (client-side).
 *
 * Por quê no client: o gateway de IA do app (OpenRouter) NÃO aceita vídeo — só
 * imagem (visão). Em vez de subir o vídeo cru (pesado) e falhar, amostramos N
 * quadros (JPEG reduzido) e mandamos como imagens ao Gemini pela edge. Um
 * <video> + <canvas> lê os frames sem nenhuma dependência externa.
 */
export interface FrameExtractOpts {
  intervalSec?: number; // 1 quadro a cada N segundos
  maxFrames?: number;   // teto de quadros (custo/tempo)
  maxWidth?: number;    // reduz cada quadro (largura máx.)
  quality?: number;     // qualidade JPEG (0..1)
}

/**
 * Teto de quadros (fonte-única, alinhado ao MAX_FRAMES da edge). NÃO é o antigo cap de
 * 60 quadros: é uma proteção de tempo-de-execução da edge + tamanho do POST. Com amostragem
 * densa (~2–4 fps) 300 quadros cobrem minutos de scroll; vídeos ainda mais longos se dividem.
 */
export const MAX_VIDEO_FRAMES = 300;

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('Falha ao posicionar o vídeo.')); };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    try { video.currentTime = t; } catch (e) { cleanup(); reject(e as Error); }
  });
}

export async function extractVideoFrames(
  file: File,
  opts: FrameExtractOpts = {},
  onProgress?: (done: number, total: number) => void,
): Promise<{ frames: string[]; durationSec: number }> {
  const { intervalSec = 0.75, maxFrames = MAX_VIDEO_FRAMES, maxWidth = 640, quality = 0.6 } = opts;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Não consegui ler o vídeo (formato não suportado pelo navegador).'));
    });

    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) throw new Error('Vídeo sem duração legível.');

    const times: number[] = [];
    for (let t = 0; t < duration && times.length < maxFrames; t += intervalSec) {
      times.push(Math.min(t, Math.max(0, duration - 0.05)));
    }
    if (times.length === 0) times.push(0);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível neste navegador.');

    const frames: string[] = [];
    for (let i = 0; i < times.length; i++) {
      await seekTo(video, times[i]);
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) { onProgress?.(i + 1, times.length); continue; }
      const scale = Math.min(1, maxWidth / vw);
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
      if (b64) frames.push(b64);
      onProgress?.(i + 1, times.length);
    }
    return { frames, durationSec: duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Edge invoke ──────────────────────────────────────────────────────────────

export interface VideoImportResult {
  ok: boolean;
  day: string;
  mode?: 'video' | 'frames';    // 'video' = path nativo (Files API); 'frames' = quadros
  fallback?: 'frames';          // nativo pediu p/ o front reprocessar via quadros
  extraction_id?: string;       // busca "c/ wpp" (dona do run) — usar p/ polling
  swpp_extraction_id?: string;  // busca "s/ wpp"
  run_id?: string;
  frames: number;
  gemini_calls: number;
  handles_extracted: number;
  net_new: number;
  duplicates: number;
  overflow?: number;
  message?: string;
}

/** Até este tamanho o front tenta o path NATIVO (vídeo inteiro); acima, vai direto p/ frames. */
export const NATIVE_MAX_BYTES = 45 * 1024 * 1024;

/** Sobe o vídeo pro bucket privado 'prospeccao-video' e devolve o path (a edge lê e apaga). */
export async function uploadVideoToStorage(file: File, productId: string): Promise<string> {
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const path = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from('prospeccao-video')
    .upload(path, file, { contentType: file.type || 'video/mp4', upsert: false });
  if (error) throw new Error(`upload do vídeo falhou: ${error.message}`);
  return path;
}

async function invokeError(error: unknown): Promise<string> {
  const e = error as { message?: string; context?: { json?: () => Promise<{ error?: string }> } };
  try {
    const body = await e?.context?.json?.();
    if (body?.error) return body.error;
  } catch { /* mantém message */ }
  return e?.message ?? 'Falha ao importar o vídeo';
}

export function useImportVideo() {
  return useMutation({
    mutationFn: async (
      args: { product_id: string; frames?: string[]; video_path?: string; model?: string },
    ): Promise<VideoImportResult> => {
      const { data, error } = await supabase.functions.invoke('leads-import-video', { body: args });
      if (error) throw new Error(await invokeError(error));
      // fallback:'frames' NÃO é erro — o componente decide reprocessar via quadros.
      if ((data as any)?.error && (data as any)?.fallback !== 'frames') throw new Error((data as any).error);
      return data as VideoImportResult;
    },
  });
}

// ── Polling do enriquecimento (as 2 buscas do dia) ───────────────────────────

export interface ExtractionStatus { id: string; status: string; total_found: number | null }

export function useVideoEnrichmentStatus(cwppId: string | null, swppId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['video-enrichment-status', cwppId, swppId],
    enabled: enabled && !!cwppId,
    refetchInterval: (query) => {
      const d = query.state.data as { cwpp?: ExtractionStatus | null } | undefined;
      const s = d?.cwpp?.status;
      return s === 'done' || s === 'error' ? false : 4000;
    },
    queryFn: async () => {
      const ids = [cwppId, swppId].filter(Boolean) as string[];
      const { data } = await supabase
        .from('platform_crm_lead_extractions')
        .select('id, status, total_found')
        .in('id', ids);
      const rows = (data ?? []) as ExtractionStatus[];
      return {
        cwpp: rows.find((r) => r.id === cwppId) ?? null,
        swpp: rows.find((r) => r.id === swppId) ?? null,
      };
    },
  });
}
