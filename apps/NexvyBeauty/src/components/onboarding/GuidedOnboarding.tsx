import { useState, useEffect, type FC } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Palette,
  CheckCircle2,
  Loader2,
  Upload,
  ArrowRight,
  X,
  Smartphone,
  QrCode,
  ExternalLink,
  Link2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PRODUCT_MODULES, type ModuleId } from '@/config/modules';
import {
  MODULE_ONBOARDING_STEPS,
  type OnboardingStepProps,
} from '@/components/onboarding/registry';
import { getPublicAppUrl } from '@/lib/publicUrl';
import {
  useCompanySettings,
  useUpdateCompanySettings,
  uploadCompanyLogo,
} from '@/hooks/useCompanySettings';
import {
  useCreateEvolutionInstanceSelf,
  useConnectEvolutionInstance,
} from '@/hooks/useEvolutionInstances';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface GuidedOnboardingProps {
  onComplete: () => void;
  onSkipAll: () => void;
}

// Paleta canônica do salão (espelha CompanySettings.tsx). Default = laranja.
const PRESET_COLORS = [
  '#F97316', '#EC4899', '#8B5CF6', '#10B981',
  '#3B82F6', '#EF4444', '#F59E0B', '#14B8A6',
];
const DEFAULT_PRIMARY_COLOR = '#F97316';

// Estado compartilhado entre os passos do onboarding (referências dos recursos criados)
interface OnboardingShared {
  productId: string | null;
  productName: string | null;
  instanceId: string | null;
  instanceName: string | null;
  instancePhone: string | null;
  agentId: string | null;
  agentName: string | null;
}

// ─── Sequência de passos (V3 functional-first) ────────────────────────────
// Cada passo é um "node": conteúdo fixo deste arquivo (identity, crm-whatsapp,
// done) ou um passo vindo do registry MODULE_ONBOARDING_STEPS (erp_salao).
// Cada node tem um `label` curto pro stepper de topo.
type StepNode =
  | { kind: 'identity'; label: string }
  | { kind: 'crm-whatsapp'; label: string }
  | { kind: 'module'; moduleId: ModuleId; Component: FC<OnboardingStepProps>; label: string }
  | { kind: 'done'; label: string };

/**
 * Sequência V3 (functional-first). A Home/HomeDeValor já entrega o "AHA" de
 * oportunidade; o onboarding faz só o SETUP que a Home não consegue fingir e
 * então cai na Home. Fluxo aprovado pelo dono:
 *   1. Seu salão (identidade + slug)
 *   2. Quem atende (salao_profissionais)
 *   3. O que você faz (salao_servicos)
 *   4. (opcional) Ligue sua IA no WhatsApp (crm-whatsapp)
 *   → Pronto (done)
 * Fora do caminho crítico (acessíveis depois via /admin e Minha IA):
 * welcome, crm-product, crm-agent, team.
 */
function buildSteps(): StepNode[] {
  const salaoSteps: StepNode[] = (MODULE_ONBOARDING_STEPS['erp_salao'] ?? []).map(
    (s) => ({
      kind: 'module' as const,
      moduleId: 'erp_salao' as ModuleId,
      Component: s.Component,
      label: s.label,
    })
  );

  return [
    { kind: 'identity', label: 'Seu negócio' },
    ...salaoSteps, // Quem atende (profissionais) + O que você faz (serviços)
    { kind: 'crm-whatsapp', label: 'IA no WhatsApp' },
    { kind: 'done', label: 'Pronto' },
  ];
}

