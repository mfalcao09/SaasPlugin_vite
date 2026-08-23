import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseAffiliateApplication } from './affiliate-apply-core.ts';

Deno.test('inscrição válida', () => {
  const r = parseAffiliateApplication({
    name: 'Maria Silva',
    email: 'Maria@X.com',
    phone: '11999998888',
    notes: 'Tenho salão',
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.email, 'maria@x.com');
    assertEquals(r.value.name, 'Maria Silva');
  }
});

Deno.test('rejeita e-mail inválido', () => {
  const r = parseAffiliateApplication({ name: 'Maria', email: 'x', phone: '11999998888' });
  assertEquals(r.ok, false);
});

Deno.test('rejeita telefone curto', () => {
  const r = parseAffiliateApplication({ name: 'Maria', email: 'a@b.com', phone: '123' });
  assertEquals(r.ok, false);
});
