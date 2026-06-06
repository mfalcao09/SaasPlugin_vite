/**
 * Painel Super Admin (/adminmaster) — usa User Base44 nativo (OAuth).
 * Gestão completa de Empresas + EmpresaUser owner.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useEmpresa } from "@/hooks/useEmpresa";
import { hashPassword, generateTempPassword } from "@/lib/tenantAuth";
import Modal from "@/components/app/Modal";
import { FormField, Input, Select } from "@/components/app/FormField";
import { Shield, Building2, CheckCircle2, Clock, XCircle, Plus, Pencil, ToggleLeft, ToggleRight, Copy, Loader2 } from "lucide-react";

const statusCobrancaStyle = {
  trial:        { backgroundColor: "#FEF3C7", color: "#92400E" },
  ativo:        { backgroundColor: "#D1FAE5", color: "#065F46" },
  inadimplente: { backgroundColor: "#FEE2E2", color: "#991B1B" },
  suspenso:     { backgroundColor: "#F3F4F6", color: "#374151" },
  cancelado:    { backgroundColor: "#1F2937", color: "#9CA3AF" },
};

const today = () => new Date().toISOString().split("T")[0];
const plus14 = () => {
  const d = new Date(); d.setDate(d.getDate() + 14);
  return d.toISOString().split("T")[0];
};

const emptyForm = {
  nome: "", nome_fantasia: "", cnpj: "",
  owner_nome: "", owner_cpf: "", owner_email: "", owner_telefone: "",
  plano: "trial", ciclo: "mensal", valor: "", trial_ate: plus14(),
};

export default function AdminMaster() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading: contextLoading, appConfig } = useEmpresa();
  const [empresas, setEmpresas] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);

  // Modals
  const [modalNova, setModalNova] = useState(false);
  const [modalEdit, setModalEdit] = useState(false);
  const [modalSenha, setModalSenha] = useState(null); // { nome, senha }
  const [editTarget, setEditTarget] = useState(null);

  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [copiedSenha, setCopiedSenha] = useState(false);

  const load = async () => {
    const list = await base44.entities.Empresa.list("-created_date");
    setEmpresas(list);
    setPageLoading(false);
  };

  useEffect(() => { if (!contextLoading) load(); }, [contextLoading]);

  // Guard
  if (contextLoading || pageLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen" style={{ backgroundColor: "var(--surface)" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ backgroundColor: "var(--surface)" }}>
        <XCircle className="w-12 h-12" style={{ color: "#DC2626" }} />
        <h2 className="text-xl font-black" style={{ color: "var(--ink)" }}>Acesso negado</h2>
        <p style={{ color: "var(--ink-muted)" }}>Você não tem permissão para acessar esta área.</p>
        <button onClick={() => navigate("/")} className="px-4 py-2 rounded-sm text-sm font-bold text-white" style={{ backgroundColor: "var(--brand)" }}>
          Voltar à home
        </button>
      </div>
    );
  }

  const stats = {
    total: empresas.length,
    ativas: empresas.filter(e => e.status_cobranca === "ativo").length,
    trial: empresas.filter(e => e.status_cobranca === "trial").length,
    bloqueadas: empresas.filter(e => e.status === "inativo").length,
  };

  // Criar nova oficina
  const handleCriar = async () => {
    if (!form.nome.trim() || !form.owner_email.trim()) return;
    setSaving(true);
    const senhaTemp = generateTempPassword();
    const senhaHash = await hashPassword(senhaTemp);

    const empresa = await base44.entities.Empresa.create({
      nome: form.nome.trim(),
      nome_fantasia: form.nome_fantasia || undefined,
      cnpj: form.cnpj || undefined,
      owner_nome: form.owner_nome || undefined,
      owner_cpf: form.owner_cpf || undefined,
      owner_email: form.owner_email.trim().toLowerCase(),
      owner_telefone: form.owner_telefone || undefined,
      plano: form.plano,
      ciclo: form.ciclo,
      valor: form.valor ? Number(form.valor) : undefined,
      trial_ate: form.trial_ate || undefined,
      status: "trial",
      status_cobranca: "trial",
      onboarding_step: 0,
      onboarding_concluido: false,
    });

    await base44.entities.EmpresaUser.create({
      empresa_id: empresa.id,
      email: form.owner_email.trim().toLowerCase(),
      nome: form.owner_nome || undefined,
      role: "owner",
      ativo: true,
      forcar_troca_senha: true,
      senha_hash: senhaHash,
    });

    setSaving(false);
    setModalNova(false);
    setForm(emptyForm);
    setModalSenha({ nome: form.owner_email.trim(), senha: senhaTemp });
    load();
  };

  // Salvar edição
  const handleSalvarEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    await base44.entities.Empresa.update(editTarget.id, {
      status: editForm.status,
      status_cobranca: editForm.status_cobranca,
      plano: editForm.plano,
      ciclo: editForm.ciclo,
      valor: editForm.valor ? Number(editForm.valor) : undefined,
      trial_ate: editForm.trial_ate || undefined,
      proximo_vencimento: editForm.proximo_vencimento || undefined,
      observacoes_internas: editForm.observacoes_internas || undefined,
      limite_usuarios: editForm.limite_usuarios ? Number(editForm.limite_usuarios) : 3,
    });
    setSaving(false);
    setModalEdit(false);
    setEditTarget(null);
    load();
  };

  const handleToggleBloquear = async (e) => {
    const novoStatus = e.status === "inativo" ? "ativo" : "inativo";
    await base44.entities.Empresa.update(e.id, { status: novoStatus });
    load();
  };

  const copySenha = () => {
    navigator.clipboard.writeText(modalSenha?.senha);
    setCopiedSenha(true);
    setTimeout(() => setCopiedSenha(false), 2000);
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 space-y-6" style={{ backgroundColor: "var(--surface)" }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded flex items-center justify-center" style={{ backgroundColor: "var(--brand-subtle)" }}>
            <Shield className="w-5 h-5" style={{ color: "var(--brand)" }} />
          </div>
          <div>
            <h1 className="text-2xl font-black" style={{ color: "var(--ink)" }}>Admin Master</h1>
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Gestão central de clientes SaaS</p>
          </div>
        </div>
        <button onClick={() => { setForm(emptyForm); setModalNova(true); }}
          className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded text-white hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}>
          <Plus className="w-4 h-4" /> Nova Oficina
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total",      value: stats.total,     icon: Building2,   color: "#6366F1" },
          { label: "Ativas",     value: stats.ativas,    icon: CheckCircle2,color: "#059669" },
          { label: "Trial",      value: stats.trial,     icon: Clock,       color: "#D97706" },
          { label: "Bloqueadas", value: stats.bloqueadas,icon: XCircle,     color: "#DC2626" },
        ].map(s => (
          <div key={s.label} className="rounded border p-4" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
            <s.icon className="w-5 h-5 mb-3" style={{ color: s.color }} />
            <div className="text-2xl font-black" style={{ color: "var(--ink)" }}>{s.value}</div>
            <div className="text-xs font-medium mt-0.5" style={{ color: "var(--ink-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded border overflow-hidden" style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
        <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: "var(--line-soft)" }}>
          <h2 className="font-bold text-sm" style={{ color: "var(--ink)" }}>Clientes SaaS</h2>
        </div>
        {empresas.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Nenhuma oficina cadastrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs" style={{ borderBottom: "1px solid var(--line-soft)", color: "var(--ink-muted)" }}>
                  <th className="text-left px-5 pb-3 pt-3 font-semibold">Empresa</th>
                  <th className="text-left px-3 pb-3 pt-3 font-semibold hidden md:table-cell">Owner</th>
                  <th className="text-left px-3 pb-3 pt-3 font-semibold hidden sm:table-cell">Plano</th>
                  <th className="text-left px-3 pb-3 pt-3 font-semibold hidden lg:table-cell">Cobrança</th>
                  <th className="text-left px-3 pb-3 pt-3 font-semibold hidden lg:table-cell">Trial até</th>
                  <th className="text-left px-3 pb-3 pt-3 font-semibold hidden xl:table-cell">Último acesso</th>
                  <th className="text-center px-5 pb-3 pt-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map(e => (
                  <tr key={e.id} className="transition-colors" style={{ borderBottom: "1px solid var(--line-soft)" }}
                    onMouseEnter={el => el.currentTarget.style.backgroundColor = "#F0EEE8"}
                    onMouseLeave={el => el.currentTarget.style.backgroundColor = "transparent"}>
                    <td className="py-3 px-5">
                      <div className="font-semibold text-sm" style={{ color: e.status === "inativo" ? "var(--ink-faint)" : "var(--ink)" }}>{e.nome}</div>
                      {e.cnpj && <div className="text-xs" style={{ color: "var(--ink-muted)" }}>{e.cnpj}</div>}
                    </td>
                    <td className="py-3 px-3 hidden md:table-cell">
                      <div className="text-xs" style={{ color: "var(--ink-2)" }}>{e.owner_email || "—"}</div>
                    </td>
                    <td className="py-3 px-3 hidden sm:table-cell">
                      <span className="text-xs px-2 py-0.5 rounded border" style={{ borderColor: "var(--line-soft)", color: "var(--ink)" }}>{e.plano || "trial"}</span>
                    </td>
                    <td className="py-3 px-3 hidden lg:table-cell">
                      <span className="text-xs px-2 py-0.5 rounded font-semibold" style={statusCobrancaStyle[e.status_cobranca] || statusCobrancaStyle.trial}>
                        {e.status_cobranca || "trial"}
                      </span>
                    </td>
                    <td className="py-3 px-3 hidden lg:table-cell text-xs" style={{ color: "var(--ink-muted)" }}>
                      {e.trial_ate || "—"}
                    </td>
                    <td className="py-3 px-3 hidden xl:table-cell text-xs" style={{ color: "var(--ink-muted)" }}>
                      {e.ultimo_acesso_owner ? new Date(e.ultimo_acesso_owner).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="py-3 px-5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => { setEditTarget(e); setEditForm({ status: e.status, status_cobranca: e.status_cobranca || "trial", plano: e.plano || "trial", ciclo: e.ciclo || "mensal", valor: e.valor || "", trial_ate: e.trial_ate || "", proximo_vencimento: e.proximo_vencimento || "", observacoes_internas: e.observacoes_internas || "", limite_usuarios: e.limite_usuarios || 3 }); setModalEdit(true); }}
                          className="p-1.5 rounded transition-colors" style={{ color: "var(--ink-muted)" }}
                          onMouseEnter={f => { f.currentTarget.style.color = "var(--brand)"; f.currentTarget.style.backgroundColor = "var(--brand-subtle)"; }}
                          onMouseLeave={f => { f.currentTarget.style.color = "var(--ink-muted)"; f.currentTarget.style.backgroundColor = "transparent"; }}>
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleToggleBloquear(e)} title={e.status === "inativo" ? "Ativar" : "Bloquear"}
                          className="p-1.5 rounded transition-colors" style={{ color: e.status === "inativo" ? "#059669" : "#DC2626" }}
                          onMouseEnter={f => f.currentTarget.style.backgroundColor = e.status === "inativo" ? "#D1FAE5" : "#FEE2E2"}
                          onMouseLeave={f => f.currentTarget.style.backgroundColor = "transparent"}>
                          {e.status === "inativo" ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
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

      {/* ── Modal Nova Oficina ── */}
      <Modal open={modalNova} onClose={() => setModalNova(false)} title="Nova Oficina" width="max-w-xl">
        <div className="space-y-4">
          <div className="text-xs font-bold uppercase tracking-widest pb-1" style={{ color: "var(--ink-muted)", borderBottom: "1px solid var(--line-soft)" }}>Dados da Empresa</div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nome da Oficina" required>
              <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Auto Center..." />
            </FormField>
            <FormField label="Nome Fantasia">
              <Input value={form.nome_fantasia} onChange={e => setForm(p => ({ ...p, nome_fantasia: e.target.value }))} placeholder="Nome comercial" />
            </FormField>
            <FormField label="CNPJ">
              <Input value={form.cnpj} onChange={e => setForm(p => ({ ...p, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" />
            </FormField>
          </div>

          <div className="text-xs font-bold uppercase tracking-widest pb-1 pt-2" style={{ color: "var(--ink-muted)", borderBottom: "1px solid var(--line-soft)" }}>Dados do Owner</div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nome do Owner">
              <Input value={form.owner_nome} onChange={e => setForm(p => ({ ...p, owner_nome: e.target.value }))} placeholder="Nome completo" />
            </FormField>
            <FormField label="CPF">
              <Input value={form.owner_cpf} onChange={e => setForm(p => ({ ...p, owner_cpf: e.target.value }))} placeholder="000.000.000-00" />
            </FormField>
            <FormField label="E-mail do Owner" required>
              <Input type="email" value={form.owner_email} onChange={e => setForm(p => ({ ...p, owner_email: e.target.value }))} placeholder="owner@email.com" />
            </FormField>
            <FormField label="Telefone">
              <Input value={form.owner_telefone} onChange={e => setForm(p => ({ ...p, owner_telefone: e.target.value }))} placeholder="(11) 99999-9999" />
            </FormField>
          </div>

          <div className="text-xs font-bold uppercase tracking-widest pb-1 pt-2" style={{ color: "var(--ink-muted)", borderBottom: "1px solid var(--line-soft)" }}>Faturamento</div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Plano">
              <Select value={form.plano} onChange={e => setForm(p => ({ ...p, plano: e.target.value }))}>
                <option value="trial">Trial</option>
                <option value="basico">Básico</option>
                <option value="profissional">Profissional</option>
              </Select>
            </FormField>
            <FormField label="Ciclo">
              <Select value={form.ciclo} onChange={e => setForm(p => ({ ...p, ciclo: e.target.value }))}>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </Select>
            </FormField>
            <FormField label="Valor (R$)">
              <Input type="number" min="0" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" />
            </FormField>
            <FormField label="Trial até">
              <Input type="date" value={form.trial_ate} onChange={e => setForm(p => ({ ...p, trial_ate: e.target.value }))} />
            </FormField>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalNova(false)} className="px-4 py-2 rounded text-sm font-semibold border" style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}>
              Cancelar
            </button>
            <button onClick={handleCriar} disabled={saving || !form.nome.trim() || !form.owner_email.trim()}
              className="px-4 py-2 rounded text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: "var(--brand)" }}>
              {saving ? "Criando..." : "Criar Oficina"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal Editar Cobrança ── */}
      <Modal open={modalEdit} onClose={() => setModalEdit(false)} title={`Editar: ${editTarget?.nome}`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Status">
              <Select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}>
                <option value="ativo">Ativo</option>
                <option value="trial">Trial</option>
                <option value="inativo">Inativo</option>
              </Select>
            </FormField>
            <FormField label="Status Cobrança">
              <Select value={editForm.status_cobranca} onChange={e => setEditForm(p => ({ ...p, status_cobranca: e.target.value }))}>
                <option value="trial">Trial</option>
                <option value="ativo">Ativo</option>
                <option value="inadimplente">Inadimplente</option>
                <option value="suspenso">Suspenso</option>
                <option value="cancelado">Cancelado</option>
              </Select>
            </FormField>
            <FormField label="Plano">
              <Select value={editForm.plano} onChange={e => setEditForm(p => ({ ...p, plano: e.target.value }))}>
                <option value="trial">Trial</option>
                <option value="basico">Básico</option>
                <option value="profissional">Profissional</option>
              </Select>
            </FormField>
            <FormField label="Ciclo">
              <Select value={editForm.ciclo} onChange={e => setEditForm(p => ({ ...p, ciclo: e.target.value }))}>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </Select>
            </FormField>
            <FormField label="Valor (R$)">
              <Input type="number" min="0" value={editForm.valor} onChange={e => setEditForm(p => ({ ...p, valor: e.target.value }))} />
            </FormField>
            <FormField label="Limite Usuários">
              <Input type="number" min="1" value={editForm.limite_usuarios} onChange={e => setEditForm(p => ({ ...p, limite_usuarios: e.target.value }))} />
            </FormField>
            <FormField label="Trial até">
              <Input type="date" value={editForm.trial_ate} onChange={e => setEditForm(p => ({ ...p, trial_ate: e.target.value }))} />
            </FormField>
            <FormField label="Próx. Vencimento">
              <Input type="date" value={editForm.proximo_vencimento} onChange={e => setEditForm(p => ({ ...p, proximo_vencimento: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Obs. Internas">
            <textarea value={editForm.observacoes_internas} onChange={e => setEditForm(p => ({ ...p, observacoes_internas: e.target.value }))}
              rows={3} className="w-full rounded-sm border px-3 py-2 text-[13px] focus:outline-none"
              style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink)" }} />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalEdit(false)} className="px-4 py-2 rounded text-sm font-semibold border" style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}>
              Cancelar
            </button>
            <button onClick={handleSalvarEdit} disabled={saving}
              className="px-4 py-2 rounded text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: "var(--brand)" }}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal Senha Provisória ── */}
      <Modal open={!!modalSenha} onClose={() => setModalSenha(null)} title="Oficina criada!">
        <div className="space-y-4">
          <div className="rounded px-4 py-3 text-sm" style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
            ⚠️ Anote esta senha provisória. Ela não será exibida novamente.
          </div>
          <div>
            <p className="text-sm mb-1" style={{ color: "var(--ink-muted)" }}>Login: <strong style={{ color: "var(--ink)" }}>{modalSenha?.nome}</strong></p>
            <p className="text-sm mb-3" style={{ color: "var(--ink-muted)" }}>Senha provisória:</p>
            <div className="rounded border px-4 py-3 font-mono text-lg font-bold text-center" style={{ backgroundColor: "var(--surface-sunken)", borderColor: "var(--line)", color: "var(--ink)" }}>
              {modalSenha?.senha}
            </div>
          </div>
          <button onClick={copySenha}
            className="w-full py-2.5 rounded-sm text-sm font-bold flex items-center justify-center gap-2 border"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}>
            {copiedSenha ? "✓ Copiado!" : <><Copy className="w-4 h-4" /> Copiar senha</>}
          </button>
          <button onClick={() => setModalSenha(null)}
            className="w-full py-2.5 rounded-sm text-sm font-bold text-white" style={{ backgroundColor: "var(--brand)" }}>
            Entendi, fechar
          </button>
        </div>
      </Modal>
    </div>
  );
}