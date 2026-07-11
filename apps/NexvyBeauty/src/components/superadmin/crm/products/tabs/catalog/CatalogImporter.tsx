// Porte 1:1 de `.vendus-src-reference/src/components/admin/products/tabs/catalog/CatalogImporter.tsx`
// Parser CSV client-side mantido; importação: TODO(edge: platform-catalog-import-csv)
// + TODO(table: platform_crm_product_catalog_items). Sem organization_id.
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props { productId: string }

// CSV parser simples (linhas separadas por \n, vírgula como separador, com aspas)
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        cur.push(cell); rows.push(cur); cur = []; cell = '';
      } else cell += c;
    }
  }
  if (cell.length > 0 || cur.length > 0) { cur.push(cell); rows.push(cur); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

export function CatalogImporter({ productId }: Props) {
  const qc = useQueryClient();
  // Twin product-scoped: a edge insere os itens em platform_crm_product_catalog_items
  // (source_type='csv'), escopado por product_id. Segue o padrão dos hooks vivos
  // (trata FunctionsHttpError lendo o corpo real da Response).
  const importMut = useMutation({
    mutationFn: async (payload: { product_id: string; items: unknown[] }) => {
      const { data, error } = await supabase.functions.invoke('platform-catalog-import-csv', {
        body: payload,
      });
      if (error) {
        let msg = error.message;
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        try {
          const body = await ctx?.json?.();
          if (body?.error) msg = body.error;
        } catch {
          /* mantém error.message */
        }
        throw new Error(msg);
      }
      const result = (data ?? {}) as { success?: boolean; error?: string; inserted?: number };
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['platform-crm', 'product-catalog-items'] });
      toast.success(`${result.inserted ?? 0} itens importados para o catálogo!`);
    },
    onError: (e: unknown) => toast.error((e as Error).message || 'Erro ao importar itens'),
  });
  const [preview, setPreview] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  void headers;

  const handleFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      toast.error('Arquivo vazio ou inválido');
      return;
    }
    const hdr = rows[0].map((h) => h.trim().toLowerCase());
    setHeaders(hdr);

    // Mapeamento: title, description, price, url, thumbnail_url, tags, external_id + qualquer outra coluna vira attribute
    const STANDARD = new Set(['title', 'titulo', 'título', 'description', 'descricao', 'descrição', 'price', 'preco', 'preço', 'url', 'link', 'thumbnail_url', 'foto', 'imagem', 'tags', 'external_id', 'id', 'images']);

    const items = rows.slice(1).map((r) => {
      const item: any = { attributes: {}, tags: [], images: [] };
      r.forEach((val, i) => {
        const h = hdr[i];
        const v = val.trim();
        if (!v) return;
        if (h === 'title' || h === 'titulo' || h === 'título') item.title = v;
        else if (h === 'description' || h === 'descricao' || h === 'descrição') item.description = v;
        else if (h === 'price' || h === 'preco' || h === 'preço') {
          const n = Number(v.replace(/[^\d.,-]/g, '').replace(',', '.'));
          item.price = isNaN(n) ? null : n;
        }
        else if (h === 'url' || h === 'link') item.url = v;
        else if (h === 'thumbnail_url' || h === 'foto' || h === 'imagem') item.thumbnail_url = v;
        else if (h === 'images') item.images = v.split('|').map((s) => s.trim()).filter(Boolean);
        else if (h === 'tags') item.tags = v.split('|').map((s) => s.trim()).filter(Boolean);
        else if (h === 'external_id' || h === 'id') item.external_id = v;
        else if (!STANDARD.has(h)) {
          const num = Number(v);
          item.attributes[h] = !isNaN(num) && v !== '' ? num : v;
        }
      });
      return item;
    }).filter((x) => x.title);

    setPreview(items);
    toast.success(`${items.length} itens prontos para importar`);
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    try {
      await importMut.mutateAsync({ product_id: productId, items: preview });
      setPreview([]);
      setHeaders([]);
    } catch {
      /* erro já sinalizado no onError da mutação; mantém o preview para retry */
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Importar planilha (CSV)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Colunas reconhecidas: <code className="text-xs">title, description, price, url, thumbnail_url, images, tags, external_id</code></p>
          <p>Demais colunas viram <strong>atributos</strong> de busca (ex: bairro, cidade, quartos, ano).</p>
          <p>Use <code className="text-xs">|</code> como separador para múltiplos valores em <code>images</code> e <code>tags</code>.</p>
        </div>

        <div>
          <Label>Arquivo CSV</Label>
          <Input type="file" accept=".csv,text/csv" onChange={(e) => {
            const f = e.target.files?.[0]; if (f) handleFile(f);
          }} />
        </div>

        {preview.length > 0 && (
          <>
            <div className="rounded-md border p-3 bg-muted/30 max-h-64 overflow-y-auto text-xs">
              <p className="font-medium mb-2">Pré-visualização ({preview.length} itens, primeiros 5):</p>
              {preview.slice(0, 5).map((it, i) => (
                <div key={i} className="py-1 border-b last:border-0">
                  <strong>{it.title}</strong>
                  {it.price && <span> · R$ {it.price}</span>}
                  {Object.keys(it.attributes).length > 0 && (
                    <span className="text-muted-foreground"> · {Object.entries(it.attributes).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ')}</span>
                  )}
                </div>
              ))}
            </div>
            <Button onClick={handleImport} disabled={importMut.isPending}>
              <Upload className="h-4 w-4 mr-2" />
              Importar {preview.length} itens
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
