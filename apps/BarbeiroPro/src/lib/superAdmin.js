import { base44 } from '@/api/base44Client';

let cachedConfig = null;

export async function getAppConfig() {
  if (cachedConfig) return cachedConfig;
  const configs = await base44.entities.AppConfig.list();
  cachedConfig = configs[0] || null;
  return cachedConfig;
}

export async function isSuperAdmin(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const config = await getAppConfig();
  if (!config?.super_admin_emails) return false;
  return config.super_admin_emails.includes(user.email);
}