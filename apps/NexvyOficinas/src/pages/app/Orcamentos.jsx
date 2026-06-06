import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useTenantEmpresa } from "@/hooks/useTenantEmpresa";
import Modal from "@/components/app/Modal";
import { FormField, Input, Select, Textarea } from "@/components/app/FormField";
import { FileText, ChevronDown, ChevronUp, ArrowRight, Plus, Pencil, Trash2, Loader2, X } from "lucide-react";

const statusStyle = {
  aprovado: { backgroundColor: "var(--status-green-bg)", color: "var(--status-green-fg)" },
  pendente:  { backgroundColor: "var(--status-amber-bg)", color: "var(--status-amber-fg)" },
  recusado:  { backgroundColor: "var(--status-red-bg)", color: "var(--status-red-fg)" },
};
const statusLabel = { aprovado: "Aprovado", pendente: "Pendente", recusado: "Recusado" };

const emptyForm = {
  cliente_id: "", cliente_nome: "", veiculo_id: "", veiculo_desc: "",
  data: new Date().toISOString().split("T")[0], validade: "",
  status: "pendente", observacoes: "",
};
const emptyItem = { descricao: "", quantidade: 1, valor: "" };

export default function Orcamentos() {
  const { empresaId, loading: loadingEmpresa } = useTenantEmpresa();
  const [orcamentos, setOrcamentos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [veiculos, setVeiculos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [itens, setItens] = useState([{ ...emptyItem }]);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [convertingId, setConvertingId] = useState(null);

  const load = async () => {
    if (!empresaId) return;
    setLoading(true);
    const [o, c, v] = await Promise.all([
      base44.entities.Orcamento.filter({ empresa_id: empresaId }, "-created_date"),
      base44.entities.Cliente.filter({ empresa_id: empresaId }, "nome"),
      base44.entities.Veiculo.filter({ empresa_id: empresaId }, "marca"),
    ]);
    setOrcamentos(o); setClientes(c); setVeiculos(v);
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
  const openEdit = (o) => {
    setForm({ cliente_id: o.cliente_id, cliente_nome: o.cliente_nome, veiculo_id: o.veiculo_id, veiculo_desc: o.veiculo_desc, data: o.data, validade: o.validade || "", status: o.status, observacoes: o.observacoes || "" });
    setItens(o.itens?.length ? o.itens.map(i => ({ descricao: i.descricao, quantidade: i.quantidade || 1, valor: i.valor })) : [{ ...emptyItem }]);
    setEditId(o.id); setModal(true);
  };

  const total = itens.reduce((s, i) => s + (Number(i.valor) * Number(i.quantidade || 1)), 0);

  const save = async () => {
    if (!form.cliente_id) return;
    setSaving(true);
    const numero = editId ? undefined : `ORC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    const payload = { ...form, empresa_id: empresaId, itens: itens.filter(i => i.descricao.trim()), total };
    if (!editId) payload.numero = numero;
    if (editId) {
      await base44.entities.Orcamento.update(editId, payload);
    } else {
      await base44.entities.Orcamento.create({ ...payload, convertido_em_os: false });
    }
    setSaving(false); setModal(false); load();
  };

  const remove = async (id) => {
    if (!confirm("Remover orçamento?")) return;
    await base44.entities.Orcamento.delete(id); load();
  };

  const converterEmOS = async (o) => {
    setConvertingId(o.id);
    try {
      const numero = `OS-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      const os = await base44.entities.OrdemServico.create({
        numero, orcamento_id: o.id,
        cliente_id: o.cliente_id, cliente_nome: o.cliente_nome,
        veiculo_id: o.veiculo_id, veiculo_desc: o.veiculo_desc,
        data_abertura: new Date().toISOString().split("T")[0],
        status: "aberta", prioridade: "normal",
        itens: o.itens.map(i => ({ descricao: i.descricao, valor: i.valor * (i.quantidade || 1), status: "pendente" })),
        total: o.total, empresa_id: empresaId, pagamento_status: "pendente",
        observacoes: o.observacoes || "",
      });
      await base44.entities.Orcamento.update(o.id, { convertido_em_os: true, os_id: os.id, status: "aprovado" });
      load();
    } finally { setConvertingId(null); }
  };

  const updateItem = (i, field, val) => setItens(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  const addItem = () => setItens(prev => [...prev, { ...emptyItem }]);
  const removeItem = (i) => setItens(prev => prev.filter((_, idx) => idx !== i));

  if (loadingEmpresa) return <Spinner />;

  return (
    <div className="p-5 sm:p-6 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--ink)" }}>Orçamentos</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-muted)" }}>{orcamentos.length} registrados</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 text-[13px] font-bold px-4 py-2 rounded-sm text-white hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}>
          <Plus className="w-4 h-4" /> Novo orçamento
        </button>
      </div>

      {/* Resumo */}
      {orcamentos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {["pendente", "aprovado", "recusado"].map(s => (
            <div key={s} className="rounded-sm border p-4 text-center"
              style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
              <div className="text-[20px] font-black" style={{ color: "var(--brand)" }}>
                {orcamentos.filter(o => o.status === s).length}
              </div>
              <div className="text-[11px] font-medium mt-0.5" style={{ color: "var(--ink-muted)" }}>{statusLabel[s]}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? <Spinner /> : orcamentos.length === 0 ? (
        <Empty text="Nenhum orçamento registrado" onAction={openNew} actionLabel="Criar primeiro orçamento" />
      ) : (
        <div className="space-y-3">
          {orcamentos.map(o => {
            const isExp = expanded === o.id;
            return (
              <div key={o.id} className="rounded-sm border overflow-hidden"
                style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)" }}>
                <div className="p-4 cursor-pointer transition-colors"
                  style={{ borderBottom: isExp ? "1px solid var(--line-soft)" : undefined }}
                  onClick={() => setExpanded(isExp ? null : o.id)}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--surface-sunken)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {o.numero && <span className="text-[11px] font-mono" style={{ color: "var(--ink-muted)" }}>{o.numero}</span>}
                        <span className="text-[11px] px-2 py-0.5 rounded-sm font-semibold" style={statusStyle[o.status]}>{statusLabel[o.status]}</span>
                        {o.convertido_em_os && (
                          <span className="text-[11px] px-2 py-0.5 rounded-sm font-semibold flex items-center gap-1"
                            style={{ backgroundColor: "var(--brand-subtle)", color: "var(--brand)" }}>
                            <ArrowRight className="w-3 h-3" /> Convertido em OS
                          </span>
                        )}
                      </div>
                      <p className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>{o.cliente_nome}</p>
                      {o.veiculo_desc && <p className="text-[12px]" style={{ color: "var(--ink-muted)" }}>{o.veiculo_desc}</p>}
                      {o.data && <p className="text-[11px] mt-0.5" style={{ color: "var(--ink-muted)" }}>{new Date(o.data).toLocaleDateString("pt-BR")}</p>}
                    </div>
                    <div className="text-right flex-shrink-0 flex items-start gap-2">
                      <div>
                        <div className="font-black text-[15px]" style={{ color: "var(--brand)" }}>
                          R$ {(o.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>{o.itens?.length || 0} itens</div>
                      </div>
                      <div className="flex gap-1 mt-0.5">
                        <button onClick={e => { e.stopPropagation(); openEdit(o); }} className="p-1.5 rounded-sm" style={{ color: "var(--ink-muted)" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "var(--brand)"; e.currentTarget.style.backgroundColor = "var(--brand-subtle)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "var(--ink-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); remove(o.id); }} className="p-1.5 rounded-sm" style={{ color: "var(--ink-muted)" }}
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
                  <div className="px-5 pb-5 pt-4" style={{ backgroundColor: "var(--surface)" }}>
                    {o.itens?.map((item, i) => (
                      <div key={i} className="flex justify-between py-2" style={{ borderBottom: "1px solid var(--line-soft)" }}>
                        <span className="text-[13px]" style={{ color: "var(--ink)" }}>{item.descricao}</span>
                        <span className="font-semibold text-[13px]" style={{ color: "var(--brand)" }}>
                          R$ {((item.valor || 0) * (item.quantidade || 1)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between mt-3 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
                      <span className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>Total</span>
                      <span className="font-black text-[15px]" style={{ color: "var(--brand)" }}>
                        R$ {(o.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {!o.convertido_em_os && (
                      <div className="flex gap-2 mt-4">
                        {o.status !== "aprovado" && (
                          <button onClick={() => base44.entities.Orcamento.update(o.id, { status: "aprovado" }).then(load)}
                            className="flex-1 py-2 rounded-sm text-[12px] font-bold border transition-all"
                            style={{ borderColor: "var(--status-green-fg)", color: "var(--status-green-fg)", backgroundColor: "var(--status-green-bg)" }}>
                            Aprovar
                          </button>
                        )}
                        {o.status !== "recusado" && (
                          <button onClick={() => base44.entities.Orcamento.update(o.id, { status: "recusado" }).then(load)}
                            className="flex-1 py-2 rounded-sm text-[12px] font-bold border transition-all"
                            style={{ borderColor: "var(--status-red-fg)", color: "var(--status-red-fg)", backgroundColor: "var(--status-red-bg)" }}>
                            Recusar
                          </button>
                        )}
                        {o.status === "aprovado" && (
                          <button disabled={convertingId === o.id} onClick={() => converterEmOS(o)}
                            className="flex-1 py-2 rounded-sm text-[12px] font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: "var(--brand)" }}>
                            {convertingId === o.id ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Convertendo...</> : <><ArrowRight className="w-3.5 h-3.5" /> Converter em OS</>}
                          </button>
                        )}
                      </div>
                    )}
                    {o.observacoes && <p className="mt-4 text-[12px] italic" style={{ color: "var(--ink-muted)" }}>{o.observacoes}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar orçamento" : "Novo orçamento"} width="max-w-2xl">
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
            <FormField label="Data">
              <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
            </FormField>
            <FormField label="Validade">
              <Input type="date" value={form.validade} onChange={e => setForm(p => ({ ...p, validade: e.target.value }))} />
            </FormField>
          </div>

          {/* Itens */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-muted)" }}>Itens / Serviços</div>
            <div className="space-y-2">
              {itens.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={item.descricao} onChange={e => updateItem(i, "descricao", e.target.value)}
                    placeholder="Descrição do serviço/peça"
                    className="flex-1 rounded-sm border px-3 py-2 text-[12px] focus:outline-none"
                    style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink)" }} />
                  <input value={item.quantidade} onChange={e => updateItem(i, "quantidade", e.target.value)} type="number" min="1"
                    placeholder="Qtd" className="w-14 rounded-sm border px-2 py-2 text-[12px] text-center focus:outline-none"
                    style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink)" }} />
                  <input value={item.valor} onChange={e => updateItem(i, "valor", e.target.value)} type="number" step="0.01"
                    placeholder="R$ 0,00" className="w-28 rounded-sm border px-2 py-2 text-[12px] text-right focus:outline-none"
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
              className="mt-2 text-[12px] font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-sm border transition-all"
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

          <FormField label="Status">
            <Select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="pendente">Pendente</option>
              <option value="aprovado">Aprovado</option>
              <option value="recusado">Recusado</option>
            </Select>
          </FormField>
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
              {saving ? "Salvando..." : editId ? "Salvar" : "Criar orçamento"}
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