import { Wrench } from "lucide-react";

const APP_URL = "https://app.nexvyoficinas.com.br";

export const Footer = () => {
  return (
    <footer id="footer">
      <hr className="w-11/12 mx-auto" />

      <section className="container py-20 grid grid-cols-2 md:grid-cols-4 gap-x-12 gap-y-8">
        <div className="col-span-full md:col-span-2">
          <a
            rel="noreferrer noopener"
            href="/"
            className="font-bold text-xl flex items-center gap-2"
          >
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-orange-500" />
            </div>
            NexvyOficinas
          </a>
          <p className="text-muted-foreground mt-3 max-w-md">
            O sistema completo para sua oficina mecânica. OS, orçamentos, controle de veículos, financeiro e CRM em um só lugar.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="font-bold text-lg">Produto</h3>
          <a href="#features" className="opacity-60 hover:opacity-100">Funções</a>
          <a href="#pricing" className="opacity-60 hover:opacity-100">Preços</a>
          <a href="#faq" className="opacity-60 hover:opacity-100">FAQ</a>
          <a href={`${APP_URL}/signup`} className="opacity-60 hover:opacity-100">Começar grátis</a>
          <a href={`${APP_URL}/login`} className="opacity-60 hover:opacity-100">Entrar</a>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="font-bold text-lg">Empresa</h3>
          <a href="mailto:contato@nexvy.tech" className="opacity-60 hover:opacity-100">Contato</a>
          <a href="mailto:vendas@nexvy.tech" className="opacity-60 hover:opacity-100">Vendas</a>
          <a href="mailto:suporte@nexvy.tech" className="opacity-60 hover:opacity-100">Suporte</a>
          <a href="https://nexvy.tech" target="_blank" rel="noreferrer noopener" className="opacity-60 hover:opacity-100">Nexvy.tech</a>
        </div>
      </section>

      <section className="container pb-14 text-center text-sm text-muted-foreground">
        <p>
          &copy; 2026 NexvyOficinas. Um produto{" "}
          <a
            rel="noreferrer noopener"
            target="_blank"
            href="https://nexvy.tech"
            className="text-orange-500 hover:underline"
          >
            Nexvy
          </a>
          .
        </p>
      </section>
    </footer>
  );
};
