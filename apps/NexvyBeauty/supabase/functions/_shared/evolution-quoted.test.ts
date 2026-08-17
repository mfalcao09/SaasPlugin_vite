import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { inboundForQuote, quotedFromInbound, remoteJidForQuote } from './evolution-quoted.ts';

Deno.test('quotedFromInbound: sem id → null', () => {
  assertEquals(quotedFromInbound({ content: 'oi' }), null);
});

Deno.test('quotedFromInbound: usa evolution_message_id', () => {
  const q = quotedFromInbound({
    evolutionMessageId: '3AABC',
    content: 'Não tô confiando',
    remoteJid: '62213373075703@lid',
  });
  assertEquals(q?.key.id, '3AABC');
  assertEquals(q?.key.fromMe, false);
  assertEquals(q?.key.remoteJid, '62213373075703@lid');
  assertEquals(q?.message.conversation, 'Não tô confiando');
});

Deno.test('remoteJidForQuote prefere LID', () => {
  assertEquals(
    remoteJidForQuote({ waLid: '62213373075703', phoneDigits: '5511945760964' }),
    '62213373075703@lid',
  );
  assertEquals(
    remoteJidForQuote({ phoneDigits: '5511945760964' }),
    '5511945760964@s.whatsapp.net',
  );
});

Deno.test('inboundForQuote: rajada DESC de 4 msgs → fonte é a última (E4), não a primeira', () => {
  const historyDesc = [
    { direction: 'inbound', sender_type: 'visitor', content: 'E4' },
    { direction: 'inbound', sender_type: 'visitor', content: 'E3' },
    { direction: 'inbound', sender_type: 'visitor', content: 'E2' },
    { direction: 'inbound', sender_type: 'visitor', content: 'E1' },
  ];
  const src = inboundForQuote(historyDesc);
  assertEquals(src?.content, 'E4');
});
