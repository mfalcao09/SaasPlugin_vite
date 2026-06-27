import { useState, type FC } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Users, Loader2, Plus, X } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { useOrganizationId } from '@/pages/salao/_shared'
import { Input } from '@/components/ui/input'

// Passo de onboarding do salão: cadastra os profissionais (cada um ganha
// agenda própria). Insere em profissionais (organization_id, nome, ativo) via
// client autenticado (RLS get_user_organization). Tabela fora de types.ts -> any.

interface StepProps {
  onNext: () => void
  onSkip: () => void
  onBack: () => void
}

const db = supabase as any

export const SalaoProfissionaisStep: FC<StepProps> = ({ onNext, onSkip, onBack }) => {
  const organizationId = useOrganizationId()
  const [nomes, setNomes] = useState<string[]>([])
  const [input, setInput] = useState('')

  const add = () => {
    const n = input.trim()
    if (n && !nomes.includes(n)) {
      setNomes((p) => [...p, n])
      setInput('')
    }
  }
  const remove = (n: string) => setNomes((p) => p.filter((x) => x !== n))

  const salvar = useMutation({
    mutationFn: async () => {
      if (!organizationId || nomes.length === 0) return
      const rows = nomes.map((nome) => ({ organization_id: organizationId, nome, ativo: true }))
      const { error } = await db.from('profissionais').insert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      if (nomes.length > 0) toast.success('Profissionais adicionados!')
      onNext()
    },
    onError: () => toast.error('Erro ao salvar. Tente novamente.'),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/15 flex items-center justify-center">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Quem atende no seu negócio?</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Adicione os profissionais (cabeleireiro, manicure, esteticista…). Cada um terá a própria agenda.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Nome do profissional"
          maxLength={80}
        />
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 px-3 py-2 rounded-lg border border-input bg-card hover:border-primary/50 text-sm text-foreground shrink-0 transition-colors"
        >
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>

      {nomes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {nomes.map((n) => (
            <span key={n} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-foreground text-sm px-3 py-1">
              {n}
              <button type="button" onClick={() => remove(n)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {nomes.length} profissional{nomes.length === 1 ? '' : 'is'} adicionado{nomes.length === 1 ? '' : 's'}.
        Você pode editar a equipe a qualquer momento.
      </p>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          disabled={salvar.isPending}
          className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 text-sm transition-colors"
        >
          Voltar
        </button>
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

export default SalaoProfissionaisStep
