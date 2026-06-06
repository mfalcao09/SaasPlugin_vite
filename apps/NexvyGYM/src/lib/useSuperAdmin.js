import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Hook que verifica se o usuário atual é Super Admin.
 * Usado por MasterPanel e AdminConfig — páginas fora do AppLayout.
 *
 * Lógica de resolução (ordem de prioridade):
 *  1. user.role === "admin"
 *  2. AppConfig.super_admin_email === user.email
 *  3. AppConfig.super_admin_emails inclui user.email
 *  4. Se AppConfig vazio → cria com o e-mail do usuário atual (primeiro acesso)
 */
export function useSuperAdmin() {
  const [user, setUser] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [appConfig, setAppConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkSuperAdmin();
  }, []);

  async function checkSuperAdmin() {
    try {
      setLoading(true);
      setError(null);

      const me = await base44.auth.me();
      setUser(me);
      console.log("[SuperAdmin] Usuário:", me.email, "| role:", me.role);

      // role === "admin" = proprietário da conta Base44 → sempre super admin
      if (me.role === "admin") {
        setIsSuperAdmin(true);
        setLoading(false);
        return;
      }

      // Verifica lista extra no AppConfig (sem criar nem modificar nada)
      const configs = await base44.entities.AppConfig.list();
      const cfg = configs[0] || null;
      setAppConfig(cfg);

      const extras = cfg?.super_admin_emails || [];
      const isSA = extras.includes(me.email);
      console.log("[SuperAdmin] Resultado:", { isSA, extras });
      setIsSuperAdmin(isSA);
    } catch (err) {
      console.error("[SuperAdmin] Erro:", err);
      setError(err);
      setIsSuperAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  return { user, isSuperAdmin, appConfig, loading, error, recheckSuperAdmin: checkSuperAdmin };
}