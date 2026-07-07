import { MapPinned, RefreshCw } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useSalvyAreaCodes } from '@/hooks/useTelefonia';

/** Estoque de DDDs da Salvy — consulta grátis, útil antes de pedir linha. */
export function TelefoniaAreaCodes() {
  const { data: areaCodes, isLoading, isFetching, refetch, error } = useSalvyAreaCodes();

  const available = (areaCodes ?? []).filter((a) => a.available);
  const unavailable = (areaCodes ?? []).filter((a) => !a.available);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MapPinned className="h-6 w-6" />
            Disponibilidade de DDDs
          </h2>
          <p className="text-sm text-muted-foreground">
            Estoque de números por código de área na Salvy (consulta sem custo).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Falha ao consultar a Salvy.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Com estoque ({available.length})</CardTitle>
              <CardDescription>DDDs prontos para provisionar linha.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum DDD disponível agora.</p>
              ) : (
                available.map((a) => (
                  <Badge
                    key={a.areaCode}
                    variant="outline"
                    className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-sm px-3 py-1"
                  >
                    {a.areaCode}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sem estoque ({unavailable.length})</CardTitle>
              <CardDescription>Indisponíveis no momento — tente mais tarde.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {unavailable.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todos os DDDs têm estoque.</p>
              ) : (
                unavailable.map((a) => (
                  <Badge
                    key={a.areaCode}
                    variant="outline"
                    className="text-muted-foreground text-sm px-3 py-1"
                  >
                    {a.areaCode}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
