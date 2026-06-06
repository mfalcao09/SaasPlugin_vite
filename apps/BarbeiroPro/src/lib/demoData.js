export const demoCompany = {
  id: 'demo-company',
  name: 'Barbearia Studio 47',
  slug: 'studio47',
  phone: '(11) 98765-4321',
  whatsapp: '11987654321',
  address: 'Rua das Palmeiras, 47 - Vila Madalena, SP',
  primary_color: '#1B3A4B',
  logo_url: null,
  business_hours: {
    seg: { open: '09:00', close: '20:00', active: true },
    ter: { open: '09:00', close: '20:00', active: true },
    qua: { open: '09:00', close: '20:00', active: true },
    qui: { open: '09:00', close: '20:00', active: true },
    sex: { open: '09:00', close: '20:00', active: true },
    sab: { open: '09:00', close: '18:00', active: true },
    dom: { open: '10:00', close: '16:00', active: false },
  }
};

export const demoServices = [
  { id: 's1', name: 'Corte Clássico', duration_minutes: 30, price: 45, featured: true, category_id: 'cat1', active: true, description: 'Corte tradicional com acabamento impecável' },
  { id: 's2', name: 'Barba Completa', duration_minutes: 30, price: 40, featured: true, category_id: 'cat1', active: true, description: 'Toalha quente, navalha e hidratação' },
  { id: 's3', name: 'Corte + Barba', duration_minutes: 60, price: 75, featured: true, category_id: 'cat1', active: true, description: 'O combo mais pedido da casa' },
  { id: 's4', name: 'Acabamento', duration_minutes: 15, price: 25, featured: false, category_id: 'cat1', active: true, description: 'Finalização com pente e tesoura' },
  { id: 's5', name: 'Sobrancelha', duration_minutes: 15, price: 20, featured: false, category_id: 'cat2', active: true, description: 'Design e acabamento da sobrancelha' },
  { id: 's6', name: 'Hidratação', duration_minutes: 20, price: 35, featured: false, category_id: 'cat2', active: true, description: 'Tratamento profundo para cabelo e barba' },
];

