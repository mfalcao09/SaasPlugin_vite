// deno test — golden suite da decisão PURA pickOffersToDisable (colapso das
// ofertas antigas/divergentes). Sem rede, sem DB.
//   deno test --no-check supabase/functions/cakto-sync-offer/pick-offers.test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { pickOffersToDisable } from './pick-offers.ts';

const offer = (o: Record<string, unknown> = {}) => ({
  type: 'subscription',
  status: 'active',
  intervalType: 'month',
  ...o,
});

Deno.test('(a) mantém as desejadas e devolve só as de assinatura ativas divergentes', () => {
  const offers = [
    offer({ id: 'keepM', price: 383 }), // mensal desejada (nova)
    offer({ id: 'keepY', price: 3830, intervalType: 'year' }), // anual desejada (nova)
    offer({ id: 'oldM', price: 275 }), // mensal ANTIGA (preço defasado)
    offer({ id: 'oldY', price: 2750, intervalType: 'year' }), // anual ANTIGA
  ];
  const toDisable = pickOffersToDisable(offers, ['keepM', 'keepY']);
  assertEquals(toDisable.sort(), ['oldM', 'oldY']);
});

Deno.test('(a) NUNCA desabilita as desejadas mesmo com preço diferente', () => {
  const offers = [offer({ id: 'keepM' }), offer({ id: 'keepY', intervalType: 'year' })];
  assertEquals(pickOffersToDisable(offers, ['keepM', 'keepY']), []);
});

Deno.test('(b) vazio quando não há oferta divergente (idempotente)', () => {
  const offers = [offer({ id: 'keepM' })];
  assertEquals(pickOffersToDisable(offers, ['keepM']), []);
  // 2ª rodada: as antigas já saíram de active → nada a fazer.
  const afterCollapse = [offer({ id: 'keepM' }), offer({ id: 'oldM', status: 'disabled' })];
  assertEquals(pickOffersToDisable(afterCollapse, ['keepM']), []);
});

Deno.test('(b) vazio para array vazio e para keepIds vazio sem ofertas', () => {
  assertEquals(pickOffersToDisable([], ['keepM']), []);
  assertEquals(pickOffersToDisable([], []), []);
});

Deno.test('ignora não-assinatura, não-ativas e intervalType não gerenciado', () => {
  const offers = [
    offer({ id: 'oldM' }), // divergente válida → sai
    offer({ id: 'unique', type: 'unique' }), // produto avulso → protegido
    offer({ id: 'inactive', status: 'disabled' }), // já desabilitada → ignorada
    offer({ id: 'weekly', intervalType: 'week' }), // SKU semanal alheio → protegido
    offer({ id: 'lifetime', intervalType: 'lifetime' }), // vitalícia alheia → protegida
  ];
  assertEquals(pickOffersToDisable(offers, ['keepM']), ['oldM']);
});

Deno.test('dedupe e ids nulos: sem repetidos, sem entradas sem id', () => {
  const offers = [
    offer({ id: 'oldM' }),
    offer({ id: 'oldM' }), // duplicada
    offer({ id: null }), // sem id → ignorada
    offer({}), // sem id → ignorada
  ];
  assertEquals(pickOffersToDisable(offers, []), ['oldM']);
});

Deno.test('keepIds com null/undefined não derruba o filtro das desejadas', () => {
  const offers = [offer({ id: 'keepM' }), offer({ id: 'oldM' })];
  // yearly.slug pode vir null quando o ciclo anual foi pulado (< preço mínimo).
  assertEquals(pickOffersToDisable(offers, ['keepM', null, undefined]), ['oldM']);
});
