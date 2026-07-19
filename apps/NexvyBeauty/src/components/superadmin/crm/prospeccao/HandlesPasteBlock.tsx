import { useMemo, useState } from 'react';
import { ClipboardList, Loader2, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useImportHandles } from '@/components/superadmin/crm/data/usePlatformProspeccao';
import { ImportCard } from './ImportCard';
import { tallyHandles } from './instagram-handle';

/**
 * COLAR @HANDLES — a entrada manual da prospecção.
 *
 * Cola uma lista (um por linha, por vírgula ou espaço) → sanitiza com a MESMA regra
 * da edge (`instagram-handle.ts` replica `_shared/apify-leads.ts`) → mostra
 * válidos/inválidos/duplicados ANTES de gastar Apify → dispara a edge existente
 * `leads-import-handles` pelo hook que já existe (`useImportHandles`), que também já
 * cuida do invalidate e dos toasts. Este componente é SÓ a casca de entrada.
 *
 * A contagem daqui é sobre o TEXTO COLADO. O dedup contra a base já existente é
 * sempre da edge — o front nunca decide o que já está no banco.
 */

/** Teto da edge (`MAX_HANDLES` em leads-import-handles) — avisamos antes de cortar. */
const MAX_HANDLES = 200;

export function HandlesPasteBlock({
  productId,
  onStarted,
}: {
  productId: string | null;
  onStarted?: (r: { extraction_id: string; run_id: string; handles: number }) => void;
}) {
  const [text, setText] = useState('');
  const [done, setDone] = useState<{ handles: number } | null>(null);
  const importHandles = useImportHandles();

  const tally = useMemo(() => tallyHandles(text), [text]);
  const overflow = Math.max(0, tally.valid.length - MAX_HANDLES);

  const submit = () => {
    if (!productId || tally.valid.length === 0) return;
    setDone(null);
    importHandles.mutate(
      { product_id: productId, handles: tally.valid.slice(0, MAX_HANDLES) },
      {
        onSuccess: (r) => {
          setDone({ handles: r.handles });
          setText('');
          onStarted?.(r);
        },
      },
    );
  };

  return (
    <ImportCard
      icon="📋"
      title="Colar @handles"
      subtitle="Cole uma lista de @perfis — um por linha, separados por vírgula ou espaço."
      gives={<b className="text-foreground">uma lista de @perfis</b>}
      gets={<b className="text-foreground">cada perfil enriquecido no Apify</b>}
      headerAside={
        tally.valid.length > 0 ? (
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 tabular-nums">
            {tally.valid.length}
          </Badge>
        ) : null
      }
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        spellCheck={false}
        placeholder={'@salao.bella\n@studio.unhas\ninstagram.com/cabelo.da.ana'}
        className="resize-y font-mono text-xs"
        disabled={!productId || importHandles.isPending}
      />

      {/* Prévia: exatamente o que a edge vai receber, antes de gastar Apify. */}
      {tally.total > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            {tally.valid.length} válidos
          </Badge>
          {tally.duplicates > 0 && (
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
              {tally.duplicates} repetidos na lista
            </Badge>
          )}
          {tally.invalid > 0 && (
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
              {tally.invalid} inválidos
            </Badge>
          )}
          {overflow > 0 && (
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
              +{overflow} acima do limite de {MAX_HANDLES} — ficam de fora
            </Badge>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="gap-2"
          onClick={submit}
          disabled={!productId || tally.valid.length === 0 || importHandles.isPending}
        >
          {importHandles.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Importar @perfis
        </Button>
        {text.trim() && !importHandles.isPending && (
          <Button variant="ghost" size="sm" onClick={() => { setText(''); setDone(null); }}>
            Limpar
          </Button>
        )}
      </div>

      {done && (
        <div className="rounded-md border border-border p-3 flex items-start gap-2 text-xs text-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
          <span>
            <b>{done.handles}</b> @perfis enviados ao Apify. O enriquecimento roda em segundo plano —
            acompanhe em <b>Buscas</b>.
          </span>
        </div>
      )}

      {tally.total === 0 && !done && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5 shrink-0 mt-px" />
          Aceita @perfil, link do Instagram ou o username cru. Até {MAX_HANDLES} por vez.
        </p>
      )}
    </ImportCard>
  );
}

export default HandlesPasteBlock;
