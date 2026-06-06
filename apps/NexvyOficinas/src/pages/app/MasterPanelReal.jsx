/**
 * Painel Master Real - Gestão de Plataforma
 * Super Admin acessa, cria, edita e gerencia oficinas
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useEmpresa } from "@/hooks/useEmpresa";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import Modal from "@/components/app/Modal";
import { FormField, Input, Select, Textarea } from "@/components/app/FormField";
import { Shield, Building2, TrendingUp, Users, CheckCircle2, Clock, Plus, Pencil, Eye, Loader2 } from "lucide-react";

const statusStyle = {
  ativo: { backgroundColor: "#D1FAE5", color: "#065F46" },
  trial: { backgroundColor: "#FEF3C7", color: "#92400E" },
  inativo: { backgroundColor: "#FEE2E2", color: "#991B1B" },
};

const statusLabel = { ativo: "Ativo", trial: "Trial", inativo: "Inativo" };

const emptyForm = {
  nome: "",
  slogan: "",
  telefone: "",
  email: "",
  endereco: "",
  status: "trial",
  plano: "trial",
};

export default function MasterPanelReal() {
  useDocumentTitle("Master | AutoFlow AI");
  const navigate = useNavigate();
  const { loading: contextLoading, isSuperAdmin, appConfig } = useEmpresa();
  const [empresas, setEmpresas] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    const list = await base44.entities.Empresa.list("-created_date");
    setEmpresas(list);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(emptyForm); setEditId(null); setModal(true); };
  const openEdit = (e) => {
    setForm({
      nome: e.nome,
      slogan: e.slogan || "",
      telefone: e.telefone || "",
      email: e.email || "",
      endereco: e.endereco || "",
      status: e.status || "trial",
      plano: e.plano || "trial",
    });
    setEditId(e.id);
    setModal(true);
  };

  const save = async () => {
    if (!form.nome.trim()) return;
    setSaving(true);
    if (editId) {
      await base44.entities.Empresa.update(editId, form);
    } else {
      await base44.entities.Empresa.create(form);
    }
    setSaving(false);
    setModal(false);
    load();
  };

  const stats = {
    total: empresas.length,
    ativas: empresas.filter(e => e.status === "ativo").length,
    trial: empresas.filter(e => e.status === "trial").length,
  };

  if (contextLoading || !appConfig) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-6" style={{ backgroundColor: "var(--surface)" }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded flex items-center justify-center" style={{ backgroundColor: "var(--brand-subtle)" }}>
            <Shield className="w-5 h-5" style={{ color: "var(--brand)" }} />
          </div>
          <div>
            <h1 className="text-2xl font-black" style={{ color: "var(--ink)" }}>Painel Master</h1>
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Gestão central da plataforma</p>
          </div>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded text-white hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}>
          <Plus className="w-4 h-4" /> Nova Oficina
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Oficinas", value: stats.total, icon: Building2 },
          { label: "Ativas", value: stats.ativas, icon: CheckCircle2 },
          { label: "Em Trial", value: stats.trial, icon: Clock },
        ].map((s) => (
          <div key={s.label} className="rounded border p-4" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
            <div className="w-8 h-8 rounded flex items-center justify-center mb-3" style={{ backgroundColor: "var(--brand-subtle)" }}>
              <s.icon className="w-4 h-4" style={{ color: "var(--brand)" }} />
            </div>
            <div className="text-xl font-black" style={{ color: "var(--ink)" }}>{s.value}</div>
            <div className="text-xs font-medium mt-0.5" style={{ color: "var(--ink-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded border" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-bold text-sm" style={{ color: "var(--ink)" }}>Oficinas Cadastradas</h2>
        </div>
        {empresas.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Nenhuma oficina cadastrada ainda.</p>
            <button onClick={openNew} className="mt-3 text-sm font-bold px-4 py-2 rounded text-white" style={{ backgroundColor: "var(--brand)" }}>
              Criar primeira oficina
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs" style={{ borderBottom: "1px solid var(--line-soft)", color: "var(--ink-muted)" }}>
                  <th className="text-left pb-3 font-semibold">Empresa</th>
                  <th className="text-left pb-3 font-semibold hidden md:table-cell">Status</th>
                  <th className="text-left pb-3 font-semibold hidden md:table-cell">Plano</th>
                  <th className="text-left pb-3 font-semibold hidden sm:table-cell">Onboarding</th>
                  <th className="text-center pb-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-[#F0EEE8]" style={{ borderBottom: "1px solid var(--line-soft)" }}>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--brand-subtle)" }}>
                          <Building2 className="w-4 h-4" style={{ color: "var(--brand)" }} />
                        </div>
                        <div>
                          <div className="font-semibold text-sm" style={{ color: "var(--ink)" }}>{e.nome}</div>
                          <div className="text-xs" style={{ color: "var(--ink-muted)" }}>{e.email || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 hidden md:table-cell">
                      <span className="text-xs px-2 py-0.5 rounded font-semibold" style={statusStyle[e.status]}>
                        {statusLabel[e.status]}
                      </span>
                    </td>
                    <td className="py-3 hidden md:table-cell">
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line-soft)", color: "var(--ink)" }}>
                        {e.plano || "—"}
                      </span>
                    </td>
                    <td className="py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--line-soft)" }}>
                          <div className="h-full rounded-full" style={{ width: `${(e.onboarding_step || 0) * 25}%`, backgroundColor: e.onboarding_concluido ? "#059669" : "var(--brand)" }} />
                        </div>
                        <span className="text-xs w-8" style={{ color: "var(--ink-muted)" }}>{(e.onboarding_step || 0) * 25}%</span>
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => window.open(`/dashboard?empresa=${e.id}`, "_blank")} className="p-1.5 rounded transition-colors" style={{ color: "var(--ink-muted)" }}
                          onMouseEnter={f => { f.currentTarget.style.color = "var(--brand)"; f.currentTarget.style.backgroundColor = "var(--brand-subtle)"; }}
                          onMouseLeave={f => { f.currentTarget.style.color = "var(--ink-muted)"; f.currentTarget.style.backgroundColor = "transparent"; }}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(e)} className="p-1.5 rounded transition-colors" style={{ color: "var(--ink-muted)" }}
                          onMouseEnter={f => { f.currentTarget.style.color = "var(--brand)"; f.currentTarget.style.backgroundColor = "var(--brand-subtle)"; }}
                          onMouseLeave={f => { f.currentTarget.style.color = "var(--ink-muted)"; f.currentTarget.style.backgroundColor = "transparent"; }}>
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar Oficina" : "Nova Oficina"}>
        <div className="space-y-4">
          <FormField label="Nome da Oficina" required>
            <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Auto Center..." />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Telefone">
              <Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} placeholder="(11) 99999-9999" />
            </FormField>
            <FormField label="E-mail">
              <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="contato@..." />
            </FormField>
            <FormField label="Status">
              <Select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                <option value="trial">Trial</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </Select>
            </FormField>
            <FormField label="Plano">
              <Select value={form.plano} onChange={e => setForm(p => ({ ...p, plano: e.target.value }))}>
                <option value="trial">Trial</option>
                <option value="basico">Básico</option>
                <option value="profissional">Profissional</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Slogan">
            <Input value={form.slogan} onChange={e => setForm(p => ({ ...p, slogan: e.target.value }))} placeholder="Excelência em manutenção" />
          </FormField>
          <FormField label="Endereço">
            <Input value={form.endereco} onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))} placeholder="Rua, número — Cidade, UF" />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(false)} className="px-4 py-2 rounded text-sm font-semibold border" style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving || !form.nome.trim()} className="px-4 py-2 rounded text-sm font-bold text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: "var(--brand)" }}>
              {saving ? "Salvando..." : editId ? "Salvar" : "Criar"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}