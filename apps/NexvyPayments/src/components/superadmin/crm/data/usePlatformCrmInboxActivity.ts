import { useEffect, useMemo, useState } from 'react';
import {
  filterConversationsByTab,
  type PlatformCrmConversationRow,
  type PlatformCrmStatusTab,
} from './usePlatformCrmConversations';

/**
 * U2 — sinalização das abas da inbox de PLATAFORMA: detecta, por aba
 * (Atendendo/Agentes/Em Fila/Resolvidas), se chegou conversa/mensagem NOVA
 * desde a última vez que a aba foi visualizada.
 *
 * Persistência: localStorage (`nexvybeauty_platform_crm_inbox_tab_seen_v1`)
 * com um timestamp ISO de "última visualização" por aba. A aba ATIVA é marcada
 * como vista continuamente (enquanto o operador olha pra ela, nada é "novo");
 * as demais acendem o ponto pulsante quando `last_message_at` (ou `created_at`,
 * para conversa recém-criada sem mensagem) ultrapassa o visto.
 */

const STORAGE_KEY = 'nexvybeauty_platform_crm_inbox_tab_seen_v1';

const ALL_TABS: PlatformCrmStatusTab[] = ['attending', 'agents', 'waiting', 'resolved'];

type SeenMap = Partial<Record<PlatformCrmStatusTab, string>>;

/** Mapa de "há novidade?" por aba — consumido pelos TabButtons da lista. */
export type PlatformCrmTabActivity = Record<PlatformCrmStatusTab, boolean>;

function loadSeenMap(): SeenMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as SeenMap) : {};
  } catch {
    return {};
  }
}

function saveSeenMap(map: SeenMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage indisponível — o badge simplesmente não persiste entre sessões.
  }
}

/** Epoch ms seguro (0 para nulo/inválido) — evita comparar ISO com formatos mistos. */
function toMs(value: string | null | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/** Atividade mais recente de uma conversa (mensagem OU criação da conversa). */
function conversationActivityMs(conv: PlatformCrmConversationRow): number {
  return Math.max(toMs(conv.last_message_at), toMs(conv.created_at));
}

/**
 * Hook de atividade por aba. Recebe a lista COMPLETA de conversas (não a
 * filtrada) + a aba ativa; devolve `{ attending, agents, waiting, resolved }`
 * com true onde há novidade não vista.
 */
export function usePlatformCrmInboxTabActivity(
  conversations: PlatformCrmConversationRow[] | undefined,
  activeTab: PlatformCrmStatusTab,
): PlatformCrmTabActivity {
  const [seen, setSeen] = useState<SeenMap>(() => {
    // Primeiro uso: baseline = agora (sem "última visita" anterior não há
    // novidade a sinalizar — evita acender as 4 abas no primeiro load).
    const stored = loadSeenMap();
    const now = new Date().toISOString();
    let changed = false;
    for (const tab of ALL_TABS) {
      if (!stored[tab]) {
        stored[tab] = now;
        changed = true;
      }
    }
    if (changed) saveSeenMap(stored);
    return stored;
  });

  // Atividade mais recente por aba (epoch ms), derivada da lista completa.
  const latestByTab = useMemo(() => {
    const acc = {} as Record<PlatformCrmStatusTab, number>;
    for (const tab of ALL_TABS) {
      const list = filterConversationsByTab(conversations, tab);
      let max = 0;
      for (const conv of list) {
        const ms = conversationActivityMs(conv);
        if (ms > max) max = ms;
      }
      acc[tab] = max;
    }
    return acc;
  }, [conversations]);

  // A aba ATIVA é marcada como vista sempre que a atividade dela avança —
  // atualiza só quando estritamente mais novo (converge, sem loop de render).
  useEffect(() => {
    const latest = latestByTab[activeTab];
    if (!latest || latest <= toMs(seen[activeTab])) return;
    setSeen((prev) => {
      if (latest <= toMs(prev[activeTab])) return prev;
      const next = { ...prev, [activeTab]: new Date(latest).toISOString() };
      saveSeenMap(next);
      return next;
    });
  }, [activeTab, latestByTab, seen]);

  return useMemo(() => {
    const result = {} as PlatformCrmTabActivity;
    for (const tab of ALL_TABS) {
      result[tab] = tab !== activeTab && latestByTab[tab] > toMs(seen[tab]);
    }
    return result;
  }, [activeTab, latestByTab, seen]);
}
