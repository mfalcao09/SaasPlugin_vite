// conversation-state.test.ts — PR-A. Definição de PRONTO do módulo.
//   deno test --no-check supabase/functions/_shared/conversation-state.test.ts
//
// Os testes marcados [CONTROLE NEGATIVO] são a peça exigida pela revisão da
// sessão Controladora GO-LIVE: todo campo tier 2/3 tem um caso cuja entrada é a
// NEGAÇÃO do padrão. Se um controle negativo falhar, aquele campo NÃO pode ser
// tier 2/3 — rebaixa para tier 1 ou sai do estado.

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  derivarEstagio,
  estadoVazio,
  politica,
  predicadoTravaOtimista,
  reduzir,
} from './conversation-state.ts';

// ─── REDUCER ─────────────────────────────────────────────────────────────────

Deno.test('estado vazio OMITE tudo — nenhum default vira fato por acidente', () => {
  const s = estadoVazio();
  assertEquals(Object.keys(s).length, 0);
  // A regra de ouro em forma de asserção: sem estado, a política não afirma NADA
  // que não possa provar. Estado ausente → modelo improvisa (aceitável).
  const p = politica(s);
  assertEquals(p.fatos.length, 0);
  assertFalse(p.proibirOfertaDemo);
  assertFalse(p.proibirNome);
  assertFalse(p.proibirReapresentar);
});

Deno.test('tier 1: outbound entregue marca apresentou', () => {
  const s = reduzir(estadoVazio(), { seq: 10, enviouOutbound: true });
  assert(s.apresentou);
  assertEquals(s.atualizado_seq, 10);
});

Deno.test('idempotência: reduzir o MESMO seq duas vezes não conta duas vezes', () => {
  const s1 = reduzir(estadoVazio(), { seq: 10, tagOfertaDemo: true });
  const s2 = reduzir(s1, { seq: 10, tagOfertaDemo: true }); // re-entrega / retry
  assertEquals(s1.demo_ofertas, 1);
  assertEquals(s2.demo_ofertas, 1);
});

Deno.test('seq ANTIGO não regride o estado (chegada fora de ordem)', () => {
  const s1 = reduzir(estadoVazio(), { seq: 50, enviouLink: true });
  const s2 = reduzir(s1, { seq: 20, tagOfertaDemo: true }); // turno atrasado
  assert(s2.link_enviado);
  assertEquals(s2.demo_ofertas, undefined); // não aplicou
  assertEquals(s2.atualizado_seq, 50);
});

Deno.test('objeções deduplicam e normalizam', () => {
  let s = reduzir(estadoVazio(), { seq: 1, tagsObjecao: ['Golpe', ' preco '] });
  s = reduzir(s, { seq: 2, tagsObjecao: ['golpe', 'virus'] });
  assertEquals(s.objecoes_vistas?.slice().sort(), ['golpe', 'preco', 'virus']);
});

// ─── CONTROLES NEGATIVOS ─────────────────────────────────────────────────────

Deno.test('[CONTROLE NEGATIVO] a armadilha do regex é REAL — documentada aqui', () => {
  // Este teste existe para que ninguém reintroduza a inferência por prosa.
  // O sanitizeReply da Duda morreu exatamente assim: o padrão casa DENTRO da
  // frase negada.
  const fraseDaReclamacao = 'não vou ficar te oferecendo demonstração';
  const regexIngenuo = /oferec\w*\s+demonstra/i;
  assert(
    regexIngenuo.test(fraseDaReclamacao),
    'o regex ingênuo DEVE casar — é essa a armadilha que o tier 3 carrega',
  );
});

Deno.test('[CONTROLE NEGATIVO] demo_ofertas NÃO incrementa sem tag explícita', () => {
  // Mesmo turno em que a frase acima foi dita: sem `tagOfertaDemo`, nada conta.
  // O reducer não vê prosa — por construção, não por sorte.
  const s = reduzir(estadoVazio(), { seq: 30, enviouOutbound: true });
  assertEquals(s.demo_ofertas, undefined);
  assertFalse(politica(s).proibirOfertaDemo);
});

Deno.test('[CONTROLE NEGATIVO] link_enviado continua false sem ato do código', () => {
  // "não mando link nenhum agora" — o gate não deixou URL passar, logo
  // enviouLink é false, logo o estado não mente.
  const s = reduzir(estadoVazio(), { seq: 31, enviouOutbound: true, enviouLink: false });
  assertFalse(!!s.link_enviado);
});

Deno.test('[CONTROLE NEGATIVO] nome NÃO é marcado quando não saiu na bolha', () => {
  const s = reduzir(estadoVazio(), { seq: 32, enviouOutbound: true, usouNome: false });
  assertEquals(s.nome_ultimo_uso_seq, undefined);
  assertFalse(politica(s, { seqAtual: 33 }).proibirNome);
});

// ─── POLÍTICA ────────────────────────────────────────────────────────────────

Deno.test('defeito nº2 medido: demo recusada → PROIBIDO reofertar', () => {
  let s = reduzir(estadoVazio(), { seq: 40, tagOfertaDemo: true });
  s = reduzir(s, { seq: 41, leadRecusou: true }); // "tá chato"
  const p = politica(s);
  assert(p.proibirOfertaDemo);
  assert(p.fatos.some((f) => f.includes('PROIBIDO oferecer de novo')));
});

