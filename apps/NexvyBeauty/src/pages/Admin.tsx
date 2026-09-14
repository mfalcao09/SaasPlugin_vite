import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * /admin foi dissolvido — Configurações viraram páginas no cockpit.
 * Esta rota existe só como compatibilidade de bookmarks/CTAs legados:
 * qualquer ?tab= redireciona; default → /empresa.
 *
 * IMPORTANTE: Integrações (catálogo Stripe/GPT/…) NÃO voltam aqui.
 * WhatsApp/canais → /conexoes. Nunca reintroduzir IntegrationsManager nesta rota.
 */
const LEGACY_ADMIN_TABS: Record<string, string> = {
  dashboard: '/painel',
  leads: '/leads',
  pipeline: '/pipeline',
  calendar: '/salao/agenda',
  inbox: '/conversas',
  agents: '/minha-ia',
  team: '/equipes',
  products: '/produtos',
  reports: '/relatorios',
  financial: '/faturamento',
  notifications: '/notificacoes',
  webhooks: '/webhooks',
  'custom-fields': '/campos-personalizados',
  // Catálogo de integrações de gestão: morto para o tenant.
  // Reconectar WhatsApp e bookmarks antigos caem em Conexões.
  integrations: '/conexoes',
  sectors: '/setores',
  plan: '/plano',
  payments: '/faturamento',
  connections: '/conexoes',
  tags: '/etiquetas',
  schedules: '/horarios',
  company: '/empresa',
  support: '/suporte',
  'quick-replies': '/respostas-rapidas',
  campaigns: '/minha-ia',
  cadences: '/minha-ia',
  'capture-chatbot': '/atrair',
  'capture-whatsapp': '/atrair',
  'capture-forms': '/atrair',
  'capture-widget': '/atrair',
  'capture-quiz': '/atrair',
  'capture-results': '/atrair',
  'capture-templates': '/atrair',
  'capture-analytics': '/relatorios-comerciais',
  'capture-reports': '/relatorios-comerciais',
};

export default function Admin() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? '';
  return <Navigate to={LEGACY_ADMIN_TABS[tab] ?? '/empresa'} replace />;
}

/** Prefetch no-op: AdminSidebar legado pode ainda importar; sem chunks a baixar. */
export function prefetchAdminSection(_id: string) {
  /* Admin dissolvido — nada a prefetchar. */
}
