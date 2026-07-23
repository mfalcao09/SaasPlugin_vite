import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  ListChecks,
  Send,
  Scale,
  Download,
  Settings,
  LogOut,
} from 'lucide-react';
import { NexvyShell, NexvyMobileBottomNav, type NexvyModule } from './shell';
import { TelaFontes, TelaPublicacoes, TelaRevisao } from './pages/Telas';
import Acesso, { type Identidade } from './pages/Acesso';

// ============================================================================
// DiárioMonitor — casca de navegação (card C0.1c)
//
// Camada de APRESENTAÇÃO (§7.2.3): nenhuma query, nenhuma regra de negócio.
// Cada seção consumirá um hook de `src/hooks/` escrito na camada de dados.
// Tema: Nexvy Lux institucional, aplicado no index.html antes do 1º paint.
// ============================================================================

/** Placeholder até o card correspondente construir a tela de verdade. */
function EmConstrucao({ titulo, card }: { titulo: string; card: string }) {
  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-semibold text-foreground">{titulo}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Tela prevista no card <span className="font-mono text-[13px]">{card}</span> do PRD v2.1.
      </p>
    </div>
  );
}

const MODULOS: NexvyModule[] = [
  {
    id: 'diariomonitor',
    label: 'DiárioMonitor',
    icon: Scale,
    nav: [
      {
        id: 'principal',
        label: null,
        items: [
          {
            id: 'dashboard',
            label: 'Visão Geral',
            icon: LayoutDashboard,
            render: () => <EmConstrucao titulo="Visão Geral" card="F1" />,
          },
          {
            id: 'publicacoes',
            label: 'Publicações',
            icon: FileText,
            render: () => <TelaPublicacoes />,
          },
          {
            id: 'revisao',
            label: 'Fila de Revisão',
            icon: ListChecks,
            render: () => <TelaRevisao />,
          },
        ],
      },
      {
        id: 'acervo',
        label: 'Acervo normativo',
        items: [
          {
            id: 'normas',
            label: 'Normas',
            icon: Scale,
            render: () => <EmConstrucao titulo="Acervo Normativo" card="C2.4" />,
          },
        ],
      },
      {
        id: 'distribuicao',
        label: 'Distribuição',
        items: [
          {
            id: 'listas',
            label: 'Listas de Disparo',
            icon: Send,
            render: () => <EmConstrucao titulo="Listas de Disparo" card="C1.5b" />,
          },
          {
            id: 'envios',
            label: 'Envios',
            icon: Send,
            render: () => <EmConstrucao titulo="Envios" card="C1.6" />,
          },
        ],
      },
      {
        id: 'config',
        label: 'Configuração',
        items: [
          {
            id: 'fontes',
            label: 'Fontes de Diários',
            icon: Download,
            render: () => <TelaFontes />,
          },
          {
            id: 'ajustes',
            label: 'Ajustes',
            icon: Settings,
            render: () => <EmConstrucao titulo="Ajustes" card="F1" />,
          },
        ],
      },
    ],
  },
];

// O bottom nav mobile recebe uma lista plana (contrato proprio da shell).
// Derivado do registry acima para nao duplicar a definicao de navegacao.
const ITENS_MOBILE = MODULOS[0].nav
  .flatMap((g) => g.items)
  .slice(0, 5)
  .map(({ id, label, icon }) => ({ id, label, icon }));

/** Faixa fina com quem está logado — e por qual instituição a RLS filtra. */
function BarraSessao({ sessao, aoSair }: { sessao: Identidade; aoSair: () => void }) {
  return (
    <div className="fixed right-3 top-3 z-50 flex items-center gap-3 rounded-lg border border-border bg-card/95 px-3 py-1.5 shadow-sm backdrop-blur">
      <div className="text-right leading-tight">
        <div className="text-[12px] font-medium text-foreground">{sessao.nome}</div>
        <div className="text-[10px] text-muted-foreground">{sessao.instituicao_nome}</div>
      </div>
      <button
        onClick={aoSair}
        title="Encerrar sessão"
        className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function App() {
  const [secao, setSecao] = useState('dashboard');
  const [sessao, setSessao] = useState<Identidade | null>(null);
  const [verificando, setVerificando] = useState(true);
  const [escuro, setEscuro] = useState(
    () => document.documentElement.classList.contains('dark'),
  );

  // Quem manda é o cookie no servidor, não o estado do React: recarregar a
  // página precisa reencontrar a sessão, e um cookie inválido precisa derrubar.
  useEffect(() => {
    fetch('/api/sessao')
      .then((r) => (r.ok ? r.json() : null))
      .then(setSessao)
      .catch(() => setSessao(null))
      .finally(() => setVerificando(false));
  }, []);

  const alternarTema = () => {
    const proximo = !escuro;
    setEscuro(proximo);
    document.documentElement.classList.toggle('dark', proximo);
    localStorage.setItem('theme', proximo ? 'dark' : 'light');
  };

  const sair = async () => {
    await fetch('/api/sessao/sair', { method: 'POST' });
    setSessao(null);
    setSecao('dashboard');
  };

  // Enquanto a sessão não foi verificada, não pisca nem login nem app.
  if (verificando) return <div className="min-h-screen bg-background" />;
  if (!sessao) return <Acesso aoEntrar={setSessao} />;

  return (
    <>
      <BarraSessao sessao={sessao} aoSair={sair} />
      <NexvyShell
        modules={MODULOS}
        activeModuleId="diariomonitor"
        onModuleChange={() => {}}
        activeSection={secao}
        onSectionChange={setSecao}
        isDark={escuro}
        onToggleTheme={alternarTema}
      />
      <NexvyMobileBottomNav
        items={ITENS_MOBILE}
        activeId={secao}
        onSelect={setSecao}
      />
    </>
  );
}
