/**
 * Testes das tags classificadoras (PR-B).
 *
 * Rodar:
 *   deno test --no-check apps/NexvyBeauty/supabase/functions/_shared/turn-tags.test.ts
 *
 * O bloco CONTROLE NEGATIVO é o coração deste arquivo. Ele é o que separa TIER 2
 * (tag explícita do modelo — fonte legítima) de TIER 3 (regex sobre prosa — fonte
 * que MENTE). Se algum destes cair, a fonte degradou de tier e o estado passou a
 * poder mentir: NÃO "conserte" o teste, conserte quem o quebrou.
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { BLOCO_TAGS_CLASSIFICADORAS, extrairTags, TAG_RECUSOU_DEMO } from './turn-tags.ts';

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLE NEGATIVO — a prosa NUNCA conta. Só a tag literal.
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('CONTROLE NEGATIVO: a frase-armadilha do PR-A NÃO dispara recusa sem a tag', () => {
  // Esta é a frase que derruba qualquer detector tier 3. O teste do PR-A prova que
  // /oferec\w*\s+demonstra/i casa com ela — e ela é a lead RECLAMANDO da oferta.
  const r = extrairTags('não vou ficar te oferecendo demonstração, fica tranquila');
  assertEquals(r.recusouDemo, false, 'sem tag literal, NÃO é recusa — nem que a prosa grite');
  assertEquals(r.objecoes, []);
});

Deno.test('CONTROLE NEGATIVO: prosa cheia de palavras de recusa e objeção, zero tags', () => {
  const r = extrairTags(
    'Entendi que você recusou antes e que o preço pesou. Não quero insistir na demonstração.',
  );
  assertEquals(r.recusouDemo, false);
  assertEquals(r.objecoes, []);
});

Deno.test('CONTROLE NEGATIVO: tag MALFORMADA não conta', () => {
  for (const ruim of [
    'LEAD_RECUSOU_DEMO',            // sem colchetes
    '[LEAD_RECUSOU]',               // nome errado
    '[lead_recusou_demo]',          // minúscula
    '[OBJECAO]',                    // sem slug
    '[OBJECAO:]',                   // slug vazio
    '[OBJECAO:com espaço]',         // slug inválido
  ]) {
    const r = extrairTags(`Resposta qualquer. ${ruim}`);
    assertEquals(r.recusouDemo, false, `"${ruim}" não pode contar como recusa`);
    assertEquals(r.objecoes, [], `"${ruim}" não pode virar objeção`);
  }
});

Deno.test('CONTROLE NEGATIVO: resposta comum (o caso MAIS frequente) não gera marca nenhuma', () => {
  const entrada = 'Oi Andreia! Custa R$450, hoje sai por R$275. Quer ver rodando?';
  const r = extrairTags(entrada);
  assertEquals(r.recusouDemo, false);
  assertEquals(r.objecoes, []);
  assertEquals(r.texto, entrada, 'texto sem tag sai byte-a-byte idêntico');
});

// ─────────────────────────────────────────────────────────────────────────────
// A TAG LITERAL CONTA — e some do texto
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('tag de recusa: detecta E remove do texto', () => {
  const r = extrairTags(`Tranquilo, sem problema. ${TAG_RECUSOU_DEMO}`);
  assertEquals(r.recusouDemo, true);
  assertEquals(r.texto, 'Tranquilo, sem problema.');
  assertEquals(r.texto.includes('LEAD_RECUSOU'), false, 'a lead NUNCA pode ver a marca');
});

Deno.test('tag no MEIO do texto: some sem deixar buraco nem espaço duplo', () => {
  const r = extrairTags(`Beleza. ${TAG_RECUSOU_DEMO} Me conta uma coisa então.`);
  assertEquals(r.recusouDemo, true);
  assertEquals(r.texto, 'Beleza. Me conta uma coisa então.');
});

Deno.test('objeções: extrai, normaliza pra minúscula e deduplica', () => {
  const r = extrairTags('Entendo. [OBJECAO:Preco] [OBJECAO:ja_tentei] [OBJECAO:preco]');
  assertEquals(r.recusouDemo, false);
  assertEquals(r.objecoes, ['preco', 'ja_tentei']);
  assertEquals(r.texto, 'Entendo.');
});

Deno.test('recusa + objeção no mesmo turno', () => {
  const r = extrairTags(`Sem problema. ${TAG_RECUSOU_DEMO} [OBJECAO:sem_tempo]`);
  assertEquals(r.recusouDemo, true);
  assertEquals(r.objecoes, ['sem_tempo']);
  assertEquals(r.texto, 'Sem problema.');
});

// ─────────────────────────────────────────────────────────────────────────────
// BORDAS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('idempotência: extrair de novo no texto limpo não acha nada', () => {
  const uma = extrairTags(`Ok. ${TAG_RECUSOU_DEMO} [OBJECAO:preco]`);
  const duas = extrairTags(uma.texto);
  assertEquals(duas.recusouDemo, false);
  assertEquals(duas.objecoes, []);
  assertEquals(duas.texto, uma.texto);
});

Deno.test('borda: string vazia e resposta que era SÓ a tag', () => {
  assertEquals(extrairTags('').recusouDemo, false);
  const so = extrairTags(TAG_RECUSOU_DEMO);
  assertEquals(so.recusouDemo, true);
  assertEquals(so.texto, '', 'texto vazio é responsabilidade do chamador tratar');
});

Deno.test('borda: a remoção não come pontuação nem quebra parágrafo', () => {
  const r = extrairTags(`Primeira linha.\n\nSegunda linha. ${TAG_RECUSOU_DEMO}`);
  assertEquals(r.texto, 'Primeira linha.\n\nSegunda linha.');
});

// ─────────────────────────────────────────────────────────────────────────────
// O BLOCO DE PROMPT
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('bloco de prompt pede OBSERVAÇÃO, não contenção', () => {
  // A distinção que justifica este PR: o eval mediu que o modelo ignora proibição,
  // mas classificar é outra tarefa. Se alguém enfiar proibição aqui, o bloco volta
  // a ser o que já falhou.
  assertStringIncludes(BLOCO_TAGS_CLASSIFICADORAS, TAG_RECUSOU_DEMO);
  assertStringIncludes(BLOCO_TAGS_CLASSIFICADORAS, 'Marque APENAS o que ela de fato disse');
  assertStringIncludes(BLOCO_TAGS_CLASSIFICADORAS, 'ausência de marca é resposta válida');
  for (const contencao of [/NÃO ofereça/i, /PROIBIDO oferecer/i, /nunca ofereça/i]) {
    assertEquals(
      contencao.test(BLOCO_TAGS_CLASSIFICADORAS),
      false,
      'contenção não pode entrar aqui — ela é aplicada por CÓDIGO, com o estado',
    );
  }
});
