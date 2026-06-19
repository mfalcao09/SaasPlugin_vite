import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';

// Página jurídica pública (Termos / Privacidade). Renderiza o markdown de
// legalContent.ts com estilos do tema. Rota pública (sem login).

interface Props {
  title: string;
  version: string;
  markdown: string;
}

export function LegalPage({ title, version, markdown }: Props) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/"><Logo size="sm" /></Link>
          <Link
            to="/vendas"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">Versão {version}</p>

        <div className="mt-6 space-y-3 text-[15px] leading-relaxed">
          <ReactMarkdown
            components={{
              h2: ({ children }) => <h2 className="text-xl font-bold text-foreground mt-8 mb-2">{children}</h2>,
              h3: ({ children }) => <h3 className="text-base font-semibold text-foreground mt-6 mb-1.5">{children}</h3>,
              p: ({ children }) => <p className="text-muted-foreground">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 text-muted-foreground">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              strong: ({ children }) => <strong className="text-foreground font-semibold">{children}</strong>,
              a: ({ href, children }) => <a href={href} className="text-primary underline">{children}</a>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-primary/40 pl-4 italic text-muted-foreground">{children}</blockquote>
              ),
              hr: () => <hr className="border-border my-6" />,
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>

        <footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
          Dúvidas sobre seus dados pessoais? Fale com o Encarregado pela Proteção de Dados (DPO) indicado na Política de Privacidade.
        </footer>
      </main>
    </div>
  );
}
