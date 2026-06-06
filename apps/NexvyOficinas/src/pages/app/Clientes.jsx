import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useTenantEmpresa } from "@/hooks/useTenantEmpresa";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import Modal from "@/components/app/Modal";
import { FormField, Input, Select, Textarea } from "@/components/app/FormField";
import { Search, Plus, Car, Phone, Mail, Pencil, Trash2, Loader2 } from "lucide-react";

const empty = { nome: "", telefone: "", email: "", status: "ativo", observacoes: "" };

export default function Clientes() {
  const { empresa, empresaId, loading: loadingEmpresa } = useTenantEmpresa();
  useDocumentTitle(empresa ? `${empresa.nome} | AutoFlow AI` : "Clientes | AutoFlow AI");
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    if (!empresaId) return;
    setLoading(true);
    const data = await base44.entities.Cliente.filter({ empresa_id: empresaId }, "-created_date");
    setClientes(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [empresaId]);

  const openNew = () => { setForm(empty); setEditId(null); setModal(true); };
  const openEdit = (c) => { setForm({ nome: c.nome, telefone: c.telefone || "", email: c.email || "", status: c.status, observacoes: c.observacoes || "" }); setEditId(c.id); setModal(true); };

  const save = async () => {
    if (!form.nome.trim()) return;
    setSaving(true);
    if (editId) {
      await base44.entities.Cliente.update(editId, form);
    } else {
      await base44.entities.Cliente.create({ ...form, empresa_id: empresaId });
    }
    setSaving(false);
    setModal(false);
    load();
  };

  const remove = async (id) => {
    if (!confirm("Remover cliente?")) return;
    await base44.entities.Cliente.delete(id);
    load();
  };

  const filtered = clientes.filter((c) => {
    const matchSearch = c.nome.toLowerCase().includes(search.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.telefone || "").includes(search);
    const matchFiltro = filtro === "todos" || c.status === filtro;
    return matchSearch && matchFiltro;
  });

  if (loadingEmpresa) return <Spinner />;

  return (
    <div className="p-5 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--ink)" }}>Clientes</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-muted)" }}>{clientes.length} cadastrados</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 text-[13px] font-bold px-4 py-2 rounded-sm text-white transition-all hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}>
          <Plus className="w-4 h-4" /> Novo cliente
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--ink-muted)" }} />
          <input type="text" placeholder="Buscar por nome, e-mail ou telefone..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-sm border pl-9 pr-4 py-2 text-[13px] focus:outline-none"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)", color: "var(--ink)" }} />
        </div>
        <div className="flex gap-2">
          {["todos", "ativo", "inativo"].map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className="px-3 py-2 rounded-sm text-[12px] font-semibold transition-all capitalize"
              style={filtro === f
                ? { backgroundColor: "var(--brand)", color: "white" }
                : { backgroundColor: "var(--surface-raised)", border: "1px solid var(--line)", color: "var(--ink-muted)" }}>
              {f === "todos" ? "Todos" : f === "ativo" ? "Ativos" : "Inativos"}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <Empty text={search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"} onAction={openNew} actionLabel="Cadastrar primeiro cliente" />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="rounded-sm border p-5"
              style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                    style={{ backgroundColor: "var(--brand)" }}>
                    {c.nome.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>{c.nome}</h3>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-sm font-semibold"
                      style={c.status === "ativo"
                        ? { backgroundColor: "var(--status-green-bg)", color: "var(--status-green-fg)" }
                        : { backgroundColor: "var(--status-red-bg)", color: "var(--status-red-fg)" }}>
                      {c.status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded-sm transition-colors"
                    style={{ color: "var(--ink-muted)" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "var(--brand)"; e.currentTarget.style.backgroundColor = "var(--brand-subtle)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--ink-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(c.id)} className="p-1.5 rounded-sm transition-colors"
                    style={{ color: "var(--ink-muted)" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#DC2626"; e.currentTarget.style.backgroundColor = "#FEE2E2"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--ink-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 text-[12px]" style={{ color: "var(--ink-muted)" }}>
                {c.telefone && <div className="flex items-center gap-2"><Phone className="w-3 h-3 flex-shrink-0" />{c.telefone}</div>}
                {c.email && <div className="flex items-center gap-2"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{c.email}</span></div>}
              </div>
              {c.observacoes && (
                <p className="mt-3 pt-3 text-[12px] italic" style={{ borderTop: "1px solid var(--line-soft)", color: "var(--ink-muted)" }}>
                  {c.observacoes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar cliente" : "Novo cliente"}>
        <div className="space-y-4">
          <FormField label="Nome" required>
            <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Nome completo" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Telefone">
              <Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} placeholder="(11) 99999-9999" />
            </FormField>
            <FormField label="Status">
              <Select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </Select>
            </FormField>
          </div>
          <FormField label="E-mail">
            <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
          </FormField>
          <FormField label="Observações">
            <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} placeholder="Anotações sobre o cliente..." />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(false)}
              className="px-4 py-2 rounded-sm text-[13px] font-semibold border transition-all"
              style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving || !form.nome.trim()}
              className="px-4 py-2 rounded-sm text-[13px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--brand)" }}>
              {saving ? "Salvando..." : editId ? "Salvar alterações" : "Cadastrar cliente"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
    </div>
  );
}

function Empty({ text, onAction, actionLabel }) {
  return (
    <div className="text-center py-16 rounded-sm border"
      style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
      <p className="text-[13px] mb-3" style={{ color: "var(--ink-muted)" }}>{text}</p>
      {onAction && (
        <button onClick={onAction}
          className="text-[13px] font-bold px-4 py-2 rounded-sm text-white"
          style={{ backgroundColor: "var(--brand)" }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}