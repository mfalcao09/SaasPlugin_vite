import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useTenantEmpresa } from "@/hooks/useTenantEmpresa";
import { useTenantAuth } from "@/lib/TenantAuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { FormField, Input, Textarea } from "@/components/app/FormField";
import { Building2, Palette, Settings, Save, Loader2 } from "lucide-react";

export default function Configuracoes() {
  useDocumentTitle("Configurações | AutoFlow AI");
  const { empresa, empresaId, loading } = useTenantEmpresa();
  const { reloadSession: refetch } = useTenantAuth();
  const [form, setForm] = useState({ nome: "", slogan: "", telefone: "", email: "", endereco: "", cor_primaria: "#1C3F5E", cor_secundaria: "#2A5280" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (empresa) {
      setForm({
        nome:          empresa.nome          || "",
        slogan:        empresa.slogan        || "",
        telefone:      empresa.telefone      || "",
        email:         empresa.email         || "",
        endereco:      empresa.endereco      || "",
        cor_primaria:  empresa.cor_primaria  || "#1C3F5E",
        cor_secundaria:empresa.cor_secundaria|| "#2A5280",
      });
    }
  }, [empresa]);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Empresa.update(empresaId, form);
    // Apply brand color live
    document.documentElement.style.setProperty("--brand", form.cor_primaria);
    document.documentElement.style.setProperty("--sidebar-item-active-bg", form.cor_primaria);
    await refetch();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} /></div>;

  return (
    <div className="p-5 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      <div>
        <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--ink)" }}>Configurações</h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-muted)" }}>White-label e dados da oficina</p>
      </div>

      {/* Dados da Empresa */}
      <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
        <h2 className="font-bold text-[13px] mb-4 flex items-center gap-2" style={{ color: "var(--ink)" }}>
          <Building2 className="w-4 h-4" style={{ color: "var(--brand)" }} /> Dados da Oficina
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Nome da oficina" required>
            <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Auto Center..." />
          </FormField>
          <FormField label="Slogan">
            <Input value={form.slogan} onChange={e => setForm(p => ({ ...p, slogan: e.target.value }))} placeholder="Excelência em manutenção" />
          </FormField>
          <FormField label="Telefone">
            <Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} placeholder="(11) 99999-9999" />
          </FormField>
          <FormField label="E-mail">
            <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="contato@oficina.com" />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Endereço">
              <Input value={form.endereco} onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))} placeholder="Rua, número, bairro — Cidade, UF" />
            </FormField>
          </div>
        </div>
      </div>

      {/* White-label */}
      <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
        <h2 className="font-bold text-[13px] mb-4 flex items-center gap-2" style={{ color: "var(--ink)" }}>
          <Palette className="w-4 h-4" style={{ color: "var(--brand)" }} /> Identidade Visual (White-label)
        </h2>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <div className="text-[11px] font-semibold mb-2 uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>Cor Principal</div>
            <div className="flex items-center gap-3">
              <input type="color" value={form.cor_primaria}
                onChange={e => {
                  setForm(p => ({ ...p, cor_primaria: e.target.value }));
                  document.documentElement.style.setProperty("--brand", e.target.value);
                }}
                className="w-12 h-10 rounded-sm border cursor-pointer bg-transparent"
                style={{ borderColor: "var(--line)" }} />
              <span className="font-mono text-[13px]" style={{ color: "var(--ink)" }}>{form.cor_primaria}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold mb-2 uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>Cor Secundária</div>
            <div className="flex items-center gap-3">
              <input type="color" value={form.cor_secundaria}
                onChange={e => setForm(p => ({ ...p, cor_secundaria: e.target.value }))}
                className="w-12 h-10 rounded-sm border cursor-pointer bg-transparent"
                style={{ borderColor: "var(--line)" }} />
              <span className="font-mono text-[13px]" style={{ color: "var(--ink)" }}>{form.cor_secundaria}</span>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-5 rounded-sm border p-4 flex items-center gap-3"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--line)" }}>
          <div className="w-9 h-9 rounded-sm flex items-center justify-center text-white font-black text-sm"
            style={{ backgroundColor: form.cor_primaria }}>
            {(form.nome || "A").charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>{form.nome || "Nome da Oficina"}</div>
            <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>{form.slogan || "Slogan da oficina"}</div>
          </div>
          <div className="ml-auto text-[11px] px-2 py-0.5 rounded-sm font-semibold"
            style={{ backgroundColor: form.cor_primaria + "20", color: form.cor_primaria }}>
            Preview
          </div>
        </div>
      </div>

      {/* Plano */}
      {empresa && (
        <div className="rounded-sm border p-5" style={{ backgroundColor: "var(--brand-subtle)", borderColor: "var(--brand-line)" }}>
          <h2 className="font-bold text-[13px] mb-3 flex items-center gap-2" style={{ color: "var(--ink)" }}>
            <Settings className="w-4 h-4" style={{ color: "var(--brand)" }} /> Plano atual
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-black text-[16px] capitalize" style={{ color: "var(--brand)" }}>{empresa.plano || "Trial"}</div>
              <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>Status: {empresa.status || "ativo"}</div>
            </div>
            <span className="text-[12px] font-semibold px-4 py-2 rounded-sm border"
              style={{ borderColor: "var(--brand-line)", color: "var(--brand)", backgroundColor: "white" }}>
              Gerenciar plano
            </span>
          </div>
        </div>
      )}

      {/* Save */}
      <button onClick={handleSave} disabled={saving || !form.nome.trim()}
        className="w-full font-bold py-3 rounded-sm flex items-center justify-center gap-2 text-white hover:opacity-90 disabled:opacity-50 transition-all"
        style={{ backgroundColor: "var(--brand)" }}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saved ? "✓ Salvo com sucesso!" : saving ? "Salvando..." : "Salvar configurações"}
      </button>
    </div>
  );
}