import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { INSTAGRAM_LOGIN_ENABLED } from '@/lib/instagramLoginApp';
import {
  INSTAGRAM_OAUTH_POPUP_FEATURES,
  INSTAGRAM_OAUTH_POPUP_NAME,
  isInstagramOAuthPopupMessage,
} from '@/lib/instagramOAuthPopup';
import { useStartInstagramLogin } from '@/hooks/useInstagramLoginConnection';

const IG_CONNECTIONS_KEY = ['instagram-login-connections'] as const;

export function useInstagramOAuthPopup() {
  const startMut = useStartInstagramLogin();
  const queryClient = useQueryClient();
  const popupRef = useRef<Window | null>(null);
  const settledRef = useRef(false);
  const pollRef = useRef<number | null>(null);
  const listenerRef = useRef<((event: MessageEvent) => void) | null>(null);

  const stopWatch = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (listenerRef.current) {
      window.removeEventListener('message', listenerRef.current);
      listenerRef.current = null;
    }
  }, []);

  const settleFromMessage = useCallback((ok: boolean, error?: string) => {
    if (settledRef.current) return;
    settledRef.current = true;
    stopWatch();
    popupRef.current = null;
    if (ok) {
      toast.success('Instagram conectado');
      void queryClient.invalidateQueries({ queryKey: IG_CONNECTIONS_KEY });
      return;
    }
    toast.error(error || 'Falha ao conectar Instagram');
  }, [queryClient, stopWatch]);

  const watchPopup = useCallback((popup: Window) => {
    stopWatch();
    settledRef.current = false;
    popupRef.current = popup;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isInstagramOAuthPopupMessage(event.data)) return;
      settleFromMessage(event.data.ok, event.data.error);
    };
    listenerRef.current = onMessage;
    window.addEventListener('message', onMessage);

    pollRef.current = window.setInterval(() => {
      if (!popup.closed) return;
      stopWatch();
      popupRef.current = null;
      if (settledRef.current) return;
      settledRef.current = true;
    }, 500);
  }, [settleFromMessage, stopWatch]);

  useEffect(() => () => stopWatch(), [stopWatch]);

  const start = useCallback(() => {
    if (!INSTAGRAM_LOGIN_ENABLED) {
      toast.error('config Instagram ausente');
      return;
    }

    const popup = window.open(
      'about:blank',
      INSTAGRAM_OAUTH_POPUP_NAME,
      INSTAGRAM_OAUTH_POPUP_FEATURES,
    );

    if (!popup) {
      toast.error('Permita pop-ups para conectar o Instagram');
      startMut.mutate(undefined, {
        onSuccess: ({ authorize_url }) => {
          window.location.assign(authorize_url);
        },
      });
      return;
    }

    watchPopup(popup);

    startMut.mutate(undefined, {
      onSuccess: ({ authorize_url }) => {
        if (popup.closed) return;
        popup.location.href = authorize_url;
      },
      onError: () => {
        try { popup.close(); } catch { /* ignore */ }
        stopWatch();
        popupRef.current = null;
        settledRef.current = true;
      },
    });
  }, [startMut, stopWatch, watchPopup]);

  return { start, isPending: startMut.isPending };
}
