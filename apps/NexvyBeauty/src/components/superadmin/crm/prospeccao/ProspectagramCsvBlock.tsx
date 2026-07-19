import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle, Phone, PhoneOff, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { ImportCard } from './ImportCard';
import {
  parseProspectagramCsv,
  chunkRecords,
  type ProspectagramParseResult,
  type ProspectagramRecord,
} from './prospectagram-csv';

/**
 * PROSPECTAGRAM (CSV) — sobe a base exportada do Prospectagram.
 *
 * O ARQUIVO NÃO SOBE AO SERVIDOR: o parse acontece aqui no navegador
 * (`prospectagram-csv.ts`, ancorado nas duas pontas porque o export não escapa
 * vírgula) e o que viaja são só os registros normalizados, em lotes.
 *
 * O fluxo é em 2 tempos de propósito: primeiro a PRÉVIA (quantas linhas, quantas
 * válidas, quantas com/sem WhatsApp, quantas descartadas), depois o envio. Uma base de
 * ~25 mil linhas não é coisa que se manda antes de olhar.
 */

/** Registros por requisição. O teto da edge é 500; 250 mantém cada POST pequeno. */
const BATCH_SIZE = 250;

interface BatchResponse {
  ok: boolean;
  day: string;
  label: string;
  extraction_id?: string;
  received: number;
  malformed: number;
  inserted: number;
  duplicates: number;
  total: number | null;
}

type Phase = 'idle' | 'parsing' | 'preview' | 'sending' | 'done' | 'error';

