export interface AffiliateApplication {
  name: string;
  email: string;
  phone: string;
  notes: string | null;
}

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

export function parseAffiliateApplication(body: unknown):
  | { ok: true; value: AffiliateApplication }
  | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
  const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 1000) : null;
  if (name.length < 2) return { ok: false, error: 'Nome obrigatório' };
  if (!isEmail(email)) return { ok: false, error: 'E-mail inválido' };
  if (phone.replace(/\D/g, '').length < 10) return { ok: false, error: 'WhatsApp inválido' };
  return { ok: true, value: { name, email, phone, notes } };
}
