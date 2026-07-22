// ─── Saúde da Base — diagnóstico da qualidade do cadastro de clientes ────────
// Feature D) do plano de compatibilização (CBA → salão). DIAGNOSTICA a base
// (% preenchimento, score médio, duplicatas, inativos) e ROTEIA pro merge que
// já existe no banner de /clientes (fonte única, com confirmação) — não duplica
// a UI de merge. Mesma cara/estrutura do AiGrowth/AcoesClientes. Cálculo puro em
// clientHygiene.ts.

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Activity, Phone, Mail, Cake, CreditCard, Users, UserX, RefreshCw, ArrowUpRight,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrganizationId, NoOrg } from '@/pages/salao/_shared'
import { TO_CLIENTES } from '@/cockpit/levers'
import { buildHealthMetrics, type HealthMetrics, type ClienteHigiene } from '@/cockpit/clientHygiene'

// Uma linha de "% da base com o campo X preenchido" + barra de progresso.
function FieldBar({ icon: Icon, label, pct }: { icon: LucideIcon; label: string; pct: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </span>
        <span className="font-semibold text-foreground">{pct}%</span>
      </div>
      <Progress value={pct} />
    </div>
  )
}

export default function SaudeBase({ demo }: { demo?: HealthMetrics } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo

  const { data: clientesRows = [], refetch, isFetching } = useQuery({
    queryKey: ['salao-saude', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('nome, telefone, email, cpf_cnpj, data_nascimento, observacoes, status')
        .eq('organization_id', organizationId!)
        .eq('carteira_estado', 'principal') // [B4] higiene mede a carteira real, não o ruído
      if (error) throw error
      return (data ?? []) as ClienteHigiene[]
    },
  })

  if (!isDemo && !organizationId) {
    return <div className="p-6"><NoOrg /></div>
  }

  const m = demo ?? buildHealthMetrics(clientesRows)

  return (
    <div className="p-6 space-y-6">
      {isDemo && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          Modo demonstração — dados fictícios, nada é salvo.
        </div>
      )}

      <PageHeader
        title="Saúde da Base"
        description="O retrato do seu cadastro: o quanto está completo, duplicado ou parado — e o que dá pra arrumar."
      />

      {!isDemo && (
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar agora
        </Button>
      )}

      {m.total === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Você ainda não tem clientes cadastrados. Conforme sua base cresce, o retrato da
            saúde dela aparece aqui.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Headline: score médio de cadastro */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
            <CardContent className="py-6 space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
                <Activity className="h-4 w-4" />
                Cadastro completo
              </div>
              <div className="text-4xl font-bold tracking-tight text-foreground">{m.pct.media}%</div>
              <Progress value={m.pct.media} />
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{m.total}</span> cliente{m.total === 1 ? '' : 's'} na base —
                quanto mais completo o cadastro, mais a IA acerta na hora de reativar e vender.
              </p>
            </CardContent>
          </Card>

          {/* Preenchimento por campo */}
          <Card>
            <CardContent className="py-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Preenchimento por campo</h3>
              <FieldBar icon={Phone} label="Telefone" pct={m.pct.telefone} />
              <FieldBar icon={Mail} label="Email" pct={m.pct.email} />
              <FieldBar icon={Cake} label="Data de nascimento" pct={m.pct.nascimento} />
              <FieldBar icon={CreditCard} label="CPF / CNPJ" pct={m.pct.cpf} />
            </CardContent>
          </Card>

          {/* Duplicatas + Inativos */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="py-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Users className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold text-foreground">Cadastros duplicados</h3>
                </div>
                {m.dupGrupos > 0 ? (
                  <>
                    <div className="text-2xl font-bold tracking-tight text-foreground">{m.dupClientes}</div>
                    <p className="text-sm text-muted-foreground">
                      {m.dupClientes} cadastros em {m.dupGrupos} grupo{m.dupGrupos === 1 ? '' : 's'} com o mesmo
                      telefone. Juntar deixa o histórico num cadastro só.
                    </p>
                    <div className="flex justify-end pt-1">
                      <Button asChild variant="outline" size="sm" className="gap-1.5">
                        <Link to={TO_CLIENTES}>
                          Ver e juntar
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma duplicata por telefone — base limpa 🎉</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <UserX className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold text-foreground">Clientes inativos</h3>
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground">{m.inativos}</div>
                <p className="text-sm text-muted-foreground">
                  {m.pctInativos}% da base marcada como inativa.{' '}
                  {m.inativos > 0
                    ? 'Veja quem dá pra reativar em Ações com Clientes.'
                    : 'Toda a base está ativa.'}
                </p>
                {m.inativos > 0 && (
                  <div className="flex justify-end pt-1">
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <Link to="/acoes">
                        Ver ações
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Seed do modo demonstração ──────────────────────────────────────────────
export const DEMO_SAUDE: HealthMetrics = {
  total: 84,
  pct: { telefone: 92, email: 41, nascimento: 23, cpf: 18, media: 48 },
  scoreMedia: 2.9, // 2.9/6 → 48% (mantém o seed coerente com buildHealthMetrics)
  dupGrupos: 3,
  dupClientes: 7,
  inativos: 19,
  pctInativos: 23,
}
