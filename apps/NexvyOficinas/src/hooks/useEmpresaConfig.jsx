/**
 * Context + hook global de configuração de empresa.
 * Aplica cor primária como CSS var(--brand) dinamicamente.
 * Usa useEmpresaUser para detectar corretamente a empresa.
 */
import { createContext, useContext } from "react";
import { useEmpresaUser } from "./useEmpresaUser";

const EmpresaConfigContext = createContext(null);

export function EmpresaConfigProvider({ children }) {
  const { empresa, isSuperAdmin } = useEmpresaUser();

  // Aplica cor da empresa se não for super admin
  if (empresa && empresa.cor_primaria && !isSuperAdmin) {
    document.documentElement.style.setProperty("--brand", empresa.cor_primaria);
    document.documentElement.style.setProperty("--sidebar-item-active-bg", empresa.cor_primaria);
  }

  return (
    <EmpresaConfigContext.Provider value={{ empresa, isSuperAdmin }}>
      {children}
    </EmpresaConfigContext.Provider>
  );
}

export function useEmpresaConfig() {
  return useContext(EmpresaConfigContext);
}