import type { DashboardData } from './Dashboard'

// Dados FICTÍCIOS para o modo demonstração (rotas /demo, sem auth, sem banco).
// Espelham o shape real do Dashboard — nada aqui toca o Supabase.

export const DEMO_DASHBOARD: DashboardData = {
  agendamentosHoje: 7,
  agendamentosSemana: 38,
  faturamentoMes: 18750.5,
  ticketMedio: 142.3,
  clientes: 214,
  profissionaisAtivos: 5,
  chart: [
    { dia: '01', valor: 620 }, { dia: '03', valor: 880 }, { dia: '05', valor: 540 },
    { dia: '08', valor: 1120 }, { dia: '10', valor: 760 }, { dia: '12', valor: 1340 },
    { dia: '15', valor: 980 }, { dia: '17', valor: 1450 }, { dia: '19', valor: 1180 },
    { dia: '22', valor: 1620 }, { dia: '24', valor: 990 }, { dia: '26', valor: 1380 },
  ],
  topServicos: [
    { name: 'Corte feminino', value: 42 },
    { name: 'Coloração', value: 31 },
    { name: 'Manicure', value: 28 },
    { name: 'Hidratação', value: 19 },
    { name: 'Escova', value: 14 },
  ],
  topProfissionais: [
    { nome: 'Ana', valor: 6200 },
    { nome: 'Bruna', valor: 4850 },
    { nome: 'Carla', valor: 3900 },
    { nome: 'Daniela', valor: 2400 },
    { nome: 'Elaine', valor: 1400 },
  ],
  proximos: [
    { id: 'd1', data: null, hora: '14:00', status: 'confirmado', cliente_nome: 'Marina Lopes', servico_nome: 'Coloração', profissional_nome: 'Ana Paula' },
    { id: 'd2', data: null, hora: '15:30', status: 'agendado', cliente_nome: 'Júlia Ferreira', servico_nome: 'Corte feminino', profissional_nome: 'Bruna Reis' },
    { id: 'd3', data: null, hora: '16:00', status: 'confirmado', cliente_nome: 'Patrícia Gomes', servico_nome: 'Manicure', profissional_nome: 'Carla Souza' },
    { id: 'd4', data: null, hora: '17:15', status: 'agendado', cliente_nome: 'Renata Dias', servico_nome: 'Hidratação', profissional_nome: 'Ana Paula' },
  ],
}
