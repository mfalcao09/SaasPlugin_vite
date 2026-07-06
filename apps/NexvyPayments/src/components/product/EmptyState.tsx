import { Clock, Settings, Package } from 'lucide-react';
import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/button';
import { usePlatformName } from '@/hooks/usePlatformName';
import { useAuth } from '@/hooks/useAuth';

// Casca visual comum às 3 variantes (ícone + logo + título + conteúdo).
function Shell({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
      <div className="relative mb-8">
        <div className="h-24 w-24 rounded-2xl bg-muted/50 flex items-center justify-center p-4">
          <Logo size="lg" showText={false} />
        </div>
        <div className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border-2 border-background">
          {icon}
        </div>
      </div>
      <h2 className="text-2xl font-semibold text-foreground mb-2 text-center">{title}</h2>
      {children}
    </div>
  );
}

export function EmptyState() {
  const { platformName } = usePlatformName();
  const { isAdmin, isSuperAdmin, profile } = useAuth();
  const navigate = useNavigate();
  const hasOrg = !!profile?.organization_id;

  // 1) Gestor (admin OU super admin) operando uma empresa, mas sem produtos:
  //    o caminho certo é cadastrar um produto na Administração — NÃO mandar
  //    pro painel da plataforma. O CRM de Vendas é organizado por produto.
  if (isAdmin() && hasOrg) {
    return (
      <Shell icon={<Package className="h-5 w-5 text-primary" />} title="Cadastre seu primeiro produto">
        <p className="text-base text-muted-foreground text-center mb-2">
          O CRM de Vendas é organizado por produto
        </p>
        <p className="text-muted-foreground text-center max-w-md mb-8 text-sm">
          Cadastre um produto (pacote, plano ou serviço) para liberar o pipeline,
          os leads e a IA de vendas desta empresa.
        </p>
        <Button onClick={() => navigate('/admin?tab=products')} className="gap-2">
          <Package className="h-4 w-4" />
          Ir para Produtos
        </Button>
      </Shell>
    );
  }

  // 2) Super admin SEM empresa ativa (gerenciando a plataforma): vai ao painel.
  if (isSuperAdmin()) {
    return (
      <Shell icon={<Settings className="h-5 w-5 text-primary" />} title="Configure sua plataforma">
        <p className="text-base text-muted-foreground text-center mb-2">
          Você é o Super Admin desta instalação
        </p>
        <p className="text-muted-foreground text-center max-w-md mb-8 text-sm">
          Crie uma organização e seus produtos no painel Super Admin para liberar o sistema.
        </p>
        <Button onClick={() => navigate('/super-admin')} className="gap-2">
          <Settings className="h-4 w-4" />
          Ir ao painel Super Admin
        </Button>
      </Shell>
    );
  }

  // 3) Vendedor sem produtos atribuídos: aguardar liberação do gestor.
  return (
    <Shell icon={<Clock className="h-5 w-5 text-primary" />} title={`Bem-vindo ao ${platformName}`}>
      <p className="text-base text-muted-foreground text-center mb-2">
        Você ainda não tem produtos atribuídos
      </p>
      <p className="text-muted-foreground text-center max-w-md mb-8 text-sm">
        Aguarde seu gestor liberar acesso aos produtos. Assim que isso acontecer,
        você verá aqui tudo o que precisa para vender.
      </p>
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 text-muted-foreground text-sm">
        <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        Aguardando liberação
      </div>
    </Shell>
  );
}
