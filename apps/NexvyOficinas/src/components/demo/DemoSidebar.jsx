import { Link } from "react-router-dom";
import { 
  LayoutDashboard, Users, Car, FileText, ClipboardList,
  DollarSign, BarChart2, UserCog, Zap, Settings, ChevronRight
} from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/demo/dashboard" },
  { label: "Clientes", icon: Users, path: "/demo/clientes" },
  { label: "Veículos", icon: Car, path: "/demo/veiculos" },
  { label: "Orçamentos", icon: FileText, path: "/demo/orcamentos" },
  { label: "Ordens de Serviço", icon: ClipboardList, path: "/demo/ordens" },
  { label: "Financeiro", icon: DollarSign, path: "/demo/financeiro" },
  { label: "Relatórios", icon: BarChart2, path: "/demo/relatorios" },
  { label: "Equipe", icon: UserCog, path: "/demo/equipe" },
  { label: "AI Growth", icon: Zap, path: "/demo/ai-growth", highlight: true },
  { label: "Configurações", icon: Settings, path: "/demo/configuracoes" },
];

export default function DemoSidebar({ active }) {
  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-800">
        <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 text-black" />
        </div>
        <div>
          <span className="font-bold text-white text-xs">AutoFlow AI</span>
          <p className="text-gray-500 text-xs leading-none">Auto Center Supremo</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = active === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-xs font-medium
                ${isActive ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "text-gray-400 hover:bg-gray-800 hover:text-white"}
                ${item.highlight && !isActive ? "text-amber-400/70" : ""}
              `}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${item.highlight ? "text-amber-400" : ""}`} />
              <span className="flex-1">{item.label}</span>
              {item.highlight && <span className="text-xs bg-amber-500 text-black px-1 py-0.5 rounded-full font-bold" style={{fontSize:'9px'}}>IA</span>}
              {isActive && <ChevronRight className="w-3 h-3" />}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-800 p-3">
        <div className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg">
          <div className="w-6 h-6 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-amber-400 text-xs font-bold">R</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">Roberto Nascimento</p>
            <p className="text-xs text-gray-500">Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}