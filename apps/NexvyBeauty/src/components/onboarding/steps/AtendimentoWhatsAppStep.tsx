import type { FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { useEvolutionInstances } from '@/hooks/useEvolutionInstances'

interface StepProps {
  onNext: () => void
  onSkip: () => void
  onBack: () => void
}

const CONNECTED_STATES = new Set(['connected', 'paired'])

/**
 * Passo de onboarding do módulo Atendimento.
 * Enxuto e read-only: detecta (via hook Evolution já existente) se há
 * instância WhatsApp conectada. Não cria/conecta instância aqui — a
 * configuração completa vive em Administração. Se não houver nada, é um
 * passo informativo "configure depois".
 */
export const AtendimentoWhatsAppStep: FC<StepProps> = ({ onNext, onSkip }) => {
  const navigate = useNavigate()
  const { data: instances = [], isLoading } = useEvolutionInstances()

  const connected = (instances as any[]).filter((i) =>
    CONNECTED_STATES.has(i?.status),
  )
  const isConnected = connected.length > 0

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/15 flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Atendimento no WhatsApp</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Centralize as conversas do seu salão no inbox. Conecte um número de WhatsApp
            para receber e responder mensagens dos clientes em um só lugar.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-4 py-4 rounded-xl border bg-card text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verificando conexões...
        </div>
      ) : isConnected ? (
        <div className="flex items-center gap-3 px-4 py-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">WhatsApp já conectado</p>
            <p className="text-xs text-muted-foreground">
              {connected.length} número{connected.length === 1 ? '' : 's'} ativo
              {connected.length === 1 ? '' : 's'}. Seu inbox está pronto para receber mensagens.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 py-4 rounded-xl border bg-card space-y-3">
          <p className="text-sm text-muted-foreground">
            Você ainda não tem um número conectado. Sem problema — dá para configurar agora ou
            deixar para depois em <span className="font-medium text-foreground">Administração → Integrações</span>.
          </p>
          <button
            type="button"
            onClick={() => navigate('/admin?tab=integrations')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Configurar WhatsApp
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onNext}
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors"
        >
          {isConnected ? 'Avançar' : 'Continuar'}
        </button>
        {!isConnected && (
          <button
            type="button"
            onClick={onSkip}
            className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm transition-colors"
          >
            Configurar depois
          </button>
        )}
      </div>
    </div>
  )
}

export default AtendimentoWhatsAppStep
