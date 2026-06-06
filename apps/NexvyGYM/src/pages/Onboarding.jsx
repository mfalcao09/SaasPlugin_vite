import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Dumbbell, ChevronRight, ChevronLeft, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { setDemoMode } from "@/lib/demoMode";

const STEPS = [
  { id: 1, title: "Sua Academia",        desc: "Dados básicos da academia"                          },
  { id: 2, title: "Contato & Endereço",  desc: "Como os alunos te encontram"                        },
  { id: 3, title: "Horários",            desc: "Quando a academia funciona"                          },
  { id: 4, title: "Planos & Modalidades",desc: "O que você oferece"                                  },
  { id: 5, title: "Equipe Inicial",      desc: "Seus professores e colaboradores"                    },
  { id: 6, title: "Primeiros Alunos",    desc: "Opcional — cadastre já seus primeiros alunos"       },
  { id: 7, title: "Pronto!",             desc: "Sua academia está configurada"                       },
];

const inputClass = "w-full bg-[#18181B] border border-gym-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gym-orange transition-colors";

function Field({ label, value, onChange, placeholder, type = "text", textarea = false }) {
  return (
    <div>
      {label && <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">{label}</label>}
      {textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          rows={3} className={inputClass + " resize-none"} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className={inputClass} />
      )}
    </div>
  );
}

