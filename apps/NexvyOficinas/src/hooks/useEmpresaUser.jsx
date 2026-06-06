/**
 * Hook consolidado de empresa do usuário
 * Diferencia entre:
 * - Super Admin: criado_por base44, vê todas as empresas
 * - Admin da Oficina: criado_por usuário, vinculado a uma empresa
 * - Usuário convidado: criado_por outro, vê apenas a empresa vinculada
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export function useEmpresaUser() {
  const [user, setUser] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // Verifica se é super admin (criado por "base44")
        const isSA = currentUser.created_by === "base44";
        setIsSuperAdmin(isSA);

        if (isSA) {
          // Super admin não tem empresa vinculada
          setEmpresa(null);
        } else {
          // Usuário comum: procura empresa vinculada ao seu email (criada por ele)
          // Se não encontrar, procura em empresas onde ele foi adicionado
          const empresasCriadas = await base44.entities.Empresa.filter({ created_by: currentUser.email });
          
          if (empresasCriadas.length > 0) {
            // É admin da oficina
            setEmpresa(empresasCriadas[0]);
          } else {
            // Pode ser usuário convidado: tenta encontrar por user_id ou email
            // Por enquanto retorna null - será expandido se necessário
            setEmpresa(null);
          }
        }
      } catch (e) {
        console.error("useEmpresaUser error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return {
    user,
    empresa,
    empresaId: empresa?.id || null,
    isSuperAdmin,
    loading,
  };
}