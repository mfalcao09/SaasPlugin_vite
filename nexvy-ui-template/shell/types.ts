// ═══════════════════════════════════════════════════════════════════════════
// NEXVY UI TEMPLATE · shell/types.ts
// Contrato de navegação (registry) + util `cn`. Zero dependência de app/Supabase.
//
// Deps externas: react, clsx, tailwind-merge (só p/ o `cn`).
//   npm i clsx tailwind-merge
// Se preferir não trazê-las, troque `cn` por uma junção simples de strings.
// ═══════════════════════════════════════════════════════════════════════════
import type { ComponentType, ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge de classes tailwind (mesmo helper do NexvyBeauty: src/lib/utils.ts). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Ícone genérico — compatível com lucide-react (`{ className?: string }`). */
export type NexvyIcon = ComponentType<{ className?: string }>;

/** Uma entrada de menu (seção). O `render` é opcional: sem router, a shell
 *  só reporta `activeSection` via callback; com router, use-o para o conteúdo. */
export interface NexvyNavItem {
  /** ID único da seção — chave do estado ativo. */
  id: string;
  label: string;
  icon: NexvyIcon;
  /** Conteúdo a renderizar quando a seção está ativa (opcional). */
  render?: () => ReactNode;
  /** Badge numérico opcional (contador). */
  badge?: number;
}

/** Grupo de itens. `label: null` = itens de topo, SEM cabeçalho colapsável. */
export interface NexvyNavGroup {
  id: string;
  label: string | null;
  items: NexvyNavItem[];
}

/** Um módulo do produto (o registry passado por prop à shell). Em SaaS com um
 *  só módulo, passe um array de 1 — o switcher some automaticamente. */
export interface NexvyModule {
  id: string;
  label: string;
  description?: string;
  icon: NexvyIcon;
  /** Classe tailwind de fundo do ícone no switcher (ex.: 'bg-primary'). */
  color?: string;
  nav: NexvyNavGroup[];
}