export function GuidedOnboarding({ onComplete, onSkipAll }: GuidedOnboardingProps) {
  const [stepIdx, setStepIdx] = useState(0);

  const [shared, setShared] = useState<OnboardingShared>({
    productId: null,
    productName: null,
    instanceId: null,
    instanceName: null,
    instancePhone: null,
    agentId: null,
    agentName: null,
  });

  const update = (patch: Partial<OnboardingShared>) =>
    setShared((s) => ({ ...s, ...patch }));

  // Módulos do NexvyBeauty são FIXOS — ativa o conjunto de produto na org ao
  // montar o wizard (idempotente). O provisioning também seta; isto garante o
  // estado correto mesmo se o provisioning ainda não rodou.
  const { profile } = useAuth();
  useEffect(() => {
    const orgId = profile?.organization_id;
    if (!orgId) return;
    void (supabase.from('organizations') as any)
      .update({ enabled_modules: PRODUCT_MODULES })
      .eq('id', orgId);
  }, [profile?.organization_id]);

  // Módulos são FIXOS — sequência estática focada no salão.
  const steps = buildSteps();
  const safeIdx = Math.min(stepIdx, steps.length - 1);
  const node = steps[safeIdx];

  const goNext = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  const goPrev = () => setStepIdx((i) => Math.max(i - 1, 0));

  return (
    // In-shell: painel centralizado, NÃO modal. A sidebar do UnifiedShell
    // continua visível; o wizard é o conteúdo principal focado.
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden flex flex-col">
        {/* Top: stepper + pular tudo */}
        <div className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Configuração guiada · {safeIdx + 1} de {steps.length}</span>
            </div>
            <button
              onClick={onSkipAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              Pular tudo <X className="h-3 w-3" />
            </button>
          </div>
          <Stepper steps={steps} currentIdx={safeIdx} />
        </div>

        {/* Body */}
        <div className="px-6 py-8 min-h-[420px] flex flex-col">
          {node.kind === 'identity' && (
            <IdentityStep onNext={goNext} onSkip={goNext} onBack={goPrev} isFirst />
          )}
          {node.kind === 'crm-whatsapp' && (
            <WhatsAppStep
              onNext={goNext}
              onSkip={goNext}
              onBack={goPrev}
              update={update}
            />
          )}
          {node.kind === 'module' && (
            <node.Component onNext={goNext} onSkip={goNext} onBack={goPrev} />
          )}
          {node.kind === 'done' && (
            <DoneStep onFinish={onComplete} shared={shared} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- STEPPER ---------------- */
function Stepper({ steps, currentIdx }: { steps: StepNode[]; currentIdx: number }) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        return (
          <li key={`${s.kind}-${i}`} className="flex items-center gap-2 min-w-0">
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                done && 'bg-primary text-primary-foreground',
                current && 'bg-primary/15 text-primary ring-2 ring-primary',
                !done && !current && 'bg-muted text-muted-foreground',
              )}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                'text-xs truncate hidden sm:block',
                current ? 'text-foreground font-medium' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className={cn('h-px w-4 sm:w-6 shrink-0', done ? 'bg-primary' : 'bg-border')} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- SEU SALÃO (IDENTIDADE + SLUG) ---------------- */
function IdentityStep({
  onNext,
  onSkip,
  onBack,
  isFirst,
}: {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
  isFirst?: boolean;
}) {
  const { profile } = useAuth();
  const { data: company } = useCompanySettings();
  const updateCompany = useUpdateCompanySettings();
  const firstName = profile?.full_name?.split(' ')[0] || '';
  const [logoUrl, setLogoUrl] = useState(company?.logo_url || '');
  const [color, setColor] = useState<string>(DEFAULT_PRIMARY_COLOR);
  const [uploading, setUploading] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [slug, setSlug] = useState('');
  // Slug que o salão JÁ tinha salvo (backfill). Usado como fallback honesto do
  // preview quando o campo está vazio — o save pula a escrita de slug vazio, ou
  // seja, a org mantém este slug.
  const [existingSlug, setExistingSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Base do link público (origin real em prod; fallback configurado em dev).
  const publicBase = getPublicAppUrl();

  const sanitizeSlug = (v: string) =>
    v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  // Pré-carrega nome, cor (settings.primary_color) e slug atuais da org p/ o
  // admin confirmar/ajustar no 1º acesso. NÃO chuta azul: usa o que existe ou
  // o laranja canônico.
  useEffect(() => {
    const orgId = profile?.organization_id;
    if (!orgId) return;
    let active = true;
    (supabase as any)
      .from('organizations')
      .select('name, slug, settings')
      .eq('id', orgId)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (!active || !data) return;
        if (data.name) setOrgName(data.name);
        const existingColor = data.settings?.primary_color;
        if (existingColor) setColor(existingColor);
        // Já existe slug salvo → respeita (marca como "tocado" p/ a derivação
        // por nome NÃO sobrescrever o que o salão já usava) e guarda como
        // fallback do preview.
        if (data.slug) {
          setSlug(data.slug);
          setExistingSlug(data.slug);
          setSlugTouched(true);
        }
      });
    return () => {
      active = false;
    };
  }, [profile?.organization_id]);

  // Enquanto o usuário não editar o slug manualmente, mantém-no derivado do
  // nome (slug "vivo"). Após editar, respeita a escolha dele. Usa o MESMO
  // sanitizeSlug do save/preview pra que campo, preview e valor salvo sejam
  // idênticos (sem divergência com generateBookingSlug).
  useEffect(() => {
    if (slugTouched) return;
    if (orgName.trim()) setSlug(sanitizeSlug(orgName));
    // sanitizeSlug é puro/estável (closure local), fora das deps de propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgName, slugTouched]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.organization_id) return;
    setUploading(true);
    try {
      const url = await uploadCompanyLogo(file, profile.organization_id);
      setLogoUrl(url);
      toast.success('Logo enviado');
    } catch (err: any) {
      toast.error('Erro ao enviar logo', { description: err.message });
    } finally {
      setUploading(false);
    }
  };

  // Escreve o slug com tratamento de colisão (unique violation = 23505):
  // tenta o slug pedido; se colidir, anexa sufixo curto e tenta 1x mais.
  const saveSlug = async (orgId: string, desired: string): Promise<string | null> => {
    if (!desired) return null;
    const db = supabase as any;
    const first = await db.from('organizations').update({ slug: desired }).eq('id', orgId);
    if (!first.error) return desired;
    if (first.error.code !== '23505') {
      // Erro que não é colisão → propaga pro caller tratar.
      throw first.error;
    }
    const retrySlug = `${desired}-${Date.now().toString(36).slice(-4)}`;
    const second = await db.from('organizations').update({ slug: retrySlug }).eq('id', orgId);
    if (second.error) {
      // Espelha a 1ª tentativa: erro que não é colisão → propaga pro caller;
      // só colisão persistente (23505) retorna null.
      if (second.error.code !== '23505') throw second.error;
      return null; // colisão persistente
    }
    toast.message('Esse link já estava em uso', {
      description: `Usamos ${publicBase}/s/${retrySlug}`,
    });
    return retrySlug;
  };

  const handleSave = async () => {
    if (!profile?.organization_id) return;
    setSaving(true);
    try {
      const orgId = profile.organization_id;

      // Logo (helper inalterado).
      if (logoUrl && logoUrl !== company?.logo_url) {
        await updateCompany.mutateAsync({ logo_url: logoUrl });
      }

      // Read-merge das settings (NÃO sobrescreve outras chaves).
      const { data: org } = await (supabase as any)
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .maybeSingle();
      const newSettings = { ...(org?.settings || {}), primary_color: color };
      const patch: Record<string, any> = { settings: newSettings };
      if (orgName.trim()) patch.name = orgName.trim();
      await (supabase as any).from('organizations').update(patch).eq('id', orgId);

      // Slug (separado pra isolar o tratamento de colisão).
      const desiredSlug = sanitizeSlug(slug);
      if (desiredSlug) {
        try {
          const written = await saveSlug(orgId, desiredSlug);
          if (!written) {
            toast.error('Não foi possível reservar esse link', {
              description: 'Tente um nome de link diferente.',
            });
            setSaving(false);
            return; // não avança: o link é parte do valor do passo
          }
          setSlug(written);
        } catch (err: any) {
          toast.error('Erro ao salvar o link do seu negócio', { description: err?.message });
          setSaving(false);
          return;
        }
      }

      onNext();
    } catch {
      toast.error('Erro ao salvar identidade');
    } finally {
      setSaving(false);
    }
  };

  // Preview honesto: campo vazio → cai pro slug que a org JÁ tem (o save pula a
  // escrita de slug vazio, então é isso que continua valendo). Só sem nenhum
  // slug existente é que mostra o placeholder neutro.
  const previewSlug = sanitizeSlug(slug) || existingSlug || 'seu-negocio';

  return (
    <div className="flex-1 flex flex-col">
      <StepHeader
        icon={Palette}
        title="Seu negócio"
        description={
          isFirst && firstName
            ? `Olá, ${firstName}! Vamos deixar seu negócio pronto — comece pelo nome, logo, cor e o link de agendamento.`
            : 'Confirme o nome, personalize logo e cor e escolha o link de agendamento.'
        }
      />

      <div className="space-y-5 flex-1">
        <div>
          <Label className="mb-2 block">Nome da empresa</Label>
          <Input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Nome do seu negócio"
            maxLength={120}
          />
        </div>

        <div>
          <Label className="mb-2 block flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Link de agendamento
          </Label>
          <div className="flex items-stretch rounded-md border focus-within:ring-1 focus-within:ring-ring overflow-hidden">
            <span className="hidden sm:flex items-center px-3 bg-muted text-xs text-muted-foreground border-r whitespace-nowrap">
              {publicBase}/s/
            </span>
            <Input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              onBlur={() => setSlug((s) => sanitizeSlug(s))}
              placeholder="seu-negocio"
              className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 break-all">
            Seu link: <span className="font-medium text-foreground">{publicBase}/s/{previewSlug}</span>
          </p>
        </div>

        <div>
          <Label className="mb-2 block">Logo</Label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center overflow-hidden border">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="w-full h-full object-contain" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
                id="logo-upload"
              />
              <Button asChild variant="outline" size="sm" disabled={uploading}>
                <label htmlFor="logo-upload" className="cursor-pointer">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar imagem'}
                </label>
              </Button>
              <p className="text-xs text-muted-foreground mt-1">PNG ou JPG, até 2MB</p>
            </div>
          </div>
        </div>

        <div>
          <Label className="mb-2 block">Cor principal</Label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  'w-10 h-10 rounded-lg border-2 transition-all',
                  color.toLowerCase() === c.toLowerCase() ? 'border-foreground scale-110' : 'border-transparent'
                )}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer border"
            />
          </div>
        </div>
      </div>

      <StepFooter
        onBack={onBack}
        onSkip={onSkip}
        onPrimary={handleSave}
        primaryLabel="Salvar e continuar"
        loading={saving || updateCompany.isPending}
        hideBack={isFirst}
        hideSkip
      />
    </div>
  );
}


/* ---------------- WHATSAPP ---------------- */
function WhatsAppStep({
  onNext,
  onSkip,
  onBack,
  update,
}: {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
  update: (p: Partial<OnboardingShared>) => void;
}) {
  const createInstance = useCreateEvolutionInstanceSelf();
  const connectInstance = useConnectEvolutionInstance();
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('disconnected');
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);

  const sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const valid = /^[a-z0-9-]{3,40}$/.test(sanitized);

  // Polling do status
  useEffect(() => {
    if (!instanceId || status === 'connected' || status === 'paired') return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('evolution_instances')
        .select('status, qr_code, phone_number')
        .eq('id', instanceId)
        .maybeSingle();
      if (data) {
        if (data.qr_code && data.qr_code !== qr) setQr(data.qr_code);
        if (data.status !== status) setStatus(data.status);
        if (data.phone_number) setPhoneNumber(data.phone_number);
        if (data.status === 'connected' || data.status === 'paired') {
          toast.success('WhatsApp conectado!');
          // Vincula a conexão ao admin que está fazendo o onboarding
          if (profile?.id) {
            try {
              await supabase
                .from('profiles')
                .update({ default_connection_id: instanceId })
                .eq('id', profile.id);
            } catch (e) { console.warn('Could not set default_connection_id', e); }
          }
          update({
            instanceId,
            instanceName: sanitized,
            instancePhone: data.phone_number,
          });
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [instanceId, status, qr, sanitized, update, profile?.id]);

  const handleCreateAndConnect = async () => {
    if (!valid) return;
    try {
      const created: any = await createInstance.mutateAsync({ name: sanitized });
      const newId = created?.instance?.id || created?.id;
      if (!newId) throw new Error('Falha ao obter ID da instância');
      setInstanceId(newId);
      const result: any = await connectInstance.mutateAsync(newId);
      if (result?.qr_code) setQr(result.qr_code);
      setStatus('qr_pending');
    } catch (err: any) {
      // erros já tostam pelos hooks
    }
  };

  const isQrBase64 = qr?.startsWith('data:image') || qr?.startsWith('iVBOR');
  const isConnected = status === 'connected' || status === 'paired';

  return (
    <div className="flex-1 flex flex-col">
      <StepHeader
        icon={Smartphone}
        title="Conecte o WhatsApp"
        description="Crie a conexão e escaneie o QR Code aqui mesmo."
      />

      <div className="space-y-4 flex-1">
        {!instanceId && (
          <>
            <div>
              <Label className="mb-2 block">Nome da conexão *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: vendas"
                disabled={createInstance.isPending}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Apenas letras minúsculas, números e hífens. Mínimo 3 caracteres.
              </p>
              {name && !valid && (
                <p className="text-xs text-destructive mt-1">
                  Use apenas letras minúsculas, números e hífens (3 a 40 caracteres).
                </p>
              )}
            </div>
            <Button
              onClick={handleCreateAndConnect}
              disabled={!valid || createInstance.isPending}
              className="w-full gap-2"
            >
              {createInstance.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <QrCode className="h-4 w-4" />
              Criar e gerar QR Code
            </Button>
          </>
        )}

        {instanceId && (
          <div className="flex flex-col items-center justify-center py-4 min-h-[280px] gap-3">
            {isConnected ? (
              <>
                <CheckCircle2 className="h-16 w-16 text-green-500" />
                <p className="font-medium">Conectado!</p>
                {phoneNumber && (
                  <p className="text-sm text-muted-foreground">+{phoneNumber}</p>
                )}
              </>
            ) : connectInstance.isPending && !qr ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
              </>
            ) : qr ? (
              <>
                <div className="bg-white p-3 rounded-lg">
                  <img
                    src={
                      isQrBase64
                        ? (qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`)
                        : `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qr)}`
                    }
                    alt="QR Code"
                    className="w-56 h-56"
                  />
                </div>
                <p className="text-sm text-center text-muted-foreground max-w-sm">
                  Abra o WhatsApp → <strong>Configurações</strong> → <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong>.
                </p>
                <Badge variant="secondary">Aguardando leitura...</Badge>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Não foi possível gerar o QR Code.</p>
            )}
          </div>
        )}
      </div>

      <StepFooter
        onBack={onBack}
        onSkip={onSkip}
        onPrimary={onNext}
        primaryLabel={isConnected ? 'Avançar' : 'Continuar mesmo assim'}
      />
    </div>
  );
}

/* ---------------- DONE / TESTE ---------------- */
function DoneStep({ onFinish, shared }: { onFinish: () => void; shared: OnboardingShared }) {
  // Confirmação COMPACTA: a Home/HomeDeValor logo atrás já entrega o AHA, então
  // não repetimos um resumo pesado. Só o link de teste de WhatsApp aparece se
  // de fato conectaram um número — e o botão de concluir é SEMPRE alcançável.
  const phone = shared.instancePhone?.replace(/\D/g, '');
  const waLink = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent('Olá! Quero testar o atendimento.')}`
    : null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
        <CheckCircle2 className="h-10 w-10 text-primary" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Tudo pronto! 🎉</h2>
      <p className="text-muted-foreground max-w-sm mb-8">
        Seu negócio está montado. Você pode ajustar tudo depois — agora é só começar.
      </p>

      <div className="flex flex-col gap-2 w-full max-w-xs">
        <Button onClick={onFinish} size="lg" className="gap-2">
          Ir para o meu dia <ArrowRight className="h-4 w-4" />
        </Button>
        {waLink && (
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a href={waLink} target="_blank" rel="noopener noreferrer">
              Testar no WhatsApp <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------------- HELPERS ---------------- */
function StepHeader({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="mb-6">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-xl font-bold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StepFooter({
  onBack,
  onSkip,
  onPrimary,
  primaryLabel,
  loading,
  disabled,
  hideBack,
  hideSkip,
}: {
  onBack: () => void;
  onSkip: () => void;
  onPrimary: () => void;
  primaryLabel: string;
  loading?: boolean;
  disabled?: boolean;
  /** Esconde "Voltar" (ex.: 1º passo do wizard). Mantém o alinhamento. */
  hideBack?: boolean;
  /** Esconde "Pular esta etapa" (ex.: passos core, não puláveis). */
  hideSkip?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-6 mt-6 border-t">
      {hideBack ? (
        <span aria-hidden />
      ) : (
        <Button variant="ghost" onClick={onBack} size="sm">Voltar</Button>
      )}
      <div className="flex gap-2">
        {!hideSkip && (
          <Button variant="ghost" onClick={onSkip} size="sm">Pular esta etapa</Button>
        )}
        <Button onClick={onPrimary} disabled={loading || disabled} className="gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
