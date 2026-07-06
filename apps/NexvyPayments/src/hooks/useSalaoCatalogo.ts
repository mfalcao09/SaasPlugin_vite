// Catálogo do negócio pro inbox: o que o salão/espaço REALMENTE vende —
// Serviços (servico_catalogo) + Pacotes (view pacotes) + Produtos de revenda
// (products tipo=produto). Read-only, escopado por organization_id, só itens
// ativos. Substitui a leitura de product_catalog_items (catálogo de ofertas B2B
// do CRM, populado por Firecrawl — sempre vazio num salão). Normaliza as 3
// fontes num shape comum pra o CatalogPickerDialog enviar no chat.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'

export type SalaoCatalogKind = 'servico' | 'pacote' | 'produto'

export interface SalaoCatalogItem {
  /** chave estável (prefixada por tipo — id de tabelas diferentes pode colidir) */
  id: string
  kind: SalaoCatalogKind
  title: string
  price: number | null
  description: string | null
  /** linha extra de contexto (ex.: "30 min", "4 sessões · validade 90d", "Estoque: 5") */
  meta?: string
}

export function useSalaoCatalogo(enabled: boolean) {
  const { profile } = useAuth()
  const orgId = profile?.organization_id

  return useQuery({
    queryKey: ['salao-catalogo', orgId],
    enabled: !!orgId && enabled,
    queryFn: async (): Promise<SalaoCatalogItem[]> => {
      if (!orgId) return []

      const [serv, pac, prod] = await Promise.all([
        supabase.from('servico_catalogo')
          .select('id, nome, preco_base, descricao, duracao_minutos, ativo')
          .eq('organization_id', orgId).eq('ativo', true).order('nome'),
        supabase.from('pacotes')
          .select('id, nome, valor, descricao, total_sessoes, validade_dias, servicos_incluidos, ativo')
          .eq('organization_id', orgId).eq('ativo', true).order('nome'),
        supabase.from('products')
          .select('id, name, category, settings, status')
          .eq('organization_id', orgId).eq('tipo', 'produto').eq('status', 'published').order('name'),
      ])

      const items: SalaoCatalogItem[] = []

      for (const s of (serv.data ?? []) as any[]) {
        items.push({
          id: `servico:${s.id}`, kind: 'servico', title: s.nome,
          price: s.preco_base ?? null, description: s.descricao ?? null,
          meta: s.duracao_minutos ? `${s.duracao_minutos} min` : undefined,
        })
      }

      for (const p of (pac.data ?? []) as any[]) {
        const partes: string[] = []
        if (p.total_sessoes) partes.push(`${p.total_sessoes} sessões`)
        if (p.validade_dias) partes.push(`validade ${p.validade_dias}d`)
        const incl = Array.isArray(p.servicos_incluidos) && p.servicos_incluidos.length
          ? `Inclui: ${p.servicos_incluidos.join(', ')}` : null
        items.push({
          id: `pacote:${p.id}`, kind: 'pacote', title: p.nome,
          price: p.valor ?? null, description: p.descricao || incl,
          meta: partes.join(' · ') || undefined,
        })
      }

      for (const pr of (prod.data ?? []) as any[]) {
        const est = pr.settings?.estoque
        items.push({
          id: `produto:${pr.id}`, kind: 'produto', title: pr.name,
          price: pr.settings?.preco ?? null, description: pr.category ?? null,
          meta: est != null ? `Estoque: ${est}` : undefined,
        })
      }

      return items
    },
  })
}
