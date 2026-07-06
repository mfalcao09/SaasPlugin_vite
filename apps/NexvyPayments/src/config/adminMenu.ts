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

// Admin DISSOLVIDO. Captação migrou para o cockpit (Atrair Clientes / Relatórios)
// e Configurações migraram para o cockpit (Gestão) como páginas individuais
// (/conexoes, /webhooks, /empresa, /plano, …). O menu do Admin fica vazio; a rota
// /admin redireciona (Admin.tsx: ?tab=<config> → rota nova, default → /empresa) e o
// item "Gestão & Ajustes" saiu do nav.tsx do cockpit.
export const menuGroups: AdminMenuGroup[] = [];

export const allMenuItems: AdminMenuItem[] = [
  ...fixedItems,
  ...menuGroups.flatMap((g) => g.items),
];

// Helper: encontra o id do grupo que contém a seção ativa (para abrir o accordion)
export function findGroupIdForSection(sectionId: string): string | undefined {
  return menuGroups.find((g) => g.items.some((i) => i.id === sectionId))?.id;
}
