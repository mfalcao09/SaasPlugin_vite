// deno test — prova o núcleo de extração/prioridade/intenção com DADOS SEMEADOS,
// sem tocar no banco live. É o "smoke" do loop fechado no nível da lógica:
// resposta do cliente → valor canônico pronto pra gravar em clientes.<campo>.
//
//   deno test --no-check supabase/functions/salon-collect-inbound/extract.test.ts

import { assertEquals } from 'jsr:@std/assert@1'
import {
  extractField, isAffirmative, isNegative, isDecline, pickTopRequest, type Campo,
} from './extract.ts'

Deno.test('nascimento: DD/MM/YYYY grava direto (confiança 1.0)', () => {
  const r = extractField('data_nascimento', 'minha data é 12/03/1990')
  assertEquals(r.value, '1990-03-12')
  assertEquals(r.confidence, 1.0)
})

Deno.test('nascimento: ano de 2 dígitos → século de nascimento', () => {
  assertEquals(extractField('data_nascimento', '05/07/90').value, '1990-07-05')
  assertEquals(extractField('data_nascimento', '05/07/05').value, '2005-07-05')
})

Deno.test('nascimento: "12 de março de 1990" (por extenso, com ano)', () => {
  const r = extractField('data_nascimento', 'nasci em 12 de março de 1990')
  assertEquals(r.value, '1990-03-12')
  assertEquals(r.confidence, 1.0)
})

Deno.test('nascimento: DD/MM sem ano → confiança 0.5 (index pede o ano)', () => {
  const r = extractField('data_nascimento', 'faço aniversário 12/03')
  assertEquals(r.confidence, 0.5)
  assertEquals(r.value, '--03-12') // marcador MM-DD, não grava como date
})

Deno.test('nascimento: data inválida não casa (32/13)', () => {
  assertEquals(extractField('data_nascimento', 'sei lá, 32/13/1990').value, null)
})

Deno.test('email: extrai e normaliza pra minúsculas', () => {
  const r = extractField('email', 'pode mandar pra Ana.Silva@Exemplo.COM sim')
  assertEquals(r.value, 'ana.silva@exemplo.com')
  assertEquals(r.confidence, 1.0)
})

Deno.test('cpf: 11 dígitos com máscara', () => {
  assertEquals(extractField('cpf_cnpj', 'meu cpf 529.982.247-25').value, '52998224725')
})

Deno.test('endereco: CEP com máscara → 8 dígitos, index expande via BrasilAPI', () => {
  const r = extractField('endereco', 'meu cep é 01001-000')
  assertEquals(r.cep, '01001000')
  assertEquals(r.confidence, 1.0)
  assertEquals(r.value, null)
})

Deno.test('endereco: texto livre com "rua" → confiança 0.5 (confirma)', () => {
  const r = extractField('endereco', 'moro na Rua das Flores 123')
  assertEquals(r.confidence, 0.5)
})

Deno.test('intenção: afirmação (texto e emoji)', () => {
  assertEquals(isAffirmative('sim, é isso'), true)
  assertEquals(isAffirmative('👍'), true)
  assertEquals(isAffirmative('não'), false)
})

Deno.test('intenção: negação', () => {
  assertEquals(isNegative('não, errado'), true)
  assertEquals(isNegative('sim'), false)
})

Deno.test('intenção: recusa / opt-out (LGPD Art.18)', () => {
  assertEquals(isDecline('não quero receber isso'), true)
  assertEquals(isDecline('me remove da lista'), true)
  assertEquals(isDecline('12/03/1990'), false)
})

Deno.test('prioridade: nascimento vence endereco/email', () => {
  const reqs: Array<{ campo: Campo }> = [{ campo: 'email' }, { campo: 'data_nascimento' }, { campo: 'endereco' }]
  assertEquals(pickTopRequest(reqs)?.campo, 'data_nascimento')
})

Deno.test('prioridade: sem nascimento, endereco vence email', () => {
  const reqs: Array<{ campo: Campo }> = [{ campo: 'email' }, { campo: 'endereco' }]
  assertEquals(pickTopRequest(reqs)?.campo, 'endereco')
})
