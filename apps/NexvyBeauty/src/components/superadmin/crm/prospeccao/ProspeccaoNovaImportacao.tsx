import { DownloadCloud, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { KeywordSearchBlock } from '@/components/superadmin/crm/prospeccao/KeywordSearchBlock';
import { ImportCard } from './ImportCard';
import { VideoImportBlock } from './VideoImportBlock';
import { HandlesPasteBlock } from './HandlesPasteBlock';
import { ProspectagramCsvBlock } from './ProspectagramCsvBlock';

/**
 * NOVA IMPORTAÇÃO — a PORTA ÚNICA de aquisição de leads.
 *
 * Antes, cada jeito de entrar lead morava num canto (a busca por palavra-chave dentro
 * da tela "Buscas", o vídeo numa página própria, o Prospectagram em lugar nenhum). Aqui
 * os 5 métodos ficam lado a lado, com o MESMO peso visual, e a "Buscas" volta a ser o
 * que deveria: o RESULTADO, não a entrada.
 *
 * Peso igual não é enfeite — é o que responde "qual destes eu uso?". Por isso todos
 * vestem a mesma casca (`ImportCard`) e todos respondem, no rodapé, o mesmo par:
 * o que você fornece → o que volta.
 *
 * Grade: 1 coluna no mobile, 2 a partir de `lg`. O corte é em `lg` (1024px) e não em
 * `md` (768px) de propósito — em 768px duas colunas espremeriam o cartão de palavra-chave
 * (rótulo + limite + botão na mesma linha). Telas médias ficam em 1 coluna inteira.
 */
export function ProspeccaoNovaImportacao() {
  const { effectiveProductId } = useActivePlatformProduct();
  const productId = effectiveProductId ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <DownloadCloud className="h-6 w-6 text-primary" /> Nova importação
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Todo lead entra por aqui. Escolha por onde: cada cartão diz o que precisa de você
          e o que devolve. Qualquer que seja o caminho, o lead é <b>deduplicado por @perfil</b> contra
          toda a base e cai na <b>busca do dia</b> daquela fonte — o resultado você acompanha
          em <b>Buscas</b>.
        </p>
      </div>

      {!productId && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Selecione um produto</AlertTitle>
          <AlertDescription>
            Escolha o produto no seletor da plataforma para importar leads.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* 1 · Vídeo (Gemini) — o motor da página "Importação por vídeo", como cartão. */}
        <VideoImportBlock variant="card" />

        {/* 2 · Palavra-chave (Apify) — componente da sessão parceira. Só MONTAMOS: ele
            traz a própria casca e o próprio disparo, e não é editado aqui. */}
        <KeywordSearchBlock productId={productId} variant="card" />

        {/* 3 · Colar @handles */}
        <HandlesPasteBlock productId={productId} />

        {/* 4 · Prospectagram (CSV) */}
        <ProspectagramCsvBlock productId={productId} />

        {/* 5 · Server API (Serper) — o motor existe, mas ainda não roda pela plataforma. */}
        <ImportCard
          icon="🌐"
          title="Server API (Serper)"
          subtitle="Busca perfis por fora do Instagram, via mecanismo de busca."
          gives={<b className="text-foreground">termos de busca</b>}
          gets={<b className="text-foreground">perfis achados na web</b>}
          disabled
          headerAside={
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
              Em breve
            </Badge>
          }
        >
          <p className="text-xs text-muted-foreground">
            O motor <b>existe e roda por fora</b> da plataforma; o resultado dele entra hoje
            como importação manual. O que ainda <b>não existe</b> é o botão: disparar e
            acompanhar essa busca por aqui dentro. Enquanto isso não fica pronto, este cartão
            não faz nada — de propósito.
          </p>
          <Button size="sm" disabled className="gap-2">
            Buscar na web
          </Button>
        </ImportCard>
      </div>
    </div>
  );
}

export default ProspeccaoNovaImportacao;
