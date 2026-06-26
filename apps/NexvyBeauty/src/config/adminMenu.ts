import {
  LayoutDashboard,
  Package,
  Users,
  TrendingUp,
  DollarSign,
  Target,
  Settings,
  Bell,
  LayoutGrid,
  MessageSquare,
  MessageCircle,
  BarChart3,
  CalendarDays,
  Zap,
  Webhook,
  FileText,
  Bot,
  Building2,
  Plug,
  Tag,
  Clock,
  CreditCard,
  LifeBuoy,
  Sparkles,
  SlidersHorizontal,
  Briefcase,
  Banknote,
  Megaphone,
  Code2,
  ListChecks,
  Filter,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface AdminMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export interface AdminMenuGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: AdminMenuItem[];
}

// Itens fixos (sempre visíveis, sem accordion).
// Dashboard/Atendimentos/Pipeline/Leads migraram para o cockpit (Comercial):
// Painel (absorveu a Central de Operação), Conversas, Pipeline, Leads.
// O admin agora é só configuração/gestão; ?tab= antigos redirecionam (Admin.tsx).
// Agenda também migrou (redireciona p/ /salao/agenda). Admin = só config/gestão.
export const fixedItems: AdminMenuItem[] = [];

// Grupos em accordion
export const menuGroups: AdminMenuGroup[] = [
  {
    id: 'capture-channels',
    label: 'Captação',
    icon: Filter,
    items: [
      { id: 'capture-quiz', label: 'Quiz', icon: ListChecks },
      { id: 'capture-forms', label: 'Formulários', icon: FileText },
      { id: 'capture-chatbot', label: 'ChatBot', icon: MessageCircle },
      { id: 'capture-widget', label: 'Widget', icon: Code2 },
      { id: 'capture-whatsapp', label: 'WhatsApp', icon: MessageSquare },
      // Templates migraram p/ o cockpit (Atrair Clientes > Quiz > Templates Quizzes).
      { id: 'capture-results', label: 'Resultados', icon: Target },
      { id: 'capture-analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  // Grupo 'Gestão' migrou para o cockpit (seção Gestão): Produtos/Setores/Equipes.
  // Relatórios/Financeiro (deal/afiliado) → SuperAdmin > Afiliados (removidos do tenant).
  // Pagamentos → Meu Salão > Financeiro (aba). Tudo redireciona via Admin.tsx.
  {
    id: 'settings',
    label: 'Configurações',
    icon: Settings,
    items: [
      { id: 'connections', label: 'Conexões', icon: Plug },
      { id: 'webhooks', label: 'Webhooks', icon: Webhook },
      // Integrações migrou para o SuperAdmin (config central da plataforma).
      { id: 'quick-replies', label: 'Respostas Rápidas', icon: MessageSquare },
      { id: 'custom-fields', label: 'Campos personalizados', icon: FileText },
      { id: 'tags', label: 'Etiquetas', icon: Tag },
      { id: 'notifications', label: 'Notificações', icon: Bell },
      { id: 'schedules', label: 'Horários', icon: Clock },
      { id: 'company', label: 'Empresa', icon: Building2 },
      { id: 'plan', label: 'Plano', icon: CreditCard },
      { id: 'support', label: 'Suporte', icon: LifeBuoy },
    ],
  },
];

export const allMenuItems: AdminMenuItem[] = [
  ...fixedItems,
  ...menuGroups.flatMap((g) => g.items),
];

// Helper: encontra o id do grupo que contém a seção ativa (para abrir o accordion)
export function findGroupIdForSection(sectionId: string): string | undefined {
  return menuGroups.find((g) => g.items.some((i) => i.id === sectionId))?.id;
}
