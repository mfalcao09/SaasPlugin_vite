import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  PlatformCrmMediaKind as MediaKind,
  PlatformCrmMediaPayload as MediaPayload,
} from '../inbox/PlatformCrmMediaAttachment';
import type { PlatformCrmSendMediaPayload } from './usePlatformCrmConversations';

/**
 * Upload de mídia do composer da inbox de PLATAFORMA — porte A1.2 de
 * `src/hooks/useMediaUpload.ts` (Vendus v5 original), adaptado ao CONTRATO:
 *
 *   bucket `platform-crm-media` · path `conv/<conversationId>/<epoch>-<slug>`
 *   via `supabase.storage.from('platform-crm-media').upload(path, file)`.
 *
 * Diferenças vs v5 (adaptação b/d):
 * - sem organization_id/userId no path (plataforma é single-org, RLS super_admin);
 * - upload via storage SDK (contrato) em vez de XHR com progresso fino — o
 *   onProgress recebe marcos (1% início → 100% fim) para a MediaPreviewBar;
 * - TODO(A1.2-backend): transcode client-side de vídeo (.mov→.mp4 H.264) e
 *   áudio (webm/opus→m4a) do v5 depende de `@ffmpeg/ffmpeg`+`@ffmpeg/util`
 *   (não instalados neste app). Enquanto isso o arquivo original sobe intacto
 *   e a conversão pode acontecer no edge de entrega.
 */
const BUCKET = 'platform-crm-media' as const;
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — alinhado ao limite prático do WhatsApp
const IMAGE_COMPRESS_THRESHOLD = 1.5 * 1024 * 1024; // 1.5 MB
const IMAGE_MAX_DIMENSION = 1920;
const IMAGE_JPEG_QUALITY = 0.82;

export interface UploadResult {
  /** Shape de exibição (MediaAttachment/extractMedia). */
  media: MediaPayload;
  /** Shape do CONTRATO A1.2 para o body do send (edge platform-webchat-inbox). */
  payload: PlatformCrmSendMediaPayload;
  path: string;
}

export interface UsePlatformCrmMediaUploadReturn {
  upload: (file: File, opts?: { kind?: MediaKind; durationMs?: number }) => Promise<UploadResult>;
  uploadOne: (
    file: File,
    opts?: { kind?: MediaKind; durationMs?: number; onProgress?: (pct: number) => void },
  ) => Promise<UploadResult>;
  isUploading: boolean;
  progress: number;
  error: string | null;
  reset: () => void;
}

/**
 * Pré-aquece o conversor de vídeo. TODO(A1.2-backend): no-op até as deps
 * `@ffmpeg/*` entrarem no app (v5: `prefetchVideoTranscoder` de
 * `src/lib/videoTranscode.ts`). Mantido para paridade de chamada no ChatInput.
 */
export function prefetchVideoTranscoder(): Promise<void> {
  return Promise.resolve();
}

function inferKind(file: File, hint?: MediaKind): MediaKind {
  if (hint) return hint;
  const m = file.type;
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return 'document';
}

function safeFilename(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
}

async function probeImage(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function probeMediaDuration(file: File, isVideo: boolean): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(isVideo ? 'video' : 'audio') as HTMLMediaElement;
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const ms = isFinite(el.duration) ? Math.round(el.duration * 1000) : null;
      resolve(ms);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    el.src = url;
  });
}

/**
 * Comprime imagens grandes via canvas. PNG/GIF/WebP transparentes mantêm
 * o tipo original (best effort); JPEG sempre re-encoda em JPEG.
 * Retorna o arquivo original se a compressão falhar ou aumentar o tamanho.
 * (Cópia 1:1 do v5.)
 */
async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file; // preserva animação
  if (file.size <= IMAGE_COMPRESS_THRESHOLD) return file;

  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;

    const { width, height } = bitmap;
    const maxSide = Math.max(width, height);
    const scale = maxSide > IMAGE_MAX_DIMENSION ? IMAGE_MAX_DIMENSION / maxSide : 1;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', IMAGE_JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Slug curto do nome do arquivo para compor o path do contrato. */
