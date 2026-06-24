import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Link2, ShoppingBag, CircleDollarSign } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentAffiliate } from '@/hooks/useAffiliatePortal';
import { MyLinkSection } from './MyLinkSection';
import { MySalesSection } from './MySalesSection';
import { MyCommissionSection } from './MyCommissionSection';

type Section = 'link' | 'sales' | 'commission';

export default function AffiliatePortal() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { data: affiliate } = useCurrentAffiliate();
  const [section, setSection] = useState<Section>('link');

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold">Portal do Afiliado</h1>
            {affiliate && (
              <p className="text-sm text-muted-foreground">Olá, {affiliate.name}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="mr-1 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
          <TabsList className="mb-6">
            <TabsTrigger value="link" className="gap-1.5">
              <Link2 className="h-4 w-4" />
              Meu Link
            </TabsTrigger>
            <TabsTrigger value="sales" className="gap-1.5">
              <ShoppingBag className="h-4 w-4" />
              Minhas Vendas
            </TabsTrigger>
            <TabsTrigger value="commission" className="gap-1.5">
              <CircleDollarSign className="h-4 w-4" />
              Minha Comissão
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link">
            <MyLinkSection />
          </TabsContent>
          <TabsContent value="sales">
            <MySalesSection />
          </TabsContent>
          <TabsContent value="commission">
            <MyCommissionSection />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
