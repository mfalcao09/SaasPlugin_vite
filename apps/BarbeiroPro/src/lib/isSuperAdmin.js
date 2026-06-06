import { base44 } from '@/api/base44Client';

/**
 * Verifica se um usuário é super admin:
 * - user.role === 'admin' (role da plataforma), OU
 * - user.email está em AppConfig.super_admin_emails
 */
export async function isSuperAdmin(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;

  try {
    const configs = await base44.entities.AppConfig.list();
    const config = configs[0];
    if (!config) return false;
    return Array.isArray(config.super_admin_emails) && config.super_admin_emails.includes(user.email);
  } catch {
    return false;
  }
}

/**
 * Hook-friendly versão síncrona para usar com dados já carregados de AppConfig.
 */
export function isSuperAdminSync(user, appConfig) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!appConfig) return false;
  return Array.isArray(appConfig.super_admin_emails) && appConfig.super_admin_emails.includes(user.email);
}