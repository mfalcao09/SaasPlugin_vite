// Produtos & Serviços — movido do admin para a seção Gestão do cockpit. Mantém o
// fluxo master/detail do admin (lista → detalhe) com estado local, reusando os
// mesmos ProductListPage/ProductDetailPage (escopados por org).
import { useState } from 'react'
import { ProductListPage } from '@/components/admin/products/ProductListPage'
import { ProductDetailPage } from '@/components/admin/products/ProductDetailPage'

export default function Produtos() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  return (
    <div className="p-6">
      {selectedId ? (
        <ProductDetailPage productId={selectedId} onBack={() => setSelectedId(null)} />
      ) : (
        <ProductListPage onProductSelect={setSelectedId} />
      )}
    </div>
  )
}
