/**
 * Bug Camila T2 (IMG_1912, conv a364b553…): bolha partiu no meio do parêntese.
 *
 * Rodar:
 *   deno test --no-check apps/NexvyBeauty/supabase/functions/_shared/bubble-split.test.ts
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  MAX_BUBBLE_CHARS,
  mergeBrokenBubbles,
  splitIntoBubbles,
  splitSentencesForBubbles,
} from './bubble-split.ts';

/** Texto exato do caso vivo (wamids 3EB0E0CC… / 3EB0C9D7…). */
const CAMILA_PAREN =
  'Imagina que o NexvyBeauty é uma assistente que fica no seu WhatsApp. ' +
  'Ela responde as clientes, marca horários na sua agenda (só os que estão livres de verdade!) ' +
  'e manda a confirmação pra elas.';

Deno.test('DEFEITO: ! dentro de ( ) NÃO abre sentença que começa com )', () => {
  const sentences = splitSentencesForBubbles(CAMILA_PAREN);
  assert(
    sentences.every((s) => !s.trimStart().startsWith(')')),
    `sentença órfã com ): ${JSON.stringify(sentences)}`,
  );
  assert(
    sentences.some((s) => s.includes('verdade!)')),
    'cláusula parentética deve ficar íntegra com o fechamento',
  );
});

Deno.test('DEFEITO vivo: splitIntoBubbles mantém …verdade!) na mesma bolha da cláusula', () => {
  assert(CAMILA_PAREN.length > MAX_BUBBLE_CHARS, 'pré-condição: texto passa do teto');
  const bubbles = splitIntoBubbles(CAMILA_PAREN);
  assert(
    bubbles.every((b) => !b.trimStart().startsWith(')')),
    `bolha começa com ): ${JSON.stringify(bubbles)}`,
  );
  const joined = bubbles.join(' ');
  assert(joined.includes('verdade!)'), `esperado verdade!) em ${JSON.stringify(bubbles)}`);
  // O fechamento e a continuação não podem ser bolha isolada
  assertEquals(
    bubbles.some((b) => /^\)\s*e manda/.test(b.trim())),
    false,
  );
});

Deno.test('mergeBrokenBubbles: junta bolha que começa com ) (rede de segurança)', () => {
  const merged = mergeBrokenBubbles([
    'agenda (só os que estão livres de verdade!',
    ') e manda a confirmação pra elas.',
  ]);
  assertEquals(merged.length, 1);
  assertEquals(
    merged[0],
    'agenda (só os que estão livres de verdade!) e manda a confirmação pra elas.',
  );
});

Deno.test('mergeBrokenBubbles: junta bolha que começa com vírgula', () => {
  const merged = mergeBrokenBubbles([
    'Ela responde as clientes',
    ', marca horários na agenda.',
  ]);
  assertEquals(merged.length, 1);
  assert(merged[0]!.includes(', marca'));
});

Deno.test('splitIntoBubbles: newline artificial no meio do paren ainda reagrupa', () => {
  const broken =
    'Ela responde as clientes, marca horários na sua agenda (só os que estão livres de verdade!\n' +
    ') e manda a confirmação pra elas.';
  const bubbles = splitIntoBubbles(broken);
  assert(bubbles.every((b) => !b.trimStart().startsWith(')')));
  assert(bubbles.join(' ').includes('verdade!)'));
});

Deno.test('controle: frases normais ainda viram bolhas separadas acima do teto', () => {
  const a = 'A'.repeat(80) + '.';
  const b = 'B'.repeat(80) + '.';
  const bubbles = splitIntoBubbles(`${a} ${b}`);
  assertEquals(bubbles.length, 2);
});
