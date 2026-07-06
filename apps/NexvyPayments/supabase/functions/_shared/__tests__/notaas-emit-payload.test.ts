// _shared/__tests__/notaas-emit-payload.test.ts
//
// Suíte `deno test` PURA (zero rede, zero mock de supabase) para a montagem do
// payload de emissão NFS-e do NotaAS `_shared/notaas-emit-payload.ts` — C1.
//
// A função é 100% pura: recebe (invoice, payer, contract) como objetos JS e devolve
// o item do payload — sem tocar rede/banco/env. Todos os valores abaixo são
// SINTÉTICOS (nunca CPF/CNPJ reais).
//
// Contrato exercitado (critério binário §3.2 C1):
//   - tomador cpf XOR cnpj (11 díg => cpf; 14 díg => cnpj; nunca os dois);
//   - servico.descricao + codigo (código de serviço propagado; omitido => sem campo);
//   - valores: total, aliquotaIss, issRetido, retenções (irrf/cp/csll/pisCofins);
//   - competencia 'YYYY-MM'; referencia = invoice.referencia (âncora de idempotência);
//   - chunkItems: split de 101 -> 2 lotes ([100, 1]); 250 -> [100,100,50]; 0 -> [].
//
// FLAGS: `deno test --no-check --allow-env --allow-net`. Não abre rede.

import {
  assert,
  assertEquals,
  assertFalse,
  assertThrows,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';

import {
  buildEmitItem,
  chunkItems,
  type ContractRow,
  type InvoiceRow,
  mapRetencoes,
  NOTAAS_BATCH_MAX,
  type PayerRow,
  resolveTomadorDoc,
} from '../notaas-emit-payload.ts';

// ── Fixtures sintéticas ─────────────────────────────────────────────────────
function invoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 'inv-0001-aaaa',
    organization_id: 'org-aaaa-1111',
    competencia: '2026-06',
    referencia: 'NFSE-2026-06-0001',
    valor_total: 250.5,
    valor_original: 250.5,
    iss_retido: false,
    retencoes: {},
    ...overrides,
  };
}

