import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Loader2, Power, PowerOff, Radio, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ProspeccaoCampanhaNova } from '@/components/superadmin/crm/prospeccao/ProspeccaoCampanhaNova';
import {
  avaliarLifecycle, lifecycleDaLinha,
} from '../../../../../supabase/functions/_shared/cold-outreach/campaign-lifecycle.ts';

/**
 * CONTROLE DE CAMPANHAS DE PROSPECÇÃO — armar, desarmar, agendar.
 *
 * ── POR QUE ESTA TELA EXISTE ──────────────────────────────────────────────
 * Até 2026-08-07 as campanhas reais viviam SÓ no banco: eram criadas e ligadas
 * por UPDATE em SQL. A tela "Campanhas de disparo" compunha uma mensagem em
 * estado local e nunca tocava `platform_crm_cold_campaigns` — ou seja, existia
 * uma tela de campanhas que não via campanha nenhuma.
 *
 * O efeito prático: a campanha `TESTE Gate G` ficou `active` com `dry_run=false`
 * e janela 0h-24h, e o primeiro lead que entrasse na fila viraria disparo em
 * menos de um minuto (o cron roda a cada minuto). Ninguém tinha onde ver isso.
 *
 * ── A REGRA QUE ESTA TELA TEM DE RESPEITAR ────────────────────────────────
 * `status` SOZINHO MENTE. Uma campanha `active` sem `activated_at` não dispara.
 * Se esta tela pintasse "Ativa" com base no status, repetiria na interface
 * exatamente o engano que o motor cometia.
 *
 * Por isso o selo vem de `avaliarLifecycle` — a MESMA função pura que o motor
 * usa (`supabase/functions/_shared/cold-outreach/campaign-lifecycle.ts`), que
 * não tem imports próprios e por isso é consumível dos dois lados. Não é
 * conveniência: é o que torna impossível a tela e o motor discordarem sobre o
 * que está no ar.
 */

interface CampanhaRow {
  id: string;
  name: string;
  channel: string;
  status: string;
  dry_run: boolean;
  activated_at: string | null;
  activated_by: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  paused_reason: string | null;
  sender_name: string | null;
  window_config: { startHour?: number; endHour?: number; days?: number[] } | null;
  warmup_config: { startPerDay?: number; maxPerDay?: number } | null;
  jitter_config: { minMs?: number; maxMs?: number } | null;
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * Converte o valor de um `<input type="datetime-local">` em ISO.
 *
 * O input devolve "2026-08-11T09:00", SEM fuso. `new Date(...)` interpreta essa
 * string no fuso do navegador — que é o que o operador quer dizer ao digitar
 * 09:00. O `.toISOString()` então grava o instante correto em UTC.
 * Tratar a string como UTC (concatenando "Z") deslocaria a campanha em 3 horas.
 */
function localParaIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Rótulo humano para cada motivo devolvido pelo ciclo de vida. */
function rotuloDoMotivo(motivo: string | null): string {
  if (!motivo) return 'Disparando';
  if (motivo === 'nao_autorizada') return 'Configurada, não armada';
  if (motivo === 'aguardando_agendamento') return 'Agendada';
  if (motivo === 'vigencia_encerrada') return 'Encerrada';
  if (motivo === 'autorizacao_no_futuro') return 'Autorização inválida';
  if (motivo.startsWith('estado_terminal:killed')) return 'Interrompida pelo anti-ban';
  if (motivo.startsWith('estado_terminal:completed')) return 'Concluída';
  if (motivo.startsWith('estado_nao_disparavel:paused')) return 'Desarmada';
  if (motivo.startsWith('estado_nao_disparavel:draft')) return 'Rascunho';
  return motivo;
}

function SeloEstado({ armada, motivo }: { armada: boolean; motivo: string | null }) {
  const rotulo = rotuloDoMotivo(motivo);
  if (armada) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/15 text-green-600 border border-green-500/30">
        <Radio className="h-3.5 w-3.5 animate-pulse" /> {rotulo}
      </span>
    );
  }
  // "Agendada" é o único "não disparando" que é um estado BOM — merece cor
  // própria, senão o operador lê como problema e desarma o que ele programou.
  const agendada = motivo === 'aguardando_agendamento';
  const cls = agendada
    ? 'bg-blue-500/15 text-blue-600 border-blue-500/30'
    : 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {agendada ? <CalendarClock className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />} {rotulo}
    </span>
  );
}

