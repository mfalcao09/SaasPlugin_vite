import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { verifyPassword, hashPassword } from '@/lib/auth-local';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { ChefHat, Eye, EyeOff } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function TrocarSenha() {
  useDocumentTitle('Trocar Senha | FoodControl AI');
  const navigate = useNavigate();
  const { companyUser, session } = useTenantAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isForcado = companyUser?.forcar_troca_senha;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (novaSenha.length < 8) { setError('A nova senha deve ter pelo menos 8 caracteres.'); return; }
    if (novaSenha !== confirmar) { setError('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      // Se não é troca forçada, valida senha atual
      if (!isForcado) {
        const valid = await verifyPassword(senhaAtual, companyUser?.senha_hash);
        if (!valid) { setError('Senha atual incorreta.'); return; }
      }
      const novoHash = await hashPassword(novaSenha);
      await base44.entities.CompanyUser.update(session.company_user_id, {
        senha_hash: novoHash,
        forcar_troca_senha: false,
      });
      navigate('/app/dashboard');
    } catch (err) {
      setError('Erro ao trocar senha.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-accent rounded-xl mb-4">
            <ChefHat className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Trocar Senha</h1>
          {isForcado && (
            <p className="text-sm text-amber-600 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Troca de senha obrigatória no primeiro acesso.
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-border p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isForcado && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Senha Atual</label>
                <input
                  type="password"
                  required
                  value={senhaAtual}
                  onChange={e => setSenhaAtual(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="••••••••"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Nova Senha (mín. 8 caracteres)</label>
              <input
                type="password"
                required
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Confirmar Nova Senha</label>
              <input
                type="password"
                required
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar Nova Senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}