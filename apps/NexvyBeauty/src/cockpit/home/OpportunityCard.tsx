// ─── Card de oportunidade (TOP-3) — padrão "tá aqui o dinheiro" ──────────
// Visual da LP aprovada (mock "Oportunidades"): tag versalete rosé de
// prioridade ("PRIORIDADE ALTA"), headline em bold com o FATO da oportunidade
// (nome + motivo), linha de apoio "Mensagem personalizada pronta para o seu
// WhatsApp:" + a mensagem, e chip pill rosé-soft "Impacto estimado · +R$ X".
// O motivo vem do scan em texto livre — "{nome}: {motivo}" encaixa qualquer
// frase sem depender de gênero do nome. Dados/hooks inalterados: botão real
// de reativação vem do WS3 (ReactivationButton); em seed-mode o botão vira
// "Conecte para disparar" (link p/ conexões) — ou, no demo público, um CTA de
// conversão via onSeedCta. Chamado por HomeDeValor.tsx (app logado) e
// DemoCockpitHome.tsx (demo público).

import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { MessageCircle } from 'lucide-react'
import { ReactivationButton } from '@/cockpit/reactivation/ReactivationButton'
import type { OpportunityCardData } from '@/cockpit/types'
import { formatBRLWhole, CLASS_TAG } from './format'

// "Sumiu há 32 dias." → "sumiu há 32 dias" pra encaixar após "{nome}: ".
// Só descapitaliza padrão Frase (maiúscula + minúscula) — preserva siglas.
function asClause(reason: string): string {
  const trimmed = reason.trim().replace(/\.+$/, '')
  return /^[A-ZÀ-Ü][a-zà-ü]/.test(trimmed)
    ? trimmed.charAt(0).toLocaleLowerCase('pt-BR') + trimmed.slice(1)
    : trimmed
}

interface OpportunityCardProps {
  card: OpportunityCardData
  onSent?: (item: OpportunityCardData) => void
  /** exemplo (conta sem dado real): não dispara envio, mostra CTA conectar */
  seed?: boolean
  /** demo público: clicar no card chama isto (ex.: abrir captura de lead) em
   *  vez de linkar p/ a área logada. Só usado quando seed=true. */
  onSeedCta?: () => void
  /** rótulo do CTA do card no demo (default: "Quero isso no meu negócio"). */
  seedCtaLabel?: string
}

export function OpportunityCard({ card, onSent, seed, onSeedCta, seedCtaLabel }: OpportunityCardProps) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-2">
      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
        {CLASS_TAG[card.classification]}
      </span>

      <h3 className="text-base font-semibold leading-snug text-foreground">
        {card.name}
        {card.reason ? <>: {asClause(card.reason)}</> : null}
      </h3>

      {card.followupMessage && (
        <>
          <p className="text-sm text-muted-foreground">
            Mensagem personalizada pronta para o seu WhatsApp:
          </p>
          <blockquote className="border-l-2 border-primary/30 pl-3 text-sm italic text-muted-foreground">
            "{card.followupMessage}"
          </blockquote>
        </>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          Impacto estimado · +{formatBRLWhole(card.dealValue)}
        </span>
        {seed ? (
          onSeedCta ? (
            <Button onClick={onSeedCta} size="sm" className="gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              {seedCtaLabel ?? 'Quero isso no meu negócio'}
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/conexoes">
                <MessageCircle className="h-3.5 w-3.5" />
                Conecte para disparar
              </Link>
            </Button>
          )
        ) : (
          <ReactivationButton item={card} onSent={onSent} />
        )}
      </div>
    </article>
  )
}
