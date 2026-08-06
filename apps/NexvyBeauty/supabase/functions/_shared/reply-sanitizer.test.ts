/**
 * Testes do sanitizador de resposta.
 *
 * Rodar:
 *   deno test --no-check apps/NexvyBeauty/supabase/functions/_shared/reply-sanitizer.test.ts
 *
 * O primeiro teste é a frase REAL que o eval E1 capturou saindo pra lead em
 * 2026-08-06. Ela é o motivo deste módulo existir e é a asserção que não pode
 * cair nunca.
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { sanitizeReply, splitSentencas } from './reply-sanitizer.ts';

// ─────────────────────────────────────────────────────────────────────────────
// O DEFEITO MEDIDO — negação à DIREITA do termo
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('DEFEITO E1: "Desconto não tem como" sai INTACTO — negação à direita do termo', () => {
  // O guard antigo olhava só 40 chars à ESQUERDA. Aqui o termo ABRE a frase e a
  // negação vem depois, então ele substituía e destruía a sentença.
  const entrada = 'Desconto não tem como, Fernanda — mas olha a conta antes de decidir se é caro.';
  const r = sanitizeReply(entrada);

  assertEquals(r.sanitized, false, 'a agente está NEGANDO desconto — não há o que censurar');
  assertEquals(r.removidas, 0);
  assertStringIncludes(r.text, 'Desconto não tem como');
  assertStringIncludes(r.text, 'olha a conta antes de decidir');
});

Deno.test('DEFEITO E1 (regressão): a saída NUNCA pode conter o frankenstein que a lead recebeu', () => {
  const entrada = 'Desconto não tem como, Fernanda — mas olha a conta antes de decidir se é caro.';
  const r = sanitizeReply(entrada);
  // O texto exato que saiu em produção, agramatical:
  assertEquals(
    r.text.includes('a conta da recuperação (2-3 clientes de volta já pagam a mensalidade) não tem como'),
    false,
    'splice substantivo→oração não pode voltar',
  );
});

Deno.test('DEFEITO E2: segunda variante do MESMO splice, capturada no run seguinte', () => {
  // O E2 rodou contra o brain v90 (sem este módulo) e o splice reapareceu com nota
  // máxima, agora noutra forma:
  //   "a conta da recuperação (2-3 clientes de volta já pagam a mensalidade) a gente
  //    não trabalha com isso, Fernanda — mas o preço de hoje já é o menor"
  // Mesma causa: negação ("não") à DIREITA do termo, fora da janela do guard antigo.
  // Duas capturas independentes da mesma classe valem mais que uma: o defeito é
  // sistemático, não um azar de amostragem.
  const entrada = 'Desconto a gente não trabalha com isso, Fernanda — mas o preço de hoje já é o menor';
  const r = sanitizeReply(entrada);

  assertEquals(r.sanitized, false, 'a agente está negando — sai intacta');
  assertEquals(r.text, entrada, 'byte-a-byte, travessão incluído');
  assertEquals(
    r.text.includes('a conta da recuperação (2-3 clientes de volta já pagam a mensalidade) a gente não'),
    false,
    'o frankenstein do E2 não pode voltar',
  );
});

Deno.test('negação à ESQUERDA continua protegida (o caso que o guard antigo pegava)', () => {
  const r = sanitizeReply('Não trabalho com desconto, mas te mostro a conta.');
  assertEquals(r.sanitized, false);
  assertStringIncludes(r.text, 'Não trabalho com desconto');
});

// ─────────────────────────────────────────────────────────────────────────────
// O QUE DEVE SER CENSURADO — sentença cai inteira, reancoragem entra sozinha
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('promessa de desconto: a sentença CAI inteira e a reancoragem vira sentença própria', () => {
  const r = sanitizeReply('Oi Ana! Consigo um desconto especial pra você. Bora fechar?');

  assertEquals(r.sanitized, true);
  assertEquals(r.removidas, 1);
  assertEquals(r.text.toLowerCase().includes('desconto'), false, 'a promessa some');
  assertStringIncludes(r.text, 'Oi Ana!', 'o resto da fala é preservado');
  assertStringIncludes(r.text, 'Bora fechar?');
  assertStringIncludes(r.text, '2-3 clientes de volta já pagam a mensalidade');
});

Deno.test('promessa de grátis: idem — produto é PAGO', () => {
  const r = sanitizeReply('Te dou um teste grátis de 7 dias. O que acha?');
  assertEquals(r.sanitized, true);
  assertEquals(/gr[aá]tis/i.test(r.text), false);
  assertStringIncludes(r.text, 'produto pago');
  assertStringIncludes(r.text, 'O que acha?');
});

Deno.test('a saída censurada é sempre gramatical: só sentenças inteiras, nunca enxerto', () => {
  const r = sanitizeReply('Tenho uma promoção rolando. Quer ver como funciona?');
  assertEquals(/promo/i.test(r.text), false);
  assertStringIncludes(r.text, 'Quer ver como funciona?');
  assertStringIncludes(r.text, 'O preço que te passei é o que está valendo hoje.');
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLES NEGATIVOS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('CONTROLE NEGATIVO: texto sem termo proibido sai byte-a-byte idêntico', () => {
  const entrada = 'Oi Andreia! Custa R$450, hoje sai por R$275. Quer ver rodando?';
  const r = sanitizeReply(entrada);
  assertEquals(r.sanitized, false);
  assertEquals(r.text, entrada, 'nem espaço a mais');
});

Deno.test('CONTROLE NEGATIVO: a âncora temporal REVOGADA não pode voltar pela reancoragem', () => {
  const r = sanitizeReply('Consigo um desconto pra você.');
  for (const proibido of [/vai subir/i, /aumenta/i, /[úu]ltimos dias/i, /s[óo] at[ée]/i, /garantia/i]) {
    assertEquals(proibido.test(r.text), false, `reancoragem não pode conter ${proibido}`);
  }
});

Deno.test('CONTROLE NEGATIVO: idempotência — sanitizar duas vezes dá o mesmo texto', () => {
  const uma = sanitizeReply('Consigo um desconto especial. Fechado?');
  const duas = sanitizeReply(uma.text);
  assertEquals(duas.sanitized, false, 'a reancoragem não contém termo proibido');
  assertEquals(duas.text, uma.text);
});

Deno.test('CONTROLE NEGATIVO: string vazia e só espaços não quebram', () => {
  assertEquals(sanitizeReply('').sanitized, false);
  assertEquals(sanitizeReply('   ').sanitized, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// MISTOS E BORDAS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('misto: uma sentença nega (fica) e outra promete (cai)', () => {
  const r = sanitizeReply('Desconto não tem como. Mas te dou um teste grátis. Topa?');
  assertEquals(r.removidas, 1);
  assertStringIncludes(r.text, 'Desconto não tem como.', 'a negação sobrevive');
  assertEquals(/gr[aá]tis/i.test(r.text), false, 'a promessa cai');
  assertStringIncludes(r.text, 'Topa?');
});

Deno.test('duas sentenças com o MESMO termo geram UMA reancoragem só', () => {
  const r = sanitizeReply('Consigo desconto pra você. Sério, tenho desconto sim.');
  assertEquals(r.removidas, 2);
  const ocorrencias = r.text.split('2-3 clientes de volta já pagam a mensalidade').length - 1;
  assertEquals(ocorrencias, 1, 'reancoragem não se repete');
});

Deno.test('borda: resposta que era SÓ a promessa vira só a reancoragem (nunca vazia)', () => {
  const r = sanitizeReply('Consigo um desconto pra você.');
  assertEquals(r.sanitized, true);
  assertEquals(r.text.length > 0, true);
  assertStringIncludes(r.text, '2-3 clientes');
});

Deno.test('splitSentencas: separa por travessão, quebra de linha e pontuação final', () => {
  assertEquals(splitSentencas('A — B'), ['A', 'B']);
  assertEquals(splitSentencas('A.\nB'), ['A.', 'B']);
  assertEquals(splitSentencas('Oi! Tudo bem? Sim...'), ['Oi!', 'Tudo bem?', 'Sim...']);
  assertEquals(splitSentencas('sem pontuacao nenhuma'), ['sem pontuacao nenhuma']);
});
