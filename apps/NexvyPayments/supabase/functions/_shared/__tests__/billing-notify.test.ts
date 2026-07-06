// _shared/__tests__/billing-notify.test.ts
//
// Suíte `deno test` PURA (mock em memória, ZERO rede) para o FALLBACK DE CANAL do
// E1 (_shared/billing-notify.ts). Mock do client supabase com fake-DB +
// query-builder encadeável + captura de `.rpc()` (a fila pgmq de e-mail).
//
// Cobre o critério binário §3.2 E1 (fallback e-mail):
//   - payer SEM whatsapp (só email) -> enqueue_email('transactional_emails', ...)
//     é CHAMADO (mensagem enfileirada na fila pgmq de e-mail). NENHUM
//     billing_events de WhatsApp é gravado.
//   - payer COM whatsapp -> billing_events(canal='whatsapp'); enqueue_email NÃO
//     é chamado (fila de e-mail intocada).
//   - payer sem whatsapp E sem email -> falha explícita, nada enfileirado.
//   - o payload enfileirado carrega os campos que o process-email-queue consome
//     (message_id/to/subject/html/queue 'transactional_emails').
//
// FLAGS: `deno test --no-check --allow-env --allow-net`. Não abre rede.

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';

import { notificarCobranca } from '../billing-notify.ts';

const ORG = 'org-aaaa-1111';

// ---------------------------------------------------------------------------
// Mock supabase: fake-DB para billing_events + captura das chamadas .rpc().
// O `enqueueLog` grava cada enqueue_email (queue_name + payload) — é a "fila
// pgmq de e-mail" observável pelo teste (o process-email-queue leria daqui).
// ---------------------------------------------------------------------------
let _msgSeq = 1000;

function makeSupabaseMock() {
  const db: Record<string, any[]> = { billing_events: [] };
  const enqueueLog: Array<{ queue_name: string; payload: any }> = [];
  const rpcCalls: Array<{ fn: string; args: any }> = [];

  function makeBuilder(table: string) {
    const builder: any = {
      select() {
        return builder;
      },
      insert(row: any) {
        const withId = { id: `evt-${db[table].length + 1}`, ...row };
        db[table].push(withId);
        builder._lastInserted = withId;
        return builder;
      },
      async single() {
        return { data: builder._lastInserted ?? null, error: null };
      },
    };
    return builder;
  }

  return {
    _db: db,
    _enqueueLog: enqueueLog,
    _rpcCalls: rpcCalls,
    from(table: string) {
      return makeBuilder(table);
    },
    // Captura a RPC. enqueue_email devolve um msg_id (bigint) como o pgmq.send real.
    async rpc(fn: string, args: any) {
      rpcCalls.push({ fn, args });
      if (fn === 'enqueue_email') {
        enqueueLog.push({ queue_name: args.queue_name, payload: args.payload });
        return { data: ++_msgSeq, error: null };
      }
      return { data: null, error: null };
    },
  };
}

const notif = {
  invoiceId: 'inv-0001',
  tipo: 'fatura_vencida' as const,
  assunto: 'Sua fatura venceu',
  corpoTexto: 'Olá, sua fatura de R$ 217,00 venceu em 10/05/2026.',
};

// ===========================================================================
// CRITÉRIO E1: payer SEM whatsapp -> fila de e-mail pgmq (enqueue_email)
// ===========================================================================
Deno.test('payer SEM whatsapp (só email) -> enfileira na fila de e-mail pgmq', async () => {
  const sb = makeSupabaseMock();
  const r = await notificarCobranca(
    sb,
    ORG,
    { id: 'pay-1', nome: 'Fulano', whatsapp: null, email: 'fulano@exemplo.com' },
    notif,
  );

  assertEquals(r.success, true);
  assertEquals(r.canal, 'email');

  // CRITÉRIO BINÁRIO: enqueue_email foi chamado na fila de e-mail.
  assertEquals(sb._enqueueLog.length, 1);
  const enq = sb._enqueueLog[0];
  assertEquals(enq.queue_name, 'transactional_emails');
  assertEquals(enq.payload.to, 'fulano@exemplo.com');
  assertEquals(enq.payload.subject, 'Sua fatura venceu');
  assertEquals(enq.payload.purpose, 'transactional');
  assert(enq.payload.message_id.includes('inv-0001'), 'message_id cita a fatura');
  assert(enq.payload.html && enq.payload.html.length > 0, 'html do e-mail preenchido');
  assert(enq.payload.queued_at, 'queued_at presente (TTL do process-email-queue)');

  // NENHUM billing_events de WhatsApp gravado (não caiu no canal primário).
  assertEquals(sb._db.billing_events.length, 0);
  assert(r.email_msg_id != null, 'devolve o msg_id da fila pgmq');
});

// ===========================================================================
// Canal primário: payer COM whatsapp -> billing_events, sem tocar a fila e-mail
// ===========================================================================
Deno.test('payer COM whatsapp -> billing_events(canal=whatsapp); NÃO usa fila e-mail', async () => {
  const sb = makeSupabaseMock();
  const r = await notificarCobranca(
    sb,
    ORG,
    { id: 'pay-1', nome: 'Fulano', whatsapp: '5599999990000', email: 'fulano@exemplo.com' },
    notif,
  );

  assertEquals(r.success, true);
  assertEquals(r.canal, 'whatsapp');

  // billing_events gravado com canal whatsapp.
  assertEquals(sb._db.billing_events.length, 1);
  const ev = sb._db.billing_events[0];
  assertEquals(ev.tipo, 'fatura_vencida');
  assertEquals(ev.origem, 'regua');
  assertEquals(ev.payload.canal, 'whatsapp');

  // A fila de e-mail NÃO foi tocada (whatsapp tem precedência).
  assertEquals(sb._enqueueLog.length, 0);
});

// ===========================================================================
// whatsapp vazio ("  ") é tratado como ausente -> cai no e-mail
// ===========================================================================
Deno.test('whatsapp em branco conta como ausente -> fallback e-mail', async () => {
  const sb = makeSupabaseMock();
  const r = await notificarCobranca(
    sb,
    ORG,
    { id: 'pay-1', whatsapp: '   ', email: 'x@exemplo.com' },
    notif,
  );
  assertEquals(r.success, true);
  assertEquals(r.canal, 'email');
  assertEquals(sb._enqueueLog.length, 1);
});

// ===========================================================================
// sem whatsapp E sem email -> falha explícita, nada enfileirado
// ===========================================================================
Deno.test('sem whatsapp e sem email -> falha explícita (unreachable), nada enfileirado', async () => {
  const sb = makeSupabaseMock();
  const r = await notificarCobranca(
    sb,
    ORG,
    { id: 'pay-1', whatsapp: null, email: null },
    notif,
  );
  assertEquals(r.success, false);
  assert((r.error ?? '').toLowerCase().includes('não tem'));
  assertEquals(sb._enqueueLog.length, 0);
  assertEquals(sb._db.billing_events.length, 0);
});

// ===========================================================================
// idempotência: message_id determinístico por (invoice, tipo)
// ===========================================================================
Deno.test('message_id do e-mail é determinístico por (invoice, tipo)', async () => {
  const sb1 = makeSupabaseMock();
  const sb2 = makeSupabaseMock();
  const payer = { id: 'pay-1', email: 'x@exemplo.com' };
  await notificarCobranca(sb1, ORG, payer, notif);
  await notificarCobranca(sb2, ORG, payer, notif);
  assertEquals(sb1._enqueueLog[0].payload.message_id, sb2._enqueueLog[0].payload.message_id);
});
