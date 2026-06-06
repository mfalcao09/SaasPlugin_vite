/**
 * Hook para recuperar a empresa vinculada ao usuário.
 * Procura por empresa onde o usuário foi adicionado (por email).
 * Para super admin (criador = base44), retorna null empresaId (acesso a todas).
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export function useEmpresaVinculada() {
  const [empresa, setEmpresa] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const user = await base44.auth.me();
        
        // Super admin check: se foi criado por "base44" é super admin
        const isSA = user.created_by === "base44";
        setIsSuperAdmin(isSA);
        
        if (isSA) {
          // Super admin não tem empresa vinculada
          setEmpresa(null);
        } else {
          // Admin da oficina: procura por empresa vinculada ao seu email
          const empresas = await base44.entities.Empresa.filter({ created_by: user.email });
          if (empresas.length > 0) {
            setEmpresa(empresas[0]);
          } else {
            setEmpresa(null);
          }
        }
      } catch (e) {
        console.error("useEmpresaVinculada error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return { empresa, empresaId: empresa?.id || null, isSuperAdmin, loading };
}