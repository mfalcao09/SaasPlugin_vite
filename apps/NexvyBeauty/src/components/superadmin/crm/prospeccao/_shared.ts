import type { LeadSegment, ExtractedLead } from '@/components/superadmin/crm/data/usePlatformProspeccao';

/**
 * Helpers compartilhados do menu "Prospecção Ativa".
 *
 * São uma CÓPIA fiel dos utilitários privados de `PlatformProspeccaoManager`
 * (a tela "Buscas"). A duplicação é DELIBERADA: a decisão do Marcelo é manter a
 * Buscas "exatamente como está" (byte-a-byte), então NÃO exportamos de lá nem a
 * editamos. Estes ~40 linhas de metadados/formatadores puros vivem aqui e são
 * consumidos só pelas telas NOVAS (Base consolidada, stubs). Se um dia a Buscas
 * for tocada, o passo natural é ela passar a importar daqui e a cópia some.
 */

export const SEG_META: Record<LeadSegment, { label: string; dot: string; cls: string }> = {
  salao_cliente: { label: 'Espaço-cliente', dot: '🟢', cls: 'bg-green-500/15 text-green-600 border-green-500/30' },
  afiliado_infoproduto: { label: 'Afiliado', dot: '🔵', cls: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  revisao: { label: 'Revisão', dot: '🟡', cls: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' },
  descarte: { label: 'Descarte', dot: '⚪', cls: 'bg-muted text-muted-foreground border-border' },
  acionamento_via_instagram: { label: 'Instagram (DM)', dot: '🟣', cls: 'bg-purple-500/15 text-purple-600 border-purple-500/30' },
};

export const SEG_KEYS: LeadSegment[] = ['salao_cliente', 'afiliado_infoproduto', 'revisao', 'descarte', 'acionamento_via_instagram'];

export function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

/** Resume o veredito por camada (o "por quê") num texto pra tooltip. */
export function whyText(l: Pick<ExtractedLead, 'filter_verdicts'>): string {
  const v = l.filter_verdicts;
  if (!v) return 'Sem veredito registrado.';
  const icp = v.icp ? `ICP ${v.icp.pass ? '✓' : '✗'} (${v.icp.reason})` : '';
  const lang = v.lang ? `Idioma ${v.lang.pass ? '✓' : '✗'} (${v.lang.verdict})` : '';
  const geo = v.geo ? `GEO ${v.geo.is_brazil ? '✓ BR' : v.geo.explicit_foreign ? '✗ estrangeiro' : '✗ indef'} [${(v.geo.signals || []).join(',')}]` : '';
  const phone = v.phone ? `Telefone ${v.phone.has_br_phone ? '✓' : '✗'}` : '';
  return [icp, lang, geo, phone].filter(Boolean).join('  ·  ');
}

type CsvRow = Pick<
  ExtractedLead,
  'handle' | 'name' | 'telefone' | 'whatsapp_link' | 'instagram_url' | 'seguidores' | 'categoria' | 'email' | 'website'
>;

export function toCsv(rows: CsvRow[]): string {
  const head = ['handle', 'name', 'telefone', 'whatsapp_link', 'instagram_url', 'seguidores', 'categoria', 'email', 'website'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.handle, r.name, r.telefone, r.whatsapp_link, r.instagram_url, r.seguidores, r.categoria, r.email, r.website].map(esc).join(','),
  );
  return [head.join(','), ...lines].join('\n');
}
