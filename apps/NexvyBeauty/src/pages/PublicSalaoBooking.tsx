// PublicSalaoBooking — agendamento público do salão (rota /s/:slug).
// Wizard de 5 passos sobre as edge fns públicas (salao-public-bootstrap /
// salao-availability / salao-public-booking). Sem auth.
//
// A jornada é uma COMANDA (cesta), não um serviço solto: o cliente acumula N
// serviços, o servidor monta os roteiros possíveis (mesmo profissional em bloco
// corrido, dois profissionais em sequência, ou fracionado com intervalo) e ele
// escolhe um. Pagamento é só intenção — quem cobra é o salão, no balcão.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight, Check, ChevronLeft, Clock, CreditCard, Loader2, Mail, Minus, Package,
  Phone, Plus, ShoppingBag, Sparkles, Store, User, Users, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatAddress, type OrgAddress } from '@/lib/formatAddress';
import { usePlatformBranding } from '@/hooks/usePlatformBranding';
import { ComandaBar } from '@/components/booking/publico/ComandaBar';
import {
  formatarDuracao, formatarMoeda, precoEfetivo, useComandaBooking,
  type ModoAtendimento, type ProdutoPublico, type ProfissionalPublico,
  type RegraCrossSell, type Roteiro, type ServicoPublico,
} from '@/hooks/useComandaBooking';

type Bootstrap = {
  // address é jsonb no banco — nunca string. O tipo antigo mentia e derrubava a página.
  org: { id: string; name: string; logo_url: string | null; phone: string | null; address: OrgAddress; slug: string };
  servicos: ServicoPublico[];
  profissionais: ProfissionalPublico[];
  pacotes: { id: string; nome: string }[];
  cross_sell: RegraCrossSell[];
  produtos: ProdutoPublico[];
};

