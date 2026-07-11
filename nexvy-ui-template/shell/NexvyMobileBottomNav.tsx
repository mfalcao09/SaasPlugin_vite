// ═══════════════════════════════════════════════════════════════════════════
// NEXVY UI TEMPLATE · shell/NexvyMobileBottomNav.tsx
// SHELL MOBILE — bottom nav genericizado de src/components/layout/MobileBottomNav.tsx.
//
// REMOVIDO na genericização: framer-motion (→ transições CSS token-only),
// useHaptics e prefetchIndexTab (→ callback onSelect). Itens vêm por prop.
//
// DEPS EXTERNAS: react, lucide-react, tailwind (+ tokens/themes.css e o preset).
// Token-only (text-primary / bg-primary/10) → host-aware nos 4 temas.
// `safe-area-bottom` é aplicado via env() inline p/ ser self-contained.
// ═══════════════════════════════════════════════════════════════════════════
import type { NexvyIcon } from './types';
import { cn } from './types';

export interface NexvyBottomNavItem {
  id: string;
  label: string;
  icon: NexvyIcon;
}

export interface NexvyMobileBottomNavProps {
  items: NexvyBottomNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  /** IDs extras que acendem o item "Mais" quando ativos (opcional). */
  moreActiveWhen?: string[];
}

export function NexvyMobileBottomNav({
  items,
  activeId,
  onSelect,
  moreActiveWhen = [],
}: NexvyMobileBottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex h-16 items-center justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeId === item.id ||
            (item.id === 'more' && moreActiveWhen.includes(activeId));
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                'relative flex min-w-[56px] flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 transition-all duration-200 active:scale-90',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {/* Pílula do item ativo (token-only). */}
              {isActive && (
                <span className="absolute inset-0 rounded-xl bg-primary/10" aria-hidden />
              )}
              <span className="relative z-10">
                <Icon
                  className={cn(
                    'h-[22px] w-[22px] transition-transform duration-200',
                    isActive && 'scale-110',
                  )}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </span>
              <span
                className={cn(
                  'relative z-10 text-[10px] leading-none transition-all duration-200',
                  isActive ? 'font-semibold' : 'font-medium',
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default NexvyMobileBottomNav;
