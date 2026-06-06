import { supabase } from './supabase'

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface Academia {
  id: string
  nome: string
  slug: string
  email?: string
  telefone?: string
  primary_color: string
  endereco?: string
  ativo: boolean
  created_at: string
}

export interface AcademyUser {
  id: string
  academia_id: string
  user_id: string
  role: 'owner' | 'admin' | 'recepcao' | 'professor' | 'financeiro'
}

export interface Student {
  id: string
  academia_id: string
  nome: string
  email?: string
  telefone?: string
  data_nascimento?: string
  foto_url?: string
  plano_id?: string
  plano_nome?: string
  data_inicio?: string
  data_vencimento?: string
  status: 'ativo' | 'inativo' | 'bloqueado'
  observacoes?: string
  tags?: string[]
  created_at: string
}

export interface Plan {
  id: string
  academia_id: string
  nome: string
  descricao?: string
  preco: number
  duracao_dias: number
  modalidades?: string[]
  recorrencia?: 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'avulso'
  ativo: boolean
  created_at: string
}

export interface Schedule {
  id: string
  academia_id: string
  student_id: string
  student_nome?: string
  type: 'Avaliação Inicial' | 'Retorno de Avaliação' | 'Consulta' | 'Aula Experimental' | 'Outro'
  date: string
  time: string
  professor?: string
  status: 'agendado' | 'concluído' | 'cancelado'
  notes?: string
  created_at: string
}

export interface Checkin {
  id: string
  academia_id: string
  student_id: string
  student_nome?: string
  date: string
  time?: string
  modality?: string
  professor?: string
  notes?: string
  created_at: string
}

export interface Financial {
  id: string
  academia_id: string
  student_id?: string
  descricao: string
  tipo: 'receita' | 'despesa'
  valor: number
  data: string
  data_vencimento?: string
  categoria?: string
  status_pagamento: 'pago' | 'pendente' | 'cancelado'
  created_at: string
}

export interface Lead {
  id: string
  academia_id: string
  nome: string
  telefone?: string
  email?: string
  origem?: string
  status: string
  interesse?: string
  observacoes?: string
  created_at: string
}

export interface LeadCadence {
  id: string
  academia_id: string
  lead_id: string
  tipo: string
  conteudo?: string
  data_agendada?: string
  status: string
  created_at: string
}

export interface Meta {
  id: string
  academia_id: string
  membro_id?: string
  tipo: string
  valor_meta: number
  periodo: string
  data_inicio: string
  data_fim: string
  created_at: string
}

// ─── db object ─────────────────────────────────────────────────────────────

export const db = {
  academias: {
    getBySlug: (slug: string) =>
      supabase.from('academias').select('*').eq('slug', slug).single(),
    update: (id: string, data: Partial<Academia>) =>
      supabase.from('academias').update(data).eq('id', id).select().single(),
  },

  academyUsers: {
    getByUserId: (userId: string) =>
      supabase.from('academy_users').select('academia_id').eq('user_id', userId).single(),
  },

  students: {
    list: (academiaId: string) =>
      supabase.from('students').select('*').eq('academia_id', academiaId).order('nome'),
    getExpiring: (academiaId: string, limitDate: string) =>
      supabase
        .from('students')
        .select('*')
        .eq('academia_id', academiaId)
        .eq('status', 'ativo')
        .lte('data_vencimento', limitDate)
        .order('data_vencimento'),
    create: (data: Omit<Student, 'id' | 'created_at'>) =>
      supabase.from('students').insert(data).select().single(),
    update: (id: string, data: Partial<Student>) =>
      supabase.from('students').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('students').delete().eq('id', id),
  },

  plans: {
    list: (academiaId: string, apenasAtivos = true) =>
      supabase
        .from('plans')
        .select('*')
        .eq('academia_id', academiaId)
        .eq('ativo', apenasAtivos)
        .order('nome'),
    create: (data: Omit<Plan, 'id' | 'created_at'>) =>
      supabase.from('plans').insert(data).select().single(),
    update: (id: string, data: Partial<Plan>) =>
      supabase.from('plans').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('plans').delete().eq('id', id),
  },

  schedules: {
    list: (academiaId: string) =>
      supabase.from('schedules').select('*').eq('academia_id', academiaId).order('date').order('time'),
    listByDate: (academiaId: string, date: string) =>
      supabase.from('schedules').select('*').eq('academia_id', academiaId).eq('date', date).order('time'),
    create: (data: Omit<Schedule, 'id' | 'created_at'>) =>
      supabase.from('schedules').insert(data).select().single(),
    update: (id: string, data: Partial<Schedule>) =>
      supabase.from('schedules').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('schedules').delete().eq('id', id),
  },

  checkins: {
    list: (academiaId: string) =>
      supabase
        .from('checkins')
        .select('*')
        .eq('academia_id', academiaId)
        .order('date', { ascending: false })
        .order('time', { ascending: false }),
    listByDate: (academiaId: string, date: string) =>
      supabase.from('checkins').select('*').eq('academia_id', academiaId).eq('date', date).order('time'),
    listByMonth: (academiaId: string, ano: number, mes: number) => {
      const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
      const fim = `${ano}-${String(mes).padStart(2, '0')}-31`
      return supabase
        .from('checkins')
        .select('*')
        .eq('academia_id', academiaId)
        .gte('date', inicio)
        .lte('date', fim)
    },
    create: (data: Omit<Checkin, 'id' | 'created_at'>) =>
      supabase.from('checkins').insert(data).select().single(),
  },

  financial: {
    list: (academiaId: string) =>
      supabase
        .from('financial')
        .select('*')
        .eq('academia_id', academiaId)
        .order('data', { ascending: false }),
    listByMonth: (academiaId: string, ano: number, mes: number) => {
      const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
      const fim = `${ano}-${String(mes).padStart(2, '0')}-31`
      return supabase
        .from('financial')
        .select('*')
        .eq('academia_id', academiaId)
        .gte('data', inicio)
        .lte('data', fim)
        .order('data', { ascending: false })
    },
    create: (data: Omit<Financial, 'id' | 'created_at'>) =>
      supabase.from('financial').insert(data).select().single(),
    update: (id: string, data: Partial<Financial>) =>
      supabase.from('financial').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('financial').delete().eq('id', id),
  },

  leads: {
    list: (academiaId: string) =>
      supabase
        .from('leads')
        .select('*')
        .eq('academia_id', academiaId)
        .order('created_at', { ascending: false }),
    create: (data: Omit<Lead, 'id' | 'created_at'>) =>
      supabase.from('leads').insert(data).select().single(),
    update: (id: string, data: Partial<Lead>) =>
      supabase.from('leads').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('leads').delete().eq('id', id),
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
    list: (academiaId: string) =>
      supabase.from('metas').select('*').eq('academia_id', academiaId),
    create: (data: Omit<Meta, 'id' | 'created_at'>) =>
      supabase.from('metas').insert(data).select().single(),
    update: (id: string, data: Partial<Meta>) =>
      supabase.from('metas').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('metas').delete().eq('id', id),
  },
}
