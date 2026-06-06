import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useTenantEmpresa } from "@/hooks/useTenantEmpresa";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import Modal from "@/components/app/Modal";
import { FormField, Input, Select, Textarea } from "@/components/app/FormField";
import { ClipboardList, ChevronDown, ChevronUp, Plus, Pencil, Trash2, Loader2, CheckCircle2, Clock, Package, Wrench, X } from "lucide-react";

const statusConfig = {
  aberta:          { label: "Aberta",        bg: "#F3F4F6", fg: "#6B7280" },
  em_andamento:    { label: "Em andamento",  bg: "var(--status-blue-bg)",  fg: "var(--status-blue-fg)" },
  aguardando_peca: { label: "Aguard. peça",  bg: "var(--status-amber-bg)", fg: "var(--status-amber-fg)" },
  concluida:       { label: "Concluída",     bg: "var(--status-green-bg)", fg: "var(--status-green-fg)" },
  cancelada:       { label: "Cancelada",     bg: "var(--status-red-bg)",   fg: "var(--status-red-fg)" },
};

const itemStatusIcons = {
  concluido:       { icon: CheckCircle2, color: "#059669" },
  em_andamento:    { icon: Wrench,       color: "var(--brand)" },
  aguardando_peca: { icon: Package,      color: "#D97706" },
  pendente:        { icon: Clock,        color: "#9CA3AF" },
};

const emptyForm = {
  cliente_id: "", cliente_nome: "", veiculo_id: "", veiculo_desc: "",
  tecnico: "", prioridade: "normal", status: "aberta",
  data_abertura: new Date().toISOString().split("T")[0],
  data_prevista: "", observacoes: "",
};
const emptyItem = { descricao: "", valor: "", status: "pendente" };

