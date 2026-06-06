import { Link } from "react-router-dom";
import { Zap, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-amber-500/30">
          <Zap className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-6xl font-black text-gray-700 mb-4">404</h1>
        <p className="text-xl text-gray-400 mb-8">Página não encontrada</p>
        <Link to="/" className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-3 rounded-xl transition-colors mx-auto w-fit">
          <ArrowLeft className="w-4 h-4" /> Voltar ao início
        </Link>
      </div>
    </div>
  );
}