export const demoProfessionals = [
  { id: 'p1', name: 'Carlos Henrique', specialty: 'Corte & Degradê', active: true, photo_url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=150&h=150&fit=crop&auto=format' },
  { id: 'p2', name: 'Rafael Torres', specialty: 'Barba & Navalha', active: true, photo_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&auto=format' },
  { id: 'p3', name: 'Lucas Mendes', specialty: 'Coloração & Tratamento', active: true, photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&auto=format' },
];

export const demoCustomers = [
  { id: 'c1', name: 'André Souza', phone: '(11) 99001-1111', email: 'andre@email.com', total_appointments: 14, last_appointment_at: '2026-03-28', favorite_service: 'Corte + Barba', tags: ['recorrente', 'vip'], status: 'vip' },
  { id: 'c2', name: 'Bruno Lima', phone: '(11) 99002-2222', email: 'bruno@email.com', total_appointments: 8, last_appointment_at: '2026-03-15', favorite_service: 'Corte Clássico', tags: ['recorrente'], status: 'active' },
  { id: 'c3', name: 'Caio Martins', phone: '(11) 99003-3333', email: 'caio@email.com', total_appointments: 3, last_appointment_at: '2026-02-10', favorite_service: 'Barba Completa', tags: ['inativo'], status: 'inactive' },
  { id: 'c4', name: 'Diego Fernandes', phone: '(11) 99004-4444', email: 'diego@email.com', total_appointments: 22, last_appointment_at: '2026-04-01', favorite_service: 'Corte + Barba', tags: ['recorrente', 'vip'], status: 'vip' },
  { id: 'c5', name: 'Eduardo Costa', phone: '(11) 99005-5555', email: 'edu@email.com', total_appointments: 5, last_appointment_at: '2026-02-20', favorite_service: 'Corte Clássico', tags: ['inativo'], status: 'inactive' },
  { id: 'c6', name: 'Fábio Rocha', phone: '(11) 99006-6666', email: 'fabio@email.com', total_appointments: 11, last_appointment_at: '2026-03-30', favorite_service: 'Corte Clássico', tags: ['recorrente'], status: 'active' },
  { id: 'c7', name: 'Gabriel Nunes', phone: '(11) 99007-7777', email: 'gabriel@email.com', total_appointments: 2, last_appointment_at: '2026-01-15', favorite_service: 'Sobrancelha', tags: ['inativo'], status: 'inactive' },
  { id: 'c8', name: 'Henrique Dias', phone: '(11) 99008-8888', email: 'henrique@email.com', total_appointments: 18, last_appointment_at: '2026-04-05', favorite_service: 'Corte + Barba', tags: ['recorrente', 'vip'], status: 'vip' },
];

const today = new Date();
const fmt = (d) => d.toISOString();
const addHours = (h) => { const d = new Date(today); d.setHours(h, 0, 0, 0); return d; };
const addDays = (n, h = 10) => { const d = new Date(today); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d; };

export const demoAppointments = [
  { id: 'a1', customer_id: 'c1', professional_id: 'p1', service_id: 's3', customer_name: 'André Souza', professional_name: 'Carlos Henrique', service_name: 'Corte + Barba', scheduled_at: fmt(addHours(9)), status: 'confirmado', price: 75, source: 'online' },
  { id: 'a2', customer_id: 'c4', professional_id: 'p2', service_id: 's2', customer_name: 'Diego Fernandes', professional_name: 'Rafael Torres', service_name: 'Barba Completa', scheduled_at: fmt(addHours(10)), status: 'em_atendimento', price: 40, source: 'online' },
  { id: 'a3', customer_id: 'c8', professional_id: 'p3', service_id: 's1', customer_name: 'Henrique Dias', professional_name: 'Lucas Mendes', service_name: 'Corte Clássico', scheduled_at: fmt(addHours(11)), status: 'agendado', price: 45, source: 'interno' },
  { id: 'a4', customer_id: 'c2', professional_id: 'p1', service_id: 's1', customer_name: 'Bruno Lima', professional_name: 'Carlos Henrique', service_name: 'Corte Clássico', scheduled_at: fmt(addHours(14)), status: 'agendado', price: 45, source: 'online' },
  { id: 'a5', customer_id: 'c6', professional_id: 'p2', service_id: 's3', customer_name: 'Fábio Rocha', professional_name: 'Rafael Torres', service_name: 'Corte + Barba', scheduled_at: fmt(addHours(15)), status: 'agendado', price: 75, source: 'online' },
  { id: 'a6', customer_id: 'c1', professional_id: 'p1', service_id: 's3', customer_name: 'André Souza', professional_name: 'Carlos Henrique', service_name: 'Corte + Barba', scheduled_at: fmt(addDays(-1, 9)), status: 'concluido', price: 75, source: 'online' },
  { id: 'a7', customer_id: 'c2', professional_id: 'p2', service_id: 's2', customer_name: 'Bruno Lima', professional_name: 'Rafael Torres', service_name: 'Barba Completa', scheduled_at: fmt(addDays(-1, 11)), status: 'concluido', price: 40, source: 'interno' },
  { id: 'a8', customer_id: 'c3', professional_id: 'p3', service_id: 's1', customer_name: 'Caio Martins', professional_name: 'Lucas Mendes', service_name: 'Corte Clássico', scheduled_at: fmt(addDays(-1, 14)), status: 'faltou', price: 45, source: 'online' },
  { id: 'a9', customer_id: 'c4', professional_id: 'p1', service_id: 's3', customer_name: 'Diego Fernandes', professional_name: 'Carlos Henrique', service_name: 'Corte + Barba', scheduled_at: fmt(addDays(1, 10)), status: 'agendado', price: 75, source: 'online' },
  { id: 'a10', customer_id: 'c8', professional_id: 'p2', service_id: 's2', customer_name: 'Henrique Dias', professional_name: 'Rafael Torres', service_name: 'Barba Completa', scheduled_at: fmt(addDays(1, 14)), status: 'agendado', price: 40, source: 'online' },
];

export const demoFinancial = [
  { id: 'f1', type: 'entrada', description: 'Corte + Barba - André Souza', amount: 75, date: '2026-04-06', category: 'Atendimento', status: 'confirmado' },
  { id: 'f2', type: 'entrada', description: 'Barba Completa - Bruno Lima', amount: 40, date: '2026-04-06', category: 'Atendimento', status: 'confirmado' },
  { id: 'f3', type: 'entrada', description: 'Corte Clássico - Diego Fernandes', amount: 45, date: '2026-04-05', category: 'Atendimento', status: 'confirmado' },
  { id: 'f4', type: 'saida', description: 'Produtos de barba', amount: 120, date: '2026-04-04', category: 'Suprimentos', status: 'confirmado' },
  { id: 'f5', type: 'entrada', description: 'Corte + Barba - Fábio Rocha', amount: 75, date: '2026-04-04', category: 'Atendimento', status: 'confirmado' },
  { id: 'f6', type: 'entrada', description: 'Corte Clássico - Caio Martins', amount: 45, date: '2026-04-03', category: 'Atendimento', status: 'confirmado' },
  { id: 'f7', type: 'saida', description: 'Aluguel', amount: 2500, date: '2026-04-01', category: 'Fixo', status: 'confirmado' },
  { id: 'f8', type: 'entrada', description: 'Corte + Barba - Henrique Dias', amount: 75, date: '2026-04-02', category: 'Atendimento', status: 'confirmado' },
];

export const demoAIInsights = [
  { id: 'ai1', type: 'reativacao', title: '12 clientes inativos detectados', description: 'Esses clientes não aparecem há mais de 30 dias. Frequência histórica era de 15 dias.', priority: 'alta', count: 12, message: 'Ei, [Nome]! Faz tempo que não te vemos por aqui no Studio 47 😎 Que tal garantir seu horário essa semana? Está sobrando espaço!' },
  { id: 'ai2', type: 'horario_fraco', title: 'Segunda-feira 13h–15h sem agendamentos', description: 'Nas últimas 4 semanas, esse horário ficou vazio. Considere uma promoção pontual.', priority: 'media', count: 4, message: 'Lançamento especial Studio 47: segunda-feira das 13h às 15h com 20% de desconto. Vagas limitadas! Agende agora.' },
  { id: 'ai3', type: 'vip_ausente', title: '3 clientes VIP sem retorno em 21 dias', description: 'Clientes que historicamente gastam mais de R$200/mês estão com retorno atrasado.', priority: 'alta', count: 3, message: 'Olá, [Nome]! Seu lugar preferido no Studio 47 está esperando por você. Agendamento disponível esta semana, é só confirmar!' },
  { id: 'ai4', type: 'servico_baixo', title: 'Hidratação vendida apenas 2x este mês', description: 'Serviço tem boa margem mas baixa demanda. Experimente oferecer como combo.', priority: 'baixa', count: 2, message: 'Dica Studio 47: que tal incluir nossa hidratação no seu próximo corte? 20 min extras que fazem toda a diferença!' },
];