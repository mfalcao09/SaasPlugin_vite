// ─────────────────────────────────────────────────────────────────────────────
// ProductContext — PRODUTO ATIVO GLOBAL do CRM da plataforma (D3 Fase F2)
//
// Model A (decisão travada Marcelo, 2026-07-06): existe UM "produto ativo" no
// escopo do Módulo Vendas. Um switcher no topo do CRM re-filtra TODAS as telas
// (Pipeline, Leads, Inbox, Agenda, Agentes, Captação, Relatórios) de uma vez.
// Substitui os `useState` locais de produto que ficavam dessincronizados por tela.
//
// Duas semânticas convivem:
//   • activeProductId  — a seleção crua. `null` = "Todos os produtos" (só faz
//     sentido para telas cross-produto: Leads, Agenda, Relatórios, Inbox).
//   • effectiveProductId — `activeProductId ?? products[0]?.id`. Para telas que
//     EXIGEM um produto concreto (Pipeline/Agentes/Captação — etapas e agentes
//     são por-produto). Espelha o fallback `?? products[0]?.id` que cada tela
//     fazia localmente (ex.: PlatformCrmKanban.tsx:59 da fonte pré-F2).
//
// Comportamento "1 produto → label travada" preservado: o switcher usa o mesmo
// PlatformCrmProductSelector (0 produtos → oculto; 1 → label estática; 2+ →
// dropdown com "Todos os produtos").
// ─────────────────────────────────────────────────────────────────────────────
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  usePlatformCrmProducts,
  type PlatformCrmProduct,
} from '@/components/superadmin/crm/data/usePlatformCrmProducts';
import { PlatformCrmProductSelector } from './PlatformCrmProductSelector';

export interface ActiveProductContextValue {
  /** Lista de produtos do CRM da plataforma (platform_crm_products). */
  products: PlatformCrmProduct[];
  isLoading: boolean;
  /** Seleção global crua. `null` = "Todos os produtos". */
  activeProductId: string | null;
  /** Troca o produto ativo global. `null` = "Todos". */
  setActiveProductId: (productId: string | null) => void;
  /** Produto ativo resolvido (objeto) ou `null` se "Todos"/sem produtos. */
  activeProduct: PlatformCrmProduct | null;
  /**
   * Id concreto para telas que EXIGEM um produto (Pipeline/Agentes/Captação):
   * `activeProductId ?? products[0]?.id ?? null`.
   */
  effectiveProductId: string | null;
  /** true quando há exatamente 1 produto (switcher vira label travada). */
  isSingleProduct: boolean;
}

const ActiveProductContext = createContext<ActiveProductContextValue | null>(null);

export function ActiveProductProvider({ children }: { children: ReactNode }) {
  const { data: products = [], isLoading } = usePlatformCrmProducts();

  // Seleção crua. Começa `null`; um efeito abaixo faz o default = 1º produto
  // assim que a lista carrega (Model A: sempre há UM produto ativo por padrão).
  const [activeProductId, setActiveProductIdState] = useState<string | null>(null);
  // Trava o default-automático assim que o usuário (ou o efeito) inicializa.
  // Sem isso, escolher "Todos" (null) seria imediatamente sobrescrito de volta
  // para o 1º produto pelo efeito de inicialização.
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && products.length > 0) {
      setActiveProductIdState(products[0].id);
      setInitialized(true);
    }
  }, [initialized, products]);

  const setActiveProductId = useCallback((productId: string | null) => {
    // Qualquer seleção explícita conta como inicialização (inclusive "Todos").
    setInitialized(true);
    setActiveProductIdState(productId);
  }, []);

  const value = useMemo<ActiveProductContextValue>(() => {
    const effectiveProductId = activeProductId ?? products[0]?.id ?? null;
    const activeProduct =
      products.find((p) => p.id === activeProductId) ?? null;
    return {
      products,
      isLoading,
      activeProductId,
      setActiveProductId,
      activeProduct,
      effectiveProductId,
      isSingleProduct: products.length === 1,
    };
  }, [products, isLoading, activeProductId, setActiveProductId]);

  return (
    <ActiveProductContext.Provider value={value}>
      {children}
    </ActiveProductContext.Provider>
  );
}

/**
 * Lê o produto ativo global. DEVE ser usado dentro de <ActiveProductProvider>
 * (montado no Módulo Vendas). Lança se usado fora — falha explícita > silêncio.
 */
export function useActiveProduct(): ActiveProductContextValue {
  const ctx = useContext(ActiveProductContext);
  if (!ctx) {
    throw new Error(
      'useActiveProduct() deve ser usado dentro de <ActiveProductProvider> (Módulo Vendas).',
    );
  }
  return ctx;
}

/**
 * Switcher GLOBAL de produto — a UI do "produto ativo" no topo do CRM.
 * Reusa o PlatformCrmProductSelector (0→oculto, 1→label travada, 2+→dropdown).
 * Conectado ao contexto: trocar aqui re-filtra todas as telas do Vendas.
 */
export function ActiveProductSwitcher() {
  const { products, activeProductId, setActiveProductId } = useActiveProduct();
  return (
    <PlatformCrmProductSelector
      products={products}
      selectedProductId={activeProductId}
      onChange={setActiveProductId}
    />
  );
}
