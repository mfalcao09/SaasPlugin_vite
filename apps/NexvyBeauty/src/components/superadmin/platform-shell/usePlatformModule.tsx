import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  Layers,
  CreditCard,
  FileText,
  Banknote,
  Handshake,
  Smartphone,
  Plug,
  Palette,
  Mail,
  HelpCircle,
  LifeBuoy,
  Wrench,
  BarChart3,
  Sparkles,
  ScrollText,
  Activity,
  Target,
  KanbanSquare,
  Contact,
  CalendarDays,
  MessageSquare,
  LayoutPanelTop,
  Radar,
  Repeat,
  Webhook,
  Bot,
  Megaphone,
  Send,
  FileQuestion,
  FormInput,
  MessageCircle,
  MessagesSquare,
  MousePointerClick,
  MessageCircleMore,
  LayoutTemplate,
  Trophy,
  LineChart,
  Briefcase,
  DollarSign,
  Goal,
  Network,
  UsersRound,
  SlidersHorizontal,
  Tags,
  BellRing,
  Clock,
  Package,
  Phone,
  MapPinned,
  Receipt,
} from 'lucide-react';

// ─── Module IDs ─────────────────────────────────────────────
export type PlatformModuleId = 'erp' | 'vendas' | 'telefonia';

// ─── Nav item (uma entrada de menu dentro de um módulo) ─────
export interface PlatformNavItem {
  /** ID único da seção — usado como chave do estado do shell. */
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Componente renderizado no conteúdo quando a seção está ativa. */
  render: () => ReactNode;
}

// ─── Grupo colapsável de nav items ──────────────────────────
export interface PlatformNavGroup {
  /** ID do grupo (para persistir estado aberto/fechado). */
  id: string;
  /** Rótulo do grupo. `null` = itens de topo (sem cabeçalho colapsável). */
  label: string | null;
  items: PlatformNavItem[];
}

// ─── Definição de módulo (registry declarativo) ─────────────
export interface PlatformModuleDefinition {
  id: PlatformModuleId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  /** Classe tailwind de fundo do ícone no switcher. */
  color: string;
  /** NAV vive DENTRO da definição do módulo — sem switch gigante externo. */
  nav: PlatformNavGroup[];
}

// ─── Storage ────────────────────────────────────────────────
const STORAGE_KEY = 'nexvybeauty_platform_module';

function loadStoredModule(): PlatformModuleId | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'erp' || stored === 'vendas' || stored === 'telefonia') {
      return stored;
    }
  } catch {
    // localStorage indisponível
  }
  return null;
}

function saveModule(id: PlatformModuleId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage indisponível
  }
}

// ─── Context ────────────────────────────────────────────────
interface PlatformModuleContextValue {
  activeModule: PlatformModuleId;
  activeModuleDefinition: PlatformModuleDefinition;
  setActiveModule: (id: PlatformModuleId) => void;
  allModules: PlatformModuleDefinition[];
  /** Seção ativa dentro do módulo corrente. */
  activeSection: string;
  setActiveSection: (id: string) => void;
  /** Resolve o item de nav (label/render) da seção ativa. */
  activeNavItem: PlatformNavItem | undefined;
}

const PlatformModuleContext = createContext<PlatformModuleContextValue | null>(
  null,
);

// ─── Helpers ────────────────────────────────────────────────
function firstSectionOf(mod: PlatformModuleDefinition): string {
  for (const group of mod.nav) {
    if (group.items.length > 0) return group.items[0].id;
  }
  return '';
}

function findNavItem(
  mod: PlatformModuleDefinition,
  sectionId: string,
): PlatformNavItem | undefined {
  for (const group of mod.nav) {
    const found = group.items.find((it) => it.id === sectionId);
    if (found) return found;
  }
  return undefined;
}

// ─── Provider ───────────────────────────────────────────────
interface PlatformModuleProviderProps {
  children: ReactNode;
  /** Registry de módulos (injetado pela shell para evitar dep circular). */
  modules: PlatformModuleDefinition[];
  /** Módulo default ao abrir (regra: `erp`). */
  defaultModule?: PlatformModuleId;
}

export function PlatformModuleProvider({
  children,
  modules,
  defaultModule = 'erp',
}: PlatformModuleProviderProps) {
  const moduleMap = useMemo(() => {
    const m = new Map<PlatformModuleId, PlatformModuleDefinition>();
    modules.forEach((mod) => m.set(mod.id, mod));
    return m;
  }, [modules]);

  const [activeModule, setActiveModuleState] = useState<PlatformModuleId>(
    () => loadStoredModule() ?? defaultModule,
  );

  const activeModuleDefinition = useMemo(
    () => moduleMap.get(activeModule) ?? modules[0],
    [moduleMap, activeModule, modules],
  );

  const [activeSection, setActiveSection] = useState<string>(() =>
    firstSectionOf(moduleMap.get(activeModule) ?? modules[0]),
  );

  const setActiveModule = useCallback(
    (id: PlatformModuleId) => {
      setActiveModuleState(id);
      saveModule(id);
      // Ao trocar de módulo, cai na 1ª seção dele.
      const target = moduleMap.get(id);
      if (target) setActiveSection(firstSectionOf(target));
    },
    [moduleMap],
  );

  const activeNavItem = useMemo(
    () => findNavItem(activeModuleDefinition, activeSection),
    [activeModuleDefinition, activeSection],
  );

  const value = useMemo<PlatformModuleContextValue>(
    () => ({
      activeModule,
      activeModuleDefinition,
      setActiveModule,
      allModules: modules,
      activeSection,
      setActiveSection,
      activeNavItem,
    }),
    [
      activeModule,
      activeModuleDefinition,
      setActiveModule,
      modules,
      activeSection,
      activeNavItem,
    ],
  );

  return (
    <PlatformModuleContext.Provider value={value}>
      {children}
    </PlatformModuleContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────
export function usePlatformModule(): PlatformModuleContextValue {
  const ctx = useContext(PlatformModuleContext);
  if (!ctx) {
    throw new Error(
      'usePlatformModule deve ser usado dentro de <PlatformModuleProvider>',
    );
  }
  return ctx;
}

// ─── Ícones usados pelo registry ────────────────────────────
// Concentra os imports lucide num só lugar; o registry importa daqui.
export const PlatformIcons = {
  // módulos
  Target,
  Building2,
  // erp — topo
  LayoutDashboard,
  Users,
  // erp — comercial (SaaS)
  Layers,
  CreditCard,
  FileText,
  Banknote,
  // erp — crescimento
  Handshake,
  // erp — infra
  Smartphone,
  Plug,
  Palette,
  Mail,
  // erp — sistema
  HelpCircle,
  LifeBuoy,
  Wrench,
  BarChart3,
  Sparkles,
  ScrollText,
  Activity,
  // vendas — topo
  KanbanSquare,
  Contact,
  CalendarDays,
  // vendas — atendimentos
  MessageSquare,
  LayoutPanelTop,
  Radar,
  Repeat,
  // vendas — automação & ia
  Bot,
  Megaphone,
  Send,
  Webhook,
  // vendas — captação
  FileQuestion,
  FormInput,
  MessageCircle,
  MessagesSquare,
  MousePointerClick,
  MessageCircleMore,
  LayoutTemplate,
  Trophy,
  LineChart,
  // vendas — gestão de vendas
  Briefcase,
  Package,
  DollarSign,
  Goal,
  Network,
  UsersRound,
  // vendas — config de vendas
  SlidersHorizontal,
  Tags,
  BellRing,
  Clock,
  // telefonia
  Phone,
  MapPinned,
  Receipt,
} as const;
