// ─────────────────────────────────────────────────────────────────────────────
// PlatformCrmProductDetailPage — HUB DO PRODUTO com 14 ABAS (D3 Fase 1a)
// Porte de `.vendus-src-reference/src/components/admin/products/ProductDetailPage.tsx`
// A casca da fonte ligava 7 abas; aqui estão as 14 COMPLETAS (decisão do Marcelo),
// cobrindo todos os 24 arquivos-fonte de admin/products/ (tabs/ + catalog/ + chat/):
// Dashboard · Configurações · Cérebro · Agentes · Funil · Objeções · Cadência ·
// Pós-venda · Playbook · Materiais · Catálogo · Chat · Equipe · Relatórios
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { usePlatformCrmProduct } from '@/components/superadmin/crm/data/usePlatformCrmProducts';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ArrowLeft, Package, Settings, MessageSquare, Calendar, BookOpen,
  FileText, Brain, Zap, Bot, LayoutDashboard, Columns3, MessagesSquare,
  Users, BarChart3,
} from 'lucide-react';

// Tab Components (14 abas)
import { DashboardTab } from './tabs/DashboardTab';
import { SettingsTab } from './tabs/SettingsTab';
import { BrainTab } from './tabs/BrainTab';
import { AgentsTab } from './tabs/AgentsTab';
import { KanbanTab } from './tabs/KanbanTab';
import { ObjectionsTab } from './tabs/ObjectionsTab';
import { CadenceTab } from './tabs/CadenceTab';
import { PostSaleTab } from './tabs/PostSaleTab';
import { PlaybookTab } from './tabs/PlaybookTab';
import { MaterialsTab } from './tabs/MaterialsTab';
import { CatalogManager } from './tabs/catalog/CatalogManager';
import { ChatTab } from './tabs/chat/ChatTab';
import { SquadTab } from './tabs/SquadTab';
import { ReportsTab } from './tabs/ReportsTab';

interface PlatformCrmProductDetailPageProps {
  productId: string;
  onBack: () => void;
}

const statusOptions = [
  { value: 'draft', label: 'Rascunho', color: 'bg-muted text-muted-foreground' },
  { value: 'review', label: 'Em Revisão', color: 'bg-warning/10 text-warning' },
  { value: 'published', label: 'Publicado', color: 'bg-success/10 text-success' },
];

const productTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'settings', label: 'Configurações', icon: Settings },
  { id: 'brain', label: 'Cérebro', icon: Brain },
  { id: 'agents', label: 'Agentes', icon: Bot },
  { id: 'kanban', label: 'Funil', icon: Columns3 },
  { id: 'objections', label: 'Objeções', icon: MessageSquare },
  { id: 'cadence', label: 'Cadência', icon: Calendar },
  { id: 'postsale', label: 'Pós-venda', icon: Zap },
  { id: 'playbook', label: 'Playbook', icon: BookOpen },
  { id: 'materials', label: 'Materiais', icon: FileText },
  { id: 'catalog', label: 'Catálogo', icon: Package },
  { id: 'chat', label: 'Chat', icon: MessagesSquare },
  { id: 'squad', label: 'Equipe', icon: Users },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
];

export function PlatformCrmProductDetailPage({ productId, onBack }: PlatformCrmProductDetailPageProps) {
  const { data: product, isLoading } = usePlatformCrmProduct(productId);
  const [activeTab, setActiveTab] = useState('dashboard');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-1">Produto não encontrado</h3>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
    );
  }

  const status = statusOptions.find(s => s.value === product.status) || statusOptions[0];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab productId={productId} />;
      case 'settings':
        return <SettingsTab productId={productId} />;
      case 'brain':
        return <BrainTab productId={productId} />;
      case 'agents':
        return <AgentsTab productId={productId} />;
      case 'kanban':
        return <KanbanTab productId={productId} />;
      case 'objections':
        return <ObjectionsTab productId={productId} />;
      case 'cadence':
        return <CadenceTab productId={productId} />;
      case 'postsale':
        return <PostSaleTab productId={productId} />;
      case 'playbook':
        return <PlaybookTab productId={productId} />;
      case 'materials':
        return <MaterialsTab productId={productId} />;
      case 'catalog':
        return <CatalogManager productId={productId} />;
      case 'chat':
        return <ChatTab productId={productId} />;
      case 'squad':
        return <SquadTab productId={productId} />;
      case 'reports':
        return <ReportsTab productId={productId} />;
      default:
        return <DashboardTab productId={productId} />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              {product.logo_url ? (
                <img
                  src={product.logo_url}
                  alt={product.name}
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <Package className="h-6 w-6 text-primary" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">{product.name}</h1>
                <Badge variant="outline" className={status.color}>
                  {status.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {product.short_description || product.description?.slice(0, 60) || 'Sem descrição'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto hide-scrollbar h-auto p-1 bg-muted/50 flex-wrap sm:flex-nowrap">
          {productTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 data-[state=active]:bg-background whitespace-nowrap"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab Content */}
        <div className="mt-6">
          {renderTabContent()}
        </div>
      </Tabs>
    </div>
  );
}
