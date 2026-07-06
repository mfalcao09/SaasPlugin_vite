import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, Sparkles } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { cn } from '@/lib/utils'

// ─── Checklist de ativação do salão ────────────────────────────────────────
// Mostra a ORDEM MÍNIMA para o módulo "acender": profissionais → serviços →
// clientes → 1º agendamento (a Agenda só fica útil com os três anteriores).
// Cada passo é ✓ (já cadastrado) ou ○ (pendente) e leva direto à tela. Some
// por completo quando tudo está cadastrado — não polui o dashboard de um salão
// já ativo. As tabelas ainda não estão todas em types.ts → cast `as any`.

const db = supabase as any

interface Step {
  /** tabela contada (sempre filtrada por organization_id) */
  key: string
  label: string
  hint: string
  to: string
}

const STEPS: Step[] = [
  { key: 'profissionais', label: 'Cadastre seus profissionais', hint: 'Quem atende no seu negócio', to: '/salao/profissionais' },
  { key: 'servico_catalogo', label: 'Cadastre seus serviços', hint: 'Cílios, unhas, sobrancelha, corte…', to: '/salao/servicos' },
  { key: 'clientes', label: 'Cadastre seus clientes', hint: 'Sua base de clientes', to: '/clientes' },
  { key: 'agendamentos', label: 'Crie o primeiro agendamento', hint: 'Agende um horário na agenda', to: '/agenda' },
]

async function countRows(table: string, orgId: string): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  if (error) return 0
  return count ?? 0
}

export function SalaoActivationChecklist({ organizationId }: { organizationId: string }) {
  const navigate = useNavigate()
  const { data: counts } = useQuery({
    queryKey: ['salao-activation', organizationId],
    enabled: !!organizationId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const pairs = await Promise.all(
        STEPS.map(async (s) => [s.key, await countRows(s.key, organizationId)] as const),
      )
      return Object.fromEntries(pairs) as Record<string, number>
    },
  })

  if (!counts) return null
  const isDone = (key: string) => (counts[key] ?? 0) > 0
  const doneCount = STEPS.filter((s) => isDone(s.key)).length
  if (doneCount === STEPS.length) return null // salão já ativado → não exibe

  const pct = Math.round((doneCount / STEPS.length) * 100)
  const nextIdx = STEPS.findIndex((s) => !isDone(s.key)) // próximo passo pendente

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-foreground">Ative seu negócio</h2>
          <span className="ml-auto text-xs text-muted-foreground">{doneCount}/{STEPS.length} concluído</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Siga a ordem para deixar a agenda pronta para uso.
        </p>
        <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ol className="divide-y divide-border">
        {STEPS.map((s, i) => {
          const done = isDone(s.key)
          const isNext = i === nextIdx
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => navigate(s.to)}
                className={cn(
                  'w-full flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent',
                  isNext && 'bg-primary/5',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                    done
                      ? 'bg-primary border-primary text-primary-foreground'
                      : isNext
                        ? 'border-primary text-primary'
                        : 'border-muted-foreground/30 text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className="flex-1">
                  <span
                    className={cn(
                      'block text-sm font-medium',
                      done ? 'text-muted-foreground line-through' : 'text-foreground',
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{s.hint}</span>
                </span>
                {!done && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
