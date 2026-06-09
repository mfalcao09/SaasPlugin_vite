// Sprint 10 F5 — Onboarding Wizard para novos tenants
// 5 passos: WhatsApp → Chatbot → Atendentes → Horários → Teste

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  Loader2,
  CheckCircle2,
  Circle,
  MessageSquare,
  Bot,
  Users,
  Clock,
  Send,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

interface StepState {
  id: number
  title: string
  description: string
  done: boolean
  icon: typeof MessageSquare
  ctaLabel: string
  ctaTo?: string
}

export default function OnboardingWizard() {
  const { empresaId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [checks, setChecks] = useState({
    whatsapp: false,
    chatbot: false,
    agents: 0,
    hours: false,
  })
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [sending, setSending] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [savingComplete, setSavingComplete] = useState(false)

  async function refreshChecks() {
    if (!empresaId) return
    setLoading(true)
    try {
      const [whats, flows, users, hours, emp] = await Promise.all([
        supabase
          .from('evolution_instances')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('status', 'connected'),
        supabase
          .from('inbox_chatbot_flows')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('is_active', true),
        supabase
          .from('empresa_users')
          .select('user_id', { count: 'exact', head: true })
          .eq('empresa_id', empresaId),
        supabase
          .from('inbox_office_hours')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('ativo', true),
        supabase
          .from('empresas')
          .select('onboarding_completed_at')
          .eq('id', empresaId)
          .single(),
      ])

      setChecks({
        whatsapp: (whats.count ?? 0) > 0,
        chatbot: (flows.count ?? 0) > 0,
        agents: users.count ?? 0,
        hours: (hours.count ?? 0) > 0,
      })
      setCompletedAt((emp.data?.onboarding_completed_at as string | null) ?? null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshChecks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const steps: StepState[] = useMemo(
    () => [
      {
        id: 1,
        title: 'Conectar WhatsApp',
        description: 'Vincule sua instância Evolution e conecte via QR Code.',
        done: checks.whatsapp,
        icon: MessageSquare,
        ctaLabel: checks.whatsapp ? 'Conectado' : 'Configurar agora',
        ctaTo: '/configuracoes',
      },
      {
        id: 2,
        title: 'Configurar chatbot',
        description: 'Crie pelo menos um fluxo ativo para responder automaticamente.',
        done: checks.chatbot,
        icon: Bot,
        ctaLabel: checks.chatbot ? 'Ativo' : 'Criar fluxo',
        ctaTo: '/configuracoes',
      },
      {
        id: 3,
        title: 'Adicionar atendentes',
        description: `Convide membros da equipe. Atualmente: ${checks.agents} atendente(s).`,
        done: checks.agents > 0,
        icon: Users,
        ctaLabel: checks.agents > 0 ? `${checks.agents} convidados` : 'Convidar agora',
        ctaTo: '/equipe',
      },
      {
        id: 4,
        title: 'Definir horários',
        description: 'Configure horário de atendimento para atendimento automático fora dele.',
        done: checks.hours,
        icon: Clock,
        ctaLabel: checks.hours ? 'Configurado' : 'Configurar',
        ctaTo: '/configuracoes',
      },
      {
        id: 5,
        title: 'Enviar mensagem de teste',
        description: 'Envie uma mensagem WhatsApp pra validar a integração ponta-a-ponta.',
        done: testSent,
        icon: Send,
        ctaLabel: testSent ? 'Teste enviado' : 'Enviar teste',
      },
    ],
    [checks, testSent],
  )

  const doneCount = steps.filter((s) => s.done).length
  const allDone = doneCount === steps.length
  const progress = Math.round((doneCount / steps.length) * 100)

  async function handleSendTest() {
    if (!testPhone.trim()) {
      toast.error('Digite um número')
      return
    }
    if (!empresaId) return

    setSending(true)
    try {
      const { data: inst } = await supabase
        .from('evolution_instances')
        .select('instance_id')
        .eq('empresa_id', empresaId)
        .eq('status', 'connected')
        .limit(1)
        .single()

      if (!inst?.instance_id) {
        toast.error('Nenhuma instância WhatsApp conectada')
        return
      }

      const { error } = await supabase.functions.invoke('evolution-send', {
        body: {
          instance: inst.instance_id,
          number: testPhone.trim(),
          text: '✅ Teste do NexvyOficinas: integração funcionando!',
        },
      })
      if (error) throw error
      toast.success('Mensagem de teste enviada')
      setTestSent(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.error('Falha: ' + msg)
    } finally {
      setSending(false)
    }
  }

  async function handleMarkComplete() {
    if (!empresaId) return
    setSavingComplete(true)
    try {
      const nowIso = new Date().toISOString()
      const { error } = await supabase
        .from('empresas')
        .update({
          onboarding_completed_at: nowIso,
          onboarding_step: 5,
        })
        .eq('id', empresaId)
      if (error) throw error
      setCompletedAt(nowIso)
      toast.success('Onboarding concluído!')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.error('Falha: ' + msg)
    } finally {
      setSavingComplete(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  if (completedAt) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-gradient-to-br from-orange-600/20 to-slate-900 border border-orange-600/40 rounded-xl p-8 text-center">
          <div className="text-5xl mb-3">🎉</div>
          <h1 className="text-2xl font-bold text-white mb-2">Tudo pronto!</h1>
          <p className="text-slate-300 mb-4">
            Seu onboarding foi concluído em {new Date(completedAt).toLocaleDateString('pt-BR')}.
          </p>
          <Link
            to="/inbox"
            className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Ir para o Inbox
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-7 h-7 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold text-white">Configuração inicial</h1>
          <p className="text-slate-400 text-sm">
            Configure os essenciais para começar a usar o inbox.
          </p>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-300">
            Progresso: {doneCount}/{steps.length}
          </span>
          <span className="text-orange-400 font-semibold">{progress}%</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {steps.map((step) => {
          const Icon = step.icon
          return (
            <div
              key={step.id}
              className={[
                'flex items-start gap-4 p-4 rounded-lg border transition-colors',
                step.done
                  ? 'bg-green-600/10 border-green-600/40'
                  : 'bg-slate-900 border-slate-800',
              ].join(' ')}
            >
              <div className="shrink-0 mt-0.5">
                {step.done ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                ) : (
                  <Circle className="w-6 h-6 text-slate-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4 text-orange-400 shrink-0" />
                  <h3 className="font-medium text-white">{step.title}</h3>
                </div>
                <p className="text-slate-400 text-sm mb-2">{step.description}</p>
                {step.id === 5 ? (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="tel"
                      placeholder="5511999999999"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, ''))}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white"
                      disabled={sending || testSent}
                    />
                    <button
                      onClick={handleSendTest}
                      disabled={sending || testSent}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded text-sm font-medium"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {step.ctaLabel}
                    </button>
                  </div>
                ) : step.ctaTo ? (
                  <Link
                    to={step.ctaTo}
                    className={[
                      'inline-block mt-1 text-sm font-medium',
                      step.done ? 'text-green-400' : 'text-orange-400 hover:text-orange-300',
                    ].join(' ')}
                  >
                    {step.ctaLabel} →
                  </Link>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex justify-between items-center gap-4">
        <button
          onClick={refreshChecks}
          className="text-sm text-slate-400 hover:text-white"
        >
          ↻ Atualizar status
        </button>
        {allDone ? (
          <button
            onClick={handleMarkComplete}
            disabled={savingComplete}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium"
          >
            {savingComplete ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Concluir onboarding
          </button>
        ) : (
          <span className="text-sm text-slate-500">
            Complete todos os passos pra finalizar
          </span>
        )}
      </div>
    </div>
  )
}