async function sendBatch(
  productId: string,
  records: ProspectagramRecord[],
  final: boolean,
): Promise<BatchResponse> {
  const { data, error } = await supabase.functions.invoke('leads-import-prospectagram-csv', {
    body: { product_id: productId, records, final },
  });
  if (error) {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
    const body = await ctx?.json?.().catch(() => null);
    throw new Error(body?.error ?? (error as Error).message ?? 'Falha ao enviar o lote');
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as BatchResponse;
}

export function ProspectagramCsvBlock({ productId }: { productId: string | null }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProspectagramParseResult | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [sent, setSent] = useState({ batches: 0, ofBatches: 0, inserted: 0, duplicates: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const reset = () => {
    setFileName(null);
    setPreview(null);
    setPhase('idle');
    setSent({ batches: 0, ofBatches: 0, inserted: 0, duplicates: 0 });
    setErrorMsg(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onPick = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setErrorMsg(null);
    setPreview(null);
    setPhase('parsing');
    try {
      const text = await file.text();
      setPreview(parseProspectagramCsv(text));
      setPhase('preview');
    } catch (e) {
      setErrorMsg((e as Error)?.message ?? 'Não consegui ler o arquivo.');
      setPhase('error');
    }
  };

  const send = async () => {
    if (!productId || !preview || preview.records.length === 0) return;
    setErrorMsg(null);
    setPhase('sending');
    const batches = chunkRecords(preview.records, BATCH_SIZE);
    setSent({ batches: 0, ofBatches: batches.length, inserted: 0, duplicates: 0 });
    try {
      // Sequencial de propósito: o dedup global da edge tem que enxergar o que os
      // lotes anteriores já inseriram — em paralelo, dois lotes com o mesmo @handle
      // se atropelariam.
      for (let i = 0; i < batches.length; i++) {
        const r = await sendBatch(productId, batches[i], i === batches.length - 1);
        setSent((s) => ({
          batches: i + 1,
          ofBatches: batches.length,
          inserted: s.inserted + r.inserted,
          duplicates: s.duplicates + r.duplicates,
        }));
      }
      setPhase('done');
      qc.invalidateQueries({ queryKey: ['platform-lead-extractions', productId] });
      qc.invalidateQueries({ queryKey: ['platform-consolidated-leads'] });
    } catch (e) {
      setErrorMsg((e as Error)?.message ?? 'Falha ao enviar os registros.');
      setPhase('error');
    }
  };

  const busy = phase === 'parsing' || phase === 'sending';
  const pct = sent.ofBatches > 0 ? Math.round((sent.batches / sent.ofBatches) * 100) : 0;

  return (
    <ImportCard
      icon="📸"
      title="Prospectagram (CSV)"
      subtitle="Suba o CSV exportado do Prospectagram — o arquivo é lido aqui, não sobe ao servidor."
      gives={<b className="text-foreground">o CSV do Prospectagram</b>}
      gets={<b className="text-foreground">os leads na busca do dia, sem duplicar</b>}
      headerAside={
        preview && !preview.headerMismatch ? (
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 tabular-nums">
            {preview.validRows}
          </Badge>
        ) : null
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        disabled={busy || !productId}
      />

      {!fileName ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => inputRef.current?.click()}
          disabled={!productId}
        >
          <Upload className="h-4 w-4" /> Selecionar CSV
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className="gap-1 bg-muted text-foreground border-border max-w-full">
            <FileSpreadsheet className="h-3 w-3 shrink-0" /> <span className="truncate">{fileName}</span>
          </Badge>
          {!busy && <Button variant="ghost" size="sm" onClick={reset}>Trocar</Button>}
        </div>
      )}

      {phase === 'parsing' && (
        <div className="rounded-md border border-border p-3 flex items-center gap-2 text-xs text-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" /> Lendo e conferindo o arquivo…
        </div>
      )}

      {preview?.headerMismatch && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Isso não parece o export do Prospectagram</AlertTitle>
          <AlertDescription>
            O cabeçalho esperado começa em <b>username</b> e traz <b>whatsappEditado</b>.
          </AlertDescription>
        </Alert>
      )}

      {/* PRÉVIA — o que o arquivo tem, antes de mandar qualquer coisa. */}
      {preview && !preview.headerMismatch && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="bg-muted text-foreground border-border">
              {preview.totalRows} linhas
            </Badge>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              {preview.validRows} válidas
            </Badge>
            {preview.duplicateRows > 0 && (
              <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                {preview.duplicateRows} repetidas no arquivo
              </Badge>
            )}
            {preview.invalidRows > 0 && (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                {preview.invalidRows} inválidas
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-green-500/30 bg-green-500/5 p-2.5">
              <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                <Phone className="h-3.5 w-3.5 shrink-0" /> Com WhatsApp
              </div>
              <div className="text-xl font-bold text-foreground tabular-nums mt-1">{preview.withWhatsapp}</div>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-2.5">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                <PhoneOff className="h-3.5 w-3.5 shrink-0" /> Sem WhatsApp
              </div>
              <div className="text-xl font-bold text-foreground tabular-nums mt-1">{preview.withoutWhatsapp}</div>
            </div>
          </div>
        </div>
      )}

      {phase === 'preview' && preview && !preview.headerMismatch && preview.validRows > 0 && (
        <Button size="sm" className="gap-2" onClick={send} disabled={!productId}>
          <Send className="h-4 w-4" /> Importar {preview.validRows} leads
        </Button>
      )}

      {phase === 'sending' && (
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            Enviando lote {sent.batches}/{sent.ofBatches} — {sent.inserted} novos até agora
          </div>
          <Progress value={pct} />
        </div>
      )}

      {phase === 'error' && errorMsg && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não deu certo</AlertTitle>
          <AlertDescription>
            {errorMsg}
            {sent.batches > 0 && (
              <>
                {' '}Os {sent.inserted} leads dos {sent.batches} primeiros lotes já entraram —
                reenviar o mesmo arquivo não duplica.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {phase === 'done' && (
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-start gap-2 text-xs text-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
            <span>
              <b>{sent.inserted}</b> leads novos na busca do dia
              {sent.duplicates > 0 && <> · <b>{sent.duplicates}</b> já estavam na base</>}.
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>Importar outro CSV</Button>
        </div>
      )}

      {phase === 'idle' && (
        <p className="text-[11px] text-muted-foreground">
          O export do Prospectagram vem com linhas quebradas (vírgula no nome do perfil).
          A leitura é ancorada nas duas pontas, então elas são recuperadas — e o que não
          for confiável entra na conta de <b>inválidas</b>.
        </p>
      )}
    </ImportCard>
  );
}

export default ProspectagramCsvBlock;
