/** Filtros de lista/contagem do inbox tenant. Sem send. */

export const TENANT_INBOX_CHANNELS = ['webchat', 'whatsapp', 'instagram'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `whatsapp,instagram,webchat` → string pronta para `p_channel` (lista). */
export function normalizeInboxChannels(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const allowed = new Set<string>(TENANT_INBOX_CHANNELS);
  const uniq: string[] = [];
  for (const part of raw.split(',')) {
    const channel = part.trim().toLowerCase();
    if (!allowed.has(channel) || uniq.includes(channel)) continue;
    uniq.push(channel);
  }
  return uniq.length ? uniq.join(',') : null;
}

/** `evolution:<uuid>` | `instagram:<uuid>` */
export function parseConnectionKeys(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  const keys = raw.split(',').map((s) => s.trim()).filter((key) => {
    const sep = key.indexOf(':');
    if (sep <= 0) return false;
    const prefix = key.slice(0, sep);
    const id = key.slice(sep + 1);
    return (prefix === 'evolution' || prefix === 'instagram') && UUID_RE.test(id);
  });
  return keys.length ? keys : null;
}
