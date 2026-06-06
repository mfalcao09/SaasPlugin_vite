import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { hashPassword } from '@/lib/auth-local';
import { ChefHat } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function ResetSenha() {
  useDocumentTitle('Redefinir Senha | FoodControl AI');
  const navigate = useNavigate();
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyUser, setCompanyUser] = useState(null);
  const [tokenValid, setTokenValid] = useState(null);

  const token = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    if (!token) { setTokenValid(false); return; }
    const validate = async () => {
      const users = await base44.entities.CompanyUser.list('-created_date', 500);
      const cu = users.find(u => u.token_reset === token);
      if (!cu) { setTokenValid(false); return; }
      if (new Date(cu.token_reset_expira_em) < new Date()) { setTokenValid(false); return; }
      setCompanyUser(cu);
      setTokenValid(true);
    };
    validate().catch(() => setTokenValid(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (novaSenha.length < 8) { setError('A senha deve ter pelo menos 8 caracteres.'); return; }
    if (novaSenha !== confirmar) { setError('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      const novoHash = await hashPassword(novaSenha);
      await base44.entities.CompanyUser.update(companyUser.id, {
        senha_hash: novoHash,
        forcar_troca_senha: false,
        token_reset: null,
        token_reset_expira_em: null,
      });
      navigate('/login');
    } catch (err) {
      setError('Erro ao redefinir senha.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (tokenValid === null) {
    return (
      <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-border p-8 shadow-sm text-center">
          <h2 className="text-xl font-bold text-foreground mb-2">Link inválido ou expirado</h2>
          <p className="text-sm text-muted-foreground mb-4">Gere um novo link na página de recuperação.</p>
          <Link to="/esqueci-senha" className="text-sm text-accent hover:underline">Solicitar novo link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-accent rounded-xl mb-4">
            <ChefHat className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Redefinir Senha</h1>
        </div>
        <div className="bg-white rounded-2xl border border-border p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Nova Senha (mín. 8 caracteres)</label>
              <input type="password" required value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="••••••••" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Confirmar Senha</label>
              <input type="password" required value={confirmar} onChange={e => setConfirmar(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="••••••••" />
            </div>
            {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50">
              {loading ? 'Salvando...' : 'Redefinir Senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}