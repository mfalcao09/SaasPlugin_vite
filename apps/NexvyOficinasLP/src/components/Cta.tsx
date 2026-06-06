import { buttonVariants } from "./ui/button";
import { ArrowRight } from "lucide-react";

const APP_URL = "https://app.nexvyoficinas.com.br";

export const Cta = () => {
  return (
    <section
      id="cta"
      className="bg-orange-500/5 border-y border-orange-500/20 py-16 my-24 sm:my-32"
    >
      <div className="container lg:grid lg:grid-cols-2 place-items-center">
        <div className="lg:col-start-1">
          <h2 className="text-3xl md:text-4xl font-bold">
            Sua oficina merece{" "}
            <span className="bg-gradient-to-r from-orange-500 to-orange-700 text-transparent bg-clip-text">
              parar de perder tempo
            </span>{" "}
            com papelada
          </h2>
          <p className="text-muted-foreground text-xl mt-4 mb-8 lg:mb-0">
            Em 5 minutos você cria sua conta, cadastra seus serviços e já começa a usar. Sem instalação, sem complicação. 14 dias grátis pra você testar tudo.
          </p>
        </div>

        <div className="space-y-4 lg:col-start-2 flex flex-col sm:flex-row lg:flex-col gap-4">
          <a
            href={`${APP_URL}/signup`}
            className={`${buttonVariants({ size: "lg" })} bg-orange-600 hover:bg-orange-700 text-white w-full md:w-auto`}
          >
            Começar grátis agora
            <ArrowRight className="ml-2 w-5 h-5" />
          </a>
          <a
            href="#features"
            className={`${buttonVariants({ variant: "outline", size: "lg" })} w-full md:w-auto`}
          >
            Ver todas as funções
          </a>
        </div>
      </div>
    </section>
  );
};
