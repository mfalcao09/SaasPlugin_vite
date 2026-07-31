import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, Loader2, PackageSearch, Lock, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { SEG_META, SEG_KEYS, fmtNum } from '@/components/superadmin/crm/prospeccao/_shared';
import type { LeadSegment } from '@/components/superadmin/crm/data/usePlatformProspeccao';

/**
 * CAMPANHAS DE DISPARO (UI) — compõe uma campanha para o público APROVADO da Base
 * consolidada (só quem passou no Portão). Escolhe segmento + canal, compõe a mensagem,
 * pré-visualiza e vê o tamanho do público — tudo real, lido do banco.
 *
 * HONESTO SOBRE O MOTOR: o disparo em massa está gated OFF (COLD_OUTREACH_ENABLED=false +
 * dry-run no motor platform-cold-outreach). Por isso o botão "Disparar" fica DESABILITADO e
 * não invoca nada — nada é enviado. Habilitar é decisão do Marcelo.
 */

type Channel = 'wpp_numero' | 'wpp_link' | 'ig_dm';
const CHANNELS: { key: Channel; label: string; hint: string }[] = [
  { key: 'wpp_numero', label: 'WhatsApp (número)', hint: 'telefone discável' },
  { key: 'wpp_link', label: 'WhatsApp (link)', hint: 'wa.me/message' },
  { key: 'ig_dm', label: 'Instagram DM', hint: 'sem WhatsApp' },
];

function useAudienceCount(productId: string | null, segment: LeadSegment | 'all', channel: Channel) {
  return useQuery({
    queryKey: ['prospeccao-audience', productId, segment, channel],
    enabled: !!productId,
    queryFn: async () => {
      let q = supabase
        .from('platform_crm_consolidated_leads' as never)
        .select('*', { count: 'exact', head: true })
        .eq('product_id', productId as string)
        .eq('is_excluded', false);
      if (segment !== 'all') q = q.eq('segment', segment);
      if (channel === 'wpp_numero') q = q.not('telefone', 'is', null);
      else if (channel === 'wpp_link') q = q.is('telefone', null).not('whatsapp_link', 'is', null);
      else q = q.is('telefone', null).is('whatsapp_link', null);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function ProspeccaoCampanhas() {
  const { effectiveProductId, activeProductId, products } = useActivePlatformProduct();
  const productId = effectiveProductId ?? null;
  const isAllProducts = activeProductId == null && products.length > 1;
  const [segment, setSegment] = useState<LeadSegment | 'all'>('salao_cliente');
  const [channel, setChannel] = useState<Channel>('wpp_numero');
  const [message, setMessage] = useState('Oi {{nome}}! Vi o seu trabalho no Instagram e queria te mostrar uma forma de trazer clientes de volta pelo WhatsApp. Posso te enviar?');
  const { data: audience, isLoading } = useAudienceCount(isAllProducts ? null : productId, segment, channel);

  const preview = message.replace(/\{\{\s*nome\s*\}\}/g, 'Marina');
  const audienceN = audience ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Send className="h-6 w-6 text-primary" /> Campanhas de disparo
        </h1>
        <p className="text-muted-foreground mt-1">
          Selecione o público <b>aprovado</b> da Base consolidada, componha a mensagem e dispare em massa. Só entram
          leads que passaram no Portão de aprovação.
        </p>
      </div>

      {isAllProducts ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
          <PackageSearch className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">Selecione um produto no topo (ex.: <b>NexvyBeauty</b>) para montar uma campanha.</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
            <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Disparo em massa DESLIGADO por segurança.</p>
              <p className="text-muted-foreground">
                O motor está gated OFF (<code>COLD_OUTREACH_ENABLED=false</code> + dry-run). Você pode montar e
                pré-visualizar a campanha aqui, mas o envio real depende da liberação do Marcelo. Nada é enviado
                enquanto este aviso estiver aqui.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Segmento</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(['all', ...SEG_KEYS] as (LeadSegment | 'all')[]).map((s) => (
                    <button key={s} type="button" onClick={() => setSegment(s)}
                      className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${segment === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:bg-muted'}`}>
                      {s === 'all' ? 'Todos' : `${SEG_META[s].dot} ${SEG_META[s].label}`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Canal</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {CHANNELS.map((c) => (
                    <button key={c.key} type="button" onClick={() => setChannel(c.key)} title={c.hint}
                      className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${channel === c.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:bg-muted'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm border-t border-border pt-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Público aprovado:</span>
              <span className="font-semibold text-foreground">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : `${fmtNum(audienceN)} leads`}
              </span>
              {!isLoading && audienceN === 0 && (
                <span className="text-xs text-muted-foreground">— aprove leads na tela de Buscas para crescer o público.</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <label className="text-sm font-medium text-foreground">
              Mensagem <span className="text-muted-foreground font-normal">(use {'{{nome}}'} para personalizar)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full h-28 rounded-md border border-border bg-background p-2 text-sm resize-y"
            />
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="text-xs text-muted-foreground mb-1">Prévia</div>
              <div className="text-foreground whitespace-pre-wrap">{preview}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button disabled className="gap-2">
                <Lock className="h-4 w-4" /> Disparar {fmtNum(audienceN)} (desligado)
              </Button>
              <span className="text-xs text-muted-foreground">Habilitação: decisão do Marcelo.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ProspeccaoCampanhas;
