/**
 * Testes do gate de bolha.
 *
 * Rodar:
 *   deno test --no-check apps/NexvyBeauty/supabase/functions/_shared/bubble-gate.test.ts
 *
 * O teste que manda neste arquivo é `NOME NO MEIO`. Ele é a fronteira entre este
 * módulo e o splice que o commit 3e2aa3c matou: vocativo (BORDA, fronteira =
 * vírgula) pode sair; nome no MEIO da frase é intocável, porque ali não há
 * fronteira e qualquer remoção produz agramaticalidade.
 * Se ele cair, o módulo virou o defeito que ele existe pra evitar.
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { aplicarGateBolha } from './bubble-gate.ts';

const NOME = 'Andreia';
const LIVRE = { proibirNome: false, proibirReapresentar: false, primeiroNome: NOME };
const TRAVA_NOME = { proibirNome: true, proibirReapresentar: false, primeiroNome: NOME };
const TRAVA_APRE = { proibirNome: false, proibirReapresentar: true, primeiroNome: NOME };

// ─────────────────────────────────────────────────────────────────────────────
// A FRONTEIRA: borda sai, meio NUNCA
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('NOME NO MEIO: intocável — é onde o splice nasceria', () => {
  // Não há fronteira sintática no meio da frase. Remover aqui quebra a sentença,
  // que é exatamente o defeito do sanitizeReply antigo.
  const r = aplicarGateBolha(['Isso resolve o problema que a Andreia me contou ontem.'], TRAVA_NOME);
  assertEquals(r.bubbles[0], 'Isso resolve o problema que a Andreia me contou ontem.', 'byte-a-byte');
  assertEquals(r.vocativosRemovidos, 0);
  assertEquals(r.violacaoTolerada, true, 'o gate ADMITE que não pôde agir, em vez de fingir');
});

Deno.test('vocativo no INÍCIO sai e a frase continua gramatical', () => {
  const r = aplicarGateBolha(['Andreia, quer ver rodando?'], TRAVA_NOME);
  assertEquals(r.bubbles[0], 'Quer ver rodando?');
  assertEquals(r.vocativosRemovidos, 1);
});

Deno.test('vocativo no FIM sai preservando a pontuação', () => {
  const r = aplicarGateBolha(['Fechado, Andreia!'], TRAVA_NOME);
  assertEquals(r.bubbles[0], 'Fechado!');
});

Deno.test('saudação + vocativo no início: "Oi Andreia, ..." → "..."', () => {
  const r = aplicarGateBolha(['Oi Andreia, tudo certo por aí?'], TRAVA_NOME);
  assertEquals(r.bubbles[0], 'Tudo certo por aí?');
});

Deno.test('PARIDADE com o cinto do PR-BDR-14: vocativo ENTRE VÍRGULAS (fronteira dupla)', () => {
  // Este caso vinha do cinto inline que a consolidação removeu do brain. Sem ele,
  // "unificar" teria REMOVIDO cobertura que já existia em produção — regressão
  // disfarçada de limpeza, e nenhum teste unitário pegaria, porque os dois módulos
  // passavam isolados. É a razão de este teste existir.
  const r = aplicarGateBolha(['Olha, Andreia, isso resolve o teu problema.'], TRAVA_NOME);
  assertEquals(r.bubbles[0], 'Olha, isso resolve o teu problema.');
  assertEquals(r.vocativosRemovidos, 1);
});

Deno.test('PARIDADE: as 4 formas que o cinto cobria continuam cobertas', () => {
  const casos: [string, string][] = [
    ['Andreia, quer ver?', 'Quer ver?'], // início
    ['Oi Andreia, tudo bem?', 'Tudo bem?'], // saudação + início
    ['Show, Andreia!', 'Show!'], // fim
    ['Beleza, Andreia, vamos lá.', 'Beleza, vamos lá.'], // entre vírgulas
  ];
  for (const [entrada, esperado] of casos) {
    assertEquals(aplicarGateBolha([entrada], TRAVA_NOME).bubbles[0], esperado, entrada);
  }
});

Deno.test('regex /g não vaza estado entre chamadas (lastIndex)', () => {
  // `entreVirgulas` usa flag /g, que guarda lastIndex no objeto entre chamadas.
  // Sem resetar, a segunda chamada falharia SILENCIOSAMENTE — bug clássico.
  const entrada = ['Olha, Andreia, isso resolve.'];
  const a = aplicarGateBolha(entrada, TRAVA_NOME);
  const b = aplicarGateBolha(entrada, TRAVA_NOME);
  assertEquals(a.bubbles[0], b.bubbles[0], 'duas chamadas idênticas ⇒ resultado idêntico');
  assertEquals(b.vocativosRemovidos, 1);
});

Deno.test('borda: se remover o vocativo esvaziaria a bolha, devolve a ORIGINAL', () => {
  // "Andreia!" sozinha não é vocativo — é a fala inteira. Perder conteúdo é pior
  // que repetir o nome.
  const r = aplicarGateBolha(['Andreia!'], TRAVA_NOME);
  assertEquals(r.bubbles[0], 'Andreia!');
});

// ─────────────────────────────────────────────────────────────────────────────
// REAPRESENTAÇÃO: a bolha cai INTEIRA
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('reapresentação: a bolha cai inteira, o resto da resposta sobrevive', () => {
  const r = aplicarGateBolha(
    ['Oi! Sou a Camila, da NexvyBeauty.', 'Sobre o que você perguntou: custa R$275.'],
    TRAVA_APRE,
  );
  assertEquals(r.bolhasDerrubadas, 1);
  assertEquals(r.bubbles.length, 1);
  assertStringIncludes(r.bubbles[0], 'custa R$275');
  assertEquals(r.bubbles[0].includes('Sou a Camila'), false);
});

Deno.test('reapresentação por ORIGEM do contato também cai', () => {
  const r = aplicarGateBolha(
    ['Peguei seu contato no Instagram do salão.', 'Queria te mostrar uma coisa rápida.'],
    TRAVA_APRE,
  );
  assertEquals(r.bolhasDerrubadas, 1);
  assertEquals(r.bubbles.length, 1);
});

Deno.test('NUNCA calar: se TODAS as bolhas reapresentam, tolera em vez de silenciar', () => {
  // Silêncio é pior que redundância — a lead ficaria sem resposta nenhuma.
  const r = aplicarGateBolha(['Sou a Camila.', 'Sou da NexvyBeauty.'], TRAVA_APRE);
  assertEquals(r.bubbles.length, 2, 'nada foi derrubado');
  assertEquals(r.bolhasDerrubadas, 0);
  assertEquals(r.violacaoTolerada, true, 'e o gate DECLARA que tolerou');
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLES NEGATIVOS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('CONTROLE NEGATIVO: flags desligadas ⇒ saída byte-a-byte idêntica', () => {
  const entrada = ['Oi Andreia, sou a Camila da NexvyBeauty.', 'Quer ver rodando?'];
  const r = aplicarGateBolha(entrada, LIVRE);
  assertEquals(r.bubbles, entrada);
  assertEquals(r.vocativosRemovidos, 0);
  assertEquals(r.bolhasDerrubadas, 0);
  assertEquals(r.violacaoTolerada, false);
});

Deno.test('CONTROLE NEGATIVO: proibirNome NÃO derruba bolha por reapresentação', () => {
  // Cada flag governa só o seu eixo. Vazamento entre elas seria censura silenciosa.
  const r = aplicarGateBolha(['Sou a Camila, da NexvyBeauty.'], TRAVA_NOME);
  assertEquals(r.bolhasDerrubadas, 0);
  assertEquals(r.bubbles.length, 1);
});

Deno.test('CONTROLE NEGATIVO: proibirReapresentar NÃO mexe em vocativo', () => {
  const r = aplicarGateBolha(['Andreia, quer ver rodando?'], TRAVA_APRE);
  assertEquals(r.bubbles[0], 'Andreia, quer ver rodando?');
  assertEquals(r.vocativosRemovidos, 0);
});

Deno.test('CONTROLE NEGATIVO: nome curto não vira regex perigosa', () => {
  // "Vi" casaria dentro de "Vi que…" e comeria a fala. Nome < 3 letras não aplica.
  const curto = { proibirNome: true, proibirReapresentar: false, primeiroNome: 'Vi' };
  const r = aplicarGateBolha(['Vi que você tem 200 clientes.'], curto);
  assertEquals(r.bubbles[0], 'Vi que você tem 200 clientes.');
  assertEquals(r.vocativosRemovidos, 0);
});

Deno.test('CONTROLE NEGATIVO: lista vazia e bolha vazia não quebram', () => {
  assertEquals(aplicarGateBolha([], TRAVA_NOME).bubbles, []);
  assertEquals(aplicarGateBolha([''], TRAVA_NOME).bubbles, ['']);
});

// ─────────────────────────────────────────────────────────────────────────────
// O DEFEITO Nº3 MEDIDO: nome em bolhas SEGUIDAS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('DEFEITO nº3: nome abrindo DUAS bolhas seguidas — ambos os vocativos saem', () => {
  const r = aplicarGateBolha(
    ['Andreia, boa pergunta!', 'Andreia, sobre agendamento: dá sim.'],
    TRAVA_NOME,
  );
  assertEquals(r.vocativosRemovidos, 2);
  assertEquals(r.bubbles[0], 'Boa pergunta!');
  assertStringIncludes(r.bubbles[1], 'Sobre agendamento');
  for (const b of r.bubbles) assertEquals(/\bAndreia\b/i.test(b), false);
});
