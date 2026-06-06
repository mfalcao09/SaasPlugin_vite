import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Wrench, Car, FileText, DollarSign, Users, Smartphone } from "lucide-react";

interface FeatureProps {
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const features: FeatureProps[] = [
  {
    title: "Ordem de Serviço Digital",
    description:
      "Crie OS em segundos, fotografe o veículo, registre peças e mão-de-obra. O cliente acompanha o status pelo WhatsApp.",
    Icon: Wrench,
  },
  {
    title: "Histórico Completo do Veículo",
    description:
      "Cada carro tem sua ficha: revisões anteriores, peças trocadas, quilometragem. Indique o próximo serviço com 1 clique.",
    Icon: Car,
  },
  {
    title: "Orçamentos Profissionais",
    description:
      "Mande orçamento bonito pelo WhatsApp com itens detalhados, validade e total. Cliente aprova online — sem ida e volta.",
    Icon: FileText,
  },
  {
    title: "Financeiro Sob Controle",
    description:
      "Lançamentos de receita e despesa em segundos, com filtros por período. Veja o caixa do dia, da semana e do mês.",
    Icon: DollarSign,
  },
  {
    title: "CRM e Reativação de Clientes",
    description:
      "Identifique clientes que não voltam há 6 meses e dispare uma cadência de WhatsApp pra trazê-los de volta.",
    Icon: Users,
  },
  {
    title: "Funciona no Celular",
    description:
      "Use no computador da recepção ou no celular do mecânico, na bancada. Tudo sincroniza em tempo real.",
    Icon: Smartphone,
  },
];

export const Features = () => {
  return (
    <section
      id="features"
      className="container py-24 sm:py-32 space-y-8"
    >
      <h2 className="text-3xl lg:text-4xl font-bold md:text-center">
        Tudo que sua oficina precisa{" "}
        <span className="bg-gradient-to-r from-orange-500 to-orange-700 text-transparent bg-clip-text">
          em um só lugar
        </span>
      </h2>

      <p className="md:w-2/3 mx-auto text-xl text-center text-muted-foreground">
        Sem precisar de 5 sistemas separados. Sem planilha. Sem papel.
      </p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {features.map(({ title, description, Icon }) => (
          <Card key={title} className="border-orange-500/20 hover:border-orange-500/40 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-3">
                <Icon className="w-6 h-6 text-orange-500" />
              </div>
              <CardTitle className="text-xl">{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              {description}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};
