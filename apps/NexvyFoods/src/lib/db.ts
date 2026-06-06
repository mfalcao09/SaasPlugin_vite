import { supabase } from './supabase'

export const db = {
  // ── Companies (restaurantes) ──────────────────────────────────────────────
  companies: {
    getById: (id: string) =>
      supabase
        .from('companies')
        .select('id, name, slug, phone, primary_color, logo_url, address, status, onboarding_completed, onboarding_step, plano, ciclo, status_cobranca')
        .eq('id', id)
        .single(),
    getBySlug: (slug: string) =>
      supabase
        .from('companies')
        .select('id, name, slug, phone, primary_color, logo_url, address, average_prep_time, business_hours')
        .eq('slug', slug)
        .single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('companies').update(d).eq('id', id).select().single(),
  },

  // ── Company Users ─────────────────────────────────────────────────────────
  companyUsers: {
    getByUserId: (userId: string) =>
      supabase
        .from('company_users')
        .select('company_id, role')
        .eq('user_id', userId)
        .single(),
    list: (companyId: string) =>
      supabase
        .from('company_users')
        .select('*')
        .eq('company_id', companyId)
        .order('name'),
    create: (data: Record<string, unknown>) =>
      supabase.from('company_users').insert(data).select().single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('company_users').update(d).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('company_users').delete().eq('id', id),
  },

  // ── Customers ─────────────────────────────────────────────────────────────
  customers: {
    list: (companyId: string) =>
      supabase
        .from('customers')
        .select('*')
        .eq('company_id', companyId)
        .order('name'),
    getById: (id: string) =>
      supabase.from('customers').select('*').eq('id', id).single(),
    create: (data: Record<string, unknown>) =>
      supabase.from('customers').insert(data).select().single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('customers').update(d).eq('id', id).select().single(),
    upsertByPhone: (companyId: string, phone: string, d: Record<string, unknown>) =>
      supabase
        .from('customers')
        .upsert({ ...d, company_id: companyId, phone })
        .select()
        .single(),
  },

  // ── Menu Categories ───────────────────────────────────────────────────────
  menuCategories: {
    list: (companyId: string) =>
      supabase
        .from('menu_categories')
        .select('*')
        .eq('company_id', companyId)
        .order('sort_order'),
    listActive: (companyId: string) =>
      supabase
        .from('menu_categories')
        .select('*')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('sort_order'),
    create: (data: Record<string, unknown>) =>
      supabase.from('menu_categories').insert(data).select().single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('menu_categories').update(d).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('menu_categories').delete().eq('id', id),
  },

  // ── Menu Items ────────────────────────────────────────────────────────────
  menuItems: {
    list: (companyId: string) =>
      supabase
        .from('menu_items')
        .select('*, menu_categories(name)')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name'),
    listAll: (companyId: string) =>
      supabase
        .from('menu_items')
        .select('*, menu_categories(name)')
        .eq('company_id', companyId)
        .order('name'),
    listByCategory: (companyId: string, categoryId: string) =>
      supabase
        .from('menu_items')
        .select('*')
        .eq('company_id', companyId)
        .eq('category_id', categoryId)
        .eq('active', true)
        .order('name'),
    listFeatured: (companyId: string) =>
      supabase
        .from('menu_items')
        .select('*')
        .eq('company_id', companyId)
        .eq('featured', true)
        .eq('active', true),
    create: (data: Record<string, unknown>) =>
      supabase.from('menu_items').insert(data).select().single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('menu_items').update(d).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('menu_items').delete().eq('id', id),
  },

  // ── Menu Item Extras ──────────────────────────────────────────────────────
  menuItemExtras: {
    listByItem: (menuItemId: string) =>
      supabase
        .from('menu_item_extras')
        .select('*')
        .eq('menu_item_id', menuItemId)
        .eq('active', true)
        .order('sort_order'),
    listByCompany: (companyId: string) =>
      supabase
        .from('menu_item_extras')
        .select('*')
        .eq('company_id', companyId),
    create: (data: Record<string, unknown>) =>
      supabase.from('menu_item_extras').insert(data).select().single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('menu_item_extras').update(d).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('menu_item_extras').delete().eq('id', id),
  },

  // ── Orders ────────────────────────────────────────────────────────────────
  orders: {
    list: (companyId: string) =>
      supabase
        .from('orders')
        .select('*, customers(name, phone)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(100),
    listActive: (companyId: string) =>
      supabase
        .from('orders')
        .select('*, customers(name, phone)')
        .eq('company_id', companyId)
        .not('status', 'in', '("entregue","cancelado","recusado")')
        .order('created_at', { ascending: false }),
    listByDate: (companyId: string, date: string) =>
      supabase
        .from('orders')
        .select('*, customers(name, phone)')
        .eq('company_id', companyId)
        .gte('created_at', `${date}T00:00:00`)
        .lte('created_at', `${date}T23:59:59`)
        .order('created_at', { ascending: false }),
    getById: (id: string) =>
      supabase
        .from('orders')
        .select('*, customers(name, phone, address), order_items(*)')
        .eq('id', id)
        .single(),
    create: (data: Record<string, unknown>) =>
      supabase.from('orders').insert(data).select().single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('orders').update(d).eq('id', id).select().single(),
  },

  // ── Order Items ───────────────────────────────────────────────────────────
  orderItems: {
    listByOrder: (orderId: string) =>
      supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId),
    create: (data: Record<string, unknown>) =>
      supabase.from('order_items').insert(data).select().single(),
    createBatch: (items: Record<string, unknown>[]) =>
      supabase.from('order_items').insert(items).select(),
    delete: (id: string) =>
      supabase.from('order_items').delete().eq('id', id),
  },

  // ── Delivery Zones ────────────────────────────────────────────────────────
  deliveryZones: {
    list: (companyId: string) =>
      supabase
        .from('delivery_zones')
        .select('*')
        .eq('company_id', companyId)
        .order('name'),
    listActive: (companyId: string) =>
      supabase
        .from('delivery_zones')
        .select('*')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name'),
    create: (data: Record<string, unknown>) =>
      supabase.from('delivery_zones').insert(data).select().single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('delivery_zones').update(d).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('delivery_zones').delete().eq('id', id),
  },

  // ── Financial Entries ─────────────────────────────────────────────────────
  financialEntries: {
    list: (companyId: string) =>
      supabase
        .from('financial_entries')
        .select('*')
        .eq('company_id', companyId)
        .order('date', { ascending: false })
        .limit(200),
    listByMonth: (companyId: string, year: number, month: number) => {
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const to   = `${year}-${String(month).padStart(2, '0')}-31`
      return supabase
        .from('financial_entries')
        .select('*')
        .eq('company_id', companyId)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })
    },
    create: (data: Record<string, unknown>) =>
      supabase.from('financial_entries').insert(data).select().single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('financial_entries').update(d).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('financial_entries').delete().eq('id', id),
  },

  // ── Riders ────────────────────────────────────────────────────────────────
  riders: {
    list: (companyId: string) =>
      supabase
        .from('riders')
        .select('*')
        .eq('company_id', companyId)
        .order('name'),
    listActive: (companyId: string) =>
      supabase
        .from('riders')
        .select('*')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name'),
    create: (data: Record<string, unknown>) =>
      supabase.from('riders').insert(data).select().single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('riders').update(d).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('riders').delete().eq('id', id),
  },

  // ── Leads (CRM) ───────────────────────────────────────────────────────────
  leads: {
    list: (companyId: string) =>
      supabase
        .from('leads')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
    getById: (id: string) =>
      supabase.from('leads').select('*').eq('id', id).single(),
    create: (data: Record<string, unknown>) =>
      supabase.from('leads').insert(data).select().single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('leads').update(d).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('leads').delete().eq('id', id),
  },

  // ── Lead Cadences ─────────────────────────────────────────────────────────
  leadCadences: {
    listByLead: (leadId: string) =>
      supabase
        .from('lead_cadences')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
    create: (data: Record<string, unknown>) =>
      supabase.from('lead_cadences').insert(data).select().single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('lead_cadences').update(d).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('lead_cadences').delete().eq('id', id),
  },

  // ── Metas ─────────────────────────────────────────────────────────────────
  metas: {
    list: (companyId: string) =>
      supabase
        .from('metas')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
    getActive: (companyId: string) =>
      supabase
        .from('metas')
        .select('*')
        .eq('company_id', companyId)
        .eq('ativo', true)
        .order('created_at', { ascending: false }),
    create: (data: Record<string, unknown>) =>
      supabase.from('metas').insert(data).select().single(),
    update: (id: string, d: Record<string, unknown>) =>
      supabase.from('metas').update(d).eq('id', id).select().single(),
    delete: (id: string) =>
      supabase.from('metas').delete().eq('id', id),
  },
}
