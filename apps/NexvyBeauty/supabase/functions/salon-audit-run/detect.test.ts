// deno test — prova a varredura do Auditor com DADOS SEMEADOS (sem banco live).
//   deno test --no-check supabase/functions/salon-audit-run/detect.test.ts

import { assertEquals } from 'jsr:@std/assert@1'
import { buildPhoneCount, classifyCliente, hasCampo, type ClienteRow } from './detect.ts'

const base = (over: Partial<ClienteRow>): ClienteRow => ({
  id: 'c1', nome: 'Fulana', telefone: '11988887777',
  data_nascimento: null, email: null, cpf_cnpj: null,
  cep: null, logradouro: null, endereco: null, marketing_opt_out: false,
  ...over,
})

Deno.test('hasCampo: endereço conta se cep OU logradouro OU endereco legado', () => {
  assertEquals(hasCampo(base({ cep: '01001000' }), 'endereco'), true)
  assertEquals(hasCampo(base({ endereco: 'Rua X' }), 'endereco'), true)
  assertEquals(hasCampo(base({}), 'endereco'), false)
})

Deno.test('cliente sem nascimento e com telefone único → reachable, missing inclui nascimento', () => {
  const clientes = [base({ id: 'a', telefone: '11988887777' })]
  const pc = buildPhoneCount(clientes)
  const r = classifyCliente(clientes[0], pc)
  assertEquals(r.reachable, true)
  assertEquals(r.reason, 'ok')
  assertEquals(r.missing.includes('data_nascimento'), true)
})

Deno.test('telefone compartilhado por 2 clientes → ambíguo, NÃO alcançável', () => {
  const clientes = [
    base({ id: 'a', telefone: '11988887777' }),
    base({ id: 'b', telefone: '(11) 98888-7777' }), // mesmo número, máscara diferente
  ]
  const pc = buildPhoneCount(clientes)
  assertEquals(classifyCliente(clientes[0], pc).reason, 'ambiguous_phone')
  assertEquals(classifyCliente(clientes[0], pc).reachable, false)
})

Deno.test('sem telefone → no_phone, não alcançável', () => {
  const clientes = [base({ id: 'a', telefone: null })]
  const pc = buildPhoneCount(clientes)
  assertEquals(classifyCliente(clientes[0], pc).reason, 'no_phone')
})

Deno.test('opt-out (LGPD) → nunca alcançável, mesmo com telefone válido', () => {
  const clientes = [base({ id: 'a', telefone: '11988887777', marketing_opt_out: true })]
  const pc = buildPhoneCount(clientes)
  assertEquals(classifyCliente(clientes[0], pc).reason, 'opt_out')
  assertEquals(classifyCliente(clientes[0], pc).reachable, false)
})

Deno.test('cliente completo → missing vazio', () => {
  const clientes = [base({
    id: 'a', telefone: '11988887777',
    data_nascimento: '1990-03-12', email: 'a@x.com', cep: '01001000',
  })]
  const pc = buildPhoneCount(clientes)
  assertEquals(classifyCliente(clientes[0], pc).missing, [])
})
