import Agenda, { type Agendamento } from './Agenda'

const SEED: Agendamento[] = [
  { id: 'a1', cliente_nome: 'Marina Lopes', profissional_nome: 'Ana Paula', servico_nome: 'Coloração', data: '2026-06-22', hora: '14:00', valor: 220, status: 'agendado' },
  { id: 'a2', cliente_nome: 'Júlia Ferreira', profissional_nome: 'Bruna Reis', servico_nome: 'Corte feminino', data: '2026-06-22', hora: '15:30', valor: 90, status: 'agendado' },
  { id: 'a3', cliente_nome: 'Patrícia Gomes', profissional_nome: 'Carla Souza', servico_nome: 'Manicure', data: '2026-06-22', hora: '16:00', valor: 45, status: 'agendado' },
  { id: 'a4', cliente_nome: 'Camila Souza', profissional_nome: 'Ana Paula', servico_nome: 'Hidratação', data: '2026-06-21', hora: '10:00', valor: 80, status: 'concluido' },
  { id: 'a5', cliente_nome: 'Fernanda Castro', profissional_nome: 'Bruna Reis', servico_nome: 'Escova', data: '2026-06-21', hora: '11:30', valor: 60, status: 'concluido' },
  { id: 'a6', cliente_nome: 'Beatriz Almeida', profissional_nome: 'Carla Souza', servico_nome: 'Pedicure', data: '2026-06-20', hora: '17:00', valor: 55, status: 'cancelado' },
]

export default function DemoAgenda() {
  return <Agenda demo={SEED} />
}
