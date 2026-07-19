import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * CASCA COMUM dos cartões da página "Nova Importação".
 *
 * A queixa que originou esta página foi visual: os métodos de entrada estavam
 * espalhados e desproporcionais (um bloco gigante, outro espremido). A regra desta
 * tela é PESO VISUAL IGUAL — então a casca é UMA só e todos os cartões a vestem:
 *
 *   ícone + título + 1 linha do que faz   → cabeçalho
 *   corpo (o input daquele método)        → flex-1, empurra o rodapé pro fundo
 *   você fornece → volta                  → rodapé, alinhado no fundo em TODOS
 *
 * Sobre o `shadow-none`: o `KeywordSearchBlock` (variant='card') é de OUTRA sessão e
 * NÃO pode ser editado — ele renderiza a própria casca em
 * `rounded-lg border border-border bg-card p-4`, sem sombra. Como ele divide o grid
 * com estes cartões, a única forma de os 5 terem o mesmo peso é esta casca casar com
 * a dele: reaproveitamos o `Card` do shadcn e neutralizamos o `shadow-sm` do default.
 *
 * `flex flex-col` + `flex-1` no corpo é o que garante que dois cartões lado a lado
 * (que o grid já estica pra mesma altura) tenham o rodapé na MESMA linha — sem isso
 * o cartão de corpo curto fica com o rodapé boiando no meio.
 */
export function ImportCard({
  icon,
  title,
  subtitle,
  gives,
  gets,
  disabled = false,
  headerAside,
  children,
}: {
  /** Emoji do método — o mesmo vocabulário do menu Prospecção (📸 🎬 🔎 🌐). */
  icon: string;
  title: string;
  /** UMA linha dizendo o que o método faz. Não é lugar de parágrafo. */
  subtitle: ReactNode;
  /** Rodapé, lado esquerdo: o que o operador entrega ao método. */
  gives: ReactNode;
  /** Rodapé, lado direito: o que volta para a base. */
  gets: ReactNode;
  /** Cartão inativo (ex.: "Em breve") — perde saturação, mantém o peso no grid. */
  disabled?: boolean;
  /** Canto superior direito (Badge de status, contador…). */
  headerAside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card
      role="group"
      aria-label={title}
      className={cn(
        'flex flex-col border-border p-4 shadow-none',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            <span aria-hidden="true">{icon}</span> {title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
        {headerAside && <div className="shrink-0">{headerAside}</div>}
      </div>

      <div className="flex-1 space-y-3 mt-3">{children}</div>

      <div className="mt-4 border-t border-border pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <span className="text-foreground/70">Você fornece</span> {gives}
        <span className="mx-1.5 text-muted-foreground/60" aria-hidden="true">→</span>
        <span className="text-foreground/70">volta</span> {gets}
      </div>
    </Card>
  );
}

export default ImportCard;
