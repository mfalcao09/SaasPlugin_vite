import { supabase } from './supabase'

export const db = {
  clientes: {
    list: (empresaId: string) =>
      supabase.from('clientes').select('*').eq('empresa_id', empresaId).order('nome'),
    create: (data: any) =>
      supabase.from('clientes').insert(data).select().single(),
    update: (id: string, data: any) =>
      supabase.from('clientes').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('clientes').delete().eq('id', id),
  },
  veiculos: {
    list: (empresaId: string) =>
      supabase.from('veiculos').select('*, clientes(nome)').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    listByCliente: (clienteId: string) =>
      supabase.from('veiculos').select('*').eq('cliente_id', clienteId),
    create: (data: any) =>
      supabase.from('veiculos').insert(data).select().single(),
    update: (id: string, data: any) =>
      supabase.from('veiculos').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('veiculos').delete().eq('id', id),
  },
  ordensServico: {
    list: (empresaId: string) =>
      supabase.from('ordens_servico').select('*, clientes(nome), veiculos(marca,modelo,placa)').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    create: (data: any) =>
      supabase.from('ordens_servico').insert(data).select().single(),
    update: (id: string, data: any) =>
      supabase.from('ordens_servico').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('ordens_servico').delete().eq('id', id),
  },
  orcamentos: {
    list: (empresaId: string) =>
      supabase.from('orcamentos').select('*, clientes(nome)').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    create: (data: any) =>
      supabase.from('orcamentos').insert(data).select().single(),
    update: (id: string, data: any) =>
      supabase.from('orcamentos').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('orcamentos').delete().eq('id', id),
  },
  lancamentos: {
    list: (empresaId: string) =>
      supabase.from('lancamentos').select('*').eq('empresa_id', empresaId).order('data', { ascending: false }).limit(200),
    create: (data: any) =>
      supabase.from('lancamentos').insert(data).select().single(),
    update: (id: string, data: any) =>
      supabase.from('lancamentos').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('lancamentos').delete().eq('id', id),
  },
  leads: {
    list: (empresaId: string) =>
      supabase.from('leads').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    create: (data: any) =>
      supabase.from('leads').insert(data).select().single(),
    update: (id: string, data: any) =>
      supabase.from('leads').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('leads').delete().eq('id', id),
  },
  metas: {
    list: (empresaId: string) =>
      supabase.from('metas').select('*').eq('empresa_id', empresaId),
    create: (data: any) =>
      supabase.from('metas').insert(data).select().single(),
    update: (id: string, data: any) =>
      supabase.from('metas').update(data).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('metas').delete().eq('id', id),
  },
}
