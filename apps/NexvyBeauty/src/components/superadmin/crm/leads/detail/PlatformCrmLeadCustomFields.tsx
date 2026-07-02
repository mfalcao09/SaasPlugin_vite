import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Json } from '@/integrations/supabase/types';
import {
  usePlatformCrmCustomFields,
  type PlatformCrmCustomFieldType,
} from '../../data/usePlatformCrmCustomFields';

/**
 * CAMPOS PERSONALIZADOS no Resumo — porte fiel do `LeadCustomFields` do CRM Vendus.
 * Valores vêm de `platform_crm_leads.metadata.custom_fields` (Json); os rótulos/tipos
 * vêm de `platform_crm_custom_fields` via `usePlatformCrmCustomFields` (mapeando por
 * `field_key`). Fallback de rótulo em `metadata.custom_field_labels`. Renderização por
 * tipo (number/date/boolean/select/text) — 1:1 com o original.
 */
interface Props {
  metadata: Json | null | undefined;
}

function formatLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function tryFormatDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const d = parseISO(v);
  if (!isValid(d)) return null;
  return format(d, 'dd/MM/yyyy HH:mm', { locale: ptBR });
}

function renderValue(value: unknown, type?: PlatformCrmCustomFieldType) {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;

  switch (type) {
    case 'number': {
      const n = Number(value);
      return <span className="font-medium">{isNaN(n) ? String(value) : n.toLocaleString('pt-BR')}</span>;
    }
    case 'date': {
      const f = tryFormatDate(value);
      return <span className="font-medium">{f ?? String(value)}</span>;
    }
    case 'boolean':
      return <span className="font-medium">{value ? 'Sim' : 'Não'}</span>;
    case 'select':
      return <Badge variant="secondary" className="text-xs">{String(value)}</Badge>;
    default: {
      // text / unknown — try date auto-detect, then objects/arrays
      const asDate = tryFormatDate(value);
      if (asDate) return <span className="font-medium">{asDate}</span>;
      if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-muted-foreground">—</span>;
        // array of objects → list message-like fields
        return (
          <ul className="list-disc list-inside space-y-0.5">
            {value.slice(0, 5).map((item, i) => (
              <li key={i} className="text-sm truncate">
                {typeof item === 'object' && item !== null
                  ? ((item as Record<string, unknown>).mensagem ||
                      (item as Record<string, unknown>).message ||
                      (item as Record<string, unknown>).text ||
                      JSON.stringify(item)) as string
                  : String(item)}
              </li>
            ))}
            {value.length > 5 && <li className="text-xs text-muted-foreground">+{value.length - 5} mais</li>}
          </ul>
        );
      }
      if (typeof value === 'object') {
        return <span className="font-mono text-xs break-all">{JSON.stringify(value)}</span>;
      }
      return <span className="font-medium break-words">{String(value)}</span>;
    }
  }
}

export function PlatformCrmLeadCustomFields({ metadata }: Props) {
  const { data: fields = [] } = usePlatformCrmCustomFields();

  const meta = (metadata ?? undefined) as Record<string, unknown> | undefined;
  const values = (meta?.custom_fields || {}) as Record<string, unknown>;
  const customFieldLabels = (meta?.custom_field_labels || {}) as Record<string, string>;

  const items = useMemo(() => {
    const entries = Object.entries(values).filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (entries.length === 0) return [];

    const fieldByKey = new Map(fields.map((f) => [f.field_key, f]));

    return entries
      .map(([key, value]) => ({
        key,
        value,
        field: fieldByKey.get(key),
      }))
      .sort((a, b) => {
        // Defined fields first, then by field name / key
        const aHas = a.field ? 0 : 1;
        const bHas = b.field ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        const aName = a.field?.name || a.key;
        const bName = b.field?.name || b.key;
        return aName.localeCompare(bName);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, fields]);

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Database className="h-4 w-4" />
          <span>Campos personalizados</span>
          <span className="text-xs font-normal text-muted-foreground">· {items.length} {items.length === 1 ? 'campo' : 'campos'}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {items.map(({ key, value, field }) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs text-muted-foreground truncate">
                {field?.name || customFieldLabels[key] || formatLabel(key)}
              </dt>
              <dd className="mt-0.5">
                {renderValue(value, field?.field_type as PlatformCrmCustomFieldType | undefined)}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