function fileSlug(file: File, kind: MediaKind): string {
  const ext = file.name.includes('.')
    ? file.name.split('.').pop()
    : kind === 'audio'
      ? 'webm'
      : 'bin';
  const baseName = safeFilename(file.name.replace(/\.[^.]+$/, '')) || kind;
  return `${Math.random().toString(36).slice(2, 8)}-${baseName}.${ext}`;
}

export function usePlatformCrmMediaUpload(
  conversationId: string | null | undefined,
): UsePlatformCrmMediaUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  const uploadOne = useCallback<UsePlatformCrmMediaUploadReturn['uploadOne']>(
    async (file, opts) => {
      if (!file) throw new Error('Arquivo inválido');
      if (!conversationId) throw new Error('Conversa inválida para upload.');

      const kind0 = inferKind(file, opts?.kind);
      // 'sticker' compartilha o pipeline de imagem; o contrato só transporta 4 kinds.
      const contractKind: PlatformCrmSendMediaPayload['kind'] =
        kind0 === 'sticker' ? 'image' : kind0;

      // Compressão client-side para imagens grandes (paridade v5).
      let finalFile: File = file;
      if (contractKind === 'image') {
        finalFile = await compressImageIfNeeded(file);
      }
      // TODO(A1.2-backend): vídeo .mov→.mp4 (ensureWhatsAppCompatibleVideo) e
      // áudio webm→m4a (ensureUniversalAudio) — pendem deps @ffmpeg no app.

      if (finalFile.size > MAX_BYTES) {
        throw new Error(
          `Arquivo muito grande após preparo (máx ${Math.round(MAX_BYTES / 1024 / 1024)}MB).`,
        );
      }

      // CONTRATO A1.2: path conv/<conversationId>/<epoch>-<slug>.
      const path = `conv/${conversationId}/${Date.now()}-${fileSlug(finalFile, kind0)}`;

      opts?.onProgress?.(1);
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, finalFile, {
          contentType: finalFile.type || 'application/octet-stream',
          cacheControl: '3600',
          upsert: false,
        });
      if (upErr) throw new Error(upErr.message || 'Upload falhou');
      opts?.onProgress?.(90);

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = pub.publicUrl;

      let width: number | null = null;
      let height: number | null = null;
      let durationMs: number | null = opts?.durationMs ?? null;

      if (contractKind === 'image') {
        const dim = await probeImage(finalFile);
        if (dim) {
          width = dim.width;
          height = dim.height;
        }
      } else if (contractKind === 'audio' && durationMs == null) {
        durationMs = await probeMediaDuration(finalFile, false);
      } else if (contractKind === 'video') {
        durationMs = durationMs ?? (await probeMediaDuration(finalFile, true));
      }

      const media: MediaPayload = {
        kind: kind0,
        url,
        mime: finalFile.type || null,
        filename: finalFile.name || null,
        size_bytes: finalFile.size,
        duration_ms: durationMs,
        width,
        height,
        caption: null,
        thumbnail_url: null,
      };

      const payload: PlatformCrmSendMediaPayload = {
        bucket: BUCKET,
        path,
        mimeType: finalFile.type || 'application/octet-stream',
        kind: contractKind,
        filename: finalFile.name || undefined,
        url,
        size_bytes: finalFile.size,
        duration_ms: durationMs,
        width,
        height,
      };

      opts?.onProgress?.(100);
      return { media, payload, path };
    },
    [conversationId],
  );

  /** API legada — mantida para callers existentes (Catalog/Schedule/audio). */
  const upload = useCallback<UsePlatformCrmMediaUploadReturn['upload']>(
    async (file, opts) => {
      setError(null);
      setIsUploading(true);
      setProgress(5);
      try {
        const r = await uploadOne(file, {
          ...opts,
          onProgress: (p) => setProgress(p),
        });
        setProgress(100);
        return r;
      } catch (e: any) {
        const msg = e?.message || 'Falha no upload.';
        setError(msg);
        throw e;
      } finally {
        setIsUploading(false);
      }
    },
    [uploadOne],
  );

  return { upload, uploadOne, isUploading, progress, error, reset };
}
