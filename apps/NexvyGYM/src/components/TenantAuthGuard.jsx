/**
 * Guard para rotas do painel da academia.
 * Verifica sessão localStorage (AcademyUser), não User Base44.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Outlet } from "react-router-dom";
import { getSession } from "@/lib/tenantAuth";
import { Loader2 } from "lucide-react";

export default function TenantAuthGuard() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (session) {
      setOk(true);
    } else {
      navigate("/login", { replace: true });
    }
    setChecked(true);
  }, [navigate]);

  if (!checked) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
        <Loader2 className="w-6 h-6 text-gym-orange animate-spin" />
      </div>
    );
  }

  return ok ? <Outlet /> : null;
}