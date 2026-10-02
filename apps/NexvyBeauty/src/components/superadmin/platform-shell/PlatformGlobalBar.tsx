import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';
import { TopBarActions } from '@/components/layout/TopBarActions';
import { OrganizationSelector } from '@/components/layout/OrganizationSelector';
import { isGestaoHostname } from '@/lib/publicUrl';
import { PlatformModuleSwitcher } from './PlatformModuleSwitcher';
import { PlatformProductSwitcher } from './PlatformProductSwitcher';

/** Contexto global do workspace; títulos e ações de cada tela ficam no conteúdo. */
export function PlatformGlobalBar({ mobileLeading }: { mobileLeading?: ReactNode }) {
  const showOrganizationSwitcher = !isGestaoHostname();

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border/80 bg-background/95 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] shadow-[0_4px_18px_-18px_hsl(var(--primary)/.5)] backdrop-blur-xl lg:left-[272px] lg:right-0 lg:z-30 lg:h-[68px] lg:px-6 lg:py-0">
      <div className="flex h-9 items-center justify-between gap-2 lg:h-full lg:gap-3">
        <div className="flex min-w-0 items-center gap-2 lg:flex-1 lg:gap-3">
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            {mobileLeading}
            <Logo size="sm" />
          </div>
          <div className="hidden min-w-0 items-center gap-3 lg:flex">
            <PlatformModuleSwitcher />
            <span aria-hidden="true" className="h-7 w-px bg-border" />
            <PlatformProductSwitcher compact />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 [&>button]:h-9 [&>button]:w-9 lg:gap-3 lg:[&>button]:h-10 lg:[&>button]:w-10">
          {showOrganizationSwitcher && <div className="hidden lg:block"><OrganizationSelector /></div>}
          <span aria-hidden="true" className="hidden h-7 w-px bg-border lg:block" />
          <TopBarActions />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-2 lg:hidden">
        <PlatformModuleSwitcher compact />
        <PlatformProductSwitcher compact />
      </div>
    </header>
  );
}
