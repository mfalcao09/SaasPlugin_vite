// ─────────────────────────────────────────────────────────────────────────────
// PlatformProductContext — seletor GLOBAL de produto do painel da plataforma (A1.3)
// Estado: activeProductId (null = "Todos os produtos", o default). Persiste em
// localStorage (`platform.activeProductId`). Fonte da lista = hook COMPARTILHADO
// `usePlatformCrmProducts` (platform_crm_products) — só IMPORTADO/lido aqui.
// Filtra Vendas + ERP: cada tela permitida consome `useActivePlatformProduct()`.
// Contrato: com activeProductId = null a UI é IDÊNTICA ao comportamento atual.
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

const STORAGE_KEY = 'platform.activeProductId';

export interface PlatformProductContextValue {
  /** null = "Todos os produtos" (default). */
  activeProductId: string | null;
  setActiveProductId: (id: string | null) => void;
  /** Catálogo de produtos (platform_crm_products) — fonte: usePlatformCrmProducts. */
  products: PlatformCrmProduct[];
  isLoading: boolean;
  /** Produto ativo resolvido (ou null quando "Todos"). */
  activeProduct: PlatformCrmProduct | null;
}

const PlatformProductContext = createContext<PlatformProductContextValue | null>(null);

// Fallback seguro quando o hook roda fora do provider: mantém o comportamento
// atual (activeProductId = null → nenhum filtro). O filtro é ADITIVO — nunca
// deve quebrar uma tela que porventura renderize fora da shell.
const SAFE_DEFAULT: PlatformProductContextValue = {
  activeProductId: null,
  setActiveProductId: () => {},
  products: [],
  isLoading: false,
  activeProduct: null,
};

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function PlatformProductProvider({ children }: { children: ReactNode }) {
  const { data: products = [], isLoading } = usePlatformCrmProducts();
  const [activeProductId, setActiveProductIdState] = useState<string | null>(() =>
    readStored(),
  );

  const setActiveProductId = useCallback((id: string | null) => {
    setActiveProductIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage indisponível — mantém apenas em memória.
    }
  }, []);

  // Reconciliação: se o id persistido não existe mais no catálogo (produto
  // removido), volta para "Todos" — evita filtro-fantasma que esconde tudo.
  // Guarda em !isLoading + length > 0 para não resetar durante o carregamento.
  useEffect(() => {
    if (
      !isLoading &&
      products.length > 0 &&
      activeProductId &&
      !products.some((p) => p.id === activeProductId)
    ) {
      setActiveProductId(null);
    }
  }, [isLoading, products, activeProductId, setActiveProductId]);

  const activeProduct = useMemo(
    () => products.find((p) => p.id === activeProductId) ?? null,
    [products, activeProductId],
  );

  const value = useMemo<PlatformProductContextValue>(
    () => ({ activeProductId, setActiveProductId, products, isLoading, activeProduct }),
    [activeProductId, setActiveProductId, products, isLoading, activeProduct],
  );

  return (
    <PlatformProductContext.Provider value={value}>
      {children}
    </PlatformProductContext.Provider>
  );
}

/**
 * Hook do seletor GLOBAL de produto. Fora do provider, devolve o SAFE_DEFAULT
 * (activeProductId = null) — o filtro é aditivo e nunca quebra a tela.
 */
export function useActivePlatformProduct(): PlatformProductContextValue {
  return useContext(PlatformProductContext) ?? SAFE_DEFAULT;
}
