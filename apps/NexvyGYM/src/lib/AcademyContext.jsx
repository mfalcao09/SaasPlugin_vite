import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { isDemoMode } from "@/lib/demoMode";
import { demoAcademy } from "@/lib/demoData";

const AcademyContext = createContext(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSlugParam() {
  return new URLSearchParams(window.location.search).get("slug");
}

/**
 * Determina se o usuário é Super Admin.
 * Fonte primária: user.role === "admin" (proprietário da conta Base44).
 * Fonte secundária: AppConfig.super_admin_emails (lista extra opcional).
 * NÃO cria nem modifica AppConfig aqui.
 */
async function resolveSuperAdmin(me) {
  if (me.role === "admin") return true;
  try {
    const configs = await base44.entities.AppConfig.list();
    if (configs.length > 0) {
      const extras = configs[0].super_admin_emails || [];
      return extras.includes(me.email);
    }
  } catch {}
  return false;
}

/**
 * Busca a academia vinculada ao usuário.
 * Ordem: owner_email → admin_user_email → AcademyUser (membro de equipe).
 */
async function resolveAcademyForUser(me) {
  // 1. owner_email (dono criado pelo onboarding)
  let list = await base44.entities.Academy.filter({ owner_email: me.email });
  if (list.length > 0) return list[0];

  // 2. admin_user_email (campo legado)
  list = await base44.entities.Academy.filter({ admin_user_email: me.email });
  if (list.length > 0) return list[0];

  // 3. AcademyUser (membro convidado)
  const memberships = await base44.entities.AcademyUser.filter({ user_email: me.email, status: "active" });
  if (memberships.length > 0) {
    const found = await base44.entities.Academy.filter({ id: memberships[0].academy_id });
    if (found.length > 0) return found[0];
  }

  return null;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AcademyProvider({ children }) {
  const [academy, setAcademy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const loadAcademy = useCallback(async () => {
    setLoading(true);
    setNotFound(false);

    if (isDemoMode()) {
      setAcademy(demoAcademy);
      setLoading(false);
      return;
    }

    try {
      const me = await base44.auth.me();
      setUser(me);

      const isSA = await resolveSuperAdmin(me);
      setIsSuperAdmin(isSA);

      const slugParam = getSlugParam();
      console.log("[AcademyContext]", { email: me.email, isSA, slugParam });

      if (slugParam) {
        // Super admin visualizando tenant via ?slug=
        const results = await base44.entities.Academy.filter({ slug: slugParam });
        console.log("[AcademyContext] slug lookup:", results.length);
        if (results.length > 0) {
          setAcademy(results[0]);
        } else {
          setNotFound(true);
        }
      } else {
        const found = await resolveAcademyForUser(me);
        console.log("[AcademyContext] owner lookup:", found ? found.name : "não encontrado");
        if (found) {
          setAcademy(found);
        } else {
          setNotFound(true);
        }
      }
    } catch (e) {
      console.error("[AcademyContext] erro:", e);
      setNotFound(true);
    }

    setLoading(false);
  }, []);

  const refreshAcademy = useCallback(async () => {
    if (isDemoMode()) return;
    try {
      const me = await base44.auth.me();
      const slugParam = getSlugParam();
      if (slugParam) {
        const list = await base44.entities.Academy.filter({ slug: slugParam });
        if (list.length > 0) setAcademy(list[0]);
      } else {
        const found = await resolveAcademyForUser(me);
        if (found) setAcademy(found);
      }
    } catch {}
  }, []);

  const updateAcademy = useCallback(async (data) => {
    if (!academy?.id) return;
    const updated = await base44.entities.Academy.update(academy.id, data);
    setAcademy(updated);
    return updated;
  }, [academy?.id]);

  useEffect(() => {
    loadAcademy();
  }, [loadAcademy]);

  // White-label: aplica cor primária da academia ao CSS
  useEffect(() => {
    if (academy?.primary_color) {
      document.documentElement.style.setProperty("--academy-primary", academy.primary_color);
    }
  }, [academy?.primary_color]);

  const viewingAsAdmin = isSuperAdmin && !!getSlugParam();

  return (
    <AcademyContext.Provider value={{
      academy, setAcademy,
      loading, notFound,
      user, isSuperAdmin, viewingAsAdmin,
      refreshAcademy, updateAcademy, loadAcademy,
    }}>
      {children}
    </AcademyContext.Provider>
  );
}

export function useAcademy() {
  return useContext(AcademyContext);
}