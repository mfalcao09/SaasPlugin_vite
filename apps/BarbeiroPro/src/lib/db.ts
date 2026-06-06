import { supabase } from './supabase'

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface Barbearia {
  id: string; nome: string; slug: string; email?: string; telefone?: string
  primary_color: string; logo_url?: string; ativo: boolean; created_at: string
}
export interface Customer {
  id: string; barbearia_id: string; nome: string; telefone?: string; email?: string
  data_nascimento?: string; observacoes?: string
  total_atendimentos: number; total_gasto: number; created_at: string
}
export interface Professional {
  id: string; barbearia_id: string; nome: string; email?: string; foto_url?: string
  especialidades?: string[]; comissao_pct: number; ativo: boolean; created_at: string
}
export interface Service {
  id: string; barbearia_id: string; nome: string; descricao?: string
  duracao_minutos: number; preco: number; categoria?: string; ativo: boolean; created_at: string
}
export interface ServiceCategory {
  id: string; barbearia_id: string; nome: string; ordem: number; created_at: string
}
export interface Appointment {
  id: string; barbearia_id: string; customer_id?: string; professional_id?: string
  service_id?: string; data: string; hora: string; duracao_minutos: number
  valor?: number; status: string; observacoes?: string; created_at: string
}
export interface FinancialEntry {
  id: string; barbearia_id: string; appointment_id?: string; descricao: string
  tipo: 'entrada' | 'saida'; valor: number; data: string; categoria?: string; created_at: string
}
export interface Lead {
  id: string; barbearia_id: string; nome: string; telefone?: string; email?: string
  origem?: string; status: string; interesse?: string; observacoes?: string
  cliente_id?: string; created_at: string
}
export interface LeadCadence {
  id: string; barbearia_id: string; lead_id: string; tipo: string
  conteudo?: string; data_agendada?: string; status: string; created_at: string
}
export interface Meta {
  id: string; barbearia_id: string; profissional_id?: string; tipo: string
  valor_meta: number; periodo: string; data_inicio: string; data_fim: string; created_at: string
}

// ─── Queries ─────────────────────────────────────────────────────────────────
export const db = {
  barbearias: {
    getBySlug: (slug: string) =>
      supabase.from('barbearias').select('*').eq('slug', slug).single(),
    update: (id: string, data: Partial<Barbearia>) =>
      supabase.from('barbearias').update(data).eq('id', id).select().single(),
  },
  customers: {
    list: (bid: string) =>
      supabase.from('customers').select('*').eq('barbearia_id', bid).order('nome'),
    create: (data: Omit<Customer, 'id' | 'created_at'>) =>
      supabase.from('customers').insert(data).select().single(),
    update: (id: string, data: Partial<Customer>) =>
      supabase.from('customers').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('customers').delete().eq('id', id),
  },
  professionals: {
    list: (bid: string, apenasAtivos = true) =>
      supabase.from('professionals').select('*').eq('barbearia_id', bid)
        .eq('ativo', apenasAtivos).order('nome'),
    create: (data: Omit<Professional, 'id' | 'created_at'>) =>
      supabase.from('professionals').insert(data).select().single(),
    update: (id: string, data: Partial<Professional>) =>
      supabase.from('professionals').update(data).eq('id', id).select().single(),
  },
  services: {
    list: (bid: string, apenasAtivos = true) =>
      supabase.from('services').select('*').eq('barbearia_id', bid)
        .eq('ativo', apenasAtivos).order('nome'),
    create: (data: Omit<Service, 'id' | 'created_at'>) =>
      supabase.from('services').insert(data).select().single(),
    update: (id: string, data: Partial<Service>) =>
      supabase.from('services').update(data).eq('id', id).select().single(),
  },
  serviceCategories: {
    list: (bid: string) =>
      supabase.from('service_categories').select('*').eq('barbearia_id', bid).order('ordem'),
    create: (data: Omit<ServiceCategory, 'id' | 'created_at'>) =>
      supabase.from('service_categories').insert(data).select().single(),
  },
  appointments: {
    listByDate: (bid: string, data: string) =>
      supabase.from('appointments').select('*').eq('barbearia_id', bid).eq('data', data).order('hora'),
    listByRange: (bid: string, inicio: string, fim: string) =>
      supabase.from('appointments').select('*').eq('barbearia_id', bid)
        .gte('data', inicio).lte('data', fim).order('data').order('hora'),
    create: (data: Omit<Appointment, 'id' | 'created_at'>) =>
      supabase.from('appointments').insert(data).select().single(),
    update: (id: string, data: Partial<Appointment>) =>
      supabase.from('appointments').update(data).eq('id', id).select().single(),
  },
  financialEntries: {
    listByMonth: (bid: string, ano: number, mes: number) => {
      const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
      const fim = `${ano}-${String(mes).padStart(2, '0')}-31`
      return supabase.from('financial_entries').select('*').eq('barbearia_id', bid)
        .gte('data', inicio).lte('data', fim).order('data', { ascending: false })
    },
    create: (data: Omit<FinancialEntry, 'id' | 'created_at'>) =>
      supabase.from('financial_entries').insert(data).select().single(),
  },
  leads: {
    list: (bid: string) =>
      supabase.from('leads').select('*').eq('barbearia_id', bid)
        .order('created_at', { ascending: false }),
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
    list: (bid: string) =>
      supabase.from('metas').select('*, professionals(nome)').eq('barbearia_id', bid),
    create: (data: Omit<Meta, 'id' | 'created_at'>) =>
      supabase.from('metas').insert(data).select().single(),
    update: (id: string, data: Partial<Meta>) =>
      supabase.from('metas').update(data).eq('id', id).select().single(),
  },
}
