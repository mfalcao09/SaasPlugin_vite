import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useTenantEmpresa } from "@/hooks/useTenantEmpresa";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import Modal from "@/components/app/Modal";
import { FormField, Input, Select, Textarea } from "@/components/app/FormField";
import { Car, Search, Calendar, Gauge, Wrench, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

const empty = {
  cliente_id: "", cliente_nome: "",
  marca: "", modelo: "", ano: new Date().getFullYear(), placa: "", cor: "",
  quilometragem: "", ultima_revisao: "", proxima_revisao: "", observacoes: "",
};

export default function Veiculos() {
  const { empresa, empresaId, loading: loadingEmpresa } = useTenantEmpresa();
  useDocumentTitle(empresa ? `${empresa.nome} | AutoFlow AI` : "Veículos | AutoFlow AI");
  const [veiculos, setVeiculos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    if (!empresaId) return;
    setLoading(true);
    const [v, c] = await Promise.all([
      base44.entities.Veiculo.filter({ empresa_id: empresaId }, "-created_date"),
      base44.entities.Cliente.filter({ empresa_id: empresaId }, "nome"),
    ]);
    setVeiculos(v);
    setClientes(c);
    setLoading(false);
  };

  useEffect(() => { load(); }, [empresaId]);

  const openNew = () => { setForm(empty); setEditId(null); setModal(true); };
  const openEdit = (v) => {
    setForm({
      cliente_id: v.cliente_id || "", cliente_nome: v.cliente_nome || "",
      marca: v.marca, modelo: v.modelo, ano: v.ano, placa: v.placa, cor: v.cor || "",
      quilometragem: v.quilometragem || "", ultima_revisao: v.ultima_revisao || "",
      proxima_revisao: v.proxima_revisao || "", observacoes: v.observacoes || "",
    });
    setEditId(v.id);
    setModal(true);
  };

  const onClienteChange = (e) => {
    const id = e.target.value;
    const cli = clientes.find(c => c.id === id);
    setForm(p => ({ ...p, cliente_id: id, cliente_nome: cli?.nome || "" }));
  };

  const save = async () => {
    if (!form.marca.trim() || !form.modelo.trim() || !form.placa.trim()) return;
    setSaving(true);
    const payload = { ...form, empresa_id: empresaId, ano: Number(form.ano), quilometragem: Number(form.quilometragem) || 0 };
    if (editId) {
      await base44.entities.Veiculo.update(editId, payload);
    } else {
      await base44.entities.Veiculo.create(payload);
    }
    setSaving(false);
    setModal(false);
    load();
  };

  const remove = async (id) => {
    if (!confirm("Remover veículo?")) return;
    await base44.entities.Veiculo.delete(id);
    load();
  };

  const filtered = veiculos.filter(v =>
    v.modelo?.toLowerCase().includes(search.toLowerCase()) ||
    v.marca?.toLowerCase().includes(search.toLowerCase()) ||
    v.placa?.toLowerCase().includes(search.toLowerCase()) ||
    (v.cliente_nome || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loadingEmpresa) return <Spinner />;

  return (
    <div className="p-5 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--ink)" }}>Veículos</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-muted)" }}>{veiculos.length} cadastrados</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 text-[13px] font-bold px-4 py-2 rounded-sm text-white transition-all hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}>
          <Plus className="w-4 h-4" /> Novo veículo
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--ink-muted)" }} />
        <input type="text" placeholder="Buscar por modelo, placa ou cliente..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full rounded-sm border pl-9 pr-4 py-2 text-[13px] focus:outline-none"
          style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)", color: "var(--ink)" }} />
      </div>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <Empty text={search ? "Nenhum veículo encontrado" : "Nenhum veículo cadastrado"} onAction={openNew} actionLabel="Cadastrar primeiro veículo" />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(v => (
            <div key={v.id} className="rounded-sm border p-5"
              style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-sm flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "var(--brand-subtle)" }}>
                    <Car className="w-4 h-4" style={{ color: "var(--brand)" }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>{v.marca} {v.modelo}</h3>
                    <span className="text-[12px]" style={{ color: "var(--ink-muted)" }}>{v.ano}{v.cor ? ` · ${v.cor}` : ""}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-mono font-bold px-2 py-1 rounded-sm"
                    style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)" }}>
                    {v.placa}
                  </span>
                  <button onClick={() => openEdit(v)} className="p-1.5 rounded-sm transition-colors ml-1"
                    style={{ color: "var(--ink-muted)" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "var(--brand)"; e.currentTarget.style.backgroundColor = "var(--brand-subtle)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--ink-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(v.id)} className="p-1.5 rounded-sm transition-colors"
                    style={{ color: "var(--ink-muted)" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#DC2626"; e.currentTarget.style.backgroundColor = "#FEE2E2"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--ink-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 text-[12px]">
                {v.quilometragem > 0 && (
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5" style={{ color: "var(--ink-muted)" }}><Gauge className="w-3 h-3" /> KM</span>
                    <span className="font-semibold" style={{ color: "var(--ink)" }}>{Number(v.quilometragem).toLocaleString("pt-BR")} km</span>
                  </div>
                )}
                {v.ultima_revisao && (
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5" style={{ color: "var(--ink-muted)" }}><Calendar className="w-3 h-3" /> Última revisão</span>
                    <span style={{ color: "var(--ink)" }}>{new Date(v.ultima_revisao).toLocaleDateString("pt-BR")}</span>
                  </div>
                )}
                {v.proxima_revisao && (
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5" style={{ color: "var(--ink-muted)" }}><Wrench className="w-3 h-3" /> Próx. revisão</span>
                    <span className="font-semibold" style={{ color: "var(--brand)" }}>{new Date(v.proxima_revisao).toLocaleDateString("pt-BR")}</span>
                  </div>
                )}
              </div>
              {v.cliente_nome && (
                <div className="mt-3 pt-3 text-[12px]"
                  style={{ borderTop: "1px solid var(--line-soft)", color: "var(--ink-muted)" }}>
                  Cliente: <span className="font-semibold" style={{ color: "var(--ink)" }}>{v.cliente_nome}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar veículo" : "Novo veículo"} width="max-w-xl">
        <div className="space-y-4">
          <FormField label="Cliente">
            <Select value={form.cliente_id} onChange={onClienteChange}>
              <option value="">Selecionar cliente...</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Marca" required>
              <Input value={form.marca} onChange={e => setForm(p => ({ ...p, marca: e.target.value }))} placeholder="Ex: Toyota" />
            </FormField>
            <FormField label="Modelo" required>
              <Input value={form.modelo} onChange={e => setForm(p => ({ ...p, modelo: e.target.value }))} placeholder="Ex: Corolla" />
            </FormField>
            <FormField label="Ano">
              <Input type="number" value={form.ano} onChange={e => setForm(p => ({ ...p, ano: e.target.value }))} />
            </FormField>
            <FormField label="Cor">
              <Input value={form.cor} onChange={e => setForm(p => ({ ...p, cor: e.target.value }))} placeholder="Ex: Prata" />
            </FormField>
            <FormField label="Placa" required>
              <Input value={form.placa} onChange={e => setForm(p => ({ ...p, placa: e.target.value.toUpperCase() }))} placeholder="AAA-0000" />
            </FormField>
            <FormField label="Quilometragem">
              <Input type="number" value={form.quilometragem} onChange={e => setForm(p => ({ ...p, quilometragem: e.target.value }))} placeholder="0" />
            </FormField>
            <FormField label="Última revisão">
              <Input type="date" value={form.ultima_revisao} onChange={e => setForm(p => ({ ...p, ultima_revisao: e.target.value }))} />
            </FormField>
            <FormField label="Próxima revisão">
              <Input type="date" value={form.proxima_revisao} onChange={e => setForm(p => ({ ...p, proxima_revisao: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Observações">
            <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} placeholder="Anotações técnicas..." />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(false)}
              className="px-4 py-2 rounded-sm text-[13px] font-semibold border"
              style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving || !form.marca.trim() || !form.modelo.trim() || !form.placa.trim()}
              className="px-4 py-2 rounded-sm text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--brand)" }}>
              {saving ? "Salvando..." : editId ? "Salvar" : "Cadastrar"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} /></div>;
}
function Empty({ text, onAction, actionLabel }) {
  return (
    <div className="text-center py-16 rounded-sm border" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
      <p className="text-[13px] mb-3" style={{ color: "var(--ink-muted)" }}>{text}</p>
      {onAction && <button onClick={onAction} className="text-[13px] font-bold px-4 py-2 rounded-sm text-white" style={{ backgroundColor: "var(--brand)" }}>{actionLabel}</button>}
    </div>
  );
}