function payerCPF(overrides: Partial<PayerRow> = {}): PayerRow {
  return {
    nome: 'Fulano de Tal',
    tipo_documento: 'cpf',
    documento: '111.222.333-44', // sintético, com máscara -> 11122233344
    email: 'fulano@example.test',
    whatsapp: '(11) 99999-0000',
    endereco: { logradouro: 'Rua X', numero: '10', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', cep: '01000-000' },
    ...overrides,
  };
}

function payerCNPJ(overrides: Partial<PayerRow> = {}): PayerRow {
  return {
    nome: 'Empresa Exemplo LTDA',
    tipo_documento: 'cnpj',
    documento: '11.222.333/0001-81', // sintético -> 11222333000181
    ...overrides,
  };
}

function contract(overrides: Partial<ContractRow> = {}): ContractRow {
  return {
    descricao: 'Mensalidade de cowork',
    codigo_servico_nfse: '010700',
    aliquota_iss: 2.5,
    ...overrides,
  };
}

// ── Tomador CPF XOR CNPJ ─────────────────────────────────────────────────────
Deno.test('tomador CPF: emite cpf (11 dig, só dígitos), NUNCA cnpj', () => {
  const it = buildEmitItem(invoice(), payerCPF(), contract());
  assertEquals(it.tomador.cpf, '11122233344');
  assertFalse('cnpj' in it.tomador, 'não deve emitir cnpj junto do cpf');
  assertEquals(it.tomador.nome, 'Fulano de Tal');
});

Deno.test('tomador CNPJ: emite cnpj (14 dig), NUNCA cpf', () => {
  const it = buildEmitItem(invoice(), payerCNPJ(), contract());
  assertEquals(it.tomador.cnpj, '11222333000181');
  assertFalse('cpf' in it.tomador, 'não deve emitir cpf junto do cnpj');
});

Deno.test('resolveTomadorDoc: decide pelo comprimento quando tipo diverge/ausente', () => {
  // tipo diz cnpj, mas documento tem 11 dígitos -> vence o comprimento (cpf).
  assertEquals(resolveTomadorDoc({ nome: 'X', tipo_documento: 'cnpj', documento: '11122233344' }), {
    cpf: '11122233344',
  });
  // sem tipo, 14 dígitos -> cnpj.
  assertEquals(resolveTomadorDoc({ nome: 'X', documento: '11222333000181' }), { cnpj: '11222333000181' });
});

Deno.test('documento inválido (nem 11 nem 14 dígitos) => throw (falha ANTES do 422 do NotaAS)', () => {
  assertThrows(
    () => buildEmitItem(invoice(), payerCPF({ documento: '123' }), contract()),
    Error,
    'documento do tomador inválido',
  );
});

// ── servico / código de serviço ──────────────────────────────────────────────
Deno.test('servico: descricao do contrato + codigo de serviço propagado', () => {
  const it = buildEmitItem(invoice(), payerCPF(), contract({ codigo_servico_nfse: '140800' }));
  assertEquals(it.servico.descricao, 'Mensalidade de cowork');
  assertEquals(it.servico.codigo, '140800');
});

Deno.test('codigo de serviço null => campo OMITIDO (NotaAS usa padrão do projeto)', () => {
  const it = buildEmitItem(invoice(), payerCPF(), contract({ codigo_servico_nfse: null }));
  assertFalse('codigo' in it.servico, 'codigo deve ser omitido quando null');
});

// ── valores + retenções + iss_retido ─────────────────────────────────────────
Deno.test('valores: total, aliquotaIss e issRetido propagados', () => {
  const it = buildEmitItem(
    invoice({ valor_total: '199.90', iss_retido: true }),
    payerCPF(),
    contract({ aliquota_iss: '5' }),
  );
  assertEquals(it.valores.total, 199.9);
  assertEquals(it.valores.aliquotaIss, 5);
  assertEquals(it.valores.issRetido, true);
});

Deno.test('aliquota_iss null => 0 (NotaAS aceita 0 p/ imunes)', () => {
  const it = buildEmitItem(invoice(), payerCPF(), contract({ aliquota_iss: null }));
  assertEquals(it.valores.aliquotaIss, 0);
});

Deno.test('retenções: ir/inss/csll/pisCofins mapeadas p/ campos NotaAS (R$)', () => {
  const it = buildEmitItem(
    invoice({ retencoes: { ir: 30, inss: 11, csll: 4.5, pisCofins: { cst: '01' } } }),
    payerCPF(),
    contract(),
  );
  assertEquals(it.valores.retencaoIrrf, 30);
  assertEquals(it.valores.retencaoCp, 11);
  assertEquals(it.valores.retencaoCsll, 4.5);
  assertEquals(it.valores.pisCofins, { cst: '01' });
});

Deno.test('mapRetencoes: chaves ausentes/zeradas NÃO emitem campo', () => {
  assertEquals(mapRetencoes({ ir: 0, inss: null }), {});
  assertEquals(mapRetencoes(null), {});
  assertEquals(mapRetencoes({ irrf: 12 }), { retencaoIrrf: 12 });
});

// ── competencia + referencia (idempotência) ──────────────────────────────────
Deno.test('competencia YYYY-MM propagada; referencia = invoice.referencia', () => {
  const it = buildEmitItem(invoice({ competencia: '2026-06', referencia: 'NFSE-XYZ-9' }), payerCPF(), contract());
  assertEquals(it.competencia, '2026-06');
  assertEquals(it.referencia, 'NFSE-XYZ-9');
});

Deno.test('referencia ausente => cai p/ invoice.id (âncora estável, nunca vazia)', () => {
  const it = buildEmitItem(invoice({ referencia: null, id: 'inv-fallback-77' }), payerCPF(), contract());
  assertEquals(it.referencia, 'inv-fallback-77');
});

Deno.test('competencia ausente => campo OMITIDO (NotaAS usa mês corrente)', () => {
  const it = buildEmitItem(invoice({ competencia: null }), payerCPF(), contract());
  assertFalse('competencia' in it, 'competencia deve ser omitida quando null');
});

Deno.test('endereço do tomador mapeado (cep só dígitos)', () => {
  const it = buildEmitItem(invoice(), payerCPF(), contract());
  assertEquals(it.tomador.endereco?.cidade, 'São Paulo');
  assertEquals(it.tomador.endereco?.cep, '01000000');
  assertEquals(it.tomador.telefone, '11999990000');
});

// ── chunkItems: split de lotes ≤100 ──────────────────────────────────────────
Deno.test('NOTAAS_BATCH_MAX é 100', () => {
  assertEquals(NOTAAS_BATCH_MAX, 100);
});

Deno.test('split 101 -> 2 lotes [100, 1]', () => {
  const arr = Array.from({ length: 101 }, (_, i) => i);
  const lotes = chunkItems(arr);
  assertEquals(lotes.length, 2);
  assertEquals(lotes[0].length, 100);
  assertEquals(lotes[1].length, 1);
  // Nenhum item perdido nem duplicado.
  assertEquals(lotes.flat().length, 101);
  assertEquals(lotes.flat(), arr);
});

Deno.test('split 250 -> [100, 100, 50]; exatamente 100 -> 1 lote; 0 -> []', () => {
  assertEquals(chunkItems(Array.from({ length: 250 }, (_, i) => i)).map((l) => l.length), [100, 100, 50]);
  assertEquals(chunkItems(Array.from({ length: 100 }, (_, i) => i)).length, 1);
  assertEquals(chunkItems([]), []);
});

Deno.test('chunkItems: tamanho de lote inválido (<=0) => throw', () => {
  assertThrows(() => chunkItems([1, 2, 3], 0), Error, 'tamanho de lote inválido');
});

Deno.test('determinismo: mesma entrada => mesmo item (2 chamadas idênticas)', () => {
  const a = buildEmitItem(invoice(), payerCPF(), contract());
  const b = buildEmitItem(invoice(), payerCPF(), contract());
  assertEquals(JSON.stringify(a), JSON.stringify(b));
  assert(a.referencia === b.referencia);
});
