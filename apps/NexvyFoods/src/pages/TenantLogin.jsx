import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { verifyPassword, saveSession } from '@/lib/auth-local';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { ChefHat, Eye, EyeOff } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function TenantLogin() {
  useDocumentTitle('Entrar | FoodControl AI');
  const navigate = useNavigate();
  const { setSession } = useTenantAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Busca CompanyUser por email (case-insensitive via filter)
      const users = await base44.entities.CompanyUser.list('-created_date', 500);
      const cu = users.find(u => u.email?.toLowerCase() === email.trim().toLowerCase() && u.ativo);

      if (!cu) {
        setError('Email não encontrado ou usuário inativo.');
        return;
      }

      const valid = await verifyPassword(password, cu.senha_hash);
      if (!valid) {
        setError('Senha incorreta.');
        return;
      }

      // Atualiza ultimo_login
      const now = new Date().toISOString();
      await base44.entities.CompanyUser.update(cu.id, { ultimo_login: now });

      // Se owner, atualiza Company.ultimo_acesso_owner
      if (cu.role === 'owner') {
        await base44.entities.Company.update(cu.company_id, { ultimo_acesso_owner: now });
      }

      // Salva sessão
      const sess = saveSession({
        company_id: cu.company_id,
        company_user_id: cu.id,
        role: cu.role,
        nome: cu.nome,
        email: cu.email,
      });

      await setSession(sess);

      if (cu.forcar_troca_senha) {
        navigate('/trocar-senha');
      } else {
        navigate('/app/dashboard');
      }
    } catch (err) {
      setError('Erro ao fazer login. Tente novamente.');
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
          <h1 className="text-2xl font-bold text-foreground">FoodControl AI</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesse seu painel</p>
        </div>

        <div className="bg-white rounded-2xl border border-border p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/esqueci-senha" className="text-sm text-accent hover:underline">
              Esqueci minha senha
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}