// ─── Hub de Módulos — definições (padrão Intentus, simplificado) ────
// Config-driven: cada card da home vem daqui. Ícone é o componente lucide
// direto (sem ICON_MAP de string). Visibilidade resolvida no ModuleHub.

import {
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
  /** Dica curta exibida no onboarding guiado (opcional). */
  onboardingHint?: string;
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  // NOTA: módulo `erp_oficina` ocultado no NexvyBeauty (fundação do
  // cascateamento). O vertical de salão (`erp_salao`: Profissionais,
  // Serviços, Agenda, Comandas) é construído no Bloco 2 e substitui esta
  // entrada. As rotas /oficina seguem registradas (dormentes) até lá.
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
