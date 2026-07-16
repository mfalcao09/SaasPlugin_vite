// ─────────────────────────────────────────────────────────────────────────────
// NexvyAds — formatadores compartilhados das 3 abas (Atribuição/Campanhas/Recs).
// Puro (sem I/O). Tokens Tailwind + tema rosé da plataforma.
// ─────────────────────────────────────────────────────────────────────────────

export function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('pt-BR');
}

/** Abrevia grandes números (1.2k / 3.4M). */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function fmtMoney(
  n: number | null | undefined,
  currency = 'BRL',
): string {
  if (n == null || Number.isNaN(n)) return '—';
  try {
    return n.toLocaleString('pt-BR', {
      style: 'currency',
      currency: currency || 'BRL',
      maximumFractionDigits: 2,
    });
  } catch {
    return `${(currency || 'BRL')} ${n.toFixed(2)}`;
  }
}

/** ctr etc. chegam como fração 0..1 OU como percentual bruto — normaliza p/ %. */
export function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(2)}%`;
}

export function fmtRoas(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n) || n === 0) return '—';
  return `${n.toFixed(2)}×`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Data ISO (YYYY-MM-DD) de `days` dias atrás — filtro de intervalo de ads_metrics. */
export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ── Presets de intervalo de datas (seletor da aba Campanhas) ──
export interface DateRangePreset {
  value: string;
  label: string;
  days: number;
}
export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  { value: '7', label: 'Últimos 7 dias', days: 7 },
  { value: '14', label: 'Últimos 14 dias', days: 14 },
  { value: '30', label: 'Últimos 30 dias', days: 30 },
  { value: '90', label: 'Últimos 90 dias', days: 90 },
];
