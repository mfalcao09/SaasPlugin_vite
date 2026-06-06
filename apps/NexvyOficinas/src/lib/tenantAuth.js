/**
 * Autenticação local dos tenants (EmpresaUser).
 * Sessão gravada em localStorage com expiração de 24h.
 * NÃO usa o User Base44 — somente para painel da oficina.
 */

const SESSION_KEY = "autoflow_tenant_session";

// ── Hash helpers ──────────────────────────────────────────────────────────────

async function sha256hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const hex = await sha256hex(salt + password);
  return `sha256$${salt}$${hex}`;
}

export async function verifyPassword(password, hash) {
  if (!hash || !hash.startsWith("sha256$")) return false;
  const [, salt, stored] = hash.split("$");
  const hex = await sha256hex(salt + password);
  return hex === stored;
}

export function generateTempPassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length]).join("");
}

export function generateToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Session ───────────────────────────────────────────────────────────────────

export function saveSession(data) {
  const session = { ...data, expira_em: Date.now() + 24 * 60 * 60 * 1000 };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expira_em) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}