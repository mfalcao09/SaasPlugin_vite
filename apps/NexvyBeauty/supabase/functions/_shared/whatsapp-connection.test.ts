// whatsapp-connection.test.ts — GOLDEN suite da resolução de conexão WhatsApp.
// Prova, sem banco/rede, o P0 de 2026-07-19: a resposta tem que sair pelo MESMO
// número que a lead contactou, mesmo quando existe uma conexão mais RECENTE.
// Roda: deno test supabase/functions/_shared/whatsapp-connection.test.ts
//
// Cenário de produção reproduzido (ids/tokens SINTÉTICOS, sem telefone real):
//   VENDAS  criada 05/07  ← a lead escreve aqui
//   DEMO    criada 14/07  ← "a mais recente"
// A regra antiga (.order created_at desc .limit(1)) devolvia DEMO. A conversa
// da lead tem meta_connection_id = VENDAS; a regra nova TEM que devolver VENDAS.

import {
  resolveConnectionForConversation,
  type ResolvedConnection,
} from './whatsapp-connection.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) throw new Error(`${msg} — esperado ${expected}, veio ${actual}`);
}

const VENDAS = 'conn-vendas';
const DEMO = 'conn-demo';

interface FakeRow {
  id: string;
  phone_number_id: string | null;
  access_token_encrypted: string | null;
  status: string;
  product_id: string | null;
  display_name: string;
  created_at: string;
}

function conn(over: Partial<FakeRow> & { id: string }): FakeRow {
  return {
    phone_number_id: `pn_${over.id}`,
    access_token_encrypted: `tok_${over.id}`,
    status: 'active',
    product_id: null,
    display_name: over.id,
    created_at: '2026-07-01T00:00:00Z',
    ...over,
  };
}

/** Cliente Supabase fake: só o caminho .from().select().eq().order(). */
function fakeSupabase(rows: FakeRow[]) {
  return {
    from() {
      let current = rows;
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          if (col === 'status') current = current.filter((r) => r.status === val);
          return builder;
        },
        order: () =>
          Promise.resolve({
            data: [...current].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
            error: null,
          }),
      };
      return builder;
    },
  };
}

async function resolve(
  rows: FakeRow[],
  conversation: Record<string, unknown> | null,
): Promise<ResolvedConnection> {
  return await resolveConnectionForConversation(fakeSupabase(rows), conversation);
}

const PROD_ROWS = [
  conn({ id: DEMO, created_at: '2026-07-14T01:34:52Z', display_name: 'Demo' }),
  conn({ id: VENDAS, created_at: '2026-07-05T05:19:01Z', display_name: 'Vendas' }),
];

Deno.test('P0: responde pela conexão que RECEBEU, não pela mais recente', async () => {
  const r = await resolve(PROD_ROWS, { id: 'conv-1', meta_connection_id: VENDAS });
  eq(r.conn?.id, VENDAS, 'tem que sair pelo número de VENDAS');
  eq(r.reason, 'conversation', 'motivo');
  eq(r.activeCount, 2, 'duas conexões ativas');
});

Deno.test('P0 (espelho): conversa do DEMO continua respondendo pelo DEMO', async () => {
  const r = await resolve(PROD_ROWS, { id: 'conv-2', meta_connection_id: DEMO });
  eq(r.conn?.id, DEMO, 'conversa do demo responde pelo demo');
  eq(r.reason, 'conversation', 'motivo');
});

Deno.test('ambíguo: 2+ ativas e conversa sem pista → NÃO adivinha', async () => {
  const r = await resolve(PROD_ROWS, { id: 'conv-3', meta_connection_id: null, product_id: null });
  eq(r.conn, null, 'não pode escolher no chute');
  eq(r.reason, 'ambiguous', 'motivo');
});

Deno.test('ambíguo: conversa nula (sem contexto) também recusa', async () => {
  const r = await resolve(PROD_ROWS, null);
  eq(r.conn, null, 'sem conversa e com 2 ativas não há resposta segura');
  eq(r.reason, 'ambiguous', 'motivo');
});

Deno.test('product_id desempata quando exatamente UMA conexão casa', async () => {
  const rows = [
    conn({ id: DEMO, created_at: '2026-07-14T01:34:52Z', product_id: 'prod-demo' }),
    conn({ id: VENDAS, created_at: '2026-07-05T05:19:01Z', product_id: 'prod-beauty' }),
  ];
  const r = await resolve(rows, { id: 'conv-4', product_id: 'prod-beauty' });
  eq(r.conn?.id, VENDAS, 'casa pelo produto');
  eq(r.reason, 'product', 'motivo');
});

Deno.test('product_id ambíguo (2 conexões no mesmo produto) NÃO resolve', async () => {
  const rows = [
    conn({ id: DEMO, created_at: '2026-07-14T01:34:52Z', product_id: 'prod-beauty' }),
    conn({ id: VENDAS, created_at: '2026-07-05T05:19:01Z', product_id: 'prod-beauty' }),
  ];
  const r = await resolve(rows, { id: 'conv-5', product_id: 'prod-beauty' });
  eq(r.conn, null, 'empate no produto não pode virar chute');
  eq(r.reason, 'ambiguous', 'motivo');
});

Deno.test('mono-connection (o mundo de antes) segue funcionando', async () => {
  const rows = [conn({ id: VENDAS, created_at: '2026-07-05T05:19:01Z' })];
  const r = await resolve(rows, { id: 'conv-6' });
  eq(r.conn?.id, VENDAS, 'única ativa é usada sem pista nenhuma');
  eq(r.reason, 'single_active', 'motivo');
});

Deno.test('conexão pinada mas INATIVA cai para a única ativa restante', async () => {
  const rows = [
    conn({ id: DEMO, created_at: '2026-07-14T01:34:52Z', status: 'disabled' }),
    conn({ id: VENDAS, created_at: '2026-07-05T05:19:01Z' }),
  ];
  const r = await resolve(rows, { id: 'conv-7', meta_connection_id: DEMO });
  eq(r.conn?.id, VENDAS, 'não deixa a lead sem resposta por causa de conexão morta');
  eq(r.reason, 'single_active', 'motivo');
});

Deno.test('conexão ativa SEM token/phone_number_id não conta como enviável', async () => {
  const rows = [
    conn({ id: DEMO, created_at: '2026-07-14T01:34:52Z', access_token_encrypted: null }),
    conn({ id: VENDAS, created_at: '2026-07-05T05:19:01Z' }),
  ];
  const r = await resolve(rows, { id: 'conv-8' });
  eq(r.conn?.id, VENDAS, 'sucata ativa não entra na conta');
  eq(r.activeCount, 1, 'só uma é de fato enviável');
});

Deno.test('nenhuma conexão ativa → reason explícito, nunca crash', async () => {
  const r = await resolve([], { id: 'conv-9' });
  eq(r.conn, null, 'sem conexão');
  eq(r.reason, 'no_active_connection', 'motivo');
  assert(r.activeCount === 0, 'contagem zerada');
});
