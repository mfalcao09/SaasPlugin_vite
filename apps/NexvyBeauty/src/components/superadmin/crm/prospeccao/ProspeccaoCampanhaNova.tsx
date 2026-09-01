import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Plus, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

/**
 * CRIAÇÃO DE CAMPANHA DE PROSPECÇÃO.
 *
 * ── OS DEFAULTS SÃO A PARTE IMPORTANTE DESTE ARQUIVO ──────────────────────
 * A campanha nasce `draft` + `dry_run=true` + janela comercial + jitter humano.
 * Não é conservadorismo decorativo: a campanha anterior (`TESTE Gate G`) tinha
 * janela 0h-24h todos os dias e intervalo de 1-3 SEGUNDOS, e ficou assim porque
 * foi criada por INSERT manual — onde o default de um formulário não existe.
 *
 * Para uma campanha criada aqui virar disparo real são precisas DUAS decisões
 * conscientes e separadas: desligar o `dry_run` e depois ARMAR. Nenhuma das duas
 * acontece por descuido de quem só queria salvar a configuração.
 *
 * ── POR QUE O INSERT PODE SER DIRETO ──────────────────────────────────────
 * A RLS de `platform_crm_cold_campaigns` é super_admin-only. E ainda que alguém
 * inserisse `status='active'` por fora, não dispararia: sem `activated_at` o
 * ciclo de vida recusa, e `activated_at` só é escrito por
 * `pcrm_cold_arm_campaign`. Criar e autorizar são atos separados no BANCO, não
 * apenas na tela.
 */

const FUSO = 'America/Sao_Paulo';
const DIAS = [
  { n: 1, label: 'seg' }, { n: 2, label: 'ter' }, { n: 3, label: 'qua' },
  { n: 4, label: 'qui' }, { n: 5, label: 'sex' }, { n: 6, label: 'sáb' }, { n: 0, label: 'dom' },
];

interface Agente { id: string; name: string; agent_type: string; is_active: boolean }
interface Instancia { id: string; name: string; status: string; phone_number: string | null }

function useAgentes(productId: string | null) {
  return useQuery({
    queryKey: ['cold-agentes', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_product_agents' as never)
        .select('id, name, agent_type, is_active')
        .eq('product_id', productId as string)
        .eq('is_active', true);
      if (error) throw error;
      return (data ?? []) as unknown as Agente[];
    },
  });
}

function useInstancias(productId: string | null) {
  return useQuery({
    queryKey: ['cold-instancias', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_wa_qr_instances' as never)
        .select('id, name, status, phone_number')
        .eq('product_id', productId as string);
      if (error) throw error;
      return (data ?? []) as unknown as Instancia[];
    },
  });
}

