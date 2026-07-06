// ─────────────────────────────────────────────────────────────────────────────
// PlatformCrmProductsSection — entrada do item `v-negocios` no registry (D3 1a)
// Navegação list ↔ detail (mesmo padrão do SuperAdmin da fonte, que alternava
// ProductListPage/ProductDetailPage por estado local).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { PlatformCrmProductListPage } from './PlatformCrmProductListPage';
import { PlatformCrmProductDetailPage } from './PlatformCrmProductDetailPage';

export function PlatformCrmProductsSection() {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  if (selectedProductId) {
    return (
      <PlatformCrmProductDetailPage
        productId={selectedProductId}
        onBack={() => setSelectedProductId(null)}
      />
    );
  }

  return <PlatformCrmProductListPage onProductSelect={setSelectedProductId} />;
}
