// ============================================
// DADOS DEMO — Hamburgueria do Zé
// Coerentes entre si para demonstração
// ============================================

export const DEMO_COMPANY = {
  name: 'Hamburgueria do Zé',
  slug: 'hamburgueria-ze',
  address: 'Rua das Flores, 234 — Vila Madalena, São Paulo',
  phone: '(11) 9 8765-4321',
  whatsapp: '11987654321',
  status: 'ativo',
};

export const DEMO_CATEGORIES = [
  { id: 'c1', name: 'Hambúrgueres', sort_order: 1 },
  { id: 'c2', name: 'Acompanhamentos', sort_order: 2 },
  { id: 'c3', name: 'Bebidas', sort_order: 3 },
  { id: 'c4', name: 'Sobremesas', sort_order: 4 },
];

export const DEMO_PRODUCTS = [
  { id: 'p1', category_id: 'c1', name: 'Smash Burger Duplo', description: 'Dois smash patties de 120g, queijo cheddar, cebola caramelizada, molho especial da casa', price: 32.00, featured: true, image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80' },
  { id: 'p2', category_id: 'c1', name: 'X-Bacon Artesanal', description: 'Blend 200g, bacon crocante, queijo prato, alface, tomate, maionese defumada', price: 28.00, featured: true, image_url: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=400&q=80' },
  { id: 'p3', category_id: 'c1', name: 'Classic Burger', description: 'Blend 180g, queijo americano, picles, ketchup, mostarda, pão brioche', price: 22.00, featured: false, image_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&q=80' },
  { id: 'p4', category_id: 'c1', name: 'Veggie Burger', description: 'Blend de grão de bico e ervas, queijo prato, rúcula, tomate seco, aioli de limão', price: 26.00, featured: false, image_url: 'https://images.unsplash.com/photo-1520072959219-c595dc870360?w=400&q=80' },
  { id: 'p5', category_id: 'c2', name: 'Batata Frita Rústica', description: 'Batata palito, sal grosso, ervas finas', price: 16.00, featured: false, image_url: 'https://images.unsplash.com/photo-1576107232684-1279f6dd1b1e?w=400&q=80' },
  { id: 'p6', category_id: 'c2', name: 'Onion Rings', description: 'Anéis de cebola empanados, molho ranch', price: 18.00, featured: false, image_url: 'https://images.unsplash.com/photo-1639024471283-03518883512d?w=400&q=80' },
  { id: 'p7', category_id: 'c3', name: 'Refrigerante 350ml', description: 'Coca-Cola, Guaraná ou Sprite', price: 7.00, featured: false, image_url: null },
  { id: 'p8', category_id: 'c3', name: 'Suco Natural 400ml', description: 'Laranja, limão ou maracujá', price: 12.00, featured: false, image_url: null },
  { id: 'p9', category_id: 'c3', name: 'Milkshake 400ml', description: 'Chocolate, baunilha ou morango', price: 18.00, featured: false, image_url: null },
  { id: 'p10', category_id: 'c4', name: 'Brownie com Sorvete', description: 'Brownie quente, sorvete de baunilha, calda de chocolate', price: 16.00, featured: false, image_url: null },
];

export const DEMO_ORDERS = [
  {
    id: 'o1', order_number: '#0047', status: 'novo', type: 'delivery',
    customer_name: 'Ana Clara Souza', customer_phone: '(11) 9 9111-2222',
    address: 'Rua das Acácias, 88', neighborhood: 'Pinheiros',
    items: [
      { name: 'Smash Burger Duplo', qty: 1, price: 32.00, notes: 'sem cebola' },
      { name: 'Batata Frita Rústica', qty: 1, price: 16.00, notes: '' },
      { name: 'Refrigerante 350ml', qty: 1, price: 7.00, notes: 'Coca-Cola' },
    ],
    subtotal: 55.00, delivery_fee: 6.00, total: 61.00,
    payment_method: 'pix', payment_status: 'pago',
    created_at: new Date(Date.now() - 3 * 60000).toISOString(),
  },
  {
    id: 'o2', order_number: '#0046', status: 'em_preparo', type: 'delivery',
    customer_name: 'Bruno Mendes', customer_phone: '(11) 9 8222-3333',
    address: 'Av. Paulista, 1200, ap 54', neighborhood: 'Bela Vista',
    items: [
      { name: 'X-Bacon Artesanal', qty: 2, price: 56.00, notes: 'ponto bem passado' },
      { name: 'Onion Rings', qty: 1, price: 18.00, notes: '' },
    ],
    subtotal: 74.00, delivery_fee: 8.00, total: 82.00,
    payment_method: 'cartao', payment_status: 'pago',
    created_at: new Date(Date.now() - 18 * 60000).toISOString(),
  },
  {
    id: 'o3', order_number: '#0045', status: 'pronto', type: 'pickup',
    customer_name: 'Carla Nunes', customer_phone: '(11) 9 7333-4444',
    address: '', neighborhood: '',
    items: [
      { name: 'Classic Burger', qty: 1, price: 22.00, notes: '' },
      { name: 'Batata Frita Rústica', qty: 1, price: 16.00, notes: '' },
      { name: 'Milkshake 400ml', qty: 1, price: 18.00, notes: 'chocolate' },
    ],
    subtotal: 56.00, delivery_fee: 0, total: 56.00,
    payment_method: 'dinheiro', payment_status: 'pendente',
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
  },
  {
    id: 'o4', order_number: '#0044', status: 'saiu_entrega', type: 'delivery',
    customer_name: 'Diego Rocha', customer_phone: '(11) 9 6444-5555',
    address: 'Rua Oscar Freire, 45', neighborhood: 'Cerqueira César',
    items: [
      { name: 'Smash Burger Duplo', qty: 1, price: 32.00, notes: '' },
      { name: 'Veggie Burger', qty: 1, price: 26.00, notes: '' },
    ],
    subtotal: 58.00, delivery_fee: 7.00, total: 65.00,
    payment_method: 'pix', payment_status: 'pago',
    created_at: new Date(Date.now() - 45 * 60000).toISOString(),
    rider_name: 'Marcos (Moto)',
  },
  {
    id: 'o5', order_number: '#0043', status: 'entregue', type: 'delivery',
    customer_name: 'Eduarda Lima', customer_phone: '(11) 9 5555-6666',
    address: 'Rua Teodoro Sampaio, 200', neighborhood: 'Pinheiros',
    items: [
      { name: 'X-Bacon Artesanal', qty: 1, price: 28.00, notes: '' },
      { name: 'Suco Natural 400ml', qty: 1, price: 12.00, notes: 'laranja' },
      { name: 'Brownie com Sorvete', qty: 1, price: 16.00, notes: '' },
    ],
    subtotal: 56.00, delivery_fee: 6.00, total: 62.00,
    payment_method: 'cartao', payment_status: 'pago',
    created_at: new Date(Date.now() - 72 * 60000).toISOString(),
    rider_name: 'João (Moto)',
  },
  {
    id: 'o6', order_number: '#0042', status: 'entregue', type: 'delivery',
    customer_name: 'Felipe Cardoso', customer_phone: '(11) 9 4666-7777',
    address: 'Rua Haddock Lobo, 99', neighborhood: 'Jardins',
    items: [
      { name: 'Classic Burger', qty: 2, price: 44.00, notes: '' },
      { name: 'Batata Frita Rústica', qty: 2, price: 32.00, notes: '' },
      { name: 'Refrigerante 350ml', qty: 2, price: 14.00, notes: '' },
    ],
    subtotal: 90.00, delivery_fee: 8.00, total: 98.00,
    payment_method: 'pix', payment_status: 'pago',
    created_at: new Date(Date.now() - 100 * 60000).toISOString(),
    rider_name: 'Marcos (Moto)',
  },
];

export const DEMO_CUSTOMERS = [
  { id: 'cu1', name: 'Ana Clara Souza', phone: '(11) 9 9111-2222', neighborhood: 'Pinheiros', total_orders: 8, last_order_at: new Date(Date.now() - 3 * 60000).toISOString(), status: 'ativo' },
  { id: 'cu2', name: 'Bruno Mendes', phone: '(11) 9 8222-3333', neighborhood: 'Bela Vista', total_orders: 5, last_order_at: new Date(Date.now() - 18 * 60000).toISOString(), status: 'ativo' },
  { id: 'cu3', name: 'Carla Nunes', phone: '(11) 9 7333-4444', neighborhood: 'Centro', total_orders: 3, last_order_at: new Date(Date.now() - 30 * 60000).toISOString(), status: 'ativo' },
  { id: 'cu4', name: 'Diego Rocha', phone: '(11) 9 6444-5555', neighborhood: 'Cerqueira César', total_orders: 12, last_order_at: new Date(Date.now() - 45 * 60000).toISOString(), status: 'ativo' },
  { id: 'cu5', name: 'Eduarda Lima', phone: '(11) 9 5555-6666', neighborhood: 'Pinheiros', total_orders: 6, last_order_at: new Date(Date.now() - 72 * 60000).toISOString(), status: 'ativo' },
  { id: 'cu6', name: 'Felipe Cardoso', phone: '(11) 9 4666-7777', neighborhood: 'Jardins', total_orders: 4, last_order_at: new Date(Date.now() - 100 * 60000).toISOString(), status: 'ativo' },
  { id: 'cu7', name: 'Gabriela Torres', phone: '(11) 9 3777-8888', neighborhood: 'Vila Madalena', total_orders: 9, last_order_at: new Date(Date.now() - 18 * 24 * 60 * 60000).toISOString(), status: 'inativo' },
  { id: 'cu8', name: 'Henrique Costa', phone: '(11) 9 2888-9999', neighborhood: 'Moema', total_orders: 2, last_order_at: new Date(Date.now() - 22 * 24 * 60 * 60000).toISOString(), status: 'inativo' },
];

export const DEMO_RIDERS = [
  { id: 'r1', name: 'Marcos Silva', phone: '(11) 9 9000-1111', vehicle_type: 'moto', active: true, deliveries_today: 8 },
  { id: 'r2', name: 'João Pedro', phone: '(11) 9 8001-2222', vehicle_type: 'moto', active: true, deliveries_today: 6 },
  { id: 'r3', name: 'Lucas Ferreira', phone: '(11) 9 7002-3333', vehicle_type: 'bicicleta', active: false, deliveries_today: 0 },
];

export const DEMO_FINANCIAL = [
  { id: 'f1', type: 'entrada', description: 'Pedido #0043 — Eduarda Lima', amount: 62.00, date: '2024-04-07', status: 'pago' },
  { id: 'f2', type: 'entrada', description: 'Pedido #0042 — Felipe Cardoso', amount: 98.00, date: '2024-04-07', status: 'pago' },
  { id: 'f3', type: 'entrada', description: 'Pedido #0041 — Ana Rodrigues', amount: 54.00, date: '2024-04-06', status: 'pago' },
  { id: 'f4', type: 'saida', description: 'Embalagens e descartáveis', amount: 80.00, date: '2024-04-06', status: 'pago' },
  { id: 'f5', type: 'entrada', description: 'Pedido #0040 — Carlos Oliveira', amount: 75.00, date: '2024-04-06', status: 'pago' },
  { id: 'f6', type: 'saida', description: 'Insumos cozinha', amount: 320.00, date: '2024-04-05', status: 'pago' },
  { id: 'f7', type: 'entrada', description: 'Pedido #0039 — Mariana Cruz', amount: 66.00, date: '2024-04-05', status: 'pago' },
  { id: 'f8', type: 'entrada', description: 'Pedido #0038 — Paulo Lima', amount: 42.00, date: '2024-04-05', status: 'pago' },
];

export const DEMO_WEEKLY_SALES = [
  { day: 'Seg', pedidos: 8, faturamento: 340 },
  { day: 'Ter', pedidos: 6, faturamento: 260 },
  { day: 'Qua', pedidos: 11, faturamento: 480 },
  { day: 'Qui', pedidos: 14, faturamento: 620 },
  { day: 'Sex', pedidos: 22, faturamento: 940 },
  { day: 'Sab', pedidos: 28, faturamento: 1240 },
  { day: 'Dom', pedidos: 18, faturamento: 790 },
];

export const DEMO_TOP_PRODUCTS = [
  { name: 'Smash Burger Duplo', qty: 156, revenue: 4992 },
  { name: 'X-Bacon Artesanal', qty: 134, revenue: 3752 },
  { name: 'Batata Frita Rústica', qty: 128, revenue: 2048 },
  { name: 'Classic Burger', qty: 98, revenue: 2156 },
  { name: 'Milkshake 400ml', qty: 87, revenue: 1566 },
];

export const DEMO_ZONES = [
  { id: 'z1', name: 'Pinheiros', fee: 6.00, estimated_minutes: 30 },
  { id: 'z2', name: 'Vila Madalena', fee: 5.00, estimated_minutes: 25 },
  { id: 'z3', name: 'Jardins', fee: 8.00, estimated_minutes: 35 },
  { id: 'z4', name: 'Bela Vista', fee: 8.00, estimated_minutes: 40 },
  { id: 'z5', name: 'Cerqueira César', fee: 7.00, estimated_minutes: 35 },
];

export function getStatusConfig(status) {
  const map = {
    novo: { label: 'Novo', bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
    aceito: { label: 'Aceito', bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
    em_preparo: { label: 'Em Preparo', bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
    pronto: { label: 'Pronto', bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
    saiu_entrega: { label: 'Saiu para Entrega', bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-500' },
    entregue: { label: 'Entregue', bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500' },
    cancelado: { label: 'Cancelado', bg: 'bg-gray-100', text: 'text-gray-800', dot: 'bg-gray-400' },
    recusado: { label: 'Recusado', bg: 'bg-gray-100', text: 'text-gray-800', dot: 'bg-gray-400' },
  };
  return map[status] || map.cancelado;
}

export function timeSince(isoDate) {
  const diff = Math.floor((Date.now() - new Date(isoDate)) / 60000);
  if (diff < 1) return 'agora';
  if (diff < 60) return `${diff} min`;
  const h = Math.floor(diff / 60);
  return `${h}h ${diff % 60}min`;
}