function useCampanhas(productId: string | null) {
  return useQuery({
    queryKey: ['cold-campanhas', productId],
    enabled: !!productId,
    // A campanha muda de estado SOZINHA (agendamento vence, anti-ban mata). Sem
    // refetch, a tela mostraria "Agendada" para algo que já começou a disparar.
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_cold_campaigns' as never)
        .select('*')
        .eq('product_id', productId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CampanhaRow[];
    },
  });
}

function DialogArmar({
  campanha, aberto, aoFechar,
}: { campanha: CampanhaRow | null; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');

  const armar = useMutation({
    mutationFn: async () => {
      if (!campanha) return;
      // RPC ausente de types.ts (gerado antes desta migration) — mesmo padrão de
      // cast já usado no projeto para funções novas (FirstAccessSuperAdminModal).
      const { error } = await supabase.rpc('pcrm_cold_arm_campaign' as never, {
        p_campaign: campanha.id,
        p_start: localParaIso(inicio),
        p_end: localParaIso(fim),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cold-campanhas'] });
      toast.success(inicio ? 'Campanha armada e agendada.' : 'Campanha armada — começa no próximo ciclo.');
      aoFechar();
      setInicio(''); setFim('');
    },
    onError: (e: Error) => toast.error(`Não foi possível armar: ${e.message}`),
  });

  if (!campanha) return null;
  const enviaDeVerdade = campanha.dry_run === false;
  const janelaInvalida = !!inicio && !!fim && new Date(fim) <= new Date(inicio);

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Power className="h-5 w-5 text-primary" /> Armar “{campanha.name}”
          </DialogTitle>
          <DialogDescription>
            Armar registra <b>quem</b> autorizou e <b>quando</b>. Sem esse registro o motor não dispara,
            mesmo com a campanha inteiramente configurada.
          </DialogDescription>
        </DialogHeader>

        {enviaDeVerdade && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">Esta campanha envia mensagens REAIS.</p>
              <p className="text-muted-foreground">
                <code>dry_run</code> está desligado. Ao armar, pessoas de verdade recebem WhatsApp
                de <b>{campanha.sender_name ?? 'remetente não definido'}</b> dentro da janela configurada.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Deixe as datas em branco para começar já. Preencha para programar — a campanha fica armada
            e só começa a disparar na data de início.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cold-inicio" className="text-xs">Começa em (opcional)</Label>
              <Input id="cold-inicio" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cold-fim" className="text-xs">Termina em (opcional)</Label>
              <Input id="cold-fim" type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          {janelaInvalida && (
            <p className="text-xs text-red-600">O término precisa ser depois do início.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar}>Cancelar</Button>
          <Button onClick={() => armar.mutate()} disabled={armar.isPending || janelaInvalida} className="gap-2">
            {armar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
            {inicio ? 'Armar e agendar' : 'Armar agora'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardCampanha({ c, aoArmar }: { c: CampanhaRow; aoArmar: (c: CampanhaRow) => void }) {
  const qc = useQueryClient();
  // MESMA função do motor. Se a regra mudar, muda nos dois ao mesmo tempo.
  const veredito = avaliarLifecycle(lifecycleDaLinha(c as unknown as Record<string, unknown>), new Date());

  const desarmar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('pcrm_cold_disarm_campaign' as never, {
        p_campaign: c.id,
        p_motivo: 'desarmada pelo operador na tela de campanhas',
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cold-campanhas'] });
      toast.success('Campanha desarmada. Nada mais será enviado.');
    },
    onError: (e: Error) => toast.error(`Não foi possível desarmar: ${e.message}`),
  });

  const excluir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('platform_crm_cold_campaigns' as never)
        .delete().eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cold-campanhas'] });
      toast.success('Campanha excluída.');
    },
    onError: (e: Error) => toast.error(`Não foi possível excluir: ${e.message}`),
  });

  const w = c.window_config ?? {};
  const dias = (w.days ?? []).map((d) => DIAS[d]).join(', ');
  const jit = c.jitter_config ?? {};
  const teto = c.warmup_config?.maxPerDay;
  const morta = c.status === 'killed' || c.status === 'completed';

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-foreground">{c.name}</h3>
          <p className="text-xs text-muted-foreground">
            {c.channel} · remetente {c.sender_name ?? '—'}
            {c.dry_run
              ? <span className="ml-2 text-amber-600 font-medium">simulação (dry-run)</span>
              : <span className="ml-2 text-red-600 font-medium">envio real</span>}
          </p>
        </div>
        <SeloEstado armada={veredito.armada} motivo={veredito.motivo} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs border-t border-border pt-3">
        <div>
          <div className="text-muted-foreground">Janela</div>
          <div className="text-foreground font-medium">{w.startHour ?? '—'}h–{w.endHour ?? '—'}h</div>
        </div>
        <div>
          <div className="text-muted-foreground">Dias</div>
          <div className="text-foreground font-medium">{dias || '—'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Teto/dia</div>
          <div className="text-foreground font-medium">{teto ?? '—'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Intervalo</div>
          <div className="text-foreground font-medium">
            {jit.minMs != null ? `${Math.round(jit.minMs / 1000)}–${Math.round((jit.maxMs ?? 0) / 1000)}s` : '—'}
          </div>
        </div>
      </div>

      {c.scheduled_start_at && (
        <p className="text-xs text-blue-600 flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          Programada para {new Date(c.scheduled_start_at).toLocaleString('pt-BR')}
          {c.scheduled_end_at && ` até ${new Date(c.scheduled_end_at).toLocaleString('pt-BR')}`}
        </p>
      )}

      {c.activated_at && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
          Autorizada em {new Date(c.activated_at).toLocaleString('pt-BR')}
        </p>
      )}

      {c.paused_reason && !veredito.armada && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{c.paused_reason}</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        {/* O botão segue o CARIMBO, não o selo: uma campanha agendada está
            desarmável — é justamente antes de começar que se quer cancelar. */}
        {c.activated_at ? (
          <Button variant="outline" size="sm" onClick={() => desarmar.mutate()} disabled={desarmar.isPending} className="gap-2">
            {desarmar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4" />}
            Desarmar
          </Button>
        ) : (
          <Button size="sm" onClick={() => aoArmar(c)} disabled={morta} className="gap-2">
            <Power className="h-4 w-4" /> Armar
          </Button>
        )}
        {morta && (
          <span className="text-xs text-muted-foreground">
            Interrompida pelo anti-ban — reativar exige revisão fora desta tela.
          </span>
        )}

        <div className="ml-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              {/* Excluir é bloqueado enquanto houver carimbo: desarmar primeiro é um
                  passo a mais de propósito, para que apagar nunca seja o gesto que
                  interrompe um disparo em curso. */}
              <Button
                variant="ghost" size="sm" disabled={!!c.activated_at}
                className="gap-2 text-muted-foreground hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir “{c.name}”?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>Isto não tem volta. Junto com a campanha vão embora, em cascata:</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      <li>os itens da <b>fila de disparo</b> dela;</li>
                      <li>os <b>contadores diários</b> (quanto já saiu por dia);</li>
                      <li>o <b>histórico de aquecimento do número</b> — o warm-up
                        recomeça do dia 1 na próxima campanha que usar esta instância.</li>
                    </ul>
                    <p>
                      As <b>mensagens já enviadas permanecem</b> no histórico das conversas —
                      elas não são apagadas, só deixam de apontar para uma campanha existente.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => excluir.mutate()}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Excluir definitivamente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

export function ProspeccaoCampanhasControle({ productId }: { productId: string | null }) {
  const { data: campanhas, isLoading } = useCampanhas(productId);
  const [alvo, setAlvo] = useState<CampanhaRow | null>(null);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando campanhas…
      </div>
    );
  }

  // O botão de criar aparece TAMBÉM no estado vazio — é exatamente aí que ele
  // mais falta. Uma tela que diz "nenhuma campanha" e não oferece criar obriga o
  // operador a sair para o SQL, que foi como as campanhas nasceram mal
  // configuradas até aqui.
  const cabecalho = (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-foreground">Campanhas</h2>
      <ProspeccaoCampanhaNova productId={productId} />
    </div>
  );

  if (!campanhas?.length) {
    return (
      <div className="space-y-3">
        {cabecalho}
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Nenhuma campanha cadastrada para este produto. Crie uma — ela nasce como rascunho e
          não dispara nada até você armá-la.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cabecalho}
      {campanhas.map((c) => <CardCampanha key={c.id} c={c} aoArmar={setAlvo} />)}
      <DialogArmar campanha={alvo} aberto={!!alvo} aoFechar={() => setAlvo(null)} />
    </div>
  );
}

export default ProspeccaoCampanhasControle;
