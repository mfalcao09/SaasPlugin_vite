/**
 * Hook central de multiempresa — refatorado para SaaS multi-tenant.
 * - Super admin: visualiza Empresa via query param ?empresa=<id> ou ?slug=<slug>
 * - Tenant regular: busca Empresa onde created_by === user.email (sem auto-criar)
 * Retorna { empresa, empresaId, loading, isSuperAdmin, appConfig, refetch }
 */
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { isSuperAdmin } from "@/lib/isSuperAdmin";

export function useEmpresa() {
  const [empresa, setEmpresa] = useState(null);
  const [appConfig, setAppConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const user = await base44.auth.me();
      if (!user) {
        setEmpresa(null);
        setAppConfig(null);
        setIsSuperAdminUser(false);
        setLoading(false);
        return;
      }

      // Carregar AppConfig
      const appConfigList = await base44.entities.AppConfig.list();
      const config = appConfigList.length > 0 ? appConfigList[0] : null;
      setAppConfig(config);

      // Verificar se é super admin
      const isSA = isSuperAdmin(user, config);
      setIsSuperAdminUser(isSA);

      if (isSA) {
        // Super admin: buscar Empresa via query param
        const empresaId = searchParams.get("empresa");
        const empresaSlug = searchParams.get("slug");

        if (empresaId) {
          try {
            const emp = await base44.entities.Empresa.list();
            const found = emp.find(e => e.id === empresaId);
            setEmpresa(found || null);
          } catch {
            setEmpresa(null);
          }
        } else if (empresaSlug) {
          try {
            const emp = await base44.entities.Empresa.list();
            const found = emp.find(e => e.slug === empresaSlug);
            setEmpresa(found || null);
          } catch {
            setEmpresa(null);
          }
        } else {
          // Super admin sem param: sem empresa
          setEmpresa(null);
        }
      } else {
        // Tenant regular: buscar Empresa onde created_by === user.email
        const list = await base44.entities.Empresa.filter({ created_by: user.email });
        if (list.length > 0) {
          setEmpresa(list[0]);
        } else {
          // Não existe: redirecionar para onboarding
          navigate("/onboarding");
          setEmpresa(null);
        }
      }
    } catch (e) {
      console.error("useEmpresa error:", e);
      setEmpresa(null);
      setAppConfig(null);
    } finally {
      setLoading(false);
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    empresa,
    empresaId: empresa?.id || null,
    loading,
    isSuperAdmin: isSuperAdminUser,
    appConfig,
    refetch: fetch,
  };
}