export default function Ordens() {
  useDocumentTitle("Ordens de Serviço | AutoFlow AI");
  const { empresa, empresaId, loading: loadingEmpresa } = useTenantEmpresa();
  const [ordens, setOrdens] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [veiculos, setVeiculos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [itens, setItens] = useState([{ ...emptyItem }]);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    if (!empresaId) return;
    setLoading(true);
    const [o, c, v] = await Promise.all([
      base44.entities.OrdemServico.filter({ empresa_id: empresaId }, "-created_date"),
      base44.entities.Cliente.filter({ empresa_id: empresaId }, "nome"),
      base44.entities.Veiculo.filter({ empresa_id: empresaId }, "marca"),
    ]);
    setOrdens(o); setClientes(c); setVeiculos(v);
    setLoading(false);
  };

  useEffect(() => { load(); }, [empresaId]);

  const veiculosDoCliente = veiculos.filter(v => v.cliente_id === form.cliente_id);
  const onClienteChange = (e) => {
    const id = e.target.value;
    const cli = clientes.find(c => c.id === id);
    setForm(p => ({ ...p, cliente_id: id, cliente_nome: cli?.nome || "", veiculo_id: "", veiculo_desc: "" }));
  };
  const onVeiculoChange = (e) => {
    const id = e.target.value;
    const v = veiculos.find(v => v.id === id);
    setForm(p => ({ ...p, veiculo_id: id, veiculo_desc: v ? `${v.marca} ${v.modelo} ${v.ano} — ${v.placa}` : "" }));
  };

  const openNew = () => { setForm(emptyForm); setItens([{ ...emptyItem }]); setEditId(null); setModal(true); };
  const openEdit = (os) => {
    setForm({
      cliente_id: os.cliente_id, cliente_nome: os.cliente_nome,
      veiculo_id: os.veiculo_id, veiculo_desc: os.veiculo_desc || "",
      tecnico: os.tecnico || "", prioridade: os.prioridade || "normal",
      status: os.status, data_abertura: os.data_abertura || "",
      data_prevista: os.data_prevista || "", observacoes: os.observacoes || "",
    });
    setItens(os.itens?.length ? os.itens.map(i => ({ descricao: i.descricao, valor: i.valor, status: i.status || "pendente" })) : [{ ...emptyItem }]);
    setEditId(os.id); setModal(true);
  };

  const total = itens.reduce((s, i) => s + (Number(i.valor) || 0), 0);

  const save = async () => {
    if (!form.cliente_id) return;
    setSaving(true);
    const payload = {
      ...form, empresa_id: empresaId,
      itens: itens.filter(i => i.descricao.trim()),
      total,
      pagamento_status: "pendente",
    };
    if (!editId) payload.numero = `OS-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    if (editId) {
      await base44.entities.OrdemServico.update(editId, payload);
    } else {
      await base44.entities.OrdemServico.create(payload);
    }
    setSaving(false); setModal(false); load();
  };

  const remove = async (id) => {
    if (!confirm("Remover ordem de serviço?")) return;
    await base44.entities.OrdemServico.delete(id); load();
  };

  const updateStatus = async (id, status) => {
    const extra = status === "concluida" ? { data_conclusao: new Date().toISOString().split("T")[0] } : {};
    await base44.entities.OrdemServico.update(id, { status, ...extra });
    load();
  };

  const updateItem = (i, field, val) => setItens(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  const addItem = () => setItens(prev => [...prev, { ...emptyItem }]);
  const removeItem = (i) => setItens(prev => prev.filter((_, idx) => idx !== i));

  const filtered = filtro === "todos" ? ordens : ordens.filter(o => o.status === filtro);

  if (loadingEmpresa) return <Spinner />;

  return (
    <div className="p-5 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--ink)" }}>Ordens de Serviço</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-muted)" }}>{ordens.length} registradas</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 text-[13px] font-bold px-4 py-2 rounded-sm text-white hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}>
          <Plus className="w-4 h-4" /> Nova OS
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {["todos", ...Object.keys(statusConfig)].map(f => {
          const sc = statusConfig[f];
          const isActive = filtro === f;
          return (
            <button key={f} onClick={() => setFiltro(f)}
              className="px-3 py-1.5 rounded-sm text-[11px] font-semibold transition-all"
              style={isActive
                ? (sc ? { backgroundColor: sc.bg, color: sc.fg, border: `1px solid ${sc.fg}40` } : { backgroundColor: "var(--brand)", color: "white" })
                : { backgroundColor: "var(--surface-raised)", border: "1px solid var(--line)", color: "var(--ink-muted)" }}>
              {sc ? sc.label : "Todos"}
            </button>
          );
        })}
      </div>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <Empty text={filtro !== "todos" ? "Nenhuma OS com esse status" : "Nenhuma ordem de serviço"} onAction={filtro === "todos" ? openNew : null} actionLabel="Criar primeira OS" />
      ) : (
        <div className="space-y-3">
          {filtered.map(os => {
            const sc = statusConfig[os.status] || statusConfig.aberta;
            const concluidos = (os.itens || []).filter(i => i.status === "concluido").length;
            const total_itens = (os.itens || []).length;
            const prog = total_itens > 0 ? Math.round((concluidos / total_itens) * 100) : 0;
            const isExp = expanded === os.id;

            return (
              <div key={os.id} className="rounded-sm border overflow-hidden"
                style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
                <div className="p-4 cursor-pointer transition-colors"
                  onClick={() => setExpanded(isExp ? null : os.id)}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--surface-sunken)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {os.numero && <span className="text-[11px] font-mono" style={{ color: "var(--ink-muted)" }}>{os.numero}</span>}
                        <span className="text-[11px] px-2 py-0.5 rounded-sm font-semibold"
                          style={{ backgroundColor: sc.bg, color: sc.fg }}>{sc.label}</span>
                        {os.prioridade === "alta" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-sm font-bold"
                            style={{ backgroundColor: "var(--status-red-bg)", color: "var(--status-red-fg)" }}>PRIORIDADE ALTA</span>
                        )}
                      </div>
                      <p className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>{os.cliente_nome}</p>
                      {os.veiculo_desc && <p className="text-[12px]" style={{ color: "var(--ink-muted)" }}>{os.veiculo_desc}</p>}
                      {os.tecnico && <p className="text-[11px] mt-0.5" style={{ color: "var(--ink-muted)" }}>Técnico: {os.tecnico}</p>}
                      {total_itens > 0 && (
                        <div className="mt-2">
                          <div className="flex justify-between text-[11px] mb-1" style={{ color: "var(--ink-muted)" }}>
                            <span>{concluidos}/{total_itens} concluídos</span>
                            <span className="font-bold" style={{ color: "var(--brand)" }}>{prog}%</span>
                          </div>
                          <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--line-soft)" }}>
                            <div className="h-full rounded-full" style={{ width: `${prog}%`, backgroundColor: os.status === "concluida" ? "#059669" : "var(--brand)" }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 flex items-start gap-2">
                      <div>
                        <div className="font-black text-[15px]" style={{ color: "var(--brand)" }}>
                          R$ {(os.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="flex gap-1 mt-0.5">
                        <button onClick={e => { e.stopPropagation(); openEdit(os); }} className="p-1.5 rounded-sm" style={{ color: "var(--ink-muted)" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "var(--brand)"; e.currentTarget.style.backgroundColor = "var(--brand-subtle)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "var(--ink-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); remove(os.id); }} className="p-1.5 rounded-sm" style={{ color: "var(--ink-muted)" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#DC2626"; e.currentTarget.style.backgroundColor = "#FEE2E2"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "var(--ink-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isExp ? <ChevronUp className="w-4 h-4 mt-0.5" style={{ color: "var(--ink-muted)" }} /> : <ChevronDown className="w-4 h-4 mt-0.5" style={{ color: "var(--ink-muted)" }} />}
                      </div>
                    </div>
                  </div>
                </div>

                {isExp && (
                  <div className="px-5 pb-5 pt-4" style={{ borderTop: "1px solid var(--line-soft)", backgroundColor: "var(--surface)" }}>
                    {(os.itens || []).map((item, i) => {
                      const ic = itemStatusIcons[item.status] || itemStatusIcons.pendente;
                      const Icon = ic.icon;
                      return (
                        <div key={i} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--line-soft)" }}>
                          <div className="flex items-center gap-3">
                            <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ic.color }} />
                            <span className="text-[13px]" style={{ color: "var(--ink)" }}>{item.descricao}</span>
                          </div>
                          <span className="font-semibold text-[13px]" style={{ color: "var(--brand)" }}>
                            R$ {(item.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      );
                    })}

                    {/* Status actions */}
                    {os.status !== "concluida" && os.status !== "cancelada" && (
                      <div className="flex gap-2 mt-4 flex-wrap">
                        {Object.entries(statusConfig).filter(([k]) => k !== os.status && k !== "cancelada").map(([k, v]) => (
                          <button key={k} onClick={() => updateStatus(os.id, k)}
                            className="px-3 py-1.5 rounded-sm text-[11px] font-semibold border transition-all"
                            style={{ backgroundColor: v.bg, color: v.fg, borderColor: `${v.fg}40` }}>
                            → {v.label}
                          </button>
                        ))}
                        <button onClick={() => updateStatus(os.id, "cancelada")}
                          className="px-3 py-1.5 rounded-sm text-[11px] font-semibold border"
                          style={{ backgroundColor: "var(--status-red-bg)", color: "var(--status-red-fg)", borderColor: "var(--status-red-fg)40" }}>
                          Cancelar OS
                        </button>
                      </div>
                    )}
                    {os.orcamento_id && (
                      <div className="mt-4 rounded-sm p-2.5 text-[12px] font-medium"
                        style={{ backgroundColor: "var(--brand-subtle)", color: "var(--brand)" }}>
                        ✅ Gerada a partir de orçamento aprovado
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar OS" : "Nova Ordem de Serviço"} width="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Cliente" required>
              <Select value={form.cliente_id} onChange={onClienteChange}>
                <option value="">Selecionar...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Select>
            </FormField>
            <FormField label="Veículo">
              <Select value={form.veiculo_id} onChange={onVeiculoChange} disabled={!form.cliente_id}>
                <option value="">Selecionar...</option>
                {veiculosDoCliente.map(v => <option key={v.id} value={v.id}>{v.marca} {v.modelo} — {v.placa}</option>)}
              </Select>
            </FormField>
            <FormField label="Técnico">
              <Input value={form.tecnico} onChange={e => setForm(p => ({ ...p, tecnico: e.target.value }))} placeholder="Nome do técnico" />
            </FormField>
            <FormField label="Prioridade">
              <Select value={form.prioridade} onChange={e => setForm(p => ({ ...p, prioridade: e.target.value }))}>
                <option value="baixa">Baixa</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
              </Select>
            </FormField>
            <FormField label="Status">
              <Select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </FormField>
            <FormField label="Data previsão">
              <Input type="date" value={form.data_prevista} onChange={e => setForm(p => ({ ...p, data_prevista: e.target.value }))} />
            </FormField>
          </div>

          {/* Itens */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-muted)" }}>Itens / Serviços</div>
            <div className="space-y-2">
              {itens.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={item.descricao} onChange={e => updateItem(i, "descricao", e.target.value)}
                    placeholder="Descrição" className="flex-1 rounded-sm border px-3 py-2 text-[12px] focus:outline-none"
                    style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink)" }} />
                  <Select value={item.status} onChange={e => updateItem(i, "status", e.target.value)}
                    style={{ width: "140px", padding: "8px 8px", fontSize: "12px" }}>
                    <option value="pendente">Pendente</option>
                    <option value="em_andamento">Em andamento</option>
                    <option value="aguardando_peca">Aguard. peça</option>
                    <option value="concluido">Concluído</option>
                  </Select>
                  <input value={item.valor} onChange={e => updateItem(i, "valor", e.target.value)} type="number" step="0.01"
                    placeholder="R$" className="w-24 rounded-sm border px-2 py-2 text-[12px] text-right focus:outline-none"
                    style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink)" }} />
                  {itens.length > 1 && (
                    <button onClick={() => removeItem(i)} className="p-1.5 rounded-sm" style={{ color: "#DC2626" }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addItem}
              className="mt-2 text-[12px] font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-sm border"
              style={{ borderColor: "var(--brand-line)", color: "var(--brand)", backgroundColor: "var(--brand-subtle)" }}>
              <Plus className="w-3 h-3" /> Adicionar item
            </button>
          </div>

          <div className="flex justify-between items-center rounded-sm p-3"
            style={{ backgroundColor: "var(--surface-sunken)", border: "1px solid var(--line)" }}>
            <span className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>Total</span>
            <span className="font-black text-[15px]" style={{ color: "var(--brand)" }}>
              R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <FormField label="Observações">
            <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
          </FormField>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(false)}
              className="px-4 py-2 rounded-sm text-[13px] font-semibold border"
              style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}>Cancelar</button>
            <button onClick={save} disabled={saving || !form.cliente_id}
              className="px-4 py-2 rounded-sm text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--brand)" }}>
              {saving ? "Salvando..." : editId ? "Salvar" : "Criar OS"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Spinner() { return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} /></div>; }
function Empty({ text, onAction, actionLabel }) {
  return (
    <div className="text-center py-16 rounded-sm border" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
      <p className="text-[13px] mb-3" style={{ color: "var(--ink-muted)" }}>{text}</p>
      {onAction && <button onClick={onAction} className="text-[13px] font-bold px-4 py-2 rounded-sm text-white" style={{ backgroundColor: "var(--brand)" }}>{actionLabel}</button>}
    </div>
  );
}