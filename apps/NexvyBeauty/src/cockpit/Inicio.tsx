// Início — página-âncora do Cockpit. O conteúdo antigo (Radar/recuperável) migrou
// para /ai-growth (Comercial → AI Growth). Esta tela será reconstruída do zero;
// por ora, placeholder limpo que mantém a navegação intacta.
import { Sparkles } from 'lucide-react'

export default function Inicio() {
  return (
    <div className="p-6">
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold">Início</h1>
        <p className="max-w-md text-muted-foreground">
          Estamos preparando a nova tela de Início. Enquanto isso, suas oportunidades de
          venda estão em <span className="font-medium text-foreground">Comercial → AI Growth</span>.
        </p>
      </div>
    </div>
  )
}
