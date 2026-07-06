// ─── Hub de Módulos — definições (padrão Intentus, simplificado) ────
// Config-driven: cada card da home vem daqui. Ícone é o componente lucide
// direto (sem ICON_MAP de string). Visibilidade resolvida no ModuleHub.

import {
  Sparkles,
  TrendingUp,
  MessageSquare,
  Settings,
  Crown,
  type LucideIcon,
} from 'lucide-react';

export type ModuleId =
  | 'cobranca'
  | 'erp_salao' // legado do fork Beauty — remover na limpeza A1
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
  // Vertical de cobrança (NexvyPayments). Telas em pages/cobranca/* (greenfield, Fases A–E).
  {
    id: 'cobranca',
    label: 'Cobrança',
    icon: Sparkles,
    color: 'bg-blue-900',
    description: 'Pagadores, contratos, faturas, boleto+PIX e NFS-e',
    route: '/cobranca',
    visibility: 'all',
    onboardingHint: 'Cadastre pagadores e contratos para gerar faturas.',
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
export const PRODUCT_MODULES: ModuleId[] = ['cobranca', 'crm_vendas', 'atendimento'];
