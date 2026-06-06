import { buttonVariants } from "./ui/button";
import { ArrowRight } from "lucide-react";

const APP_URL = "https://app.nexvyoficinas.com.br";

export const Hero = () => {
  return (
    <section className="container grid lg:grid-cols-2 place-items-center py-20 md:py-32 gap-10">
      <div className="text-center lg:text-start space-y-6">
        <main className="text-5xl md:text-6xl font-bold">
          <h1 className="inline">
            Acabou o caos das{" "}
            <span className="inline bg-gradient-to-r from-orange-500 to-orange-700 text-transparent bg-clip-text">
              anotações no papel
            </span>
          </h1>
        </main>

        <p className="text-xl text-muted-foreground md:w-10/12 mx-auto lg:mx-0">
          O sistema completo para sua oficina mecânica: ordem de serviço, orçamentos, controle de veículos, financeiro e CRM — tudo em um só lugar, acessível no celular ou no computador da oficina.
        </p>

        <div className="space-y-4 md:space-y-0 md:space-x-4">
          <a
            href={`${APP_URL}/signup`}
            className={`w-full md:w-auto ${buttonVariants({ size: "lg" })} bg-orange-600 hover:bg-orange-700 text-white`}
          >
            Começar grátis por 14 dias
            <ArrowRight className="ml-2 w-5 h-5" />
          </a>

          <a
            href={`${APP_URL}/login`}
            className={`w-full md:w-auto ${buttonVariants({ variant: "outline", size: "lg" })}`}
          >
            Já tenho conta
          </a>
        </div>

        <p className="text-sm text-muted-foreground">
          Sem cartão de crédito • Cancele quando quiser
        </p>
      </div>

      {/* Mockup visual — moldura simulando dashboard */}
      <div className="z-10 w-full">
        <div className="relative rounded-2xl border border-orange-500/30 bg-gradient-to-br from-slate-900 to-slate-800 p-6 shadow-2xl shadow-orange-500/20">
          <div className="flex gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <div>
                <div className="text-sm text-slate-400">OS #1247 — VW Gol</div>
                <div className="text-white font-medium">Troca de embreagem</div>
              </div>
              <span className="px-2 py-1 text-xs rounded bg-orange-500/20 text-orange-400">Em andamento</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <div>
                <div className="text-sm text-slate-400">OS #1246 — Fiat Strada</div>
                <div className="text-white font-medium">Revisão completa</div>
              </div>
              <span className="px-2 py-1 text-xs rounded bg-green-500/20 text-green-400">Concluída</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <div>
                <div className="text-sm text-slate-400">Orçamento #312</div>
                <div className="text-white font-medium">Aguardando aprovação</div>
              </div>
              <span className="px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400">R$ 2.340,00</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between text-sm">
            <span className="text-slate-400">Faturamento hoje</span>
            <span className="text-orange-400 font-bold">R$ 4.890,00</span>
          </div>
        </div>
      </div>

      {/* Shadow effect */}
      <div className="shadow"></div>
    </section>
  );
};
