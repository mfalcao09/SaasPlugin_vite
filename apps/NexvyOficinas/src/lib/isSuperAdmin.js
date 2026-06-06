export function isSuperAdmin(user, appConfig) {
  if (!user || !appConfig) return false;
  
  // Check if user role is admin (legacy)
  if (user.role === 'admin') return true;
  
  // Check if user email is in super_admin_emails (case-insensitive)
  const userEmail = user.email?.toLowerCase();
  const superAdmins = appConfig.super_admin_emails || [];
  return superAdmins.some(email => email.toLowerCase() === userEmail);
}