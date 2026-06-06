export function isSuperAdmin(user, appConfig) {
  if (!user || !appConfig) return false;
  
  const emails = (appConfig.super_admin_emails || []).map(e => (e || '').toLowerCase());
  
  // Check if user is admin role OR email is in super_admin_emails (either one qualifies)
  return user.role === 'admin' || emails.includes((user.email || '').toLowerCase());
}