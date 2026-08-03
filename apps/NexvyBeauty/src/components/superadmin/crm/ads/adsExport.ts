// ─────────────────────────────────────────────────────────────────────────────
// NexvyAds — montagem da string CSV da tabela de campanhas. Puro (sem I/O/DOM).
// O download reaproveita `downloadCsv` de src/lib/leadsExport.ts (anti-NIH).
// A matriz (cabeçalhos + linhas já formatadas) é montada pelo consumidor.
// ─────────────────────────────────────────────────────────────────────────────

/** Escapa um valor para uma célula CSV (aspas duplas + escape de aspas internas). */
function escapeCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Monta a string CSV a partir de cabeçalhos + matriz de células já formatadas. */
export function campaignsCsvString(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCell).join(',');
  const bodyLines = rows.map((r) => r.map(escapeCell).join(','));
  return [headerLine, ...bodyLines].join('\n');
}
