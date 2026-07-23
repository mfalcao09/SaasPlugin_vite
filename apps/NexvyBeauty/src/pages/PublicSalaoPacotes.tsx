// PublicSalaoPacotes — vitrine pública de pacotes (/s/:slug/pacotes).
// Compra online desativada: pagamento de pacote é presencial no salão.
// (Link de pagamento/Cakto = onda futura.)
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Store, Loader2, Package, CalendarDays, Sparkles, CalendarPlus } from 'lucide-react';
import { formatAddress, type OrgAddress } from '@/lib/formatAddress';

type Pacote = { id: string; nome: string; descricao: string | null; total_sessoes: number; valor: number; validade_dias: number };
type Bootstrap = {
  // address é jsonb no banco — nunca string. O tipo antigo mentia e derrubava a página.
  org: { name: string; address: OrgAddress; slug: string };
  pacotes: Pacote[];
};
const fmtMoney = (v: number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export default function PublicSalaoPacotes() {
  const { slug = '' } = useParams();

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

  if (boot.isLoading) {
    return <Centered><Loader2 className="h-8 w-8 animate-spin text-primary" /></Centered>;
  }
  if (boot.isError || !boot.data) {
    return <Centered><Store className="h-10 w-10 text-muted-foreground" /><p className="mt-3 text-lg font-medium">Negócio não encontrado</p></Centered>;
  }
  const { org, pacotes } = boot.data;
  const endereco = formatAddress(org.address);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/40">
        <div className="mx-auto max-w-3xl px-4 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0"><Sparkles className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h1 className="font-bold text-foreground truncate">{org.name}</h1>
              {endereco && <p className="text-xs text-muted-foreground truncate">{endereco}</p>}
            </div>
          </div>
          <Button asChild variant="outline" size="sm"><Link to={`/s/${slug}`}><CalendarPlus className="h-4 w-4 mr-1" />Agendar</Link></Button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        <h2 className="text-2xl font-bold text-foreground mb-1">Pacotes</h2>
        <p className="text-muted-foreground mb-6">Conheça nossos pacotes de sessões.</p>

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
                  <div className="mt-4 border-t pt-3 text-sm text-muted-foreground">💖 Adquira este pacote diretamente no seu espaço.</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const Centered = ({ children, className = '' }: { children: React.ReactNode; className?: string }) =>
  <div className={`min-h-screen bg-background flex flex-col items-center justify-center text-center px-4 ${className}`}>{children}</div>;
