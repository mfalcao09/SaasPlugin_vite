import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FAQProps {
  question: string;
  answer: string;
  value: string;
}

const FAQList: FAQProps[] = [
  {
    question: "Preciso instalar algo no computador?",
    answer:
      "Não. O NexvyOficinas roda direto no navegador (Chrome, Edge, Firefox, Safari). Funciona no computador da recepção, no notebook do dono e no celular do mecânico. Tudo sincronizado em tempo real.",
    value: "item-1",
  },
  {
    question: "Como funciona o período grátis?",
    answer:
      "14 dias com acesso total a TODAS as funções do plano Profissional. Sem cartão de crédito pra começar. Se gostou, escolhe o plano. Se não, é só parar de usar — sem cobrança e sem ligação chata de vendedor.",
    value: "item-2",
  },
  {
    question: "Meus dados ficam seguros?",
    answer:
      "Sim. Usamos Supabase (PostgreSQL com criptografia em repouso e em trânsito), com backups diários. Você pode exportar todos os seus dados (clientes, OS, financeiro) a qualquer momento em planilha.",
    value: "item-3",
  },
  {
    question: "Funciona se eu não tiver internet boa?",
    answer:
      "Sim. O sistema usa cache local, então funciona com internet instável. Quando reconecta, sincroniza automaticamente. Em 2026 a maioria das oficinas já tem 4G — mesmo sem WiFi, dá pra usar.",
    value: "item-4",
  },
  {
    question: "Tem suporte por WhatsApp?",
    answer:
      "Sim, no plano Profissional. Resposta em até 4 horas em horário comercial. No plano Essencial, suporte por email com resposta em 1 dia útil.",
    value: "item-5",
  },
  {
    question: "Posso cancelar quando quiser?",
    answer:
      "Sim. Sem multa, sem fidelidade. Cancela direto no painel ou pelo WhatsApp. Você fica até o final do período pago e pode baixar seus dados.",
    value: "item-6",
  },
];

export const FAQ = () => {
  return (
    <section
      id="faq"
      className="container py-24 sm:py-32"
    >
      <h2 className="text-3xl md:text-4xl font-bold mb-4">
        Perguntas{" "}
        <span className="bg-gradient-to-r from-orange-500 to-orange-700 text-transparent bg-clip-text">
          frequentes
        </span>
      </h2>

      <Accordion
        type="single"
        collapsible
        className="w-full AccordionRoot"
      >
        {FAQList.map(({ question, answer, value }: FAQProps) => (
          <AccordionItem
            key={value}
            value={value}
          >
            <AccordionTrigger className="text-left">
              {question}
            </AccordionTrigger>

            <AccordionContent>{answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <h3 className="font-medium mt-4">
        Ainda com dúvidas?{" "}
        <a
          rel="noreferrer noopener"
          href="mailto:contato@nexvy.tech"
          className="text-orange-500 transition-all border-orange-500 hover:border-b-2"
        >
          Fale conosco
        </a>
      </h3>
    </section>
  );
};
