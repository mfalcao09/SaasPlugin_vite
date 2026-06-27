// PublicSalaoBooking — Onda 2: agendamento público de salão (rota /s/:slug).
// Wizard de 5 passos contra as edge fns públicas (salao-public-bootstrap /
// salao-availability / salao-public-booking). Sem auth. Re-home do agendar.$slug
// do CBA pra React Router + edge fns Deno.
import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Store, Clock, ChevronLeft, ChevronRight, Check, Loader2,
  User, Phone, Mail, Sparkles, Package,
} from 'lucide-react';
import { toast } from 'sonner';

type Servico = { id: string; nome: string; categoria: string | null; duracao_minutos: number | null; valor: number | null };
type Profissional = { id: string; nome: string; especialidades: string[] | null; hora_inicio: string | null; hora_fim: string | null };
type Bootstrap = {
  org: { id: string; name: string; logo_url: string | null; phone: string | null; address: string | null; slug: string };
  servicos: Servico[]; profissionais: Profissional[];
  pacotes: { id: string; nome: string }[];
};

const fmtBR = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const fmtMoney = (v: number | null) => v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const hojeISO = () => new Date().toISOString().slice(0, 10);

export default function PublicSalaoBooking() {
  const { slug = '' } = useParams();
  const [step, setStep] = useState(1);
  const [servicoId, setServicoId] = useState('');
  const [profId, setProfId] = useState('');
  const [data, setData] = useState(hojeISO());
  const [hora, setHora] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [done, setDone] = useState<{ data: string; hora: string; whatsapp: boolean } | null>(null);

  const boot = useQuery({
    queryKey: ['salao-bootstrap', slug],
    queryFn: async (): Promise<Bootstrap> => {
      const { data, error } = await supabase.functions.invoke('salao-public-bootstrap', { body: { slug } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as Bootstrap;
    },
    enabled: !!slug,
    retry: false,
  });

  const servico = boot.data?.servicos.find((s) => s.id === servicoId);
  const profissional = boot.data?.profissionais.find((p) => p.id === profId);

  const slots = useQuery({
    queryKey: ['salao-slots', slug, servicoId, profId, data],
    queryFn: async (): Promise<string[]> => {
      const { data: r, error } = await supabase.functions.invoke('salao-availability', {
        body: { slug, servico_id: servicoId, profissional_id: profId, data },
      });
      if (error) throw error;
      return (r as any)?.slots ?? [];
    },
    enabled: step === 3 && !!slug && !!servicoId && !!profId && !!data,
  });

  const tracking = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    return { utm_source: q.get('utm_source') ?? undefined, utm_medium: q.get('utm_medium') ?? undefined, utm_campaign: q.get('utm_campaign') ?? undefined };
  }, []);

  const submit = useMutation({
    mutationFn: async () => {
      const { data: r, error } = await supabase.functions.invoke('salao-public-booking', {
        body: { slug, servico_id: servicoId, profissional_id: profId, data, hora, cliente_nome: nome, cliente_telefone: telefone, cliente_email: email, tracking },
      });
      if (error) {
        // edge fn devolve 409/4xx com {error} — supabase-js encapsula em FunctionsHttpError
        const ctx = (error as any)?.context;
        if (ctx?.json) { try { const body = await ctx.json(); if (body?.error) throw new Error(body.error); } catch (e) { if (e instanceof Error && e.message) throw e; } }
        throw error;
      }
      if ((r as any)?.error) throw new Error((r as any).error);
      return r as { id: string; data: string; hora: string; whatsapp_enviado: boolean };
    },
    onSuccess: (r) => { setDone({ data: r.data, hora: r.hora, whatsapp: r.whatsapp_enviado }); toast.success('Agendamento confirmado!'); },
    onError: (e: any) => toast.error(e?.message || 'Não foi possível agendar'),
  });

  if (boot.isLoading) {
    return <Centered><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="mt-3 text-muted-foreground">Carregando…</p></Centered>;
  }
  if (boot.isError || !boot.data) {
    return <Centered><Store className="h-10 w-10 text-muted-foreground" /><p className="mt-3 text-lg font-medium">Negócio não encontrado</p></Centered>;
  }
  const { org, servicos, profissionais } = boot.data;

  if (done) {
    return (
      <Centered>
        <div className="h-16 w-16 rounded-full bg-emerald-500/15 flex items-center justify-center"><Check className="h-8 w-8 text-emerald-500" /></div>
        <h1 className="mt-4 text-2xl font-bold">Agendamento confirmado!</h1>
        <p className="mt-1 text-muted-foreground">{servico?.nome} com {profissional?.nome}</p>
        <p className="text-muted-foreground">{fmtBR(done.data)} às {done.hora.slice(0, 5)}</p>
        {done.whatsapp && <p className="mt-2 text-sm text-emerald-600">Confirmação enviada por WhatsApp 📱</p>}
        <Button className="mt-6" variant="outline" onClick={() => { setDone(null); setStep(1); setServicoId(''); setProfId(''); setHora(''); setNome(''); setTelefone(''); setEmail(''); }}>Novo agendamento</Button>
      </Centered>
    );
  }

  const canNext = step === 1 ? !!servicoId : step === 2 ? !!profId : step === 3 ? !!hora : step === 4 ? (nome.trim().length >= 2 && telefone.replace(/\D/g, '').length >= 8) : true;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/40">
        <div className="mx-auto max-w-2xl px-4 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0"><Sparkles className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h1 className="font-bold text-foreground truncate">{org.name}</h1>
              {org.address && <p className="text-xs text-muted-foreground truncate">{org.address}</p>}
            </div>
          </div>
          {boot.data.pacotes.length > 0 && (
            <Button asChild variant="outline" size="sm"><Link to={`/s/${slug}/pacotes`}><Package className="h-4 w-4 mr-1" />Pacotes</Link></Button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        <Stepper step={step} />

        <div className="mt-6 space-y-4">
          {step === 1 && (
            <Grid>
              {servicos.map((s) => (
                <PickCard key={s.id} active={servicoId === s.id} onClick={() => setServicoId(s.id)}>
                  <div className="font-medium">{s.nome}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {s.categoria && <Badge variant="secondary" className="text-[10px]">{s.categoria}</Badge>}
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{s.duracao_minutos ?? 60} min</span>
                    <span>· {fmtMoney(s.valor)}</span>
                  </div>
                </PickCard>
              ))}
              {servicos.length === 0 && <Empty>Nenhum serviço disponível.</Empty>}
            </Grid>
          )}

          {step === 2 && (
            <Grid>
              {profissionais.map((p) => (
                <PickCard key={p.id} active={profId === p.id} onClick={() => setProfId(p.id)}>
                  <div className="font-medium">{p.nome}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {p.especialidades?.[0] && <Badge variant="secondary" className="text-[10px]">{p.especialidades[0]}</Badge>}
                    {p.hora_inicio && p.hora_fim && <span>{p.hora_inicio.slice(0, 5)}–{p.hora_fim.slice(0, 5)}</span>}
                  </div>
                </PickCard>
              ))}
              {profissionais.length === 0 && <Empty>Nenhum profissional disponível.</Empty>}
            </Grid>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="data">Data</Label>
                <Input id="data" type="date" min={hojeISO()} value={data} onChange={(e) => { setData(e.target.value); setHora(''); }} className="mt-1 max-w-xs" />
              </div>
              {slots.isFetching && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Calculando disponibilidade…</p>}
              {!slots.isFetching && (slots.data?.length ?? 0) === 0 && <Empty>Sem horários disponíveis nessa data.</Empty>}
              {!slots.isFetching && (slots.data?.length ?? 0) > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots.data!.map((h) => (
                    <Button key={h} variant={hora === h ? 'default' : 'outline'} size="sm" onClick={() => setHora(h)}>{h}</Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 max-w-md">
              <Field icon={User} label="Nome"><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" /></Field>
              <Field icon={Phone} label="WhatsApp / Telefone"><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 99999-9999" /></Field>
              <Field icon={Mail} label="E-mail (opcional)"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></Field>
            </div>
          )}

          {step === 5 && (
            <Card><CardContent className="p-5 space-y-2 text-sm">
              <Row label="Serviço" value={servico?.nome} />
              <Row label="Profissional" value={profissional?.nome} />
              <Row label="Data" value={`${fmtBR(data)} às ${hora}`} />
              <Row label="Duração" value={`${servico?.duracao_minutos ?? 60} min`} />
              <Row label="Cliente" value={nome} />
              <Row label="Telefone" value={telefone} />
              <div className="border-t pt-2 mt-2 flex justify-between font-semibold"><span>Total</span><span>{fmtMoney(servico?.valor ?? null)}</span></div>
            </CardContent></Card>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => s - 1)}><ChevronLeft className="h-4 w-4 mr-1" />Voltar</Button>
          {step < 5
            ? <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Próximo<ChevronRight className="h-4 w-4 ml-1" /></Button>
            : <Button disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}Confirmar agendamento</Button>}
        </div>
      </div>
    </div>
  );
}

const STEPS = ['Serviço', 'Profissional', 'Horário', 'Seus dados', 'Confirmar'];
function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((label, i) => {
        const n = i + 1, active = n === step, doneStep = n < step;
        return (
          <div key={label} className="flex-1 flex items-center gap-1">
            <div className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${active ? 'bg-primary text-primary-foreground' : doneStep ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>{doneStep ? <Check className="h-3.5 w-3.5" /> : n}</div>
            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${doneStep ? 'bg-primary/40' : 'bg-muted'}`} />}
          </div>
        );
      })}
    </div>
  );
}
const Centered = ({ children }: { children: React.ReactNode }) => <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center px-4">{children}</div>;
const Grid = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
const PickCard = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className={`text-left rounded-xl border p-4 transition-colors ${active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-accent'}`}>{children}</button>
);
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground py-8 text-center">{children}</p>;
const Field = ({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) => (
  <div><Label className="flex items-center gap-1.5 mb-1"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{label}</Label>{children}</div>
);
const Row = ({ label, value }: { label: string; value?: string }) => (
  <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="font-medium text-right">{value || '—'}</span></div>
);