const PAGAMENTOS = [
  { valor: 'pix', rotulo: 'PIX no local' },
  { valor: 'cartao_credito', rotulo: 'Cartão de crédito' },
  { valor: 'cartao_debito', rotulo: 'Cartão de débito' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
] as const;

const STEPS = ['Serviços', 'Atendimento', 'Horário', 'Seus dados', 'Confirmar'];

const hojeISO = () => new Date().toISOString().slice(0, 10);
const fmtBR = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};
/** Minutos entre dois "HH:MM" — usado para desenhar o vão entre paradas do roteiro. */
const minutosEntre = (fim: string, inicio: string) => {
  const p = (h: string) => { const [a, b] = h.split(':').map(Number); return (a || 0) * 60 + (b || 0); };
  return Math.max(0, p(inicio) - p(fim));
};
const inicial = (nome: string) => (nome ?? '').trim().charAt(0).toUpperCase();
/** Máscara brasileira progressiva: (11) 91234-5678 */
function mascararTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function PublicSalaoBooking() {
  const { slug = '' } = useParams();
  const [step, setStep] = useState(1);
  const [modo, setModo] = useState<ModoAtendimento | null>(null);
  const [profPreferido, setProfPreferido] = useState('');
  const [data, setData] = useState(hojeISO());
  const [roteiroIdx, setRoteiroIdx] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [pagamento, setPagamento] = useState<string>('');
  const [done, setDone] = useState<{
    itens: Array<{ servico_nome: string; profissional_nome: string; hora: string }>;
    data: string; total: number; whatsapp: boolean;
  } | null>(null);

  const boot = useQuery({
    queryKey: ['salao-bootstrap', slug],
    queryFn: async (): Promise<Bootstrap> => {
      const { data: r, error } = await supabase.functions.invoke('salao-public-bootstrap', { body: { slug } });
      if (error) throw error;
      if ((r as any)?.error) throw new Error((r as any).error);
      return r as Bootstrap;
    },
    enabled: !!slug,
    retry: false,
  });

  const catalogo = boot.data?.servicos ?? [];
  const comanda = useComandaBooking(catalogo, boot.data?.cross_sell ?? [], boot.data?.produtos ?? []);

  const principais = useMemo(
    () => catalogo.filter((s) => (s.tipo ?? 'principal') !== 'extra'),
    [catalogo],
  );

  /** id do combo -> "Corte feminino + Escova". Nomes resolvidos do próprio catálogo. */
  const combos = useMemo(() => {
    const nomePorId = new Map(catalogo.map((s) => [s.id, s.nome]));
    const mapa = new Map<string, string>();
    for (const s of catalogo) {
      const partes = (s.combo_servico_ids ?? [])
        .map((id) => nomePorId.get(id))
        .filter(Boolean) as string[];
      if (partes.length > 0) mapa.set(s.id, partes.join(' + '));
    }
    return mapa;
  }, [catalogo]);

  const tracking = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    return {
      utm_source: q.get('utm_source') ?? undefined,
      utm_medium: q.get('utm_medium') ?? undefined,
      utm_campaign: q.get('utm_campaign') ?? undefined,
      ref: q.get('ref') ?? undefined,
    };
  }, []);

  useEffect(() => {
    const ref = tracking.ref?.trim();
    if (!ref) return;
    void (supabase as any).rpc('record_affiliate_click', { p_ref: ref });
  }, [tracking.ref]);

  const disponibilidade = useQuery({
    queryKey: ['salao-roteiros', slug, comanda.ids, data, modo, profPreferido],
    queryFn: async (): Promise<{ roteiros: Roteiro[]; aviso?: string }> => {
      const { data: r, error } = await supabase.functions.invoke('salao-availability', {
        body: {
          slug,
          servico_ids: comanda.ids,
          data,
          modo: modo ?? 'auto',
          profissional_id: modo === 'preferido' ? profPreferido : undefined,
        },
      });
      if (error) throw error;
      return { roteiros: (r as any)?.roteiros ?? [], aviso: (r as any)?.aviso };
    },
    enabled: step === 3 && !!slug && comanda.ids.length > 0 && !!data && !!modo,
  });

  const roteiros = disponibilidade.data?.roteiros ?? [];
  const roteiro = roteiroIdx != null ? roteiros[roteiroIdx] : undefined;

  const submit = useMutation({
    mutationFn: async () => {
      if (!roteiro) throw new Error('Escolha um horário');
      const { data: r, error } = await supabase.functions.invoke('salao-public-booking', {
        body: {
          slug,
          cliente_nome: nome,
          cliente_telefone: telefone,
          cliente_email: email,
          forma_pagamento: pagamento || undefined,
          tracking,
          itens: roteiro.itens.map((i) => ({
            servico_id: i.servico_id,
            profissional_id: i.profissional_id,
            data,
            hora: i.inicio,
            execution_order: i.execution_order,
          })),
          produtos: comanda.itensProduto.map(({ produto, quantidade }) => ({
            produto_id: produto.id,
            quantidade,
          })),
        },
      });
      if (error) {
        // edge fn devolve 409/4xx com {error} — supabase-js encapsula em FunctionsHttpError
        const ctx = (error as any)?.context;
        if (ctx?.json) {
          try {
            const body = await ctx.json();
            if (body?.error) throw new Error(body.error);
          } catch (e) { if (e instanceof Error && e.message) throw e; }
        }
        throw error;
      }
      if ((r as any)?.error) throw new Error((r as any).error);
      return r as any;
    },
    onSuccess: (r) => {
      setDone({
        itens: (r.itens ?? []).map((i: any) => ({
          servico_nome: i.servico_nome,
          profissional_nome: i.profissional_nome,
          hora: String(i.hora).slice(0, 5),
        })),
        data: r.data,
        total: Number(r.valor_total ?? 0),
        whatsapp: !!r.whatsapp_enviado,
      });
      toast.success('Agendamento confirmado!');
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Não foi possível agendar');
      // Horário tomado no meio do caminho: volta pro passo do horário e recarrega.
      if (String(e?.message ?? '').includes('indisponível')) {
        setRoteiroIdx(null);
        setStep(3);
        void disponibilidade.refetch();
      }
    },
  });

  if (boot.isLoading) {
    return <Centered><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="mt-3 text-muted-foreground">Carregando…</p></Centered>;
  }
  if (boot.isError || !boot.data) {
    return <Centered><Store className="h-10 w-10 text-muted-foreground" /><p className="mt-3 text-lg font-medium">Negócio não encontrado</p></Centered>;
  }
  const { org, profissionais } = boot.data;

  if (done) {
    return (
      <Centered>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15"><Check className="h-8 w-8 text-emerald-500" /></div>
        <h1 className="mt-4 text-2xl font-bold">Agendamento confirmado!</h1>
        <p className="mt-1 text-muted-foreground">{fmtBR(done.data)}</p>
        <div className="mt-4 w-full max-w-sm space-y-2 text-left">
          {done.itens.map((i, n) => (
            <div key={n} className="flex items-center justify-between rounded-xl border p-3 text-sm">
              <div>
                <div className="font-medium">{i.servico_nome}</div>
                <div className="text-xs text-muted-foreground">com {i.profissional_nome}</div>
              </div>
              <span className="font-semibold">{i.hora}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 font-semibold">Total: {formatarMoeda(done.total)}</p>
        {done.whatsapp && <p className="mt-2 text-sm text-emerald-600">Confirmação enviada por WhatsApp 📱</p>}
        <Button
          className="mt-6"
          variant="outline"
          onClick={() => {
            setDone(null); setStep(1); comanda.limpar(); setModo(null); setProfPreferido('');
            setRoteiroIdx(null); setNome(''); setTelefone(''); setEmail(''); setPagamento('');
          }}
        >
          Novo agendamento
        </Button>
      </Centered>
    );
  }

  const podeAvancar =
    step === 1 ? comanda.itens.length > 0
      : step === 2 ? (modo === 'auto' || modo === 'unico' || (modo === 'preferido' && !!profPreferido))
        : step === 3 ? roteiroIdx != null
          : step === 4 ? (nome.trim().length >= 2 && telefone.replace(/\D/g, '').length >= 10)
            : true;

  const endereco = formatAddress(org.address);
  const avancar = () => setStep((s) => Math.min(5, s + 1));

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Cabeçalho institucional: o gradiente da marca (vinho→rosé) existia nos tokens
          e não era usado em lugar nenhum — a página inteira era cinza. */}
      <header className="border-b bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-5">
          <div className="flex min-w-0 items-center gap-3.5">
            {/* Foto do salão quando houver; o gradiente da marca é o fallback. */}
            {org.logo_url ? (
              <img
                src={org.logo_url}
                alt={org.name}
                className="h-11 w-11 shrink-0 rounded-2xl object-cover shadow-md ring-1 ring-black/5"
              />
            ) : (
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-primary-foreground shadow-md shadow-primary/25"
                style={{ backgroundImage: 'var(--gradient-signature)' }}
              >
                <Sparkles className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-semibold tracking-tight text-foreground">{org.name}</h1>
              {endereco && <p className="truncate text-xs text-muted-foreground">{endereco}</p>}
            </div>
          </div>
          {boot.data.pacotes.length > 0 && (
            <Button asChild variant="outline" size="sm"><Link to={`/s/${slug}/pacotes`}><Package className="mr-1 h-4 w-4" />Pacotes</Link></Button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        <Stepper step={step} />

        <div className="mt-6 space-y-4">
          {/* 1. Catálogo + cross-sell */}
          {step === 1 && (
            <>
              <div>
                <h2 className="text-lg font-semibold">O que você quer fazer?</h2>
                <p className="text-sm text-muted-foreground">Escolha quantos serviços quiser — montamos a agenda pra você.</p>
              </div>

              {comanda.sugestoes.length > 0 && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm font-medium">Quem faz isso também costuma levar:</p>
                  <div className="mt-3 space-y-2">
                    {comanda.sugestoes.slice(0, 3).map((s) => (
                      <div key={s.id} className="flex items-center gap-3 rounded-lg bg-background/70 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{s.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            +{formatarDuracao(s.duracao_minutos ?? 60)} ·{' '}
                            {s.preco_promocional != null && (
                              <span className="line-through">{formatarMoeda(s.valor)} </span>
                            )}
                            <span className={s.preco_promocional != null ? 'font-semibold text-primary' : ''}>
                              {formatarMoeda(precoEfetivo(s))}
                            </span>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => comanda.adicionar(s.id)}>
                          <Plus className="mr-1 h-3.5 w-3.5" />Adicionar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => comanda.dispensar(s.id)}>Agora não</Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Grid>
                {principais.map((s) => {
                  const escolhido = comanda.temItem(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={escolhido}
                      onClick={() => comanda.alternar(s.id)}
                      className={`group rounded-2xl border p-4 text-left transition-all duration-200 ${
                        escolhido
                          ? 'border-primary/60 bg-primary/[0.06] shadow-md shadow-primary/10'
                          : 'border-border/70 shadow-sm hover:border-primary/30 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {s.imagem_url && (
                          <img
                            src={s.imagem_url} alt="" loading="lazy"
                            className="h-16 w-16 shrink-0 rounded-xl object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          {s.categoria && (
                            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary/70">
                              {s.categoria}
                            </span>
                          )}
                          <div className="mt-0.5 font-medium leading-snug">{s.nome}</div>
                          {/* combo anuncia o que inclui — é o que justifica o preço fechado */}
                          {combos.get(s.id) && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              inclui {combos.get(s.id)}
                            </div>
                          )}
                          <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />{formatarDuracao(s.duracao_minutos ?? 60)}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="text-right">
                            {s.preco_promocional != null && (
                              <span className="block text-[11px] tabular-nums text-muted-foreground line-through">
                                {formatarMoeda(s.valor)}
                              </span>
                            )}
                            <span className={`text-sm font-semibold tabular-nums ${s.preco_promocional != null ? 'text-primary' : ''}`}>
                              {formatarMoeda(precoEfetivo(s))}
                            </span>
                          </span>
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                            escolhido
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/25 text-muted-foreground group-hover:border-primary/50 group-hover:text-primary'
                          }`}>
                            {escolhido ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {principais.length === 0 && <Empty>Nenhum serviço disponível.</Empty>}
              </Grid>
            </>
          )}

          {/* 2. Preferência de atendimento */}
          {step === 2 && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Como prefere ser atendida?</h2>
                <p className="text-sm text-muted-foreground">
                  {comanda.itens.length} {comanda.itens.length === 1 ? 'serviço' : 'serviços'}, {formatarDuracao(comanda.duracaoTotal)} no total.
                </p>
              </div>
              <div className="space-y-3">
                <OpcaoModo
                  ativo={modo === 'unico'} onClick={() => { setModo('unico'); setProfPreferido(''); setRoteiroIdx(null); }}
                  icone={<User className="h-5 w-5" />}
                  titulo="Tudo com a mesma pessoa"
                  descricao="Só mostramos quem consegue fazer todos os serviços da comanda."
                />
                <OpcaoModo
                  ativo={modo === 'preferido'} onClick={() => { setModo('preferido'); setRoteiroIdx(null); }}
                  icone={<Sparkles className="h-5 w-5" />}
                  titulo="Tenho preferência"
                  descricao="Sua profissional favorita faz o que puder; o resto fica com a equipe."
                />
                <OpcaoModo
                  ativo={modo === 'auto'} onClick={() => { setModo('auto'); setProfPreferido(''); setRoteiroIdx(null); }}
                  icone={<Users className="h-5 w-5" />}
                  titulo="Tanto faz — quero o mais rápido"
                  descricao="Combinamos a equipe pra encaixar no melhor horário."
                />
              </div>

              {modo === 'preferido' && (
                <div className="pt-2">
                  <Label className="mb-2 block text-sm">Com quem você prefere?</Label>
                  <Grid>
                    {profissionais.map((p) => (
                      <PickCard key={p.id} active={profPreferido === p.id} onClick={() => { setProfPreferido(p.id); setRoteiroIdx(null); }}>
                        <div className="font-medium">{p.nome}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          {p.especialidades?.[0] && <Badge variant="secondary" className="text-[10px]">{p.especialidades[0]}</Badge>}
                          {p.hora_inicio && p.hora_fim && <span>{p.hora_inicio.slice(0, 5)}–{p.hora_fim.slice(0, 5)}</span>}
                        </div>
                      </PickCard>
                    ))}
                    {profissionais.length === 0 && <Empty>Nenhum profissional disponível.</Empty>}
                  </Grid>
                </div>
              )}
            </>
          )}

          {/* 3. Data + roteiros */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="data">Para quando?</Label>
                <Input
                  id="data" type="date" min={hojeISO()} value={data}
                  onChange={(e) => { setData(e.target.value); setRoteiroIdx(null); }}
                  className="mt-1 max-w-xs"
                />
              </div>

              {disponibilidade.isFetching && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />Montando as opções…
                </p>
              )}

              {!disponibilidade.isFetching && roteiros.length === 0 && (
                <Empty>
                  {disponibilidade.data?.aviso === 'sem_profissional_no_dia'
                    ? 'A equipe não atende nesse dia. Tente outra data.'
                    : disponibilidade.data?.aviso === 'nenhum_profissional_cobre_tudo'
                      ? 'Ninguém da equipe faz todos esses serviços sozinho. Volte e escolha "tanto faz" para dividirmos entre especialistas.'
                      : 'Não encontramos horário para essa combinação nesse dia. Tente outra data.'}
                </Empty>
              )}

              {!disponibilidade.isFetching && roteiros.length > 0 && (
                <div className="space-y-4">
                  {roteiros.map((r, i) => {
                    const ativo = roteiroIdx === i;
                    const qtdProf = r.profissionais_ids.length;
                    return (
                      <button
                        key={`${r.inicio}-${i}`}
                        type="button"
                        onClick={() => setRoteiroIdx(i)}
                        aria-pressed={ativo}
                        className={`w-full overflow-hidden rounded-2xl border text-left transition-all duration-200 ${
                          ativo
                            ? 'border-primary/60 shadow-lg shadow-primary/10 ring-1 ring-primary/40'
                            : 'border-border/70 shadow-sm hover:border-primary/30 hover:shadow-md'
                        }`}
                      >
                        {/* faixa superior: horário do itinerário + natureza do roteiro */}
                        <div className={`flex items-center justify-between gap-3 px-5 py-3.5 ${ativo ? 'bg-primary/[0.07]' : 'bg-muted/40'}`}>
                          <div className="flex items-baseline gap-2">
                            <span className="text-xl font-semibold tabular-nums tracking-tight">{r.inicio}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-xl font-semibold tabular-nums tracking-tight">{r.fim}</span>
                          </div>
                          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                            {r.espera_minutos > 0 && (
                              <Badge variant="secondary" className="text-[10px] font-medium">com intervalo</Badge>
                            )}
                            {/* contagem REAL — antes era "2 profissionais" fixo, mentindo com 3 nomes na lista */}
                            <Badge variant="secondary" className="text-[10px] font-medium">
                              {qtdProf === 1 ? '1 profissional' : `${qtdProf} profissionais`}
                            </Badge>
                          </div>
                        </div>

                        {/* itinerário: cada serviço é uma parada; o vão livre é desenhado, não narrado */}
                        <div className="px-5 py-4">
                          <ol>
                            {r.itens.map((it, n) => {
                              const proximo = r.itens[n + 1];
                              // vão de SAÍDA: o espaço entre esta parada e a próxima.
                              const vao = proximo ? minutosEntre(it.fim, proximo.inicio) : 0;
                              const ultimo = n === r.itens.length - 1;
                              return (
                                <li key={n} className="flex gap-3.5">
                                  {/* trilho contínuo: marcador + conector até a próxima parada */}
                                  <div className="flex w-2.5 shrink-0 flex-col items-center">
                                    <span className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ${ativo ? 'bg-primary' : 'bg-primary/35'}`} />
                                    {!ultimo && (
                                      <span
                                        className={`w-px flex-1 ${vao > 0
                                          ? 'my-1 border-l border-dashed border-amber-400/80'
                                          : 'my-1 bg-border'}`}
                                      />
                                    )}
                                  </div>

                                  <div className={`min-w-0 flex-1 ${ultimo ? '' : 'pb-1'}`}>
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span className="truncate text-sm font-medium leading-tight">{it.nome}</span>
                                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                        {it.inicio}–{it.fim}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-1.5">
                                      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                        {inicial(it.profissional_nome)}
                                      </span>
                                      <span className="text-xs text-muted-foreground">{it.profissional_nome}</span>
                                    </div>
                                    {vao > 0 && (
                                      <div className="my-2 flex items-center gap-2">
                                        <span className="text-[11px] font-medium text-amber-600">
                                          {formatarDuracao(vao)} livres
                                        </span>
                                        <span className="h-px flex-1 bg-amber-400/30" />
                                      </div>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 4. Dados + pagamento */}
          {step === 4 && (
            <div className="max-w-md space-y-4">
              <Field icon={User} label="Nome">
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
              </Field>
              <Field icon={Phone} label="WhatsApp / Telefone">
                <Input
                  value={telefone} inputMode="tel" placeholder="(11) 99999-9999"
                  onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
                />
              </Field>
              <Field icon={Mail} label="E-mail (opcional)">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
              </Field>

              <div>
                <Label className="mb-2 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />Como pretende pagar?
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {PAGAMENTOS.map((p) => (
                    <button
                      key={p.valor}
                      type="button"
                      onClick={() => setPagamento(p.valor)}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-sm transition-colors ${pagamento === p.valor ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-accent'}`}
                    >
                      <Wallet className="h-4 w-4 text-muted-foreground" />{p.rotulo}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  O pagamento é feito no estabelecimento, no momento do atendimento.
                </p>
              </div>
            </div>
          )}

          {/* 5. Revisão */}
          {step === 5 && roteiro && (
            <Card>
              <CardContent className="space-y-3 p-5 text-sm">
                <div>
                  <div className="font-semibold">{org.name}</div>
                  {endereco && <div className="text-xs text-muted-foreground">{endereco}</div>}
                </div>
                <div className="space-y-2 border-t pt-3">
                  {roteiro.itens.map((it, n) => (
                    <div key={n} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{it.nome}</div>
                        <div className="text-xs text-muted-foreground">com {it.profissional_nome}</div>
                      </div>
                      <span className="shrink-0 font-medium">{it.inicio}–{it.fim}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 border-t pt-3">
                  <Row label="Data" value={`${fmtBR(data)}, das ${roteiro.inicio} às ${roteiro.fim}`} />
                  <Row label="Duração dos serviços" value={formatarDuracao(roteiro.duracao_total_minutos)} />
                  {roteiro.espera_minutos > 0 && <Row label="Intervalo livre" value={formatarDuracao(roteiro.espera_minutos)} />}
                  <Row label="Cliente" value={nome} />
                  <Row label="Telefone" value={telefone} />
                  <Row label="Pagamento" value={PAGAMENTOS.find((p) => p.valor === pagamento)?.rotulo ?? 'A combinar'} />
                </div>
                {comanda.itensProduto.length > 0 && (
                  <div className="space-y-1 border-t pt-3">
                    {comanda.itensProduto.map(({ produto, quantidade }) => (
                      <div key={produto.id} className="flex justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-muted-foreground">
                          {produto.nome} × {quantidade}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">
                          {formatarMoeda(produto.preco * quantidade)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex justify-between border-t pt-3 text-base font-semibold">
                  <span>Total</span><span>{formatarMoeda(comanda.valorTotal)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Leve também: produtos de revenda. Não ocupam agenda — o cliente
              retira no balcão junto com o atendimento. */}
          {step === 5 && (boot.data.produtos ?? []).length > 0 && (
            <div className="rounded-2xl border border-border/70 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Leve também</h3>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Você retira no salão, junto com o atendimento.
              </p>
              <div className="mt-3 space-y-2">
                {boot.data.produtos.map((p) => {
                  const qtd = comanda.produtos[p.id] ?? 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border p-3">
                      {p.imagem_url && (
                        <img src={p.imagem_url} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.nome}</div>
                        <div className="text-xs tabular-nums text-muted-foreground">{formatarMoeda(p.preco)}</div>
                      </div>
                      {qtd === 0 ? (
                        <Button size="sm" variant="outline" onClick={() => comanda.definirProduto(p.id, 1, p.estoque)}>
                          <Plus className="mr-1 h-3.5 w-3.5" />Adicionar
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-8 w-8"
                            aria-label={`Diminuir ${p.nome}`}
                            onClick={() => comanda.definirProduto(p.id, qtd - 1, p.estoque)}>
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">{qtd}</span>
                          <Button size="icon" variant="outline" className="h-8 w-8"
                            aria-label={`Aumentar ${p.nome}`}
                            disabled={qtd >= p.estoque}
                            onClick={() => comanda.definirProduto(p.id, qtd + 1, p.estoque)}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Navegação: no passo 1 quem avança é a ComandaBar fixa. */}
        {step > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" />Voltar
            </Button>
            {step < 5
              ? <Button disabled={!podeAvancar} onClick={avancar}>Próximo<ArrowRight className="ml-1 h-4 w-4" /></Button>
              : (
                <Button disabled={submit.isPending || !roteiro} onClick={() => submit.mutate()}>
                  {submit.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                  Confirmar agendamento
                </Button>
              )}
          </div>
        )}
      </div>

      <AssinaturaPlataforma />

      {step === 1 && (
        <ComandaBar
          itens={comanda.itens}
          duracaoTotal={comanda.duracaoTotal}
          valorTotal={comanda.valorTotal}
          onRemover={comanda.remover}
          onAvancar={avancar}
        />
      )}
    </div>
  );
}

/** Assinatura discreta da plataforma — sempre visível (produto sem white-label). */
function AssinaturaPlataforma() {
  const branding = usePlatformBranding();

  const nome = branding?.platform_name || 'NexvyBeauty';
  const texto = branding?.powered_by_text || `Agendamento por ${nome}`;

  return (
    <footer className="mx-auto max-w-2xl px-4 pb-8 pt-2">
      <div className="flex items-center justify-center gap-1.5 opacity-70">
        {branding?.logo_url
          ? <img src={branding.logo_url} alt={nome} className="h-4 w-auto" />
          : <Sparkles className="h-3 w-3 text-primary" />}
        <span className="text-[11px] text-muted-foreground">{texto}</span>
      </div>
    </footer>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((label, i) => {
        const n = i + 1, active = n === step, doneStep = n < step;
        return (
          <div key={label} className="flex flex-1 items-center gap-1">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-primary text-primary-foreground' : doneStep ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {doneStep ? <Check className="h-3.5 w-3.5" /> : n}
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${doneStep ? 'bg-primary/40' : 'bg-muted'}`} />}
          </div>
        );
      })}
    </div>
  );
}

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">{children}</div>
);
const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
);
const PickCard = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-xl border p-4 text-left transition-colors ${active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-accent'}`}
  >
    {children}
  </button>
);
const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
);
const Field = ({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) => (
  <div>
    <Label className="mb-1 flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{label}</Label>
    {children}
  </div>
);
const Row = ({ label, value }: { label: string; value?: string }) => (
  <div className="flex justify-between gap-4">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{value || '—'}</span>
  </div>
);

const OpcaoModo = ({ ativo, onClick, icone, titulo, descricao }: {
  ativo: boolean; onClick: () => void; icone: React.ReactNode; titulo: string; descricao: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${ativo ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-accent'}`}
  >
    <div className={`mt-0.5 shrink-0 ${ativo ? 'text-primary' : 'text-muted-foreground'}`}>{icone}</div>
    <div className="min-w-0">
      <div className="font-medium">{titulo}</div>
      <div className="text-xs text-muted-foreground">{descricao}</div>
    </div>
  </button>
);
