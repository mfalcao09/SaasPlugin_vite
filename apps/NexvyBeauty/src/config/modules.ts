// ─── Hub de Módulos — definições (padrão Intentus, simplificado) ────
// Config-driven: cada card da home vem daqui. Ícone é o componente lucide
// direto (sem ICON_MAP de string). Visibilidade resolvida no ModuleHub.

import {
  Scissors,
  TrendingUp,
  MessageSquare,
  Settings,
  Crown,
  type LucideIcon,
} from 'lucide-react';

export type ModuleId =
  | 'erp_salao'
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
  /** Dica curta exibida no onboarding guiado (opcional). */
  onboardingHint?: string;
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  // Vertical de salão (NexvyBeauty). Substitui o erp_oficina (ocultado;
  // rotas /oficina seguem dormentes). Telas em pages/salao/*.
  {
    id: 'erp_salao',
    label: 'Gestão do Salão',
    icon: Scissors,
    color: 'bg-pink-500',
    description: 'Agenda, profissionais, serviços, clientes e financeiro',
    route: '/salao',
    visibility: 'all',
    onboardingHint: 'Cadastre os serviços e profissionais do seu salão.',
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
    onboardingHint: 'Conecte um número de WhatsApp ao seu inbox.',
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

/**
 * Módulos de PRODUTO sempre ativos no NexvyBeauty (sem seleção no onboarding).
 * Os planos diferenciam por QUANTITATIVO (instâncias WhatsApp, usuários,
 * agentes de IA) + concessão de acessos — não por liga/desliga de módulo.
 */
export const PRODUCT_MODULES: ModuleId[] = ['erp_salao', 'crm_vendas', 'atendimento'];
