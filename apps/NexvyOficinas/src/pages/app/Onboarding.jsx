import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEmpresa } from "@/hooks/useEmpresa";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, Zap, Building2, Palette, Users, Car, Loader2 } from "lucide-react";
import { FormField, Input, Textarea } from "@/components/app/FormField";

const STEPS = [
  { id: 1, icon: Building2, label: "Dados da oficina",    desc: "Nome, telefone e endereço" },
  { id: 2, icon: Palette,   label: "Identidade visual",   desc: "Cor principal e slogan" },
  { id: 3, icon: Users,     label: "Primeiro cliente",    desc: "Cadastre um cliente inicial" },
  { id: 4, icon: Car,       label: "Primeiro veículo",    desc: "Cadastre um veículo" },
];

export default function Onboarding() {
  const { empresa, empresaId, loading, refetch } = useEmpresa();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Forms per step
  const [dadosEmpresa, setDados] = useState({ nome: "", telefone: "", email: "", endereco: "", slogan: "" });
  const [visual, setVisual] = useState({ cor_primaria: "#1C3F5E" });
  const [cliente, setCliente] = useState({ nome: "", telefone: "", email: "" });
  const [veiculo, setVeiculo] = useState({ marca: "", modelo: "", placa: "", ano: new Date().getFullYear() });

  useEffect(() => {
    if (empresa) {
      setDados({ nome: empresa.nome || "", telefone: empresa.telefone || "", email: empresa.email || "", endereco: empresa.endereco || "", slogan: empresa.slogan || "" });
      setVisual({ cor_primaria: empresa.cor_primaria || "#1C3F5E" });
      // If already completed onboarding, redirect
      if (empresa.onboarding_concluido) navigate("/dashboard");
      // Restore step
      if (empresa.onboarding_step > 0) setStep(empresa.onboarding_step);
    }
  }, [empresa]);

  const saveStep = async (nextStep, extraData = {}) => {
    setSaving(true);
    await base44.entities.Empresa.update(empresaId, { ...extraData, onboarding_step: nextStep });
    await refetch();
    setSaving(false);
    if (nextStep > STEPS.length) {
      await base44.entities.Empresa.update(empresaId, { onboarding_concluido: true });
      navigate("/dashboard");
    } else {
      setStep(nextStep);
    }
  };

  const handleStep1 = () => saveStep(2, { ...dadosEmpresa });
  const handleStep2 = () => {
    document.documentElement.style.setProperty("--brand", visual.cor_primaria);
    saveStep(3, { ...visual });
  };
  const handleStep3 = async () => {
    if (cliente.nome.trim()) {
      setSaving(true);
      await base44.entities.Cliente.create({ ...cliente, empresa_id: empresaId, status: "ativo" });
      setSaving(false);
    }
    saveStep(4);
  };
  const handleStep4 = async () => {
    if (veiculo.marca.trim() && veiculo.modelo.trim() && veiculo.placa.trim()) {
      setSaving(true);
      await base44.entities.Veiculo.create({ ...veiculo, empresa_id: empresaId });
      setSaving(false);
    }
    saveStep(5);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: "var(--surface)" }}>
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: "var(--surface)" }}>
      <div className="w-full max-w-lg">
        {/* Brand */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-sm flex items-center justify-center" style={{ backgroundColor: "var(--brand)" }}>
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[15px]" style={{ color: "var(--ink)" }}>AutoFlow AI</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const current = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-2 flex-1">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                    style={{
                      backgroundColor: done ? "var(--status-green-bg)" : current ? "var(--brand)" : "var(--line-soft)",
                      color: done ? "var(--status-green-fg)" : current ? "white" : "var(--ink-muted)",
                    }}>
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.id}
                  </div>
                  <span className="text-[10px] mt-1 text-center hidden sm:block" style={{ color: current ? "var(--ink)" : "var(--ink-muted)" }}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px mb-4" style={{ backgroundColor: done ? "var(--brand)" : "var(--line-soft)" }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step card */}
        <div className="rounded-sm border p-6" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
          {step === 1 && (
            <>
              <h1 className="text-[18px] font-black mb-1" style={{ color: "var(--ink)" }}>Dados da oficina</h1>
              <p className="text-[12px] mb-5" style={{ color: "var(--ink-muted)" }}>Informações básicas da sua empresa</p>
              <div className="space-y-3">
                <FormField label="Nome da oficina" required>
                  <Input value={dadosEmpresa.nome} onChange={e => setDados(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Auto Center Premium" />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Telefone">
                    <Input value={dadosEmpresa.telefone} onChange={e => setDados(p => ({ ...p, telefone: e.target.value }))} placeholder="(11) 99999-9999" />
                  </FormField>
                  <FormField label="E-mail">
                    <Input type="email" value={dadosEmpresa.email} onChange={e => setDados(p => ({ ...p, email: e.target.value }))} placeholder="contato@oficina.com" />
                  </FormField>
                </div>
                <FormField label="Endereço">
                  <Input value={dadosEmpresa.endereco} onChange={e => setDados(p => ({ ...p, endereco: e.target.value }))} placeholder="Rua, número, cidade" />
                </FormField>
                <FormField label="Slogan curto">
                  <Input value={dadosEmpresa.slogan} onChange={e => setDados(p => ({ ...p, slogan: e.target.value }))} placeholder="Ex: Excelência em manutenção" />
                </FormField>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-[18px] font-black mb-1" style={{ color: "var(--ink)" }}>Identidade visual</h1>
              <p className="text-[12px] mb-5" style={{ color: "var(--ink-muted)" }}>Escolha a cor principal da sua marca</p>
              <div className="space-y-4">
                <FormField label="Cor principal">
                  <div className="flex items-center gap-4">
                    <input type="color" value={visual.cor_primaria}
                      onChange={e => {
                        setVisual(p => ({ ...p, cor_primaria: e.target.value }));
                        document.documentElement.style.setProperty("--brand", e.target.value);
                      }}
                      className="w-14 h-10 rounded-sm border cursor-pointer bg-transparent"
                      style={{ borderColor: "var(--line)" }} />
                    <span className="font-mono text-[13px]" style={{ color: "var(--ink)" }}>{visual.cor_primaria}</span>
                  </div>
                </FormField>
                {/* Preview */}
                <div className="rounded-sm border p-4 flex items-center gap-3" style={{ backgroundColor: "var(--surface)", borderColor: "var(--line)" }}>
                  <div className="w-9 h-9 rounded-sm flex items-center justify-center text-white font-black text-sm"
                    style={{ backgroundColor: visual.cor_primaria }}>
                    {(dadosEmpresa.nome || "A").charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>{dadosEmpresa.nome || "Sua Oficina"}</div>
                    <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>{dadosEmpresa.slogan || "Slogan da oficina"}</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-[18px] font-black mb-1" style={{ color: "var(--ink)" }}>Primeiro cliente</h1>
              <p className="text-[12px] mb-5" style={{ color: "var(--ink-muted)" }}>Opcional — pode pular e adicionar depois</p>
              <div className="space-y-3">
                <FormField label="Nome">
                  <Input value={cliente.nome} onChange={e => setCliente(p => ({ ...p, nome: e.target.value }))} placeholder="Nome do cliente" />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Telefone">
                    <Input value={cliente.telefone} onChange={e => setCliente(p => ({ ...p, telefone: e.target.value }))} placeholder="(11) 99999-9999" />
                  </FormField>
                  <FormField label="E-mail">
                    <Input value={cliente.email} onChange={e => setCliente(p => ({ ...p, email: e.target.value }))} placeholder="email@cliente.com" />
                  </FormField>
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className="text-[18px] font-black mb-1" style={{ color: "var(--ink)" }}>Primeiro veículo</h1>
              <p className="text-[12px] mb-5" style={{ color: "var(--ink-muted)" }}>Opcional — pode pular e adicionar depois</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Marca">
                    <Input value={veiculo.marca} onChange={e => setVeiculo(p => ({ ...p, marca: e.target.value }))} placeholder="Ex: Toyota" />
                  </FormField>
                  <FormField label="Modelo">
                    <Input value={veiculo.modelo} onChange={e => setVeiculo(p => ({ ...p, modelo: e.target.value }))} placeholder="Ex: Corolla" />
                  </FormField>
                  <FormField label="Placa">
                    <Input value={veiculo.placa} onChange={e => setVeiculo(p => ({ ...p, placa: e.target.value.toUpperCase() }))} placeholder="AAA-0000" />
                  </FormField>
                  <FormField label="Ano">
                    <Input type="number" value={veiculo.ano} onChange={e => setVeiculo(p => ({ ...p, ano: Number(e.target.value) }))} />
                  </FormField>
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 pt-5" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <button
              onClick={() => setStep(s => Math.max(1, s - 1))}
              className="text-[13px] font-semibold px-4 py-2 rounded-sm border"
              style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}
              disabled={step === 1}>
              ← Voltar
            </button>
            <div className="flex gap-2">
              {step >= 3 && (
                <button onClick={() => saveStep(step + 1)}
                  className="text-[13px] px-4 py-2 rounded-sm border"
                  style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}>
                  Pular
                </button>
              )}
              <button
                disabled={saving || (step === 1 && !dadosEmpresa.nome.trim())}
                onClick={[handleStep1, handleStep2, handleStep3, handleStep4][step - 1]}
                className="flex items-center gap-2 text-[13px] font-bold px-5 py-2 rounded-sm text-white hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--brand)" }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {step === STEPS.length ? "Concluir →" : "Continuar"}
                {!saving && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] mt-4" style={{ color: "var(--ink-muted)" }}>
          Você pode editar tudo isso depois em Configurações
        </p>
      </div>
    </div>
  );
}