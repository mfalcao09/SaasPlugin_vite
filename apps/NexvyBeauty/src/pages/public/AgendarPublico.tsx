import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Scissors, Calendar, User, CheckCircle2, ChevronRight, ChevronLeft, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { db, type Salao, type Servico, type Profissional } from '@/lib/db'
import { formatCurrency } from '@/lib/utils'

const HORARIOS = [
  '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
  '13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00',
]
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

function pad(n: number) { return String(n).padStart(2, '0') }
function toIso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function diasDoMes(ano: number, mes: number): Date[] {
  const dias: Date[] = []
  const d = new Date(ano, mes, 1)
  while (d.getMonth() === mes) { dias.push(new Date(d)); d.setDate(d.getDate() + 1) }
  return dias
}

type Passo = 1 | 2 | 3

export default function AgendarPublico() {
  const { slug } = useParams<{ slug: string }>()

  const [salao, setSalao] = useState<Salao | null>(null)
  const [servicos, setServicos] = useState<Servico[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [loadingInit, setLoadingInit] = useState(true)
  const [erro404, setErro404] = useState(false)

  const [passo, setPasso] = useState<Passo>(1)
  const [servicoSel, setServicoSel] = useState<Servico | null>(null)
  const [profSel, setProfSel] = useState<Profissional | null>(null)
  const [dataSel, setDataSel] = useState<Date | null>(null)
  const [horaSel, setHoraSel] = useState<string | null>(null)
  const [calAno, setCalAno] = useState(new Date().getFullYear())
  const [calMes, setCalMes] = useState(new Date().getMonth())

  const [nomeCliente, setNomeCliente] = useState('')
  const [telCliente, setTelCliente] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [confirmado, setConfirmado] = useState(false)

  useEffect(() => {
    if (!slug) return
    async function init() {
      const { data: s } = await db.saloes.getBySlug(slug!)
      if (!s) { setErro404(true); setLoadingInit(false); return }
      setSalao(s)
      const [{ data: sv }, { data: pr }] = await Promise.all([
        db.servicos.list(s.id),
        db.profissionais.list(s.id),
      ])
      setServicos(sv ?? [])
      setProfissionais(pr ?? [])
      setLoadingInit(false)
    }
    init()
  }, [slug])

  async function confirmar() {
    if (!salao || !servicoSel || !dataSel || !horaSel) return
    if (!nomeCliente.trim()) { setErroForm('Informe seu nome'); return }
    if (!telCliente.trim()) { setErroForm('Informe seu telefone'); return }
    setSalvando(true); setErroForm(null)
    const { error } = await supabase.from('agendamentos').insert({
      salao_id: salao.id,
      cliente_nome: nomeCliente.trim(),
      servico_id: servicoSel.id,
      servico_nome: servicoSel.nome,
      profissional_id: profSel?.id ?? null,
      profissional_nome: profSel?.nome ?? null,
      data: toIso(dataSel),
      hora: horaSel,
      duracao_minutos: servicoSel.duracao_minutos,
      valor: servicoSel.preco,
      status: 'agendado',
      observacoes: `Tel: ${telCliente.trim()}`,
    })
    setSalvando(false)
    if (error) { setErroForm('Erro ao confirmar. Tente novamente.'); return }
    setConfirmado(true)
  }

  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const primColor = salao?.primary_color ?? '#f43f5e'

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loadingInit) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-slate-700 border-t-rose-500 rounded-full animate-spin" />
    </div>
  )

  if (erro404) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
      <div>
        <Scissors className="w-14 h-14 text-slate-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Salão não encontrado</h1>
        <p className="text-slate-400">O link de agendamento é inválido ou foi desativado.</p>
      </div>
    </div>
  )

  // ── Confirmação ──────────────────────────────────────────────────────────
  if (confirmado) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Agendado!</h1>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 text-left space-y-2.5">
          <Row label="Salão" value={salao?.nome_fantasia ?? salao?.nome_salao ?? ''} />
          <Row label="Serviço" value={servicoSel?.nome ?? ''} />
          {profSel && <Row label="Profissional" value={profSel.nome} />}
          <Row label="Data" value={`${dataSel ? toIso(dataSel) : ''} às ${horaSel}`} />
          <Row label="Nome" value={nomeCliente} />
          <Row label="Valor" value={servicoSel ? formatCurrency(servicoSel.preco) : ''} highlight />
        </div>
        <p className="text-sm text-slate-500">Guarde essas informações. Até logo!</p>
      </div>
    </div>
  )

  const diasMes = diasDoMes(calAno, calMes)
  const primeiroDia = diasMes[0].getDay()

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: primColor }}>
            <Scissors className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white">{salao?.nome_fantasia ?? salao?.nome_salao}</p>
            <p className="text-xs text-slate-400">Agendamento online</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* Steps */}
        <div className="flex items-center justify-center gap-2">
          {(['Serviço','Data & Hora','Seus dados'] as const).map((lbl, i) => (
            <div key={lbl} className="flex items-center gap-1.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white transition-colors"
                style={{ backgroundColor: passo > i + 1 ? '#10b981' : passo === i + 1 ? primColor : '#1e293b' }}
              >
                {passo > i + 1 ? '✓' : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:inline ${passo >= i + 1 ? 'text-white' : 'text-slate-600'}`}>{lbl}</span>
              {i < 2 && <ChevronRight className="w-3 h-3 text-slate-600" />}
            </div>
          ))}
        </div>

        {/* ─── Passo 1: Serviço ─────────────────────────────────────────── */}
        {passo === 1 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white">Escolha o serviço</h2>
            {servicos.length === 0 && <p className="text-slate-400 text-sm">Nenhum serviço disponível.</p>}
            {servicos.map(s => (
              <button
                key={s.id}
                onClick={() => { setServicoSel(s); setPasso(2) }}
                className="w-full text-left bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{s.nome}</p>
                    {s.categoria && <p className="text-xs text-slate-400 mt-0.5">{s.categoria}</p>}
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="font-bold text-emerald-400">{formatCurrency(s.preco)}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 justify-end mt-0.5">
                      <Clock className="w-3 h-3" />{s.duracao_minutos}min
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ─── Passo 2: Profissional + data + hora ─────────────────────── */}
        {passo === 2 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <button onClick={() => setPasso(1)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-lg font-bold text-white">Data, hora e profissional</h2>
            </div>

            {servicoSel && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
                <Scissors className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="text-sm font-medium text-white">{servicoSel.nome}</span>
                <span className="ml-auto text-sm text-emerald-400 font-semibold">{formatCurrency(servicoSel.preco)}</span>
              </div>
            )}

            {profissionais.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-300 mb-2">Profissional (opcional)</p>
                <div className="flex gap-2 flex-wrap">
                  <PillBtn label="Qualquer" active={profSel === null} color={primColor} onClick={() => setProfSel(null)} />
                  {profissionais.map(p => (
                    <PillBtn key={p.id} label={p.nome} active={profSel?.id === p.id} color={primColor} onClick={() => setProfSel(p)} />
                  ))}
                </div>
              </div>
            )}

            {/* Calendário */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => { if (calMes === 0) { setCalMes(11); setCalAno(a => a - 1) } else setCalMes(m => m - 1) }} className="p-1.5 text-slate-400 hover:text-white transition-colors text-lg">‹</button>
                <span className="text-sm font-semibold text-white">{MESES_PT[calMes]} {calAno}</span>
                <button onClick={() => { if (calMes === 11) { setCalMes(0); setCalAno(a => a + 1) } else setCalMes(m => m + 1) }} className="p-1.5 text-slate-400 hover:text-white transition-colors text-lg">›</button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {DIAS_PT.map(d => <p key={d} className="text-xs text-slate-500 font-medium">{d}</p>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array(primeiroDia).fill(null).map((_, i) => <div key={`e${i}`} />)}
                {diasMes.map(dia => {
                  const passado = dia < hoje
                  const sel = dataSel != null && toIso(dia) === toIso(dataSel)
                  return (
                    <button
                      key={dia.getDate()}
                      disabled={passado}
                      onClick={() => { setDataSel(dia); setHoraSel(null) }}
                      className="aspect-square rounded-lg text-sm font-medium transition-colors disabled:opacity-25 disabled:cursor-not-allowed text-slate-300 hover:bg-slate-700"
                      style={sel ? { backgroundColor: primColor, color: '#fff' } : {}}
                    >
                      {dia.getDate()}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Horários */}
            {dataSel && (
              <div>
                <p className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {dataSel.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {HORARIOS.map(h => {
                    const isSel = horaSel === h
                    return (
                      <button
                        key={h}
                        onClick={() => setHoraSel(h)}
                        className="py-2 rounded-lg text-sm font-medium border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors"
                        style={isSel ? { backgroundColor: primColor, color: '#fff', borderColor: 'transparent' } : {}}
                      >
                        {h}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {dataSel && horaSel && (
              <button
                onClick={() => setPasso(3)}
                className="w-full py-3 rounded-xl text-white font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: primColor }}
              >
                Continuar <ChevronRight className="inline w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* ─── Passo 3: Dados do cliente ────────────────────────────────── */}
        {passo === 3 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <button onClick={() => setPasso(2)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-lg font-bold text-white">Seus dados</h2>
            </div>

            {/* Resumo */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Resumo</p>
              <Row label="Serviço" value={servicoSel?.nome ?? ''} />
              {profSel && <Row label="Profissional" value={profSel.nome} />}
              <Row label="Data" value={`${dataSel ? toIso(dataSel) : ''} às ${horaSel}`} />
              <Row label="Duração" value={`${servicoSel?.duracao_minutos} min`} />
              <Row label="Valor" value={servicoSel ? formatCurrency(servicoSel.preco) : ''} highlight />
            </div>

            {erroForm && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{erroForm}</p>}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Seu nome *</label>
              <input value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} placeholder="Nome completo" className="w-full px-3 py-3 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl text-sm focus:outline-none focus:border-rose-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Telefone (WhatsApp) *</label>
              <input value={telCliente} onChange={e => setTelCliente(e.target.value)} placeholder="(11) 9xxxx-xxxx" className="w-full px-3 py-3 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl text-sm focus:outline-none focus:border-rose-500" />
            </div>

            <button
              onClick={confirmar}
              disabled={salvando}
              className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: primColor }}
            >
              {salvando ? 'Confirmando...' : 'Confirmar Agendamento'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-400 shrink-0">{label}:</span>
      <span className={highlight ? 'text-emerald-400 font-semibold ml-auto' : 'text-white font-medium'}>{value}</span>
    </div>
  )
}

function PillBtn({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-sm border transition-colors"
      style={active ? { backgroundColor: color, color: '#fff', borderColor: 'transparent' } : { borderColor: '#334155', color: '#94a3b8' }}
    >
      {label}
    </button>
  )
}
