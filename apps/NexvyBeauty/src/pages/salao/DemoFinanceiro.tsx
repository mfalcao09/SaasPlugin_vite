import Financeiro, { type Lancamento } from './Financeiro'

const SEED: Lancamento[] = [
  { id: 'f1', descricao: 'Coloração — Marina Lopes', tipo: 'entrada', valor: 220, data: '2026-06-22', status: 'confirmado', forma: 'PIX', categoria: 'Serviço' },
  { id: 'f2', descricao: 'Corte — Júlia Ferreira', tipo: 'entrada', valor: 90, data: '2026-06-22', status: 'confirmado', forma: 'Cartão de crédito', categoria: 'Serviço' },
  { id: 'f3', descricao: 'Compra de produtos', tipo: 'saida', valor: 480, data: '2026-06-21', status: 'confirmado', forma: 'Boleto', categoria: 'Estoque' },
  { id: 'f4', descricao: 'Manicure — Patrícia Gomes', tipo: 'entrada', valor: 45, data: '2026-06-21', status: 'confirmado', forma: 'Dinheiro', categoria: 'Serviço' },
  { id: 'f5', descricao: 'Comissão profissionais', tipo: 'saida', valor: 1250, data: '2026-06-20', status: 'confirmado', forma: 'Transferência', categoria: 'Pessoal' },
  { id: 'f6', descricao: 'Hidratação — Camila Souza', tipo: 'entrada', valor: 80, data: '2026-06-20', status: 'confirmado', forma: 'PIX', categoria: 'Serviço' },
  { id: 'f7', descricao: 'Aluguel', tipo: 'saida', valor: 2800, data: '2026-06-19', status: 'confirmado', forma: 'Boleto', categoria: 'Fixo' },
  { id: 'f8', descricao: 'Progressiva — Fernanda Castro', tipo: 'entrada', valor: 350, data: '2026-06-19', status: 'confirmado', forma: 'Cartão de débito', categoria: 'Serviço' },
]

export default function DemoFinanceiro() {
  return <Financeiro demo={SEED} />
}
