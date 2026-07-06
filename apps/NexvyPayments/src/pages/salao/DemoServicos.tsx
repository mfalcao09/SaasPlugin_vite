import Servicos, { type Servico } from './Servicos'

const SEED: Servico[] = [
  { id: 's1', nome: 'Corte feminino', categoria: 'Cabelo', duracao_minutos: 45, preco_base: 90, ativo: true, descricao: 'Corte + finalização' },
  { id: 's2', nome: 'Coloração', categoria: 'Cabelo', duracao_minutos: 120, preco_base: 220, ativo: true, descricao: 'Tinta + aplicação' },
  { id: 's3', nome: 'Hidratação', categoria: 'Tratamento', duracao_minutos: 40, preco_base: 80, ativo: true, descricao: null },
  { id: 's4', nome: 'Manicure', categoria: 'Unhas', duracao_minutos: 40, preco_base: 45, ativo: true, descricao: null },
  { id: 's5', nome: 'Pedicure', categoria: 'Unhas', duracao_minutos: 50, preco_base: 55, ativo: true, descricao: null },
  { id: 's6', nome: 'Escova', categoria: 'Cabelo', duracao_minutos: 30, preco_base: 60, ativo: true, descricao: null },
  { id: 's7', nome: 'Design de sobrancelha', categoria: 'Estética', duracao_minutos: 25, preco_base: 50, ativo: true, descricao: null },
  { id: 's8', nome: 'Progressiva', categoria: 'Cabelo', duracao_minutos: 180, preco_base: 350, ativo: false, descricao: 'Sazonal' },
]

export default function DemoServicos() {
  return <Servicos demo={SEED} />
}
