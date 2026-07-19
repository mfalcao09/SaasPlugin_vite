import { useState } from 'react';
import { Loader2, Search, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStartExtraction } from '@/components/superadmin/crm/data/usePlatformProspeccao';

/**
 * BLOCO "Nova busca por palavra-chave" (motor keyword-search do Apify) — REUSÁVEL.
 *
 * Extraído da tela Buscas (`PlatformProspeccaoManager`) para ser montado TAMBÉM na
 * página "Nova Importação" (a porta de entrada da prospecção). Encapsula o estado
 * próprio (keywords/limite) E o disparo (`useStartExtraction`), então o consumidor só
 * passa `productId` — não existe lógica de disparo duplicada em lugar nenhum.
 *
 *   variant='collapsed' → acordeão discreto. Usado na Buscas, onde a busca por keyword
 *                         é só MAIS UMA fonte (a maioria dos leads entra por importação).
 *   variant='card'      → bloco com peso visual igual aos demais (Nova Importação).
 *
 * A cópia do texto explicativo vive AQUI de propósito: a reclamação original do Marcelo
 * foi "se eu clicar em buscar leads, aquele motor roda onde? traz o quê?" — a resposta
 * tem de viajar junto com o botão, em QUALQUER tela que o monte.
 */

export const KEYWORD_SUGGESTED =
  'cabeleireira, escova progressiva, alongamento de unhas, design de sobrancelhas, esmalteria, micropigmentação, salão de beleza';

export function KeywordSearchBlock({
  productId,
  variant = 'card',
  onStarted,
}: {
  productId: string | null;
  variant?: 'card' | 'collapsed';
  /** Disparo OK — use p/ navegar ou revalidar a lista na tela consumidora. */
  onStarted?: (r: { extraction_id: string; run_id: string }) => void;
}) {
  const [keywords, setKeywords] = useState('');
  const [limit, setLimit] = useState(30);
  const [open, setOpen] = useState(variant === 'card');
  const start = useStartExtraction();

  const handleStart = () => {
    const kws = keywords.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 20);
    if (!productId || kws.length === 0) return;
    start.mutate(
      { product_id: productId, keywords: kws, limit },
      { onSuccess: (r) => onStarted?.(r) },
    );
  };

  const explain = (
    <>
      Roda o <b>keyword-search do Apify</b> no Instagram e cria uma busca NOVA.
      Hoje a maior parte dos leads <b>não vem daqui</b> — vem das importações
      (Prospectagram · Server API · Vídeo).
    </>
  );

  const form = (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground">Palavras-chave (separadas por vírgula)</label>
      <Input placeholder={KEYWORD_SUGGESTED} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="text-xs text-primary underline" onClick={() => setKeywords(KEYWORD_SUGGESTED)}>
          usar conjunto-ouro
        </button>
        <span className="text-xs text-muted-foreground">·</span>
        <label className="text-xs text-muted-foreground">perfis/keyword:</label>
        <Input
          type="number"
          className="w-20 h-8"
          min={5}
          max={100}
          value={limit}
          onChange={(e) => setLimit(Math.max(5, Math.min(100, Number(e.target.value) || 30)))}
        />
        <Button onClick={handleStart} disabled={start.isPending || !productId || !keywords.trim()} className="gap-2 ml-auto">
          {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar leads
        </Button>
      </div>
    </div>
  );

  if (variant === 'card') {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">🔎 Palavra-chave / hashtag (Apify)</h3>
        <p className="text-xs text-muted-foreground">{explain}</p>
        {form}
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-sm font-medium text-foreground hover:text-primary"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
        ➕ Nova busca por palavra-chave (Apify)
      </button>
      <p className="text-xs text-muted-foreground mt-1 pl-6">{explain}</p>
      {open && <div className="mt-3 pl-6">{form}</div>}
    </div>
  );
}

export default KeywordSearchBlock;
