import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UserPlus, X, Upload, Package } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { usePlatformCrmSectors } from '@/components/superadmin/crm/data/usePlatformCrmSectors';
import { usePlatformCrmSquads } from '@/components/superadmin/crm/data/usePlatformCrmSquads';
import {
  useCreatePlatformCrmTeamMember,
  type CreatePlatformCrmTeamMemberInput,
} from '@/components/superadmin/crm/data/usePlatformCrmTeam';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface PlatformCrmUserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GeneralForm {
  full_name: string;
  email: string;
  password: string;
  role: AppRole;
  recovery_whatsapp: string;
  squad_id: string; // '' = nenhum
  monthly_goal: string; // string no input; convertido no submit
  avatar_url: string;
}

const DEFAULT_GENERAL: GeneralForm = {
  full_name: '',
  email: '',
  password: '',
  role: 'seller',
  recovery_whatsapp: '',
  squad_id: '',
  monthly_goal: '',
  avatar_url: '',
};

/**
 * Dialog "Adicionar Usuário" do CRM de PLATAFORMA (super_admin) — port da
 * `UserFormDialog` do CRM Vendus V5 (abas Geral / Permissões / Notificações),
 * porém PRODUCT-SCOPED e SEM organization_id.
 *
 * Adaptações em relação ao original (documentadas para revisão):
 *  - PRODUCT-AWARE: usa `useActivePlatformProduct()`. O usuário é criado e
 *    atribuído ao produto ativo (effectiveProductId) via
 *    `platform_crm_user_product_assignments`. Em "Todos os produtos" sem catálogo,
 *    o botão de submit fica bloqueado (não há produto concreto para vincular).
 *  - "Conexão padrão (WhatsApp)" do tenant → substituída por "Squad" (membership
 *    nativa da plataforma: `platform_crm_squad_members`).
 *  - "Setores" lê de `platform_crm_sectors` (via usePlatformCrmSectors), não da
 *    tabela `sectors` do tenant.
 *  - Perfil: enum app_role completo (seller/manager/admin/super_admin).
 *  - Abas Permissões/Notificações: informativas (a plataforma não tem tabela de
 *    permissões/notificações por-usuário no schema platform_crm_*; ver TODO).
 *  - CREATE-only: a edição de papel já é feita pelo dialog próprio do
 *    PlatformCrmTeamManager. Aqui só criamos.
 *
 * ⚠️ A criação depende da edge `create-platform-team-member` (server-side), que
 * AINDA NÃO EXISTE — ver JSDoc de `useCreatePlatformCrmTeamMember`. Enquanto não
 * for deployada, o submit retorna erro visível (sem fallback silencioso).
 */
