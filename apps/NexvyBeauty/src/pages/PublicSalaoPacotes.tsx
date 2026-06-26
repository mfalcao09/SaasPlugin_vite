// PublicSalaoPacotes — Onda 2: venda pública de pacotes pré-pagos (/s/:slug/pacotes).
// Re-home do pacotes.$slug do CBA. Caminho A: registra a compra; o salão confirma
// o pagamento (Caminho B/Cakto = enhancement futuro → redireciona pro checkout_url).
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Scissors, Loader2, Package, CalendarDays, Sparkles, CalendarPlus, Check } from 'lucide-react';
import { toast } from 'sonner';

type Pacote = { id: string; nome: string; descricao: string | null; total_sessoes: number; valor: number; validade_dias: number };
type Bootstrap = {
  org: { name: string; address: string | null; slug: string };
  pacotes: Pacote[];
};
const fmtMoney = (v: number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export default function PublicSalaoPacotes() {
  const { slug = '' } = useParams();
  const [comprando, setComprando] = useState<Pacote | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [feito, setFeito] = useState(false);

  const boot = useQuery({
    queryKey: ['salao-bootstrap', slug],
    queryFn: async (): Promise<Bootstrap> => {
      const { data, error } = await supabase.functions.invoke('salao-public-bootstrap', { body: { slug } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as Bootstrap;
    },
    enabled: !!slug, retry: false,
  });

  const comprar = useMutation({
    mutationFn: async () => {
      const { data: r, error } = await supabase.functions.invoke('salao-buy-pacote', {
        body: { slug, pacote_id: comprando!.id, cliente_nome: nome, cliente_telefone: telefone, cliente_email: email },
      });
      if (error) {
        const ctx = (error as any)?.context;
        if (ctx?.json) { try { const b = await ctx.json(); if (b?.error) throw new Error(b.error); } catch (e) { if (e instanceof Error && e.message) throw e; } }
        throw error;
      }
      if ((r as any)?.error) throw new Error((r as any).error);
      return r as { ok: boolean; id: string; checkout_url?: string };
    },
    onSuccess: (r) => {
      if (r.checkout_url) { window.location.href = r.checkout_url; return; }
      setComprando(null); setFeito(true); setNome(''); setTelefone(''); setEmail('');
    },
    onError: (e: any) => toast.error(e?.message || 'Não foi possível registrar a compra'),
  });

  if (boot.isLoading) {
    return <Centered><Loader2 className="h-8 w-8 animate-spin text-primary" /></Centered>;
  }
  if (boot.isError || !boot.data) {
    return <Centered><Scissors className="h-10 w-10 text-muted-foreground" /><p className="mt-3 text-lg font-medium">Salão não encontrado</p></Centered>;
  }
  const { org, pacotes } = boot.data;
  const canBuy = nome.trim().length >= 2 && telefone.replace(/\D/g, '').length >= 8;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/40">
        <div className="mx-auto max-w-3xl px-4 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0"><Sparkles className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h1 className="font-bold text-foreground truncate">{org.name}</h1>
              {org.address && <p className="text-xs text-muted-foreground truncate">{org.address}</p>}
            </div>
          </div>
          <Button asChild variant="outline" size="sm"><Link to={`/s/${slug}`}><CalendarPlus className="h-4 w-4 mr-1" />Agendar</Link></Button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        <h2 className="text-2xl font-bold text-foreground mb-1">Pacotes</h2>
        <p className="text-muted-foreground mb-6">Compre pacotes de sessões com desconto.</p>

        {pacotes.length === 0 ? (
          <Centered className="min-h-0 py-16"><Package className="h-10 w-10 text-muted-foreground/50" /><p className="mt-3 text-muted-foreground">Nenhum pacote disponível no momento.</p></Centered>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pacotes.map((p) => (
              <Card key={p.id} className="flex flex-col">
                <CardContent className="p-5 flex-1 flex flex-col">
                  <div className="font-semibold text-foreground">{p.nome}</div>
                  {p.descricao && <p className="mt-1 text-sm text-muted-foreground">{p.descricao}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="secondary"><Package className="h-3 w-3 mr-1" />{p.total_sessoes} sessões</Badge>
                    <Badge variant="secondary"><CalendarDays className="h-3 w-3 mr-1" />{p.validade_dias} dias</Badge>
                  </div>
                  <div className="mt-4 text-2xl font-bold text-foreground">{fmtMoney(p.valor)}</div>
                  {/* Compra online desativada — pagamento de pacote é presencial no salão. */}
                  <div className="mt-4 border-t pt-3 text-sm text-muted-foreground">💖 Adquira este pacote diretamente no salão.</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog de compra */}
      <Dialog open={!!comprando} onOpenChange={(v) => !v && setComprando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Comprar {comprando?.nome}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="mb-1 block">Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" /></div>
            <div><Label className="mb-1 block">WhatsApp / Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 99999-9999" /></div>
            <div><Label className="mb-1 block">E-mail (opcional)</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></div>
            <Button className="w-full" disabled={!canBuy || comprar.isPending} onClick={() => comprar.mutate()}>
              {comprar.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Confirmar compra — {comprando && fmtMoney(comprando.valor)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sucesso (Caminho A) */}
      <Dialog open={feito} onOpenChange={setFeito}>
        <DialogContent>
          <div className="text-center py-4">
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/15 flex items-center justify-center"><Check className="h-7 w-7 text-emerald-500" /></div>
            <h3 className="mt-4 text-lg font-semibold">Compra registrada!</h3>
            <p className="mt-1 text-sm text-muted-foreground">O salão entrará em contato para confirmar o pagamento e ativar suas sessões.</p>
            <Button className="mt-5" variant="outline" onClick={() => setFeito(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Centered = ({ children, className = '' }: { children: React.ReactNode; className?: string }) =>
  <div className={`min-h-screen bg-background flex flex-col items-center justify-center text-center px-4 ${className}`}>{children}</div>;
