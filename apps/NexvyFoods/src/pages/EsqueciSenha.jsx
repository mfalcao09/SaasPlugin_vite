import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ChefHat } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

function generateToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function EsqueciSenha() {
  useDocumentTitle('Esqueci a Senha | FoodControl AI');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLink, setResetLink] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const users = await base44.entities.CompanyUser.list('-created_date', 500);
      const cu = users.find(u => u.email?.toLowerCase() === email.trim().toLowerCase() && u.ativo);
      if (!cu) {
        setError('Email não encontrado ou usuário inativo.');
        return;
      }
      const token = generateToken();
      const expira = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await base44.entities.CompanyUser.update(cu.id, {
        token_reset: token,
        token_reset_expira_em: expira,
      });
      const link = `${window.location.origin}/reset-senha?token=${token}`;
      setResetLink(link);
    } catch (err) {
      setError('Erro ao gerar link. Tente novamente.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (resetLink) {
    return (
      <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-border p-8 shadow-sm text-center">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <ChefHat className="w-6 h-6 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Link de Reset Gerado</h2>
          <p className="text-sm text-muted-foreground mb-4">Compartilhe este link com o usuário. Válido por 24 horas.</p>
          <div className="bg-secondary rounded-xl p-3 mb-4">
            <p className="text-xs font-mono break-all text-foreground select-all">{resetLink}</p>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(resetLink); }}
            className="w-full py-2.5 bg-accent text-white rounded-xl text-sm font-semibold mb-3"
          >
            Copiar Link
          </button>
          <Link to="/login" className="text-sm text-accent hover:underline">Voltar ao login</Link>
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
          <h1 className="text-2xl font-bold text-foreground">Esqueci a Senha</h1>
          <p className="text-sm text-muted-foreground mt-1">Informe seu email para receber o link de reset</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="seu@email.com"
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
              {loading ? 'Gerando link...' : 'Gerar Link de Reset'}
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/login" className="text-sm text-accent hover:underline">Voltar ao login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}