function slugify(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [academyId, setAcademyId] = useState(null);

  const [academy, setAcademy] = useState({
    name: "", phone: "", email: "", address: "", city: "", state: "",
    hours: "", primary_color: "#F97316",
  });
  const [plans, setPlans] = useState([{ name: "", value: "", modality: "Musculação", recurrence: "mensal" }]);
  const [team, setTeam] = useState([{ name: "", email: "", role: "professor", specialty: "" }]);
  const [students, setStudents] = useState([{ name: "", phone: "", email: "", plan_name: "" }]);

  async function handleFinish() {
    setSaving(true);
    try {
      const me = await base44.auth.me();

      // Calcula trial_ends_at (14 dias)
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);

      let acid = academyId;
      const academyPayload = {
        ...academy,
        slug: slugify(academy.name),
        owner_email: me.email,
        admin_user_email: me.email,
        status: "active",
        plan_name: "Starter",
        subscription_status: "trial",
        trial_ends_at: trialEnd.toISOString().slice(0, 10),
        onboarding_step: 7,
        onboarding_complete: true,
        onboarding_completed: true,
      };

      if (acid) {
        await base44.entities.Academy.update(acid, academyPayload);
      } else {
        const created = await base44.entities.Academy.create(academyPayload);
        acid = created.id;
        setAcademyId(acid);
      }

      // Cria registro AcademyUser para o dono
      try {
        await base44.entities.AcademyUser.create({
          academy_id: acid,
          user_email: me.email,
          full_name: me.full_name || "",
          role: "owner",
          status: "active",
        });
      } catch {}

      // Planos
      for (const p of plans) {
        if (!p.name || !p.value) continue;
        await base44.entities.Plan.create({
          academy_id: acid,
          name: p.name,
          value: parseFloat(p.value),
          modality: p.modality,
          recurrence: p.recurrence,
          status: "ativo",
        });
      }

      // Equipe
      for (const t of team) {
        if (!t.name || !t.email) continue;
        await base44.entities.TeamMember.create({
          academy_id: acid,
          name: t.name,
          user_email: t.email,
          role: t.role,
          specialty: t.specialty,
          active: true,
          invited_by: me.email,
        });
        // Cria AcademyUser para o membro
        try {
          await base44.entities.AcademyUser.create({
            academy_id: acid,
            user_email: t.email,
            full_name: t.name,
            role: t.role === "admin" ? "admin" : "recepcao",
            status: "active",
            invited_by: me.email,
          });
        } catch {}
        try { await base44.users.inviteUser(t.email, "user"); } catch {}
      }

      // Alunos
      for (const s of students) {
        if (!s.name) continue;
        await base44.entities.Student.create({
          academy_id: acid,
          name: s.name,
          phone: s.phone,
          email: s.email,
          plan_name: s.plan_name,
          status: "ativo",
          start_date: new Date().toISOString().slice(0, 10),
          checkin_count_month: 0,
          tags: ["novo"],
        });
      }

      setDemoMode(false);
      navigate("/app/dashboard");
      window.location.reload();
    } catch (e) {
      alert("Erro ao salvar: " + e.message);
    }
    setSaving(false);
  }

  async function saveProgress() {
    if (step < 2 || !academy.name) return;
    try {
      const me = await base44.auth.me();
      const payload = {
        ...academy,
        owner_email: me.email,
        admin_user_email: me.email,
        onboarding_step: step,
        status: "active",
        plan_name: "Starter",
      };
      if (academyId) {
        await base44.entities.Academy.update(academyId, payload);
      } else {
        const created = await base44.entities.Academy.create(payload);
        setAcademyId(created.id);
      }
    } catch {}
  }

  function next() { saveProgress(); setStep(s => Math.min(s + 1, STEPS.length)); }
  function prev() { setStep(s => Math.max(s - 1, 1)); }

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-[#0D0D0F] flex flex-col items-center justify-center p-4 font-inter">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-gym-orange rounded-xl flex items-center justify-center">
          <Dumbbell className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="text-white font-bold text-lg leading-tight">GymBoss AI</div>
          <div className="text-gym-subtle text-xs uppercase tracking-widest">Academy OS</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-2xl mb-6">
        <div className="flex justify-between mb-2">
          {STEPS.map((s) => (
            <div key={s.id} className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 transition-all ${
              step > s.id ? "bg-gym-orange border-gym-orange text-white" :
              step === s.id ? "border-gym-orange text-gym-orange" :
              "border-gym-border text-gym-subtle"
            }`}>
              {step > s.id ? <Check className="w-3.5 h-3.5" /> : s.id}
            </div>
          ))}
        </div>
        <div className="h-1.5 bg-gym-border rounded-full overflow-hidden">
          <div className="h-full bg-gym-orange rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-2xl bg-[#18181B] border border-gym-border rounded-2xl p-8">
        <div className="mb-6">
          <div className="text-xs text-gym-orange font-semibold uppercase tracking-widest mb-1">Passo {step} de {STEPS.length}</div>
          <h2 className="text-2xl font-bold text-white">{STEPS[step - 1].title}</h2>
          <p className="text-gym-muted text-sm mt-1">{STEPS[step - 1].desc}</p>
        </div>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-4">
            <Field label="Nome da Academia *" value={academy.name}
              onChange={v => setAcademy({ ...academy, name: v })} placeholder="Ex: FitZone Performance" />
            <div>
              <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">Cor Principal</label>
              <div className="flex items-center gap-3">
                <input type="color" value={academy.primary_color}
                  onChange={e => setAcademy({ ...academy, primary_color: e.target.value })}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-gym-border bg-transparent" />
                <span className="text-sm text-gym-muted">{academy.primary_color}</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Contact */}
        {step === 2 && (
          <div className="space-y-4">
            <Field label="Telefone / WhatsApp" value={academy.phone}
              onChange={v => setAcademy({ ...academy, phone: v })} placeholder="(11) 99999-0000" />
            <Field label="E-mail" value={academy.email}
              onChange={v => setAcademy({ ...academy, email: v })} placeholder="contato@suaacademia.com.br" type="email" />
            <Field label="Endereço" value={academy.address}
              onChange={v => setAcademy({ ...academy, address: v })} placeholder="Rua, número" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cidade" value={academy.city}
                onChange={v => setAcademy({ ...academy, city: v })} placeholder="São Paulo" />
              <Field label="Estado" value={academy.state}
                onChange={v => setAcademy({ ...academy, state: v })} placeholder="SP" />
            </div>
          </div>
        )}

        {/* Step 3: Hours */}
        {step === 3 && (
          <div className="space-y-4">
            <Field label="Horários de Funcionamento" value={academy.hours}
              onChange={v => setAcademy({ ...academy, hours: v })}
              placeholder="Seg-Sex: 06h-22h | Sáb: 08h-18h | Dom: 08h-14h" textarea />
          </div>
        )}

        {/* Step 4: Plans */}
        {step === 4 && (
          <div className="space-y-4">
            {plans.map((p, i) => (
              <div key={i} className="bg-[#111114] rounded-xl p-4 border border-gym-border/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-white">Plano {i + 1}</span>
                  {plans.length > 1 && (
                    <button onClick={() => setPlans(plans.filter((_, j) => j !== i))} className="text-gym-red hover:opacity-70">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nome" value={p.name}
                    onChange={v => setPlans(plans.map((x, j) => j === i ? { ...x, name: v } : x))} placeholder="Mensal Musculação" />
                  <Field label="Valor (R$)" value={p.value}
                    onChange={v => setPlans(plans.map((x, j) => j === i ? { ...x, value: v } : x))} placeholder="149.90" type="number" />
                  <div>
                    <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">Modalidade</label>
                    <select value={p.modality} onChange={e => setPlans(plans.map((x, j) => j === i ? { ...x, modality: e.target.value } : x))} className={inputClass}>
                      {["Musculação", "Funcional", "Pilates", "Yoga", "Studio", "CrossFit", "Natação", "Completo", "Outro"].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">Recorrência</label>
                    <select value={p.recurrence} onChange={e => setPlans(plans.map((x, j) => j === i ? { ...x, recurrence: e.target.value } : x))} className={inputClass}>
                      {["mensal", "trimestral", "semestral", "anual", "avulso"].map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => setPlans([...plans, { name: "", value: "", modality: "Musculação", recurrence: "mensal" }])}
              className="flex items-center gap-2 text-gym-orange text-sm font-semibold hover:opacity-80">
              <Plus className="w-4 h-4" /> Adicionar plano
            </button>
          </div>
        )}

        {/* Step 5: Team */}
        {step === 5 && (
          <div className="space-y-4">
            {team.map((t, i) => (
              <div key={i} className="bg-[#111114] rounded-xl p-4 border border-gym-border/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-white">Colaborador {i + 1}</span>
                  {team.length > 1 && (
                    <button onClick={() => setTeam(team.filter((_, j) => j !== i))} className="text-gym-red hover:opacity-70">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nome" value={t.name} onChange={v => setTeam(team.map((x, j) => j === i ? { ...x, name: v } : x))} />
                  <Field label="E-mail" value={t.email} onChange={v => setTeam(team.map((x, j) => j === i ? { ...x, email: v } : x))} type="email" />
                  <div>
                    <label className="text-xs text-gym-subtle uppercase tracking-wide mb-1 block">Papel</label>
                    <select value={t.role} onChange={e => setTeam(team.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} className={inputClass}>
                      <option value="admin">Admin</option>
                      <option value="professor">Professor</option>
                      <option value="recepcao">Recepção</option>
                      <option value="financeiro">Financeiro</option>
                    </select>
                  </div>
                  <Field label="Especialidade" value={t.specialty} onChange={v => setTeam(team.map((x, j) => j === i ? { ...x, specialty: v } : x))} />
                </div>
              </div>
            ))}
            <button onClick={() => setTeam([...team, { name: "", email: "", role: "professor", specialty: "" }])}
              className="flex items-center gap-2 text-gym-orange text-sm font-semibold hover:opacity-80">
              <Plus className="w-4 h-4" /> Adicionar colaborador
            </button>
          </div>
        )}

        {/* Step 6: Students */}
        {step === 6 && (
          <div className="space-y-4">
            <p className="text-gym-muted text-sm">Opcional. Você pode cadastrar alunos depois.</p>
            {students.map((s, i) => (
              <div key={i} className="bg-[#111114] rounded-xl p-4 border border-gym-border/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-white">Aluno {i + 1}</span>
                  {students.length > 1 && (
                    <button onClick={() => setStudents(students.filter((_, j) => j !== i))} className="text-gym-red hover:opacity-70">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nome" value={s.name} onChange={v => setStudents(students.map((x, j) => j === i ? { ...x, name: v } : x))} />
                  <Field label="Telefone" value={s.phone} onChange={v => setStudents(students.map((x, j) => j === i ? { ...x, phone: v } : x))} />
                  <Field label="E-mail" value={s.email} onChange={v => setStudents(students.map((x, j) => j === i ? { ...x, email: v } : x))} type="email" />
                  <Field label="Plano" value={s.plan_name} onChange={v => setStudents(students.map((x, j) => j === i ? { ...x, plan_name: v } : x))} placeholder="Mensal Musculação" />
                </div>
              </div>
            ))}
            <button onClick={() => setStudents([...students, { name: "", phone: "", email: "", plan_name: "" }])}
              className="flex items-center gap-2 text-gym-orange text-sm font-semibold hover:opacity-80">
              <Plus className="w-4 h-4" /> Adicionar aluno
            </button>
          </div>
        )}

        {/* Step 7: Done */}
        {step === 7 && (
          <div className="text-center py-6">
            <div className="w-20 h-20 bg-gym-green/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-10 h-10 text-gym-green" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Tudo pronto, {academy.name}!</h3>
            <p className="text-gym-muted text-sm max-w-sm mx-auto">
              Sua academia está configurada e pronta para operar. Clique em "Entrar no Sistema" para começar.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button onClick={prev} disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gym-border text-gym-muted hover:text-white text-sm font-semibold disabled:opacity-30 transition-all">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          {step < STEPS.length ? (
            <button onClick={next}
              className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all">
              Continuar <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleFinish} disabled={saving}
              className="flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-60">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Check className="w-4 h-4" /> Entrar no Sistema</>}
            </button>
          )}
        </div>
      </div>

      <p className="text-gym-subtle text-xs mt-4">
        Já tem uma academia?{" "}
        <button onClick={() => { setDemoMode(false); navigate("/app/dashboard"); window.location.reload(); }}
          className="text-gym-orange hover:underline">Acessar diretamente</button>
      </p>
    </div>
  );
}