/**
 * Autenticação interna dos tenants via CompanyUser + localStorage.
 * Independente do User Base44 (OAuth). Apenas /adminmaster usa User Base44.
 */

const SESSION_KEY = 'fc_tenant_session';

// ─── SHA256 com salt (formato: sha256$salt$hex) ─────────────────────────────

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  array.forEach(byte => { result += chars[byte % chars.length]; });
  return result;
}

export async function hashPassword(password) {
  const salt = generateSalt();
  const hex = await sha256(salt + password);
  return `sha256$${salt}$${hex}`;
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('sha256$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, salt, expectedHex] = parts;
  const hex = await sha256(salt + password);
  return hex === expectedHex;
}

export function generatePassword(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => chars[b % chars.length]).join('');
}

// ─── Sessão localStorage ─────────────────────────────────────────────────────

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

export function saveSession({ company_id, company_user_id, role, nome, email }) {
  const expira_em = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const session = { company_id, company_user_id, role, nome, email, expira_em };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function isSessionValid() {
  return getSession() !== null;
}