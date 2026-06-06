/**
 * Autenticação interna de tenants (AcademyUser).
 * Sessão gravada em localStorage — independente do User Base44.
 */

const SESSION_KEY = "gymboss_tenant_session";

// ─── Hash ─────────────────────────────────────────────────────────────────────

function hexStr(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const saltVal = salt || hexStr(crypto.getRandomValues(new Uint8Array(16)));
  const data = enc.encode(saltVal + password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return `sha256$${saltVal}$${hexStr(buf)}`;
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith("sha256$")) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 3) return false;
  const [, salt, expected] = parts;
  const enc = new TextEncoder();
  const data = enc.encode(salt + password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return hexStr(buf) === expected;
}

export function generatePassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length]).join("");
}

export function generateToken() {
  return hexStr(crypto.getRandomValues(new Uint8Array(32)));
}

// ─── Sessão ───────────────────────────────────────────────────────────────────

export function saveSession({ academy_id, academy_user_id, role, user_email, full_name }) {
  const expira_em = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const session = { academy_id, academy_user_id, role, user_email, full_name, expira_em };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (new Date(session.expira_em) < new Date()) {
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