import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const RULES = [
  { title: 'Comissão', text: '30% sobre o valor bruto da venda, por plano quando houver tabela. Não é lifetime: até 12 ciclos recorrentes.' },
  { title: 'Hold', text: 'Comissão fica pending por 30 dias (alinhado ao reembolso). Só depois pode ser aprovada.' },
  { title: 'Atribuição', text: 'Last-click, janela de 60 dias. Cookie na LP + e-mail/WhatsApp na captura + cupom no checkout Cakto. Sem cookie eterno.' },
  { title: 'Cupom', text: 'Cada afiliado ganha um código de DESCONTO Cakto (?coupon=). Não usamos o programa oficial/split da Cakto — a Nexvy atribui a comissão.' },
  { title: 'O que não fazemos', text: 'Sem multi-nível, sem CPF do comprador, sem PIX em massa nesta fase. Pagamento via PIX manual após aprovação.' },
];

export default function AffiliatesLanding() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('affiliate-apply', {
        body: { name, email, phone, notes },
      });
      const err = (data as { error?: string } | null)?.error || error?.message;
      if (err) throw new Error(err);
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível enviar. Tente de novo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link to="/"><Logo size="sm" /></Link>
          <Link to="/vendas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Ver o produto
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Programa de afiliados NexvyBeauty</p>
        <h1 className="mt-2 text-3xl font-bold">Indique a Agenda Lotada. Ganhe comissão de verdade.</h1>
        <p className="mt-3 text-muted-foreground">
          Para donas de salão e parceiras que já entendem a dor de agenda vazia, WhatsApp virando caixa e no-show.
          Pedido de acesso com aprovação — não é marketplace aberto.
        </p>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-semibold">Regras (as que valem)</h2>
          <ul className="space-y-3">
            {RULES.map((r) => (
              <li key={r.title} className="rounded-lg border border-border p-4">
                <p className="font-medium">{r.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 rounded-lg border border-border p-6">
          <h2 className="text-xl font-semibold">Pedir acesso</h2>
          {done ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Recebemos. Quando aprovarmos, você recebe o e-mail de acesso ao portal <code>/afiliado</code> com o kit de divulgação.
            </p>
          ) : (
            <form className="mt-4 space-y-3" onSubmit={submit}>
              <div>
                <Label htmlFor="aff-name">Nome</Label>
                <Input id="aff-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="aff-email">E-mail</Label>
                <Input id="aff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="aff-phone">WhatsApp</Label>
                <Input id="aff-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="aff-notes">Por que quer indicar? (opcional)</Label>
                <Textarea id="aff-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
              <Button type="submit" disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar pedido'}</Button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
