import Profissionais, { type Profissional } from './Profissionais'

const SEED: Profissional[] = [
  { id: 'p1', nome: 'Ana Paula Martins', email: 'ana@salao.com', telefone: '(11) 98800-1010', especialidades: ['Coloração', 'Corte'], comissao_pct: 40, ativo: true },
  { id: 'p2', nome: 'Bruna Reis', email: 'bruna@salao.com', telefone: '(11) 98700-2020', especialidades: ['Corte', 'Escova'], comissao_pct: 35, ativo: true },
  { id: 'p3', nome: 'Carla Souza', email: null, telefone: '(11) 98600-3030', especialidades: ['Manicure', 'Pedicure'], comissao_pct: 50, ativo: true },
  { id: 'p4', nome: 'Diego Lima', email: 'diego@salao.com', telefone: null, especialidades: ['Barba', 'Corte masculino'], comissao_pct: 45, ativo: true },
  { id: 'p5', nome: 'Elaine Costa', email: null, telefone: '(11) 98400-5050', especialidades: ['Sobrancelha', 'Estética'], comissao_pct: 30, ativo: false },
]

export default function DemoProfissionais() {
  return <Profissionais demo={SEED} />
}
