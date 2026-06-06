import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/hooks/useCompany';
import { hashPassword, generatePassword } from '@/lib/auth-local';
import { Users, Plus, X, Mail, UserCheck, Copy, Check } from 'lucide-react';

const ROLES = [
  { value: 'owner', label: 'Proprietário' },
  { value: 'admin', label: 'Administrador' },
  { value: 'atendimento', label: 'Atendimento' },
  { value: 'cozinha', label: 'Cozinha' },
  { value: 'motoboy', label: 'Motoboy' },
  { value: 'financeiro', label: 'Financeiro' },
];

export default function AppEquipe() {
  const { user, loading: companyLoading } = useCompany();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('atendimento');
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(null); // { senha }
  const [copiedSenha, setCopiedSenha] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    base44.entities.CompanyUser.filter({ company_id: user.company_id }, 'nome')
      .then(setMembers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.company_id]);

  const handleInvite = async () => {
    if (!inviteEmail || !user?.company_id) return;
    setInviting(true);
    try {
      const senha = generatePassword(10);
      const senha_hash = await hashPassword(senha);
      await base44.entities.CompanyUser.create({
        company_id: user.company_id,
        email: inviteEmail.toLowerCase().trim(),
        nome: inviteEmail.split('@')[0],
        role: inviteRole,
        ativo: true,
        forcar_troca_senha: true,
        senha_hash,
        invited_by: user.email,
      });
      setMembers(await base44.entities.CompanyUser.filter({ company_id: user.company_id }, 'nome'));
      setInviteEmail('');
      setInviteRole('atendimento');
      setShowInvite(false);
      setInviteSuccess({ senha });
    } catch (e) {
      console.error(e);
    } finally {
      setInviting(false);
    }
  };

  const handleToggle = async (member) => {
    await base44.entities.CompanyUser.update(member.id, { ativo: !member.ativo });
    setMembers(members.map(m => m.id === member.id ? { ...m, ativo: !m.ativo } : m));
  };

  if (companyLoading || loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipe</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{members.filter(m => m.ativo).length} membros ativos</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Convidar
        </button>
      </div>

      {inviteSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-3">
            <UserCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800 font-medium">Membro criado! Compartilhe a senha provisória abaixo:</p>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-lg p-2.5 border border-green-200">
            <span className="font-mono text-base font-bold text-foreground tracking-widest flex-1">{inviteSuccess.senha}</span>
            <button onClick={() => { navigator.clipboard.writeText(inviteSuccess.senha); setCopiedSenha(true); setTimeout(() => setCopiedSenha(false), 2000); }} className="p-1.5 hover:bg-secondary rounded-lg">
              {copiedSenha ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
          <p className="text-xs text-amber-700">⚠️ Esta senha não será exibida novamente. O usuário deverá trocá-la no primeiro login.</p>
          <button onClick={() => setInviteSuccess(null)} className="text-xs text-muted-foreground hover:underline">Fechar</button>
        </div>
      )}

      {showInvite && (
        <div className="bg-white border-2 border-accent/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-foreground">Convidar Membro</h2>
            <button onClick={() => setShowInvite(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Email *</label>
            <input
              type="email"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="email@exemplo.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Papel</label>
            <select
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white"
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowInvite(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground">Cancelar</button>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail}
              className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {inviting ? 'Enviando...' : 'Enviar Convite'}
            </button>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <div className="py-20 text-center">
          <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h2 className="font-bold text-foreground mb-2">Nenhum membro ainda</h2>
          <p className="text-sm text-muted-foreground">Adicione membros da equipe para acesso ao sistema.</p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          {members.map((member, i) => (
            <div key={member.id} className={`flex items-center gap-4 px-5 py-4 ${i < members.length - 1 ? 'border-b border-border' : ''}`}>
              <div className="w-9 h-9 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-accent">{(member.nome || member.email)?.[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">{member.nome || member.email}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Mail className="w-3 h-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-muted-foreground font-medium capitalize">
                  {ROLES.find(r => r.value === member.role)?.label || member.role}
                </span>
                <button
                  onClick={() => handleToggle(member)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${member.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                >
                  {member.ativo ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}