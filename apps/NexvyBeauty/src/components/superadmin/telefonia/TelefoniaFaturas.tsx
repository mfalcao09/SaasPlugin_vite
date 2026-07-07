import { ExternalLink, FileText, Receipt } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSalvyNumbers } from '@/hooks/useTelefonia';
import { SALVY_MONTHLY_COST_LABEL } from './TelefoniaManager';

const SALVY_DASHBOARD_URL = 'https://app.salvy.com.br';

/**
 * Faturas: a API da Salvy NÃO expõe faturas/NF (limitação registrada no
 * parecer de viabilidade). Aqui mostramos a estimativa reconstruída
 * (linhas ativas × mensalidade) e linkamos pro painel oficial.
 */
export function TelefoniaFaturas() {
  const { data: numbers } = useSalvyNumbers();
  const activeCount = (numbers ?? []).filter((n) => n.status === 'active').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Receipt className="h-6 w-6" />
          Faturas
        </h2>
        <p className="text-sm text-muted-foreground">
          Custo estimado das linhas e acesso às faturas oficiais.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estimativa mensal</CardTitle>
            <CardDescription>
              Reconstruída a partir das linhas ativas ({SALVY_MONTHLY_COST_LABEL} cada).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {(activeCount * 29.9).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
              <span className="text-sm font-normal text-muted-foreground">/mês</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {activeCount} linha(s) ativa(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Faturas e notas fiscais
            </CardTitle>
            <CardDescription>
              A API da Salvy não expõe faturas — o documento oficial vive no painel
              deles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href={SALVY_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir painel Salvy
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
