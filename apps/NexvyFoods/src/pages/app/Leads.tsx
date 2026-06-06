import React, { useState, useEffect } from 'react';
import { useCompanyContext } from '@/context/CompanyContext';
import { db } from '@/lib/db';
import { Plus, X, Phone, Instagram, ChevronRight, Pencil, Trash2 } from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  phone?: string;
  source?: string;
  status: 'captado' | 'interesse' | 'primeiro_pedido' | 'fidelizado';
  notes?: string;
  company_id: string;
  created_at: string;
}

const PIPELINE: { key: Lead['status']; label: string; color: string; bg: string }[] = [
  { key: 'captado',         label: 'Captado',        color: 'text-gray-700',   bg: 'bg-gray-100'   },
  { key: 'interesse',       label: 'Interesse',       color: 'text-blue-700',   bg: 'bg-blue-100'   },
  { key: 'primeiro_pedido', label: 'Primeiro Pedido', color: 'text-purple-700', bg: 'bg-purple-100' },
  { key: 'fidelizado',      label: 'Fidelizado',      color: 'text-green-700',  bg: 'bg-green-100'  },
];

const SOURCE_OPTIONS = [
  { value: 'instagram', label: '📸 Instagram' },
  { value: 'ifood',     label: '🍔 iFood'     },
  { value: 'whatsapp',  label: '💬 WhatsApp'  },
  { value: 'indicacao', label: '👥 Indicação' },
  { value: 'outro',     label: '🔗 Outro'     },
];

function LeadModal({ lead, companyId, onSave, onClose }: {
  lead?: Lead;
  companyId: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name:   lead?.name   ?? '',
    phone:  lead?.phone  ?? '',
    source: lead?.source ?? 'instagram',
    status: lead?.status ?? 'captado' as Lead['status'],
    notes:  lead?.notes  ?? '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    const data = { ...form, company_id: companyId };
    if (lead?.id) {
      await db.leads.update(lead.id, data);
    } else {
      await db.leads.create(data);
    }
    setSaving(false);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold text-foreground">{lead ? 'Editar Lead' : 'Novo Lead'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Nome *</label>
            <input
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="Nome do potencial cliente"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Telefone / @Instagram</label>
            <input
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="(11) 9 9999-9999 ou @perfil"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Origem</label>
              <select
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white"
                value={form.source}
                onChange={e => setForm({ ...form, source: e.target.value })}
              >
                {SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Estágio</label>
              <select
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white"
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value as Lead['status'] })}
              >
                {PIPELINE.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Observações</label>
            <textarea
              rows={2}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
              placeholder="Interesse em hambúrgueres, mencionou que mora no bairro..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name}
            className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LeadCard({ lead, onEdit, onDelete, onAdvance }: {
  lead: Lead;
  onEdit: (l: Lead) => void;
  onDelete: (id: string) => void;
  onAdvance: (l: Lead) => void;
}) {
  const stageIndex = PIPELINE.findIndex(p => p.key === lead.status);
  const nextStage = PIPELINE[stageIndex + 1];
  const sourceLabel = SOURCE_OPTIONS.find(s => s.value === lead.source)?.label;

  return (
    <div className="bg-white border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground text-sm">{lead.name}</p>
            {sourceLabel && <span className="text-xs text-muted-foreground">{sourceLabel}</span>}
          </div>
          {lead.phone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3" />{lead.phone}
            </p>
          )}
          {lead.notes && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{lead.notes}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(lead.created_at).toLocaleDateString('pt-BR')}
          </p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => onEdit(lead)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(lead.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {nextStage && (
        <button
          onClick={() => onAdvance(lead)}
          className="w-full flex items-center justify-center gap-1 py-1.5 border border-accent/30 text-accent rounded-lg text-xs font-medium hover:bg-accent/5 transition-colors"
        >
          Mover para {nextStage.label} <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export default function Leads() {
  const { company, loading: companyLoading } = useCompanyContext();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Lead | undefined>();

  const load = async () => {
    if (!company?.id) return;
    const { data } = await db.leads.list(company.id);
    setLeads(data ?? []);
  };

  useEffect(() => {
    if (!company?.id) return;
    load().finally(() => setLoading(false));
  }, [company?.id]);

  const handleAdvance = async (lead: Lead) => {
    const idx = PIPELINE.findIndex(p => p.key === lead.status);
    const next = PIPELINE[idx + 1];
    if (!next) return;
    await db.leads.update(lead.id, { status: next.key });
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este lead?')) return;
    await db.leads.delete(id);
    await load();
  };

  if (companyLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {leads.length} leads · pipeline de captação
          </p>
        </div>
        <button
          onClick={() => { setEditing(undefined); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Novo Lead
        </button>
      </div>

      {leads.length === 0 ? (
        <div className="py-16 text-center bg-white border border-dashed border-border rounded-xl">
          <Instagram className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-semibold text-foreground">Nenhum lead ainda</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Cadastre clientes potenciais de Instagram, iFood ou indicações que ainda não pediram online.
          </p>
          <button
            onClick={() => { setEditing(undefined); setShowModal(true); }}
            className="mt-4 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium"
          >
            Adicionar Primeiro Lead
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-4 gap-4">
          {PIPELINE.map(stage => {
            const stageLeads = leads.filter(l => l.status === stage.key);
            return (
              <div key={stage.key} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${stage.bg} ${stage.color}`}>
                    {stage.label}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">{stageLeads.length}</span>
                </div>
                {stageLeads.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-border rounded-xl">
                    <p className="text-xs text-muted-foreground">Vazio</p>
                  </div>
                ) : (
                  stageLeads.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onEdit={l => { setEditing(l); setShowModal(true); }}
                      onDelete={handleDelete}
                      onAdvance={handleAdvance}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && company?.id && (
        <LeadModal
          lead={editing}
          companyId={company.id}
          onSave={() => { setShowModal(false); load(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
