import { useState, useEffect } from "react";
import { X, Phone, Mail, Calendar, CreditCard, Clock, Loader2 } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { demoCheckins } from "@/lib/demoData";
import { base44 } from "@/api/base44Client";

export default function AlunoModal({ student, demo, academyId, onClose }) {
  const [checkins, setCheckins] = useState([]);
  const [loadingCheckins, setLoadingCheckins] = useState(false);

  useEffect(() => {
    if (!student) return;
    if (demo) {
      setCheckins(demoCheckins.filter(c => c.student_id === student.id));
      return;
    }
    setLoadingCheckins(true);
    base44.entities.Checkin.filter({ academy_id: academyId, student_id: student.id }, "-date", 20)
      .then(setCheckins)
      .finally(() => setLoadingCheckins(false));
  }, [student?.id, demo, academyId]);

  if (!student) return null;

  const safeDate = (val) => {
    if (!val) return "—";
    try { return new Date(val).toLocaleDateString("pt-BR"); } catch { return "—"; }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#18181B] border border-gym-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gym-border flex items-center justify-between sticky top-0 bg-[#18181B]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gym-orange/15 flex items-center justify-center text-gym-orange font-bold text-lg">
              {student.name[0]}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{student.name}</h2>
              <div className="flex gap-2 mt-1 flex-wrap">
                <StatusBadge status={student.status} />
                {(student.tags || []).map(t => <StatusBadge key={t} status={t} />)}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gym-subtle hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4">
            <InfoRow icon={Phone} label="Telefone" value={student.phone || "—"} />
            <InfoRow icon={Mail} label="E-mail" value={student.email || "—"} />
            {student.birthdate && <InfoRow icon={Calendar} label="Nascimento" value={safeDate(student.birthdate)} />}
            <InfoRow icon={CreditCard} label="Plano" value={student.plan_name || "—"} />
            {student.start_date && <InfoRow icon={Clock} label="Início" value={safeDate(student.start_date)} />}
            {student.expiry_date && <InfoRow icon={Clock} label="Vencimento" value={safeDate(student.expiry_date)} />}
          </div>

          {/* Frequency */}
          <div className="bg-[#111114] rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-gym-subtle mb-3 font-semibold">Frequência</div>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-2xl font-bold text-white text-tabular">{student.checkin_count_month ?? 0}x</div>
                <div className="text-xs text-gym-subtle">este mês</div>
              </div>
              {student.last_checkin && (
                <div>
                  <div className="text-sm font-semibold text-gym-muted">{safeDate(student.last_checkin)}</div>
                  <div className="text-xs text-gym-subtle">último check-in</div>
                </div>
              )}
            </div>
          </div>

          {/* Check-in history */}
          <div>
            <div className="text-xs uppercase tracking-wide text-gym-subtle mb-3 font-semibold flex items-center gap-2">
              Histórico de Check-ins
              {!demo && <span className="text-[10px] bg-gym-green/20 text-gym-green px-1.5 py-0.5 rounded font-bold">REAL</span>}
            </div>
            {loadingCheckins ? (
              <div className="flex items-center gap-2 text-gym-subtle text-sm py-3">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : checkins.length === 0 ? (
              <div className="text-gym-subtle text-sm py-3">Nenhum check-in registrado.</div>
            ) : (
              <div className="space-y-1">
                {checkins.map((c, i) => (
                  <div key={c.id || i} className="flex items-center justify-between text-sm py-2 border-b border-gym-border/30 last:border-0">
                    <span className="text-gym-muted">{safeDate(c.date)} {c.time && `• ${c.time}`}</span>
                    <span className="text-gym-subtle">{c.modality || "—"}{c.professor ? ` • Prof. ${c.professor}` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observations */}
          {student.observations && (
            <div className="bg-[#111114] rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-gym-subtle mb-2 font-semibold">Observações</div>
              <p className="text-sm text-gym-muted">{student.observations}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div>
      <div className="text-xs text-gym-subtle mb-1 flex items-center gap-1"><Icon className="w-3 h-3" />{label}</div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}