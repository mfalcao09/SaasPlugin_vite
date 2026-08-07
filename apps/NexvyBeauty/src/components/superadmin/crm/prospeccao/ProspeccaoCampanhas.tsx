import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, Loader2, PackageSearch, Lock, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { SEG_META, SEG_KEYS, fmtNum } from '@/components/superadmin/crm/prospeccao/_shared';
import { ProspeccaoCampanhasControle } from '@/components/superadmin/crm/prospeccao/ProspeccaoCampanhasControle';
import type { LeadSegment } from '@/components/superadmin/crm/data/usePlatformProspeccao';

/**
 * CAMPANHAS DE DISPARO (UI) — duas seções, propósitos distintos:
 *
 * 1. CONTROLE (ProspeccaoCampanhasControle) — as campanhas REAIS de
 *    `platform_crm_cold_campaigns`: estado, agendamento, armar e desarmar.
 *    É a parte que governa o que sai de verdade.
 *
 * 2. COMPOSIÇÃO (abaixo) — rascunho de público e mensagem. Continua sendo uma
 *    bancada de trabalho: nada aqui é persistido nem enviado.
 *
 * HISTÓRICO — a tela nasceu só com a seção 2, e isso era o problema: chamava-se
 * "Campanhas" sem enxergar campanha alguma. As reais eram ligadas por UPDATE em
 * SQL, e foi assim que `TESTE Gate G` ficou `active` com `dry_run=false` e
 * janela 0h-24h, pronta para disparar ao primeiro lead que entrasse na fila.
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
          <ProspeccaoCampanhasControle productId={productId} />

          <div className="rounded-lg border border-border pt-2">
            <h2 className="text-lg font-semibold text-foreground px-4 pt-3">Rascunho de público e mensagem</h2>
            <p className="text-sm text-muted-foreground px-4 pb-3">
              Bancada de trabalho para dimensionar público e testar texto. Nada aqui é salvo nem enviado —
              o que dispara são as campanhas acima.
            </p>
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0" />
              {/* Não existe mais botão "Disparar" aqui, e a ausência é o ponto: disparo
                  agora é um ATO REGISTRADO (armar uma campanha), não um clique numa
                  bancada de rascunho. Um botão desabilitado sugeria que um dia ele
                  ligaria — sugestão errada sobre onde mora o controle. */}
              <span>
                Público de <b>{fmtNum(audienceN)}</b> leads neste recorte. Para disparar, arme uma campanha
                na seção acima — é lá que fica o registro de quem autorizou.
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ProspeccaoCampanhas;
