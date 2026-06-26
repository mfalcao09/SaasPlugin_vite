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
    id: 'automation',
    label: 'Automação & IA',
    icon: Sparkles,
    items: [
      // Agentes/Campanhas/Cadências migraram para o cockpit (Gestão → Minha IA).
      { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    ],
  },
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
      { id: 'capture-templates', label: 'Templates', icon: LayoutGrid },
      { id: 'capture-results', label: 'Resultados', icon: Target },
      { id: 'capture-analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    id: 'management',
    label: 'Gestão',
    icon: Briefcase,
    items: [
      { id: 'products', label: 'Produtos', icon: Package },
      { id: 'sectors', label: 'Setores', icon: SlidersHorizontal },
      { id: 'team', label: 'Equipes', icon: Users },
      { id: 'reports', label: 'Relatórios', icon: BarChart3 },
      { id: 'financial', label: 'Financeiro', icon: DollarSign },
      { id: 'payments', label: 'Pagamentos', icon: Banknote },
    ],
  },
  {
    id: 'settings',
    label: 'Configurações',
    icon: Settings,
    items: [
      { id: 'connections', label: 'Conexões', icon: Plug },
      { id: 'integrations', label: 'Integrações', icon: Settings },
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
