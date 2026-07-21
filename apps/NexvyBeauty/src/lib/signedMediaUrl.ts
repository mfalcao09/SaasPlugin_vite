import { supabase } from '@/integrations/supabase/client';

/**
 * Resolvedor de signed URLs de mídia de conversa.
 *
 * ⚠️ CONTEXTO (frente "guardar path, não URL", 2026-07-20): os buckets de mídia
 * de conversa estão indo de `public=true` para privado. Com bucket privado a
 * URL pública persistida em `metadata.media.url` MORRE — o render passa a
 * assinar a partir de `bucket`+`path` via a edge `media-sign` (service_role,
 * ver supabase/functions/media-sign/index.ts).
 *
 * Duas responsabilidades, ambas necessárias:
 *  1. BATCHING — cada balão de mensagem pede sua mídia isoladamente. Sem
 *     coletor, uma conversa com 10 anexos dispara 10 invokes. Este módulo
 *     acumula os pedidos numa janela de microtask e manda UM request.
 *  2. CACHE COM VALIDADE — signed URL expira. Guardamos `expiresAt` e
 *     re-assinamos ANTES do vencimento, para que a mídia não morra na tela de
 *     quem deixou a conversa aberta.
 */

export interface MediaRef {
  bucket: string;
  path: string;
}

interface CacheEntry {
  url: string;
  /** epoch ms em que a assinatura vence de fato. */
  expiresAt: number;
}

/** Re-assina quando falta menos que isto para vencer — cobre relógio fora de
 *  sincronia e o tempo de rede do próprio refresh. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 min
/** Janela de coleta. 0ms = "no fim desta rodada de render", que é exatamente
 *  quando todos os balões da conversa já registraram seus pedidos. */
const BATCH_WINDOW_MS = 0;

const cache = new Map<string, CacheEntry>();
/** Requests em voo, para que dois balões da mesma mídia não assinem duas vezes. */
const inFlight = new Map<string, Promise<string>>();

let pending: Array<{
  key: string;
  ref: MediaRef;
  resolve: (url: string) => void;
  reject: (err: Error) => void;
}> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function mediaKey(ref: MediaRef): string {
  return `${ref.bucket}/${ref.path}`;
}

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return !!entry && entry.expiresAt - Date.now() > REFRESH_MARGIN_MS;
}

async function flush(): Promise<void> {
  const batch = pending;
  pending = [];
  flushTimer = null;
  if (batch.length === 0) return;

  // Dedup dentro do próprio lote (dois balões, mesma mídia).
  const byKey = new Map<string, MediaRef>();
  for (const p of batch) byKey.set(p.key, p.ref);

  try {
    const { data, error } = await supabase.functions.invoke('media-sign', {
      body: { items: Array.from(byKey.values()) },
    });
    if (error) throw error;

    const urls: Record<string, string> = data?.urls ?? {};
    const failed: Record<string, string> = data?.failed ?? {};
    const ttlSeconds: number = Number(data?.ttl_seconds) || 3600;
    const expiresAt = Date.now() + ttlSeconds * 1000;

    for (const [key, url] of Object.entries(urls)) {
      cache.set(key, { url, expiresAt });
    }
    for (const p of batch) {
      const url = urls[p.key];
      if (url) p.resolve(url);
      // Motivo estruturado da edge (not_found / forbidden / unrecognized_path_shape)
      // sobe intacto: a UI mostra "mídia indisponível", não um balão vazio mudo.
      else p.reject(new Error(failed[p.key] ?? 'signed_url_unavailable'));
    }
  } catch (e: any) {
    const msg = e?.message || 'falha ao assinar mídia';
    for (const p of batch) p.reject(new Error(msg));
  }
}

/**
 * Devolve uma signed URL válida para `ref`, usando cache e batching.
 * Rejeita com o motivo estruturado quando o objeto não existe ou o acesso é
 * negado — o chamador decide como degradar.
 */
export function getSignedMediaUrl(ref: MediaRef): Promise<string> {
  const key = mediaKey(ref);

  const cached = cache.get(key);
  if (isFresh(cached)) return Promise.resolve(cached.url);

  const running = inFlight.get(key);
  if (running) return running;

  const promise = new Promise<string>((resolve, reject) => {
    pending.push({ key, ref, resolve, reject });
    if (!flushTimer) flushTimer = setTimeout(flush, BATCH_WINDOW_MS);
  }).finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

/** Quanto falta (ms) até a assinatura em cache precisar ser renovada. */
export function msUntilRefresh(ref: MediaRef): number | null {
  const entry = cache.get(mediaKey(ref));
  if (!entry) return null;
  return Math.max(0, entry.expiresAt - Date.now() - REFRESH_MARGIN_MS);
}

/** Invalida uma entrada — usado quando o <img>/<video> falha em carregar
 *  (assinatura pode ter vencido antes do agendado, ex.: aba suspensa). */
export function invalidateSignedMediaUrl(ref: MediaRef): void {
  cache.delete(mediaKey(ref));
}

/** Só para teste — zera o estado do módulo. */
export function __resetSignedMediaCache(): void {
  cache.clear();
  inFlight.clear();
  pending = [];
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
