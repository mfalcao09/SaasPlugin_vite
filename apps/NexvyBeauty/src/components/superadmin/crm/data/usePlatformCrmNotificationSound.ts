import { useCallback, useEffect, useState } from 'react';

/**
 * Sons de notificação da inbox (volumes por canal: mensagem × fila) — porte
 * A1.2 de `src/hooks/useNotificationSound.ts` (Vendus v5 original), com
 * hardening de Web Audio que o v5 não tinha (ver nota abaixo).
 *
 * Cópia ESCOPADA ao platform CRM: o hook global do app
 * (`src/hooks/useNotificationSound.ts` do destino) tem o shape ANTIGO
 * ({ isEnabled, toggleSound, playNotification }) e é consumido por outras
 * telas — não foi tocado. As chaves de localStorage são as mesmas do v5,
 * então a preferência do usuário é compartilhada entre inboxes.
 *
 * DIVERGÊNCIA vs v5 (bugfix 2026-07-10): o v5 criava um AudioContext NOVO a
 * cada play e agendava os tons assumindo state === 'running'. Quando o browser
 * entrega o context 'suspended' (política de autoplay, site silenciado, cap de
 * AudioContexts simultâneos do Chromium), currentTime congela em 0,
 * osc.start(0) nunca dispara e o som falha EM SILÊNCIO — nenhuma exceção é
 * lançada, então o try/catch nunca via nada. Agora: context único compartilhado
 * (lazy), resume() antes de agendar, e o resultado da tentativa é retornado
 * para o chamador poder dar feedback (toast no "Testar").
 */
type Channel = 'message' | 'queue';

/** Resultado de uma tentativa de tocar som. `'played'` = tons agendados com sucesso. */
export type PlaySoundResult = 'played' | 'master-off' | 'volume-zero' | 'unsupported' | 'blocked';

const KEYS = {
  master: 'notif_master_enabled',
  message: 'notif_volume_message',
  queue: 'notif_volume_queue',
};

// AudioContext único do módulo, criado sob demanda e reutilizado entre plays.
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new Ctx();
  return sharedCtx;
}

/**
 * Garante que o context está 'running' antes de agendar áudio. O resume() só é
 * garantido dentro de um gesto do usuário; fora dele o Chrome deixa a Promise
 * pendente até o próximo gesto — por isso o race com timeout: não travamos o
 * play, apenas reportamos 'blocked' (e o resume enfileirado destrava os
 * próximos plays quando o usuário interagir).
 */
async function ensureRunning(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === 'running') return true;
  await Promise.race([
    ctx.resume().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 350)),
  ]);
  return (ctx.state as AudioContextState) === 'running';
}

function readNum(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  return raw !== 'false';
}

export function usePlatformCrmNotificationSound() {
  const [masterEnabled, setMasterEnabled] = useState(() => readBool(KEYS.master, true));
  const [messageVolume, setMessageVolume] = useState(() => readNum(KEYS.message, 0.8));
  const [queueVolume, setQueueVolume] = useState(() => readNum(KEYS.queue, 1));

  useEffect(() => { localStorage.setItem(KEYS.master, String(masterEnabled)); }, [masterEnabled]);
  useEffect(() => { localStorage.setItem(KEYS.message, String(messageVolume)); }, [messageVolume]);
  useEffect(() => { localStorage.setItem(KEYS.queue, String(queueVolume)); }, [queueVolume]);

  const play = useCallback(async (channel: Channel): Promise<PlaySoundResult> => {
    if (!masterEnabled) return 'master-off';
    const vol = channel === 'message' ? messageVolume : queueVolume;
    if (vol <= 0) return 'volume-zero';

    try {
      const ctx = getAudioContext();
      if (!ctx) {
        console.warn('[notification-sound] Web Audio API indisponível neste navegador.');
        return 'unsupported';
      }
      if (!(await ensureRunning(ctx))) {
        console.warn(
          '[notification-sound] AudioContext bloqueado pela política de autoplay do navegador (state=%s).',
          ctx.state
        );
        return 'blocked';
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      // Context é compartilhado (não fechamos mais): libera os nodes ao terminar.
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };

      const t0 = ctx.currentTime;

      if (channel === 'message') {
        // Bipe curto de 2 tons (sutil)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t0);
        osc.frequency.setValueAtTime(1175, t0 + 0.09);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.35 * vol, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
        osc.start(t0);
        osc.stop(t0 + 0.3);
      } else {
        // Sino de 3 tons ascendentes (mais marcante — chamada da fila)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(660, t0);
        osc.frequency.setValueAtTime(880, t0 + 0.18);
        osc.frequency.setValueAtTime(1318, t0 + 0.36);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.45 * vol, t0 + 0.03);
        gain.gain.setValueAtTime(0.45 * vol, t0 + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
        osc.start(t0);
        osc.stop(t0 + 0.9);
      }
      return 'played';
    } catch (e) {
      console.warn('[notification-sound] Falha ao tocar som de notificação:', e);
      return 'blocked';
    }
  }, [masterEnabled, messageVolume, queueVolume]);

  const playMessage = useCallback(() => play('message'), [play]);
  const playQueue = useCallback(() => play('queue'), [play]);

  const anySoundOn = masterEnabled && (messageVolume > 0 || queueVolume > 0);

  return {
    masterEnabled,
    setMasterEnabled,
    messageVolume,
    setMessageVolume,
    queueVolume,
    setQueueVolume,
    playMessage,
    playQueue,
    anySoundOn,
  };
}

export type NotificationSoundControls = ReturnType<typeof usePlatformCrmNotificationSound>;
