// Rota pública: /agendar/:slug — importado em App.tsx linha 23
// Sem login. 3 passos: serviço → profissional + data + hora → dados pessoais → confirmação
// Grava via supabase.from('appointments').insert()

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Scissors, ChevronRight, ChevronLeft, Clock, Check, Phone, User, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Barbearia, Service, Professional } from '@/lib/db'
import { formatCurrency } from '@/lib/utils'

function gerarHorarios(duracaoMin: number) {
  const slots: string[] = []
  const step = Math.max(30, duracaoMin)
  for (let h = 8 * 60; h + duracaoMin <= 19 * 60; h += step) {
    const hh = String(Math.floor(h / 60)).padStart(2, '0')
    const mm = String(h % 60).padStart(2, '0')
    slots.push(`${hh}:${mm}`)
  }
  return slots
}

function proximosDias(n = 14) {
  const dias: string[] = []
  const hoje = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(hoje)
    d.setDate(hoje.getDate() + i)
    dias.push(d.toISOString().slice(0, 10))
  }
  return dias
}

function formatDiaSemana(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export default function AgendarPublico() {
  const { slug } = useParams<{ slug: string }>()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [barbearia, setBarbearia] = useState<Barbearia | null>(null)
  const [servicos, setServicos] = useState<Service[]>([])
  const [profissionais, setProfissionais] = useState<Professional[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroFatal, setErroFatal] = useState<string | null>(null)

  const [servicoSel, setServicoSel] = useState<Service | null>(null)
  const [profSel, setProfSel] = useState<Professional | null>(null)
  const [dataSel, setDataSel] = useState('')
  const [horaSel, setHoraSel] = useState('')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [agendado, setAgendado] = useState(false)

  useEffect(() => {
    async function init() {
      if (!slug) return
      setCarregando(true)
      const { data: barb, error: e1 } = await supabase
        .from('barbearias').select('*').eq('slug', slug).single()
      if (e1 || !barb) { setErroFatal('Barbearia não encontrada.'); setCarregando(false); return }
      setBarbearia(barb)
      const [{ data: svcs }, { data: pros }] = await Promise.all([
        supabase.from('services').select('*').eq('barbearia_id', barb.id).eq('ativo', true).order('nome'),
        supabase.from('professionals').select('*').eq('barbearia_id', barb.id).eq('ativo', true).order('nome'),
      ])
      setServicos(svcs ?? [])
      setProfissionais(pros ?? [])
      setCarregando(false)
    }
    init()
  }, [slug])

  async function confirmar() {
    if (!barbearia || !servicoSel || !dataSel || !horaSel || !nome.trim() || !telefone.trim()) {
      setErroForm('Preencha todos os campos obrigatórios.')
      return
    }
    setEnviando(true)
    setErroForm(null)
    const { error } = await supabase.from('appointments').insert({
      barbearia_id: barbearia.id,
      service_id: servicoSel.id,
      professional_id: profSel?.id ?? null,
      data: dataSel,
      hora: horaSel,
      duracao_minutos: servicoSel.duracao_minutos,
      valor: servicoSel.preco,
      status: 'agendado',
      observacoes: `Cliente: ${nome.trim()} — Tel: ${telefone.trim()}`,
    })
    setEnviando(false)
    if (error) { setErroForm(error.message); return }
    setAgendado(true)
  }

  function reiniciar() {
    setStep(1); setAgendado(false); setServicoSel(null); setProfSel(null)
    setDataSel(''); setHoraSel(''); setNome(''); setTelefone(''); setErroForm(null)
  }

  const dias = proximosDias(14)
  const horarios = servicoSel ? gerarHorarios(servicoSel.duracao_minutos) : []

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-[#1e3a5f] rounded-full animate-spin" />
      </div>
    )
  }

  if (erroFatal) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center">
          <Scissors className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-white font-bold text-lg">{erroFatal}</p>
          <p className="text-slate-400 text-sm mt-2">Verifique o link e tente novamente.</p>
        </div>
      </div>
    )
  }

  if (agendado) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-emerald-900/40 border-2 border-emerald-500 flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Agendamento confirmado!</h1>
          <p className="text-slate-400 text-sm mb-6">
            Seu horário foi reservado. Aguarde a confirmação da barbearia.
          </p>
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 text-left space-y-2 mb-6">
            {barbearia && <p className="text-slate-300 text-sm"><span className="text-slate-400">Barbearia:</span> {barbearia.nome}</p>}
            {servicoSel && <p className="text-slate-300 text-sm"><span className="text-slate-400">Serviço:</span> {servicoSel.nome}</p>}
            {profSel && <p className="text-slate-300 text-sm"><span className="text-slate-400">Profissional:</span> {profSel.nome}</p>}
            <p className="text-slate-300 text-sm"><span className="text-slate-400">Data:</span> {formatDiaSemana(dataSel)}</p>
            <p className="text-slate-300 text-sm"><span className="text-slate-400">Hora:</span> {horaSel}</p>
            <p className="text-slate-300 text-sm"><span className="text-slate-400">Nome:</span> {nome}</p>
          </div>
          <button onClick={reiniciar} className="text-blue-400 hover:text-blue-300 text-sm underline transition-colors">
            Fazer novo agendamento
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-lg mx-auto">

        {/* Branding */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#1e3a5f] flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#1e3a5f]/30">
            <Scissors className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">{barbearia?.nome ?? slug}</h1>
          <p className="text-slate-400 text-sm mt-1">Agendamento online</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {([1, 2, 3] as const).map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                step > s ? 'bg-emerald-600 text-white' : step === s ? 'bg-[#1e3a5f] text-white' : 'bg-slate-800 text-slate-500'
              }`}>
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 transition-colors ${step > s ? 'bg-emerald-600' : 'bg-slate-700'}`} />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Serviço ── */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold text-white mb-4">Escolha o serviço</h2>
            {servicos.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">Nenhum serviço disponível no momento.</p>
            ) : (
              <div className="space-y-3">
                {servicos.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setServicoSel(s); setStep(2) }}
                    className="w-full flex items-center justify-between bg-slate-800/60 hover:bg-slate-800 border border-slate-700 hover:border-[#1e3a5f] rounded-2xl p-4 text-left transition-all group"
                  >
                    <div>
                      <p className="text-white font-semibold">{s.nome}</p>
                      {s.descricao && <p className="text-slate-400 text-xs mt-0.5">{s.descricao}</p>}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-emerald-400 font-bold text-sm">{formatCurrency(s.preco)}</span>
                        <span className="flex items-center gap-1 text-slate-400 text-xs">
                          <Clock className="w-3.5 h-3.5" />{s.duracao_minutos} min
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Profissional + data + hora ── */}
        {step === 2 && (
          <div>
            <button onClick={() => setStep(1)} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-4 transition-colors">
              <ChevronLeft className="w-4 h-4" />Voltar
            </button>
            <h2 className="text-lg font-bold text-white mb-4">Profissional e horário</h2>

            {servicoSel && (
              <div className="bg-[#1e3a5f]/20 border border-[#1e3a5f]/40 rounded-xl p-3 mb-5 flex items-center gap-3">
                <Scissors className="w-4 h-4 text-blue-300 flex-shrink-0" />
                <div>
                  <p className="text-white text-sm font-medium">{servicoSel.nome}</p>
                  <p className="text-blue-300 text-xs">{formatCurrency(servicoSel.preco)} · {servicoSel.duracao_minutos} min</p>
                </div>
              </div>
            )}

            <div className="mb-5">
              <p className="text-xs font-medium text-slate-400 mb-2">Profissional</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setProfSel(null)}
                  className={`px-3 py-2 rounded-xl text-sm border transition-colors ${!profSel ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'}`}
                >
                  Qualquer
                </button>
                {profissionais.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setProfSel(p)}
                    className={`px-3 py-2 rounded-xl text-sm border transition-colors ${profSel?.id === p.id ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'}`}
                  >
                    {p.nome}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <p className="text-xs font-medium text-slate-400 mb-2">
                <Calendar className="inline w-3.5 h-3.5 mr-1" />Data
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {dias.map(d => (
                  <button
                    key={d}
                    onClick={() => { setDataSel(d); setHoraSel('') }}
                    className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs border transition-colors ${dataSel === d ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'}`}
                  >
                    {formatDiaSemana(d)}
                  </button>
                ))}
              </div>
            </div>

            {dataSel && (
              <div className="mb-6">
                <p className="text-xs font-medium text-slate-400 mb-2">
                  <Clock className="inline w-3.5 h-3.5 mr-1" />Horário
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {horarios.map(h => (
                    <button
                      key={h}
                      onClick={() => setHoraSel(h)}
                      className={`py-2 rounded-xl text-sm border transition-colors text-center ${horaSel === h ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'}`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { if (dataSel && horaSel) setStep(3) }}
              disabled={!dataSel || !horaSel}
              className="w-full py-3 bg-[#1e3a5f] hover:bg-[#254d7a] text-white rounded-xl font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continuar <ChevronRight className="inline w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Step 3: Dados pessoais ── */}
        {step === 3 && (
          <div>
            <button onClick={() => setStep(2)} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-4 transition-colors">
              <ChevronLeft className="w-4 h-4" />Voltar
            </button>
            <h2 className="text-lg font-bold text-white mb-4">Seus dados</h2>

            <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4 mb-6 space-y-1.5">
              {servicoSel && <p className="text-sm text-slate-300"><span className="text-slate-400">Serviço:</span> {servicoSel.nome} — {formatCurrency(servicoSel.preco)}</p>}
              {profSel && <p className="text-sm text-slate-300"><span className="text-slate-400">Profissional:</span> {profSel.nome}</p>}
              <p className="text-sm text-slate-300"><span className="text-slate-400">Data:</span> {formatDiaSemana(dataSel)}</p>
              <p className="text-sm text-slate-300"><span className="text-slate-400">Hora:</span> {horaSel}</p>
            </div>

            {erroForm && <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg mb-4">{erroForm}</p>}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Seu nome *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    placeholder="Nome completo"
                    className="w-full pl-9 pr-3 bg-slate-800 border border-slate-600 rounded-xl py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Telefone / WhatsApp *</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={telefone}
                    onChange={e => setTelefone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full pl-9 pr-3 bg-slate-800 border border-slate-600 rounded-xl py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={confirmar}
              disabled={enviando || !nome.trim() || !telefone.trim()}
              className="w-full py-3 bg-[#1e3a5f] hover:bg-[#254d7a] text-white rounded-xl font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enviando ? 'Confirmando...' : 'Confirmar agendamento'}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
