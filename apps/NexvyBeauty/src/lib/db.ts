import { supabase } from './supabase'

// Tipos base
export interface Salao {
  id: string; nome_salao: string; nome_fantasia?: string; slug: string
  email?: string; telefone?: string; endereco?: string; cnpj?: string
  primary_color: string; logo_url?: string; ativo: boolean; created_at: string
}
export interface Cliente {
  id: string; salao_id: string; nome: string; telefone?: string; email?: string
  data_nascimento?: string; observacoes?: string; origem: string
  total_atendimentos: number; total_gasto: number; ultimo_atendimento?: string; created_at: string
}
export interface Profissional {
  id: string; salao_id: string; nome: string; email?: string; telefone?: string
  especialidades?: string[]; comissao_pct: number; foto_url?: string; ativo: boolean; created_at: string
}
export interface Servico {
  id: string; salao_id: string; nome: string; descricao?: string
  duracao_minutos: number; preco: number; categoria?: string; ativo: boolean; created_at: string
}
export interface Pacote {
  id: string; salao_id: string; nome: string; descricao?: string
  preco: number; servico_ids?: string[]; ativo: boolean; created_at: string
}
export interface PacoteCliente {
  id: string; salao_id: string; cliente_id: string; pacote_id: string
  data_compra: string; sessoes_total: number; sessoes_usadas: number; created_at: string
}
export interface Agendamento {
  id: string; salao_id: string; cliente_id?: string; cliente_nome: string
  profissional_id?: string; profissional_nome?: string; servico_id?: string; servico_nome?: string
  data: string; hora: string; duracao_minutos: number; valor?: number
  forma_pagamento?: string; status: string; pacote_cliente_id?: string; observacoes?: string; created_at: string
}
export interface Transacao {
  id: string; salao_id: string; agendamento_id?: string; descricao: string
  tipo: 'receita' | 'despesa'; valor: number; forma_pagamento?: string; data: string; categoria?: string; created_at: string
}
export interface Lead {
  id: string; salao_id: string; nome: string; telefone?: string; email?: string
  origem?: string; status: string; interesse?: string; observacoes?: string; cliente_id?: string; created_at: string
}
export interface LeadCadence {
  id: string; salao_id: string; lead_id: string; tipo: string
  conteudo?: string; data_agendada?: string; status: string; created_at: string
}
export interface Meta {
  id: string; salao_id: string; profissional_id?: string; tipo: string
  valor_meta: number; periodo: string; data_inicio: string; data_fim: string; created_at: string
}

// ─── Clientes ───────────────────────────────────────────────────────────────
export const db = {
  clientes: {
    list: (salaoId: string) =>
      supabase.from('clientes').select('*').eq('salao_id', salaoId).order('nome'),
    create: (data: Omit<Cliente, 'id' | 'created_at'>) =>
      supabase.from('clientes').insert(data).select().single(),
    update: (id: string, data: Partial<Cliente>) =>
      supabase.from('clientes').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('clientes').delete().eq('id', id),
  },
  profissionais: {
    list: (salaoId: string, apenasAtivos = true) =>
      supabase.from('profissionais').select('*').eq('salao_id', salaoId)
        .eq('ativo', apenasAtivos).order('nome'),
    create: (data: Omit<Profissional, 'id' | 'created_at'>) =>
      supabase.from('profissionais').insert(data).select().single(),
    update: (id: string, data: Partial<Profissional>) =>
      supabase.from('profissionais').update(data).eq('id', id).select().single(),
  },
  servicos: {
    list: (salaoId: string, apenasAtivos = true) =>
      supabase.from('servicos').select('*').eq('salao_id', salaoId)
        .eq('ativo', apenasAtivos).order('nome'),
    create: (data: Omit<Servico, 'id' | 'created_at'>) =>
      supabase.from('servicos').insert(data).select().single(),
    update: (id: string, data: Partial<Servico>) =>
      supabase.from('servicos').update(data).eq('id', id).select().single(),
  },
  pacotes: {
    list: (salaoId: string) =>
      supabase.from('pacotes').select('*').eq('salao_id', salaoId).eq('ativo', true).order('nome'),
    create: (data: Omit<Pacote, 'id' | 'created_at'>) =>
      supabase.from('pacotes').insert(data).select().single(),
    update: (id: string, data: Partial<Pacote>) =>
      supabase.from('pacotes').update(data).eq('id', id).select().single(),
  },
  pacotesClientes: {
    list: (salaoId: string) =>
      supabase.from('pacotes_clientes').select('*, clientes(nome), pacotes(nome)').eq('salao_id', salaoId),
    create: (data: Omit<PacoteCliente, 'id' | 'created_at'>) =>
      supabase.from('pacotes_clientes').insert(data).select().single(),
    usarSessao: (id: string) =>
      supabase.rpc('usar_sessao_pacote', { pacote_cliente_id: id }),
  },
  agendamentos: {
    listByDate: (salaoId: string, data: string) =>
      supabase.from('agendamentos').select('*').eq('salao_id', salaoId).eq('data', data).order('hora'),
    listByRange: (salaoId: string, inicio: string, fim: string) =>
      supabase.from('agendamentos').select('*').eq('salao_id', salaoId)
        .gte('data', inicio).lte('data', fim).order('data').order('hora'),
    create: (data: Omit<Agendamento, 'id' | 'created_at'>) =>
      supabase.from('agendamentos').insert(data).select().single(),
    update: (id: string, data: Partial<Agendamento>) =>
      supabase.from('agendamentos').update(data).eq('id', id).select().single(),
  },
  transacoes: {
    listByMonth: (salaoId: string, ano: number, mes: number) => {
      const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
      const fim = `${ano}-${String(mes).padStart(2, '0')}-31`
      return supabase.from('transacoes').select('*').eq('salao_id', salaoId)
        .gte('data', inicio).lte('data', fim).order('data', { ascending: false })
    },
    create: (data: Omit<Transacao, 'id' | 'created_at'>) =>
      supabase.from('transacoes').insert(data).select().single(),
  },
  leads: {
    list: (salaoId: string) =>
      supabase.from('leads').select('*').eq('salao_id', salaoId).order('created_at', { ascending: false }),
    create: (data: Omit<Lead, 'id' | 'created_at'>) =>
      supabase.from('leads').insert(data).select().single(),
    update: (id: string, data: Partial<Lead>) =>
      supabase.from('leads').update(data).eq('id', id).select().single(),
  },
  leadCadences: {
    listByLead: (leadId: string) =>
      supabase.from('lead_cadences').select('*').eq('lead_id', leadId).order('data_agendada'),
    create: (data: Omit<LeadCadence, 'id' | 'created_at'>) =>
      supabase.from('lead_cadences').insert(data).select().single(),
    update: (id: string, data: Partial<LeadCadence>) =>
      supabase.from('lead_cadences').update(data).eq('id', id).select().single(),
  },
  metas: {
    list: (salaoId: string) =>
      supabase.from('metas').select('*, profissionais(nome)').eq('salao_id', salaoId),
    create: (data: Omit<Meta, 'id' | 'created_at'>) =>
      supabase.from('metas').insert(data).select().single(),
    update: (id: string, data: Partial<Meta>) =>
      supabase.from('metas').update(data).eq('id', id).select().single(),
  },
  saloes: {
    getBySlug: (slug: string) =>
      supabase.from('saloes').select('*').eq('slug', slug).single(),
    update: (id: string, data: Partial<Salao>) =>
      supabase.from('saloes').update(data).eq('id', id).select().single(),
  },
}
