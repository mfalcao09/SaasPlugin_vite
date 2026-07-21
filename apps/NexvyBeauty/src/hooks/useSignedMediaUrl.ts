import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaPayload } from '@/components/seller/inbox/MediaAttachment';
import type { ExtractedMedia } from '@/lib/messageMedia';
import {
  getSignedMediaUrl,
  invalidateSignedMediaUrl,
  msUntilRefresh,
  type MediaRef,
} from '@/lib/signedMediaUrl';

/**
 * Resolve a URL exibível de uma mídia de mensagem.
 *
 * ⚠️ Frente "guardar path, não URL" (2026-07-20). Dois regimes convivem durante
 * a migração, de propósito:
 *
 *  • COM `bucket`+`path` → assina on-demand (TTL curto) via edge `media-sign`.
 *    É o caminho definitivo e o único que sobrevive ao bucket privado.
 *  • SEM `bucket`+`path` (legado) → devolve a `url` pública persistida como
 *    está. Continua funcionando ENQUANTO o bucket for público; quebra no flip.
 *    Toda mídia neste regime é dívida de backfill — `isLegacyPublicUrl` existe
 *    para que a UI (ou um contador de telemetria) possa enxergar isso ANTES do
 *    flip, em vez de descobrir na hora em que a tela ficar cinza.
 */

export interface UseSignedMediaUrlResult {
  /** Payload pronto para <MediaAttachment>, com a URL já resolvida. */
  media: MediaPayload | null;
  /** true enquanto a assinatura está sendo obtida. */
  isResolving: boolean;
  /** Motivo estruturado da edge quando a assinatura falhou. */
  failureReason: string | null;
  /** true quando esta mídia só tem URL pública legada (sem bucket/path). */
  isLegacyPublicUrl: boolean;
}

function refOf(media: ExtractedMedia | null): MediaRef | null {
  if (!media?.bucket || !media?.path) return null;
  return { bucket: media.bucket, path: media.path };
}

export function useSignedMediaUrl(media: ExtractedMedia | null): UseSignedMediaUrlResult {
  const bucket = media?.bucket ?? null;
  const path = media?.path ?? null;
  const ref = useMemo(() => refOf(media), [bucket, path]);

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ref) {
      setSignedUrl(null);
      setFailureReason(null);
      setIsResolving(false);
      return;
    }

    let cancelled = false;

    async function resolve(target: MediaRef) {
      setIsResolving(true);
      setFailureReason(null);
      try {
        const url = await getSignedMediaUrl(target);
        if (cancelled) return;
        setSignedUrl(url);

        // Reagenda a renovação ANTES do vencimento. Sem isto, a mídia de quem
        // deixa a conversa aberta expira na cara do usuário — e o <img> falha
        // silenciosamente, que é o pior modo de falhar.
        const wait = msUntilRefresh(target);
        if (wait != null) {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => {
            invalidateSignedMediaUrl(target);
            if (!cancelled) resolve(target);
          }, wait);
        }
      } catch (e: any) {
        if (cancelled) return;
        setFailureReason(e?.message ?? 'signed_url_unavailable');
        setSignedUrl(null);
      } finally {
        if (!cancelled) setIsResolving(false);
      }
    }

    resolve(ref);

    return () => {
      cancelled = true;
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [ref]);

  const resolvedMedia = useMemo<MediaPayload | null>(() => {
    if (!media) return null;
    if (!ref) return media;      // legado: URL pública como veio
    if (!signedUrl) return null; // ainda resolvendo, ou falhou
    return { ...media, url: signedUrl };
  }, [media, ref, signedUrl]);

  return {
    media: resolvedMedia,
    isResolving,
    failureReason,
    isLegacyPublicUrl: !!media && !ref,
  };
}

/**
 * Traduz o motivo estruturado da edge `media-sign` em texto para o usuário.
 *
 * TODO(marcelo): a voz é sua — estas strings aparecem DENTRO do balão da
 * conversa, no lugar onde deveria estar a foto/áudio do cliente. Motivos que a
 * edge emite:
 *   'not_found: …'             objeto não existe mais no storage (apagado/expurgado)
 *   'forbidden'                usuário sem acesso àquela org/bucket
 *   'unrecognized_path_shape'  path em formato que a edge não sabe escopar
 *   'bucket_not_allowed'       bucket fora da allowlist
 *   'invalid_path'             path malformado
 *   qualquer outro             falha de rede/edge
 *
 * A decisão que importa não é a redação, é QUANTO contar. 'forbidden' num balão
 * de conversa provavelmente não deve dizer "você não tem permissão" — isso
 * confirma que a mídia existe. 'not_found' pode ser honesto ("essa mídia não
 * está mais disponível"). Onde traçar essa linha é chamada sua, não minha.
 */
export function describeMediaFailure(reason: string | null): string {
  if (!reason) return '';
  // Placeholder deliberadamente uniforme até a definição acima.
  return 'Mídia indisponível';
}
