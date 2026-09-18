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

Deno.test('inboundForQuote: sem pergunta clara, empate fica com a mais nova', () => {
  const historyDesc = [
    { direction: 'inbound', sender_type: 'visitor', content: 'E4' },
    { direction: 'inbound', sender_type: 'visitor', content: 'E3' },
    { direction: 'inbound', sender_type: 'visitor', content: 'E2' },
    { direction: 'inbound', sender_type: 'visitor', content: 'E1' },
  ];
  const src = inboundForQuote(historyDesc);
  assertEquals(src?.content, 'E4');
});

Deno.test('inboundForQuote: Andressa → E vc?, não Tudo bem', () => {
  const historyDesc = [
    { direction: 'outbound', sender_type: 'agent', content: 'bolha 4' },
    { direction: 'inbound', sender_type: 'visitor', content: 'E vc?' },
    { direction: 'inbound', sender_type: 'visitor', content: 'Tudo bem' },
    { direction: 'inbound', sender_type: 'visitor', content: 'Bom dia' },
    { direction: 'inbound', sender_type: 'visitor', content: 'Oiii' },
  ];
  const src = inboundForQuote(historyDesc);
  assertEquals(src?.content, 'E vc?');
});
