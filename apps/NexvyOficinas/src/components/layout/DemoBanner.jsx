import { Eye, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function DemoBanner() {
  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-black px-4 py-2.5 flex items-center justify-between text-sm font-medium">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4" />
        <span className="font-bold">MODO DEMONSTRAÇÃO</span>
        <span className="hidden sm:inline text-black/70 font-normal">— Você está visualizando dados fictícios do AutoFlow AI</span>
      </div>
      <Link to="/" className="flex items-center gap-1 bg-black/20 hover:bg-black/30 px-3 py-1 rounded-full text-xs font-bold transition-colors">
        Ver LP <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}