export function ProspeccaoCampanhaNova({ productId }: { productId: string | null }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);

  const [nome, setNome] = useState('');
  const [agenteId, setAgenteId] = useState('');
  const [instanciaId, setInstanciaId] = useState('');
  const [remetente, setRemetente] = useState('');
  const [horaIni, setHoraIni] = useState(9);
  const [horaFim, setHoraFim] = useState(18);
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [tetoInicial, setTetoInicial] = useState(20);
  const [tetoMax, setTetoMax] = useState(200);
  const [jitterMin, setJitterMin] = useState(40);
  const [jitterMax, setJitterMax] = useState(180);
  const [simulacao, setSimulacao] = useState(true);

  const { data: agentes } = useAgentes(productId);
  const { data: instancias } = useInstancias(productId);

  const instanciaEscolhida = instancias?.find((i) => i.id === instanciaId);
  const instanciaOffline = !!instanciaEscolhida && instanciaEscolhida.status !== 'connected';

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('platform_crm_cold_campaigns' as never).insert({
        product_id: productId,
        name: nome.trim(),
        channel: 'whatsapp',
        // Nasce em rascunho, SEMPRE. Quem decide disparar é o ato de armar.
        status: 'draft',
        dry_run: simulacao,
        agent_id: agenteId || null,
        instance_id: instanciaId || null,
        sender_name: remetente.trim() || null,
        window_config: { startHour: horaIni, endHour: horaFim, days: dias, timeZone: FUSO },
        warmup_config: { startPerDay: tetoInicial, doublingEveryDays: 2, maxPerDay: tetoMax },
        // O banco guarda milissegundos; o formulário fala em segundos, que é como
        // uma pessoa pensa em "intervalo entre mensagens".
        jitter_config: { minMs: jitterMin * 1000, maxMs: jitterMax * 1000 },
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cold-campanhas'] });
      toast.success('Campanha criada como rascunho. Ela não dispara até você armá-la.');
      setAberto(false);
      setNome(''); setRemetente(''); setAgenteId(''); setInstanciaId('');
    },
    onError: (e: Error) => toast.error(`Não foi possível criar: ${e.message}`),
  });

  const alternarDia = (n: number) =>
    setDias((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort()));

  const jitterInvalido = jitterMax < jitterMin;
  const janelaInvalida = horaFim <= horaIni;
  const podeCriar = nome.trim().length > 1 && dias.length > 0 && !jitterInvalido && !janelaInvalida;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" disabled={!productId}>
          <Plus className="h-4 w-4" /> Nova campanha
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova campanha de prospecção</DialogTitle>
          <DialogDescription>
            Ela nasce como <b>rascunho</b> e não dispara nada. Depois de criada, você arma — e é o
            ato de armar que registra quem autorizou.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="camp-nome">Nome</Label>
            <Input
              id="camp-nome" value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Salões SP — agosto"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="camp-agente">Agente que atende as respostas</Label>
              <select
                id="camp-agente" value={agenteId} onChange={(e) => setAgenteId(e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">Selecione…</option>
                {agentes?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.agent_type === 'prospector' ? ' (prospecção)' : ` (${a.agent_type})`}
                  </option>
                ))}
              </select>
              {/* O pin da persona é o que impede a conversa cair na SDR genérica —
                  defeito real medido em 2026-08-06, quando a prospecção era
                  atendida pela Duda porque a conversa nascia sem agente. */}
              <p className="text-xs text-muted-foreground">
                Quem responde quando o lead responder. Sem isso, a conversa cai na SDR padrão.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="camp-inst">Número que envia</Label>
              <select
                id="camp-inst" value={instanciaId} onChange={(e) => setInstanciaId(e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">Selecione…</option>
                {instancias?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {i.phone_number ?? 'sem número'} · {i.status}
                  </option>
                ))}
              </select>
              {instanciaOffline && (
                <p className="text-xs text-amber-600 flex items-start gap-1.5">
                  <WifiOff className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Esta instância está <b>{instanciaEscolhida?.status}</b> — não está conectada ao
                  WhatsApp. Dá para criar a campanha, mas o envio só funciona depois de ler o QR.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="camp-rem">Nome de quem assina as mensagens</Label>
            <Input
              id="camp-rem" value={remetente} onChange={(e) => setRemetente(e.target.value)}
              placeholder="Ex.: Camila" className="max-w-xs"
            />
          </div>

          <div className="border-t border-border pt-4 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Quando pode enviar</h4>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="camp-ini" className="text-xs">Das</Label>
                <Input
                  id="camp-ini" type="number" min={0} max={23} className="w-20"
                  value={horaIni} onChange={(e) => setHoraIni(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="camp-fim" className="text-xs">Até</Label>
                <Input
                  id="camp-fim" type="number" min={1} max={24} className="w-20"
                  value={horaFim} onChange={(e) => setHoraFim(Number(e.target.value))}
                />
              </div>
              <p className="text-xs text-muted-foreground pb-2">horário de Brasília</p>
            </div>
            {janelaInvalida && (
              <p className="text-xs text-red-600">O fim precisa ser depois do início.</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map((d) => (
                <button
                  key={d.n} type="button" onClick={() => alternarDia(d.n)}
                  className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                    dias.includes(d.n)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {dias.length === 0 && <p className="text-xs text-red-600">Escolha ao menos um dia.</p>}
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Ritmo (proteção do número)</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="camp-t0" className="text-xs">Teto no 1º dia</Label>
                <Input id="camp-t0" type="number" min={1} value={tetoInicial}
                  onChange={(e) => setTetoInicial(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="camp-tm" className="text-xs">Teto máximo/dia</Label>
                <Input id="camp-tm" type="number" min={1} value={tetoMax}
                  onChange={(e) => setTetoMax(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="camp-jm" className="text-xs">Intervalo mín. (s)</Label>
                <Input id="camp-jm" type="number" min={1} value={jitterMin}
                  onChange={(e) => setJitterMin(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="camp-jx" className="text-xs">Intervalo máx. (s)</Label>
                <Input id="camp-jx" type="number" min={1} value={jitterMax}
                  onChange={(e) => setJitterMax(Number(e.target.value))} />
              </div>
            </div>
            {jitterInvalido && (
              <p className="text-xs text-red-600">O intervalo máximo não pode ser menor que o mínimo.</p>
            )}
            {(jitterMin < 20 || tetoInicial > 50) && (
              <p className="text-xs text-amber-600 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Ritmo agressivo para um número novo. O padrão sugerido — 20/dia dobrando a cada 2
                dias, 40–180s entre mensagens — existe para o WhatsApp não ler os envios como spam.
              </p>
            )}
          </div>

          <div className="border-t border-border pt-4 flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="camp-dry" className="text-sm font-semibold">Modo simulação</Label>
              <p className="text-xs text-muted-foreground max-w-md">
                Ligado, o motor percorre a fila e registra tudo, <b>sem enviar mensagem nenhuma</b>.
                É como testar sem risco. Desligue só quando for para valer.
              </p>
            </div>
            <Switch id="camp-dry" checked={simulacao} onCheckedChange={setSimulacao} />
          </div>

          {!simulacao && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                <b className="text-foreground">Simulação desligada.</b> Quando esta campanha for armada,
                pessoas reais receberão mensagens. Criar ainda é seguro — nada sai antes de armar.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
          <Button onClick={() => criar.mutate()} disabled={!podeCriar || criar.isPending} className="gap-2">
            {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar rascunho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ProspeccaoCampanhaNova;
