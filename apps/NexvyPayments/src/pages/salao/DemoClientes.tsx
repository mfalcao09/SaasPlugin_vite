import Clientes, { type Cliente } from './Clientes'

// Seed fictício (rota /demo, sem auth, sem banco).
const SEED: Cliente[] = [
  { id: 'c1', nome: 'Marina Lopes', telefone: '(11) 98877-1020', email: 'marina.lopes@email.com', cpf_cnpj: '123.456.789-00', status: 'ativo', tags: ['VIP', 'mensalista'], observacoes: 'Prefere a Ana Paula.' },
  { id: 'c2', nome: 'Júlia Ferreira', telefone: '(11) 99654-3321', email: 'ju.ferreira@email.com', cpf_cnpj: null, status: 'ativo', tags: ['indicação'], observacoes: null },
  { id: 'c3', nome: 'Patrícia Gomes', telefone: '(11) 97432-8810', email: 'patricia.g@email.com', cpf_cnpj: null, status: 'ativo', tags: [], observacoes: 'Alergia a amônia.' },
  { id: 'c4', nome: 'Renata Dias', telefone: '(11) 96120-4477', email: null, cpf_cnpj: null, status: 'ativo', tags: ['nova'], observacoes: null },
  { id: 'c5', nome: 'Camila Souza', telefone: '(11) 98011-9090', email: 'camila.souza@email.com', cpf_cnpj: '987.654.321-00', status: 'ativo', tags: ['VIP'], observacoes: null },
  { id: 'c6', nome: 'Beatriz Almeida', telefone: '(11) 99320-1234', email: 'bia.almeida@email.com', cpf_cnpj: null, status: 'inativo', tags: [], observacoes: 'Sem retorno há 3 meses.' },
  { id: 'c7', nome: 'Fernanda Castro', telefone: '(11) 97788-5566', email: null, cpf_cnpj: null, status: 'ativo', tags: ['mensalista'], observacoes: null },
  { id: 'c8', nome: 'Larissa Pinto', telefone: '(11) 96655-7788', email: 'lari.pinto@email.com', cpf_cnpj: null, status: 'ativo', tags: ['aniversariante'], observacoes: 'Aniversário em julho.' },
]

export default function DemoClientes() {
  return <Clientes demo={SEED} />
}
