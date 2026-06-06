import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Scissors, Eye, EyeOff } from 'lucide-react';

export default function AdminTrocarSenha() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token'); // para reset via link de e-mail
  const [nova, setNova] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [showNova, setShowNova] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Se não há token, precisa ter sessão ativa
  const session = (() => {
    try { return JSON.parse(localStorage.getItem('admin_session')); }
    catch { return null; }
  })();

  useEffect(() => {
    if (!token && !session) navigate('/admin/login');
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (nova.length < 8) { setError('A senha deve ter pelo menos 8 caracteres.'); return; }
    if (nova !== confirmar) { setError('As senhas não coincidem.'); return; }
    setLoading(true);
    setError('');

    let res;
    if (token) {
      res = await base44.functions.invoke('barbeariaUserActions', {
        action: 'reset_password', token, nova_senha: nova
      });
    } else {
      res = await base44.functions.invoke('barbeariaUserActions', {
        action: 'change_password', user_id: session.user.id, nova_senha: nova
      });
    }

    setLoading(false);
    if (res.data?.success) {
      if (session) {
        const updated = { ...session, user: { ...session.user, forcar_troca_senha: false } };
        localStorage.setItem('admin_session', JSON.stringify(updated));
      }
      navigate('/admin/dashboard');
    } else {
      setError(res.data?.error || 'Erro ao trocar senha.');
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center p-4 font-inter">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#1B3A4B] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Scissors className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-black text-[#1B1C1E]">{token ? 'Redefinir senha' : 'Primeiro acesso'}</h1>
          <p className="text-gray-400 text-sm mt-1">{token ? 'Crie sua nova senha' : 'Crie uma senha para continuar'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/8 p-6 shadow-sm">
          {!token && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg mb-4">
              Por segurança, você precisa criar uma nova senha antes de continuar.
            </div>
          )}
          {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Nova senha</label>
              <div className="relative">
                <input type={showNova ? 'text' : 'password'} value={nova} onChange={e => setNova(e.target.value)} required minLength={8}
                  className="w-full px-3 py-2.5 pr-10 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                <button type="button" onClick={() => setShowNova(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNova ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Confirmar senha</label>
              <input type="password" value={confirmar} onChange={e => setConfirmar(e.target.value)} required
                className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
            </div>
            <p className="text-xs text-gray-400">Mínimo 8 caracteres.</p>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-[#1B3A4B] text-white rounded-lg font-semibold text-sm hover:bg-[#1B3A4B]/90 disabled:opacity-60 transition-colors">
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}