export function PlatformCrmUserFormDialog({
  open,
  onOpenChange,
}: PlatformCrmUserFormDialogProps) {
  const { activeProduct, effectiveProductId, products } = useActivePlatformProduct();
  const { data: sectors = [] } = usePlatformCrmSectors();
  const { data: squads = [] } = usePlatformCrmSquads();
  const createMember = useCreatePlatformCrmTeamMember();

  const [tab, setTab] = useState('general');
  const [general, setGeneral] = useState<GeneralForm>(DEFAULT_GENERAL);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Reset ao (re)abrir
  useEffect(() => {
    if (!open) return;
    setGeneral(DEFAULT_GENERAL);
    setSectorIds([]);
    setTab('general');
  }, [open]);

  const sectorBadges = useMemo(
    () => sectors.filter((s) => sectorIds.includes(s.id)),
    [sectors, sectorIds],
  );
  const availableSectors = useMemo(
    () => sectors.filter((s) => !sectorIds.includes(s.id)),
    [sectors, sectorIds],
  );

  const updateGeneral = <K extends keyof GeneralForm>(k: K, v: GeneralForm[K]) =>
    setGeneral((g) => ({ ...g, [k]: v }));

  const handleAvatarUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `platform/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      updateGeneral('avatar_url', data.publicUrl);
      toast.success('Avatar enviado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro no upload do avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!general.full_name.trim()) return toast.error('Informe o nome');
    if (!general.email.trim()) return toast.error('Informe o email');
    if (!general.password || general.password.length < 6)
      return toast.error('Senha mínima de 6 caracteres');
    if (!effectiveProductId) {
      return toast.error(
        'Nenhum produto disponível para vincular. Crie um produto antes de adicionar usuários.',
      );
    }

    const goalNum = general.monthly_goal.trim()
      ? Number(general.monthly_goal.replace(',', '.'))
      : null;
    if (goalNum !== null && Number.isNaN(goalNum)) {
      return toast.error('Meta mensal inválida');
    }

    // Senha vai no body para a edge server-side; NUNCA é logada (Seção 11).
    const payload: CreatePlatformCrmTeamMemberInput = {
      email: general.email.trim(),
      password: general.password,
      full_name: general.full_name.trim(),
      role: general.role,
      recovery_whatsapp: general.recovery_whatsapp.trim() || undefined,
      product_id: effectiveProductId,
      monthly_goal: goalNum,
      sector_ids: sectorIds,
      squad_id: general.squad_id || null,
      avatar_url: general.avatar_url || null,
    };

    try {
      await createMember.mutateAsync(payload);
      toast.success('Usuário criado com sucesso!');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar usuário');
    }
  };

  const submitting = createMember.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Adicionar Usuário
          </DialogTitle>
        </DialogHeader>

        {/* Contexto de produto (product-aware) */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <Package className="h-4 w-4 text-primary shrink-0" />
          {effectiveProductId ? (
            <span className="text-muted-foreground">
              Vinculado ao produto{' '}
              <strong className="text-foreground">
                {activeProduct?.name ??
                  products.find((p) => p.id === effectiveProductId)?.name ??
                  '—'}
              </strong>
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              Nenhum produto disponível — crie um produto antes de adicionar usuários.
            </span>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="general">Geral</TabsTrigger>
            <TabsTrigger value="permissions">Permissões</TabsTrigger>
            <TabsTrigger value="notifications">Notificações</TabsTrigger>
          </TabsList>

          {/* ============== GERAL ============== */}
          <TabsContent value="general" className="space-y-4 pt-5">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <Avatar className="h-20 w-20">
                <AvatarImage src={general.avatar_url} />
                <AvatarFallback className="text-xl bg-primary/10 text-primary">
                  {general.full_name?.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])}
                />
                <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
                  <span>
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Enviar avatar
                  </span>
                </Button>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pcrm-name">Nome *</Label>
                <Input
                  id="pcrm-name"
                  value={general.full_name}
                  onChange={(e) => updateGeneral('full_name', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pcrm-role">Perfil *</Label>
                <Select
                  value={general.role}
                  onValueChange={(v: AppRole) => updateGeneral('role', v)}
                >
                  <SelectTrigger id="pcrm-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seller">Vendedor</SelectItem>
                    <SelectItem value="manager">Gestor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pcrm-email">Email *</Label>
                <Input
                  id="pcrm-email"
                  type="email"
                  value={general.email}
                  onChange={(e) => updateGeneral('email', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pcrm-pwd">Senha *</Label>
                <Input
                  id="pcrm-pwd"
                  type="password"
                  value={general.password}
                  onChange={(e) => updateGeneral('password', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pcrm-wpp">
                WhatsApp para Recuperação (Ex: 5511999999999)
              </Label>
              <Input
                id="pcrm-wpp"
                value={general.recovery_whatsapp}
                onChange={(e) => updateGeneral('recovery_whatsapp', e.target.value)}
              />
            </div>

            {/* Setores (platform_crm_sectors) */}
            <div className="space-y-1.5">
              <Label>Setores</Label>
              {sectorBadges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-muted/30">
                  {sectorBadges.map((s) => (
                    <Badge key={s.id} variant="secondary" className="gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: s.color || '#999' }}
                      />
                      {s.name}
                      <button
                        type="button"
                        onClick={() => setSectorIds(sectorIds.filter((id) => id !== s.id))}
                        className="hover:bg-background rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {availableSectors.length > 0 && (
                <Select value="" onValueChange={(v) => v && setSectorIds([...sectorIds, v])}>
                  <SelectTrigger>
                    <SelectValue placeholder="+ Adicionar setor" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSectors.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: s.color || '#999' }}
                          />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Squad (substitui "Conexão padrão" do tenant) */}
            <div className="space-y-1.5">
              <Label>Squad (opcional)</Label>
              {squads.length === 0 ? (
                <div className="text-xs rounded-md border border-yellow-300 bg-yellow-50 text-yellow-900 px-3 py-2 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">
                  Nenhum squad criado. Crie um time na aba <strong>Squads</strong> para poder
                  vincular o usuário a um time de vendas.
                </div>
              ) : (
                <Select
                  value={general.squad_id || 'none'}
                  onValueChange={(v) => updateGeneral('squad_id', v === 'none' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {squads.map((sq) => (
                      <SelectItem key={sq.id} value={sq.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: sq.color || '#6366F1' }}
                          />
                          {sq.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Meta mensal (product-scoped: platform_crm_user_product_assignments) */}
            <div className="space-y-1.5">
              <Label htmlFor="pcrm-goal">Meta mensal (R$, opcional)</Label>
              <Input
                id="pcrm-goal"
                inputMode="decimal"
                placeholder="Ex: 50000"
                value={general.monthly_goal}
                onChange={(e) => updateGeneral('monthly_goal', e.target.value)}
              />
            </div>
          </TabsContent>

          {/* ============== PERMISSÕES ============== */}
          <TabsContent value="permissions" className="space-y-5 pt-5">
            <p className="text-sm text-muted-foreground text-center py-8">
              Permissões por-usuário ainda não existem no schema da plataforma
              (<code>platform_crm_*</code>). O acesso é governado pelo <strong>Perfil</strong>{' '}
              (papel) escolhido na aba Geral + RLS super_admin.
            </p>
          </TabsContent>

          {/* ============== NOTIFICAÇÕES ============== */}
          <TabsContent value="notifications" className="space-y-5 pt-5">
            <p className="text-sm text-muted-foreground text-center py-8">
              As preferências de notificação poderão ser configuradas após criar o usuário,
              quando a tabela de notificações da plataforma existir.
            </p>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !effectiveProductId}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PlatformCrmUserFormDialog;
