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
    <>
      <header className="fixed left-[272px] right-0 top-0 z-30 hidden h-[68px] items-center justify-between border-b border-border/80 bg-background/95 px-6 shadow-[0_4px_18px_-18px_hsl(var(--primary)/.5)] backdrop-blur-xl lg:flex">
        <div className="flex min-w-0 items-center gap-3">
          <PlatformModuleSwitcher />
          <span aria-hidden="true" className="h-7 w-px bg-border" />
          <PlatformProductSwitcher compact />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {showOrganizationSwitcher && <OrganizationSelector />}
          <span aria-hidden="true" className="h-7 w-px bg-border" />
          <TopBarActions />
        </div>
      </header>

      <header className="fixed inset-x-0 top-0 z-40 border-b border-border/80 bg-background/95 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] shadow-[0_4px_18px_-18px_hsl(var(--primary)/.5)] backdrop-blur-xl lg:hidden">
        <div className="flex h-9 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {mobileLeading}
            <Logo size="sm" />
          </div>
          <div className="flex shrink-0 items-center gap-0.5 [&>button]:h-9 [&>button]:w-9">
            <TopBarActions />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)] gap-2">
          <PlatformModuleSwitcher compact />
          <PlatformProductSwitcher compact />
        </div>
      </header>
    </>
  );
}
