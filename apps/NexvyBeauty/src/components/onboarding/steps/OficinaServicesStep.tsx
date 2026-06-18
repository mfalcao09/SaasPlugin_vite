import { useState, type FC } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Wrench, Loader2, Check } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { useOrganizationId } from '@/pages/oficina/_shared'
import { Checkbox } from '@/components/ui/checkbox'

interface StepProps {
  onNext: () => void
  onSkip: () => void
  onBack: () => void
}

// Serviços-padrão de oficina sugeridos no onboarding. Marcados são
// inseridos em servico_catalogo (sem criar OS de exemplo).
const SERVICOS_PADRAO = [
  'Troca de óleo',
  'Revisão geral',
  'Freios',
  'Suspensão',
  'Alinhamento e balanceamento',
  'Ar-condicionado',
  'Elétrica',
  'Troca de pneus',
  'Embreagem',
  'Injeção eletrônica',
] as const

export const OficinaServicesStep: FC<StepProps> = ({ onNext, onSkip }) => {
  const organizationId = useOrganizationId()
  // por padrão já vêm pré-marcados os mais comuns; usuário ajusta
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set<string>(['Troca de óleo', 'Revisão geral', 'Freios']),
  )

  const toggle = (nome: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(nome)) next.delete(nome)
      else next.add(nome)
      return next
    })
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const nomes = Array.from(selected)
      if (!organizationId || nomes.length === 0) return
      const rows = nomes.map((nome) => ({
        organization_id: organizationId,
        nome,
        ativo: true,
      }))
      // servico_catalogo ainda não está em types.ts -> cast as any
      const { error } = await (supabase as any).from('servico_catalogo').insert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      if (selected.size > 0) toast.success('Serviços adicionados ao catálogo!')
      onNext()
    },
    onError: () => toast.error('Erro ao salvar serviços. Tente novamente.'),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/15 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Serviços da oficina</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Selecione os serviços que sua oficina oferece. Eles entram no catálogo e ficam
            prontos para usar nas ordens de serviço e orçamentos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SERVICOS_PADRAO.map((nome) => {
          const checked = selected.has(nome)
          return (
            <button
              type="button"
              key={nome}
              onClick={() => toggle(nome)}
              className={[
                'flex items-center gap-3 px-3 py-3 rounded-lg border text-left text-sm transition-colors',
                checked
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-input bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
              ].join(' ')}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggle(nome)}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0"
              />
              <span className="font-medium">{nome}</span>
              {checked && <Check className="h-4 w-4 text-primary ml-auto shrink-0" />}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {selected.size} serviço{selected.size === 1 ? '' : 's'} selecionado
        {selected.size === 1 ? '' : 's'}. Você pode editar o catálogo a qualquer momento.
      </p>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => salvar.mutate()}
          disabled={salvar.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold transition-colors"
        >
          {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar e avançar
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={salvar.isPending}
          className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm transition-colors"
        >
          Pular
        </button>
      </div>
    </div>
  )
}

export default OficinaServicesStep