Deno.test('recusa é REABERTA só por pedido explícito dela', () => {
  let s = reduzir(estadoVazio(), { seq: 40, tagOfertaDemo: true });
  s = reduzir(s, { seq: 41, leadRecusou: true });
  assertFalse(politica(s, { leadAceitouAgora: true }).proibirOfertaDemo);
});

Deno.test('link: proibido sem aceite, liberado com aceite', () => {
  const s = reduzir(estadoVazio(), { seq: 50, enviouOutbound: true });
  assert(politica(s, { leadAceitouAgora: false }).proibirLink);
  assertFalse(politica(s, { leadAceitouAgora: true }).proibirLink);
});

Deno.test('nome: proibido DENTRO da janela, liberado fora', () => {
  const s = reduzir(estadoVazio(), { seq: 100, enviouOutbound: true, usouNome: true });
  assert(politica(s, { seqAtual: 104, janelaNome: 8 }).proibirNome); // 4 < 8
  assertFalse(politica(s, { seqAtual: 110, janelaNome: 8 }).proibirNome); // 10 >= 8
});

Deno.test('reapresentação: proibida assim que existe outbound', () => {
  const s = reduzir(estadoVazio(), { seq: 60, enviouOutbound: true });
  const p = politica(s);
  assert(p.proibirReapresentar);
  assert(p.fatos.some((f) => f.includes('já se apresentou')));
});

// ─── ESTÁGIO DERIVADO ────────────────────────────────────────────────────────

Deno.test('estágio é DERIVADO — nunca armazenado, nunca diverge', () => {
  assertEquals(derivarEstagio(estadoVazio()), 'abertura');
  assertEquals(derivarEstagio({ apresentou: true }), 'duvidas');
  assertEquals(derivarEstagio({ apresentou: true, demo_ofertas: 1 }), 'fechamento');
  assertEquals(derivarEstagio({ apresentou: true, link_enviado: true }), 'fechamento');
  assertEquals(derivarEstagio(null), 'abertura'); // nulo não explode
});

// ─── TRAVA OTIMISTA ──────────────────────────────────────────────────────────

Deno.test("predicado da trava cobre primeira escrita E marca d'água menor", () => {
  const pred = predicadoTravaOtimista(77);
  assert(pred.includes('is.null'), 'primeira escrita (estado nulo) precisa passar');
  assert(pred.includes('lt.77'), "só grava por cima de marca d'água MENOR");
});

Deno.test('trava usa `->` (jsonb/numérico) e NUNCA `->>` (texto) — o bug que congelava o estado', () => {
  // ESTE TESTE EXISTE PORQUE A VERSÃO ANTERIOR PASSAVA COM O BUG: o teste acima só
  // confere que a string contém 'lt.77', e a forma quebrada com `->>` também contém.
  //
  // Achado da revisão adversarial pré-deploy, confirmado no banco de PRODUÇÃO:
  //   ('{"atualizado_seq":99}'::jsonb->>'atualizado_seq') < '459'  →  FALSE  (texto)
  //   ('{"atualizado_seq":99}'::jsonb ->'atualizado_seq') < '459'  →  TRUE   (jsonb)
  // Com `->>` o Postgres compara caractere a caractere: '9' > '4', logo '99' > '459'.
  // O UPDATE nunca casava, o fallback usava o MESMO predicado quebrado, e o log
  // dizia "trava barrou, releu e reduziu de novo" — afirmando recuperação que não
  // houve. max(seq) em produção já era 459: o defeito era ATUAL, não futuro.
  const pred = predicadoTravaOtimista(1002);

  assertEquals(pred.includes('->>'), false, 'com `->>` a comparação vira lexicográfica');
  assert(pred.includes('conversation_state->atualizado_seq'), 'precisa ser `->` (jsonb)');

  // Viradas de dígito, que são exatamente onde texto e número divergem. Se alguém
  // trocar de volta pra `->>`, isto quebra ANTES de o estado congelar em produção.
  for (const seq of [10, 100, 459, 1000, 1002]) {
    const p = predicadoTravaOtimista(seq);
    assert(p.includes('lt.' + seq), 'marca dágua ' + seq + ' precisa aparecer');
    assertEquals(p.includes('->>'), false, 'seq ' + seq + ': nunca a forma textual');
  }
});

Deno.test('lost update: o perdedor relê e reduz de novo, sem perder contagem', () => {
  // Simula o cenário real medido: 3 hand-backs concorrentes.
  const v1 = reduzir(estadoVazio(), { seq: 10, tagOfertaDemo: true }); // ofertas=1
  // Lote 2 e lote 3 leem v1 ao mesmo tempo.
  const lote2 = reduzir(v1, { seq: 11, tagOfertaDemo: true }); // ofertas=2
  // Lote 3 PERDEU a corrida (a trava barra) → relê o vencedor e reduz de novo:
  const lote3Correto = reduzir(lote2, { seq: 12, tagOfertaDemo: true }); // ofertas=3
  assertEquals(lote3Correto.demo_ofertas, 3);
  // O que aconteceria SEM a trava (os dois gravando sobre v1): a contagem mente.
  const lote3Errado = reduzir(v1, { seq: 12, tagOfertaDemo: true });
  assertEquals(lote3Errado.demo_ofertas, 2); // ← perdeu uma oferta
  assert(
    (lote3Correto.demo_ofertas ?? 0) > (lote3Errado.demo_ofertas ?? 0),
    'a trava é o que separa contagem correta de estado que mente',
  );
});
