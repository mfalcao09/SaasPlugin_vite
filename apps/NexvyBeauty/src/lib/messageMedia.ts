import type { MediaPayload, MediaKind } from '@/components/seller/inbox/MediaAttachment';

/**
 * Mídia extraída de uma mensagem. Estende o payload de render com a REFERÊNCIA
 * de storage (`bucket`+`path`) quando ela existe.
 *
 * ⚠️ Por que a referência importa (frente "guardar path, não URL", 2026-07-20):
 * os buckets de mídia de conversa vão de `public=true` para privado, e a `url`
 * pública persistida em `metadata.media.url` deixa de servir. Quem tem
 * `bucket`+`path` é assinável on-demand (ver `useSignedMediaUrl`); quem só tem
 * `url` é legado e depende de backfill.
 */
export type ExtractedMedia = MediaPayload & {
  bucket?: string | null;
  path?: string | null;
};

/**
 * Lê `metadata.media` de uma mensagem e devolve um payload normalizado para
 * o componente <MediaAttachment/>. Retorna null se a mensagem não tem mídia.
 *
 * Aceita formatos legados (campos espalhados em metadata.* — audio_url,
 * image_url, etc.) e o formato canônico novo (metadata.media = {...}).
 */
export function extractMedia(metadata: any): ExtractedMedia | null {
  if (!metadata || typeof metadata !== 'object') return null;

  // Formato canônico
  if (metadata.media && typeof metadata.media === 'object') {
    const m = metadata.media;
    // `url` OU `path`: com bucket privado a mídia nova pode chegar sem URL
    // pública nenhuma — o path sozinho já basta para renderizar (assinado).
    if ((!m.url && !m.path) || !m.kind) return null;
    return {
      kind: normalizeKind(m.kind, m.mime),
      url: m.url ? String(m.url) : '',
      bucket: m.bucket ? String(m.bucket) : null,
      path: m.path ? String(m.path) : null,
      mime: m.mime ?? null,
      filename: m.filename ?? null,
      size_bytes: typeof m.size_bytes === 'number' ? m.size_bytes : null,
      duration_ms: typeof m.duration_ms === 'number' ? m.duration_ms : null,
      width: typeof m.width === 'number' ? m.width : null,
      height: typeof m.height === 'number' ? m.height : null,
      caption: m.caption ?? null,
      thumbnail_url: m.thumbnail_url ?? null,
    };
  }

  // Formatos legados — tenta achar uma URL conhecida
  const legacy: Array<{ key: string; kind: MediaKind }> = [
    { key: 'audio_url', kind: 'audio' },
    { key: 'image_url', kind: 'image' },
    { key: 'video_url', kind: 'video' },
    { key: 'document_url', kind: 'document' },
    { key: 'file_url', kind: 'document' },
  ];
  for (const { key, kind } of legacy) {
    const url = metadata[key];
    if (typeof url === 'string' && url.startsWith('http')) {
      return {
        kind,
        url,
        mime: metadata.mime || metadata.mimetype || null,
        filename: metadata.filename || metadata.file_name || null,
        size_bytes: metadata.size_bytes ?? metadata.file_size ?? null,
        duration_ms: metadata.duration_ms ?? null,
        caption: metadata.caption ?? null,
        thumbnail_url: metadata.thumbnail_url ?? null,
      };
    }
  }

  return null;
}

function normalizeKind(raw: any, mime?: string | null): MediaKind {
  const k = String(raw || '').toLowerCase();
  if (k === 'audio' || k === 'image' || k === 'video' || k === 'document' || k === 'sticker') {
    return k;
  }
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  return 'document';
}
