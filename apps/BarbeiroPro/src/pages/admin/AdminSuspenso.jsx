import { Scissors, AlertTriangle } from 'lucide-react';

export default function AdminSuspenso() {
  return (
    <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center p-4 font-inter">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-black text-[#1B1C1E] mb-3">Acesso suspenso</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          O acesso ao painel desta barbearia está temporariamente suspenso.<br />
          Entre em contato com o suporte BarbeiroPro AI para regularizar sua situação.
        </p>
        <a href="mailto:suporte@barbeiropro.ai"
          className="inline-flex items-center gap-2 bg-[#1B3A4B] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#1B3A4B]/90 transition-colors">
          Falar com o suporte
        </a>
        <div className="mt-4">
          <button onClick={() => { localStorage.removeItem('admin_session'); window.location.href = '/admin/login'; }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Sair e tentar outro acesso
          </button>
        </div>
      </div>
    </div>
  );
}