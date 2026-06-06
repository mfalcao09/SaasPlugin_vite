import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Scissors, Eye, EyeOff } from 'lucide-react';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await base44.functions.invoke('barbeariaUserActions', {
      action: 'login', email, senha
    });
    setLoading(false);
    if (res.data?.success) {
      const { user, company } = res.data;
      // Salvar sessão no localStorage
      localStorage.setItem('admin_session', JSON.stringify({ user, company }));
      if (user.forcar_troca_senha) {
        navigate('/admin/trocar-senha');
      } else {
        navigate('/admin/dashboard');
      }
    } else if (res.data?.error === 'acesso_suspenso') {
      navigate('/admin/suspenso');
    } else {
      setError(res.data?.error || 'Credenciais inválidas');
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setLoading(true);
    await base44.functions.invoke('barbeariaUserActions', {
      action: 'forgot_password', email: forgotEmail, origin: window.location.origin
    });
    setLoading(false);
    setForgotSent(true);
  }

  return (
    <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center p-4 font-inter">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#1B3A4B] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Scissors className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-[#1B1C1E]">BarbeiroPro AI</h1>
          <p className="text-gray-400 text-sm mt-1">Acesso ao painel da barbearia</p>
        </div>

        <div className="bg-white rounded-2xl border border-black/8 p-6 shadow-sm">
          {!forgotMode ? (
            <>
              <h2 className="font-bold text-[#1B1C1E] mb-5">Entrar</h2>
              {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">E-mail</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Senha</label>
                  <div className="relative">
                    <input type={showSenha ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} required
                      className="w-full px-3 py-2.5 pr-10 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                    <button type="button" onClick={() => setShowSenha(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-2.5 bg-[#1B3A4B] text-white rounded-lg font-semibold text-sm hover:bg-[#1B3A4B]/90 disabled:opacity-60 transition-colors">
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
              <button onClick={() => setForgotMode(true)}
                className="w-full text-center text-xs text-gray-400 hover:text-[#1B3A4B] mt-4 transition-colors">
                Esqueci minha senha
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setForgotMode(false); setForgotSent(false); }} className="text-xs text-gray-400 hover:text-[#1B3A4B] mb-4">← Voltar</button>
              <h2 className="font-bold text-[#1B1C1E] mb-2">Recuperar senha</h2>
              {forgotSent ? (
                <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl">
                  Se o e-mail estiver cadastrado, você receberá as instruções em breve.
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4 mt-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Seu e-mail</label>
                    <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required
                      className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20" />
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full py-2.5 bg-[#1B3A4B] text-white rounded-lg font-semibold text-sm hover:bg-[#1B3A4B]/90 disabled:opacity-60 transition-colors">
                    {loading ? 'Enviando...' : 'Enviar link de recuperação'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}