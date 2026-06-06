import { Link, useLocation } from 'react-router-dom';
import { Scissors, Calendar, Users, Briefcase, DollarSign, BarChart2, Zap, Home, Globe } from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: Home, path: '/demo/dashboard' },
  { label: 'Agenda', icon: Calendar, path: '/demo/agenda' },
  { label: 'Clientes', icon: Users, path: '/demo/clientes' },
  { label: 'Serviços', icon: Briefcase, path: '/demo/servicos' },
  { label: 'Profissionais', icon: Scissors, path: '/demo/profissionais' },
  { label: 'Financeiro', icon: DollarSign, path: '/demo/financeiro' },
  { label: 'Relatórios', icon: BarChart2, path: '/demo/relatorios' },
  { label: 'AI Growth', icon: Zap, path: '/demo/ai-growth' },
];

export default function DemoLayout({ children }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#F8F7F3] font-inter">
      {/* Demo Banner */}
      <div className="bg-[#1B3A4B] text-white text-center py-2.5 px-4 flex items-center justify-center gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-2 text-sm font-medium">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          Modo Demonstração — dados fictícios, nenhuma ação é salva
        </div>
        <div className="hidden sm:flex items-center gap-3 ml-4">
          <Link to="/" className="text-xs text-white/70 hover:text-white underline">← Voltar à LP</Link>
          <a href="https://turbosaas.pro/" target="_blank" rel="noopener noreferrer">
            <span className="bg-white text-[#1B3A4B] text-xs font-bold px-3 py-1 rounded-full hover:bg-white/90 transition-colors">
              Contratar agora
            </span>
          </a>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-screen bg-white border-r border-black/10 flex flex-col sticky top-10 h-screen overflow-y-auto">
          <div className="p-6 border-b border-black/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-[#1B3A4B] rounded-lg flex items-center justify-center">
                <Scissors className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-bold text-sm text-[#1B1C1E]">Barbearia Demo</div>
                <div className="text-xs text-gray-400">BarbeiroPro AI</div>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? 'bg-[#1B3A4B] text-white'
                      : 'text-gray-600 hover:bg-[#F8F7F3] hover:text-[#1B3A4B]'
                  }`}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                  {item.label === 'AI Growth' && (
                    <span className="ml-auto text-xs bg-yellow-400 text-yellow-900 font-bold px-1.5 py-0.5 rounded">AI</span>
                  )}
                </Link>
              );
            })}
            <a href={`${window.location.origin}/agendar/barbearia-demo`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-[#F8F7F3] hover:text-[#1B3A4B] transition-all">
              <Globe className="w-4 h-4 flex-shrink-0" />
              Link de Agendamento
            </a>
          </nav>

          <div className="p-4 border-t border-black/10">
            <div className="bg-[#1B3A4B]/5 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-3">Gostou do que viu?</p>
              <a href="https://turbosaas.pro/" target="_blank" rel="noopener noreferrer" className="block">
                <button className="w-full bg-[#1B3A4B] text-white text-xs font-bold py-2 px-4 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors">
                  Contratar BarbeiroPro AI
                </button>
              </a>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}