// ═══════════════════════════════════════════════════════════════════════════
// NEXVY UI TEMPLATE · shell/EXAMPLE.tsx
// Uso MÍNIMO da shell — 1 módulo, registry de 3 itens de menu. Cole num SaaS
// novo (App.tsx) depois de: (1) importar tokens/themes.css, (2) aplicar o preset
// Tailwind, (3) aplicar a classe de tema no <html> (ver README §"Como aplicar").
//
// Este arquivo é DEMONSTRATIVO (não é importado pelo barrel). Deps: react,
// lucide-react. NÃO precisa de router/Supabase — o estado é useState local.
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { LayoutDashboard, Users, Settings, Package, LogOut } from 'lucide-react';
import { NexvyShell, NexvyMobileBottomNav, type NexvyModule } from './index';

// ─── Registry de exemplo: 1 módulo, 3 itens de menu (1 grupo colapsável) ─────
const MODULES: NexvyModule[] = [
  {
    id: 'app',
    label: 'Meu SaaS',
    description: 'Painel principal',
    icon: Package,
    color: 'bg-primary',
    nav: [
      // grupo de topo (label: null) — itens diretos, sem cabeçalho
      {
        id: 'top',
        label: null,
        items: [
          { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard, render: () => <DemoPage title="Visão Geral" /> },
          { id: 'clientes', label: 'Clientes', icon: Users, badge: 3, render: () => <DemoPage title="Clientes" /> },
        ],
      },
      // grupo colapsável
      {
        id: 'config',
        label: 'Configuração',
        items: [
          { id: 'ajustes', label: 'Ajustes', icon: Settings, render: () => <DemoPage title="Ajustes" /> },
        ],
      },
    ],
  },
];

function DemoPage({ title }: { title: string }) {
  return (
    <div className="surface-card p-6">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Conteúdo da seção. Tudo token-only → troca de tema é só a classe no &lt;html&gt;.
      </p>
    </div>
  );
}

export default function ExampleApp() {
  const [moduleId, setModuleId] = useState('app');
  const [section, setSection] = useState('dashboard');
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    setDark((v) => {
      document.documentElement.classList.toggle('dark', !v);
      return !v;
    });
  };

  return (
    <>
      {/* Desktop colapsável */}
      <NexvyShell
        modules={MODULES}
        activeModuleId={moduleId}
        onModuleChange={setModuleId}
        activeSection={section}
        onSectionChange={setSection}
        isDark={dark}
        onToggleTheme={toggleTheme}
        footerActions={
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        }
      />

      {/* Mobile bottom nav (mesma fonte de verdade de seção) */}
      <NexvyMobileBottomNav
        items={[
          { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
          { id: 'clientes', label: 'Clientes', icon: Users },
          { id: 'ajustes', label: 'Ajustes', icon: Settings },
        ]}
        activeId={section}
        onSelect={setSection}
      />
    </>
  );
}
