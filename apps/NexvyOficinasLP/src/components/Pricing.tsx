import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Check } from "lucide-react";

const APP_URL = "https://app.nexvyoficinas.com.br";

enum PopularPlanType {
  NO = 0,
  YES = 1,
}

interface PricingProps {
  title: string;
  popular: PopularPlanType;
  price: number;
  description: string;
  buttonText: string;
  benefitList: string[];
}

const pricingList: PricingProps[] = [
  {
    title: "Essencial",
    popular: 0,
    price: 49,
    description: "Pra oficinas que estão começando a se organizar",
    buttonText: "Começar grátis",
    benefitList: [
      "Até 100 ordens de serviço/mês",
      "Cadastro de clientes e veículos",
      "Orçamentos digitais",
      "1 usuário",
      "Suporte por email",
    ],
  },
  {
    title: "Profissional",
    popular: 1,
    price: 99,
    description: "Pra oficinas que querem escalar e fidelizar",
    buttonText: "Começar grátis",
    benefitList: [
      "OS, orçamentos e veículos ilimitados",
      "Financeiro completo + relatórios",
      "CRM e reativação de clientes",
      "Até 5 usuários",
      "Suporte prioritário por WhatsApp",
      "Integração com WhatsApp do cliente",
    ],
  },
  {
    title: "Rede",
    popular: 0,
    price: 199,
    description: "Pra redes de oficinas e franquias",
    buttonText: "Falar com vendas",
    benefitList: [
      "Tudo do Profissional",
      "Múltiplas filiais",
      "Usuários ilimitados",
      "Dashboard consolidado",
      "API e integrações personalizadas",
      "Gerente de conta dedicado",
    ],
  },
];

export const Pricing = () => {
  return (
    <section id="pricing" className="container py-24 sm:py-32">
      <h2 className="text-3xl md:text-4xl font-bold text-center">
        Preço{" "}
        <span className="bg-gradient-to-r from-orange-500 to-orange-700 text-transparent bg-clip-text">
          honesto
        </span>
        , sem letras miúdas
      </h2>
      <h3 className="text-xl text-center text-muted-foreground pt-4 pb-8">
        14 dias grátis em qualquer plano. Sem cartão de crédito pra começar.
      </h3>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {pricingList.map((pricing: PricingProps) => (
          <Card
            key={pricing.title}
            className={
              pricing.popular === PopularPlanType.YES
                ? "border-orange-500 shadow-xl shadow-orange-500/20"
                : "border-orange-500/20"
            }
          >
            <CardHeader>
              <CardTitle className="flex item-center justify-between">
                {pricing.title}
                {pricing.popular === PopularPlanType.YES ? (
                  <Badge className="bg-orange-500/20 text-orange-500 hover:bg-orange-500/30">
                    Mais popular
                  </Badge>
                ) : null}
              </CardTitle>
              <div>
                <span className="text-3xl font-bold">R$ {pricing.price}</span>
                <span className="text-muted-foreground"> /mês</span>
              </div>
              <CardDescription>{pricing.description}</CardDescription>
            </CardHeader>

            <CardContent>
              <a
                href={pricing.title === "Rede" ? "mailto:vendas@nexvy.tech" : `${APP_URL}/signup`}
                className={`w-full ${buttonVariants({
                  variant: pricing.popular === PopularPlanType.YES ? "default" : "outline",
                })} ${pricing.popular === PopularPlanType.YES ? "bg-orange-600 hover:bg-orange-700 text-white" : ""}`}
              >
                {pricing.buttonText}
              </a>
            </CardContent>

            <hr className="w-4/5 m-auto mb-4" />

            <CardFooter className="flex">
              <div className="space-y-3">
                {pricing.benefitList.map((benefit: string) => (
                  <span key={benefit} className="flex">
                    <Check className="text-orange-500 shrink-0" />
                    <h3 className="ml-2">{benefit}</h3>
                  </span>
                ))}
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
};
