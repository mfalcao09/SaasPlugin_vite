import { useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  ListChecks,
  Send,
  Scale,
  Download,
  Settings,
} from 'lucide-react';
import { NexvyShell, NexvyMobileBottomNav, type NexvyModule } from './shell';
import { TelaFontes, TelaPublicacoes, TelaRevisao } from './pages/Telas';

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

export default function App() {
  const [secao, setSecao] = useState('dashboard');
  const [escuro, setEscuro] = useState(
    () => document.documentElement.classList.contains('dark'),
  );

  const alternarTema = () => {
    const proximo = !escuro;
    setEscuro(proximo);
    document.documentElement.classList.toggle('dark', proximo);
    localStorage.setItem('theme', proximo ? 'dark' : 'light');
  };

  return (
    <>
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
