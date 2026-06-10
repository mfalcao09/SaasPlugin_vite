// ─── Hub de Módulos — definições (padrão Intentus, simplificado) ────
// Config-driven: cada card da home vem daqui. Ícone é o componente lucide
// direto (sem ICON_MAP de string). Visibilidade resolvida no ModuleHub.

import {
  Wrench,
  TrendingUp,
  MessageSquare,
  Settings,
  Crown,
  type LucideIcon,
} from 'lucide-react';

export type ModuleId =
  | 'erp_oficina'
  | 'crm_vendas'
  | 'atendimento'
  | 'administracao'
  | 'gestao_plataforma';

export type ModuleVisibility = 'all' | 'admin' | 'super_admin';

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
  color: string; // tailwind bg class do tile do ícone
  description: string;
  route: string;
  visibility: ModuleVisibility;
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    id: 'erp_oficina',
    label: 'ERP Oficina',
    icon: Wrench,
    color: 'bg-orange-500',
    description: 'Clientes, veículos, ordens de serviço, orçamentos e financeiro',
    route: '/oficina',
    visibility: 'all',
  },
  {
    id: 'crm_vendas',
    label: 'CRM de Vendas',
    icon: TrendingUp,
    color: 'bg-blue-500',
    description: 'Pipeline, leads, playbooks e IA de vendas',
    route: '/crm',
    visibility: 'all',
  },
  {
    id: 'atendimento',
    label: 'Atendimento',
    icon: MessageSquare,
    color: 'bg-emerald-500',
    description: 'Inbox WhatsApp e webchat',
    route: '/admin?tab=inbox',
    visibility: 'admin',
  },
  {
    id: 'administracao',
    label: 'Administração',
    icon: Settings,
    color: 'bg-slate-500',
    description: 'Equipe, produtos, integrações e configurações',
    route: '/admin',
    visibility: 'admin',
  },
  {
    id: 'gestao_plataforma',
    label: 'Gestão da Plataforma',
    icon: Crown,
    color: 'bg-amber-500',
    description: 'Organizações, planos e billing da plataforma',
    route: '/super-admin',
    visibility: 'super_admin',
  },
];
