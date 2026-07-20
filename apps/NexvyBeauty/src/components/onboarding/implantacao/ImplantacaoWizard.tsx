// ─── Wizard de implantação NexvyBeauty (9 steps, labels aprovados) ──────────
// Portado do Vendus e adaptado: copy PT-BR friendly, linguagem neutra ("seu
// espaço", nunca "salão"). Máquina de estados:
//   steps 1-7 (dados) → submit (apply-onboarding) → step 8 (Conectar WhatsApp)
//   → step 9 (Montando seu Espaço) → onFinish (Home).
// O slug do link de agendamento foi portado do IdentityStep do
// GuidedOnboarding: sanitização, preview {publicBase}/s/{slug} e derivação
// viva a partir do nome até o usuário tocar no campo. A gravação com retry de
// colisão (23505) acontece no apply — aqui só mantemos o slug sanitizado no
// payload.

import { useEffect, useRef, useState } from 'react';
import {
  Store, Clock, Scissors, Users, Bot, KeyRound, CheckCircle2, Smartphone,
  Sparkles, ChevronLeft, ChevronRight, Plus, Trash2, Loader2, Upload, X, Link2,
  HelpCircle, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ImplantacaoPayload,
  uploadOnboardingFile,
  DEFAULT_PRIMARY_COLOR,
} from '@/hooks/useImplantacao';
import { getPublicAppUrl } from '@/lib/publicUrl';
import { ConectarWhatsAppStep } from './steps/ConectarWhatsAppStep';
import { MontandoEspacoStep } from './steps/MontandoEspacoStep';
import { CriarSenhaStep } from './steps/CriarSenhaStep';
import { cn, maskEmail } from '@/lib/utils';

interface Props {
  payload: ImplantacaoPayload;
  status: string;
  saving: boolean;
  organizationId: string;
  onChange: <K extends keyof ImplantacaoPayload>(key: K, value: ImplantacaoPayload[K]) => void;
  /** Aplica os dados dos steps 1-7 (apply-onboarding). */
  onSubmit: () => Promise<boolean>;
  /** Fim do step 9 — navega pra Home (e marca o onboarding como concluído). */
  onFinish: () => void;
  onSkip?: () => void;
  skipsRemaining?: number;
  /** Telemetria de fase (handoff Duda→CS): chamada a cada mudança de página. */
  onStepChange?: (stepIndex: number, stepId: string) => void;
  /** Etapa inicial (0-based) — retomada cross-device a partir da etapa salva. */
  initialStep?: number;
  /** E-mail da compra (acesso master) — exibido MASCARADO no card "Seu acesso" do Resumo. */
  ownerEmail?: string | null;
  /** Token do link público de implantação. Presente + sessionToken ⇒ o wizard
   *  ganha a 10ª etapa (criar senha e entrar). No fluxo logado vêm vazios. */
  token?: string | null;
  /** Sessão corrente do link público (prova de posse junto com o token). */
  sessionToken?: string | null;
}

interface WizardStep { id: string; title: string; icon: LucideIcon }

// Labels EXATOS aprovados pelo Marcelo — não parafrasear.
const STEPS = [
  { id: 'espaco', title: 'Seu espaço', icon: Store },
  { id: 'horarios', title: 'Horários de Funcionamento', icon: Clock },
  { id: 'servicos', title: 'Serviços', icon: Scissors },
  { id: 'profissionais', title: 'Seus profissionais', icon: Users },
  { id: 'equipia', title: 'Sua EquipIA', icon: Bot },
  { id: 'usuarios', title: 'Seus usuários da Plataforma', icon: KeyRound },
  { id: 'resumo', title: 'Resumo', icon: CheckCircle2 },
  { id: 'whatsapp', title: 'Conectar seu WhatsApp', icon: Smartphone },
  { id: 'montando', title: 'Montando seu Espaço 💆🏻‍♀️💅🏻💄', icon: Sparkles },
] as const;

// 10ª etapa, SÓ no fluxo público por token: a dona cria a senha dela e entra na
// conta do próprio espaço (sem ela, o wizard terminava numa sessão alheia).
const SENHA_STEP = { id: 'senha', title: 'Crie sua senha e entre', icon: KeyRound } as const;
const STEPS_COM_SENHA = [...STEPS, SENHA_STEP] as const;

// Último step de DADOS (Resumo). Depois dele vem o pós-apply (WhatsApp/Montagem).
const LAST_DATA_STEP = 6;
// Índice da etapa de senha (logo depois de "Montando seu Espaço").
const PASSWORD_STEP = STEPS.length; // 9

const DAYS: Array<[string, string]> = [
  ['monday', 'Segunda'], ['tuesday', 'Terça'], ['wednesday', 'Quarta'], ['thursday', 'Quinta'],
  ['friday', 'Sexta'], ['saturday', 'Sábado'], ['sunday', 'Domingo'],
];

// Rótulos amigáveis pros fusos IANA. O VALUE continua IANA (o backend depende);
// fuso fora do mapa exibe o próprio IANA.
const TIMEZONE_LABELS: Record<string, string> = {
  'America/Sao_Paulo': 'Brasil — Horário de Brasília',
  'America/Manaus': 'Brasil — Manaus (AM)',
  'America/Cuiaba': 'Brasil — Cuiabá (MT/MS)',
  'America/Fortaleza': 'Brasil — Fortaleza (NE)',
  'America/Recife': 'Brasil — Recife',
  'America/Bahia': 'Brasil — Bahia',
  'America/Belem': 'Brasil — Belém',
  'America/Boa_Vista': 'Brasil — Boa Vista (RR)',
  'America/Porto_Velho': 'Brasil — Porto Velho (RO)',
  'America/Rio_Branco': 'Brasil — Rio Branco (AC)',
  'America/Noronha': 'Brasil — Fernando de Noronha',
};
const TIMEZONE_OPTIONS = ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Fortaleza'];

// Agentes prontos da EquipIA. O payload grava equipia = { agentes: [{ nome,
// tom, papel }] } (MÚLTIPLOS agentes — contrato novo do apply-onboarding). O
// tom passa pelo TONE_MAP de lá — só amigável/consultivo/formal/técnico são
// reconhecidos, qualquer outro degrada silenciosamente pra "friendly". Por isso
// os presets usam SÓ o vocabulário canônico do select de tom.
export interface EquipiaAgente { nome: string; tom: string; papel: string }

// Tons canônicos (espelham o TONE_MAP do apply-onboarding).
const EQUIPIA_TONS = ['Amigável', 'Formal', 'Consultivo', 'Técnico'] as const;

const EQUIPIA_PRESETS: readonly EquipiaAgente[] = [
  {
    nome: 'Recepcionista virtual',
    tom: 'Amigável',
    papel: 'Responde clientes no WhatsApp, agenda e confirma horários — com um jeito acolhedor.',
  },
  {
    nome: 'Assistente de reativação',
    tom: 'Amigável',
    papel: 'Chama clientes sumidas com mensagens calorosas, no seu tom.',
  },
  {
    nome: 'Consultora de serviços',
    tom: 'Consultivo',
    papel: 'Tira dúvidas sobre serviços, preços e indicações antes de agendar.',
  },
] as const;

// A máscara do e-mail master (Resumo e etapa de senha) vive em @/lib/utils —
// compartilhada com o CriarSenhaStep sem criar ciclo de import.

// Paleta canônica do espaço (espelha CompanySettings/GuidedOnboarding).
const PRESET_COLORS = [
  '#F97316', '#EC4899', '#8B5CF6', '#10B981',
  '#3B82F6', '#EF4444', '#F59E0B', '#14B8A6',
];

// Sanitização canônica do slug (a MESMA do IdentityStep do GuidedOnboarding):
// lowercase, sem acento, só [a-z0-9-], sem hífens duplicados nem nas pontas.
const sanitizeSlug = (v: string) =>
  v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

// Variante "de digitação": igual à canônica MAS preserva hífen no fim pra não
// engolir o "-" enquanto o usuário digita. O onBlur aplica a canônica.
const sanitizeSlugTyping = (v: string) =>
  v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-/, '');

export function ImplantacaoWizard({
  payload, status, saving, organizationId, onChange, onSubmit, onFinish, onSkip, skipsRemaining,
  onStepChange, initialStep, ownerEmail, token, sessionToken,
}: Props) {
  // Fluxo público por link: token + sessão ⇒ a jornada termina na criação de
  // senha (10 etapas). Fluxo logado (AdminImplantacao): 9, como sempre.
  const pedeSenha = !!token && !!sessionToken;
  const steps: readonly WizardStep[] = pedeSenha ? STEPS_COM_SENHA : STEPS;

  const [step, setStep] = useState(() =>
    Math.min(Math.max(initialStep ?? 0, 0), STEPS.length - 1));

  // Reporta a página atual (1-based na RPC) em TODA transição — pills, Voltar,
  // Continuar e os saltos pós-apply (8/9/10). Fire-and-forget; cobre também o
  // primeiro render quando o submission carrega (identidade de onStepChange muda).
  useEffect(() => { onStepChange?.(step, steps[step].id); }, [step, steps, onStepChange]);
  const [submitting, setSubmitting] = useState(false);
  // true depois do apply DESTA sessão — libera os steps 8/9 e congela os 1-7.
  const [postSubmit, setPostSubmit] = useState(false);
  const [lgpdAccepted, setLgpdAccepted] = useState(false);
  // ID da instância WhatsApp conectada no step 8 (null = pulou).
  const [instanceId, setInstanceId] = useState<string | null>(null);
  // Slug já editado à mão (ou já existente) → para de derivar do nome.
  const [slugTouched, setSlugTouched] = useState(() => !!payload.empresa?.slug);

  const pct = Math.round(((step + 1) / steps.length) * 100);
  const StepIcon = steps[step].icon;
  const isApplied = status === 'applied';
  const publicBase = getPublicAppUrl();

  const updateEmpresa = (patch: Partial<ImplantacaoPayload['empresa']>) =>
    onChange('empresa', { ...payload.empresa, ...patch });
  const updateEndereco = (patch: any) =>
    onChange('empresa', { ...payload.empresa, endereco: { ...payload.empresa?.endereco, ...patch } });
  const updateHorarios = (patch: any) => onChange('horarios', { ...payload.horarios, ...patch });

  // ── EquipIA multi-agente ──
  // Leitura com compat: payload antigo {nome, tom} (sem .agentes) vira 1 agente.
  const agentes: EquipiaAgente[] = payload.equipia?.agentes
    ?? (payload.equipia?.nome
      ? [{ nome: payload.equipia.nome, tom: payload.equipia.tom ?? 'Amigável', papel: '' }]
      : []);
  const setAgentes = (list: EquipiaAgente[]) => onChange('equipia', { agentes: list });
  const updateAgente = (i: number, patch: Partial<EquipiaAgente>) =>
    setAgentes(agentes.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const removeAgente = (i: number) => setAgentes(agentes.filter((_, idx) => idx !== i));

  // Converte o shape legado pro novo NO ESTADO assim que detectado — garante que
  // o payload autosalvo/submetido já sai como { agentes: [...] }.
  const legacyEquipia = !payload.equipia?.agentes && !!payload.equipia?.nome;
  useEffect(() => {
    if (legacyEquipia) {
      onChange('equipia', {
        agentes: [{ nome: payload.equipia!.nome!, tom: payload.equipia!.tom ?? 'Amigável', papel: '' }],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyEquipia]);

  // Nome do espaço: enquanto o usuário não tocar no slug, ele deriva vivo do
  // nome (mesmo comportamento do IdentityStep do GuidedOnboarding).
  const handleNomeChange = (v: string) => {
    const patch: Partial<ImplantacaoPayload['empresa']> = { nome_fantasia: v };
    if (!slugTouched) patch.slug = sanitizeSlug(v);
    updateEmpresa(patch);
  };

  const previewSlug = sanitizeSlug(payload.empresa?.slug ?? '') || 'seu-espaco';
  const cor = payload.empresa?.cor_principal || DEFAULT_PRIMARY_COLOR;

  // ── CEP → endereço (ViaCEP) ──
  // O ref espelha a empresa mais recente: a resposta do fetch chega DEPOIS de
  // re-renders (o closure do handler fica stale), e o preenchimento não pode
  // sobrescrever nada que a pessoa digitou nesse meio-tempo.
  const empresaRef = useRef(payload.empresa);
  empresaRef.current = payload.empresa;
  const [cepLoading, setCepLoading] = useState(false);

  const handleCepChange = async (raw: string) => {
    updateEndereco({ cep: raw });
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data || data.erro) return; // CEP inexistente: falha silenciosa
      const empresa = empresaRef.current ?? {};
      const atual = (empresa as any).endereco ?? {};
      // Só preenche campo VAZIO — nunca sobrescreve o que já foi digitado.
      const patch: Record<string, string> = {};
      if (!atual.rua && data.logradouro) patch.rua = data.logradouro;
      if (!atual.bairro && data.bairro) patch.bairro = data.bairro;
      if (!atual.cidade && data.localidade) patch.cidade = data.localidade;
      if (!atual.uf && data.uf) patch.uf = data.uf;
      if (Object.keys(patch).length) {
        onChange('empresa', { ...empresa, endereco: { ...atual, ...patch } });
      }
    } catch (err) {
      console.warn('ViaCEP indisponível:', err);
    } finally {
      setCepLoading(false);
    }
  };

  const handleApply = async () => {
    setSubmitting(true);
    const ok = await onSubmit();
    setSubmitting(false);
    if (ok) {
      setPostSubmit(true);
      setStep(LAST_DATA_STEP + 1); // → Conectar seu WhatsApp
    }
  };

  // Reentrada com implantação JÁ aplicada (fora do fluxo desta sessão).
  if (isApplied && !postSubmit) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold">Seu espaço já está montado</h1>
        <p className="text-muted-foreground">Essas configurações já estão ativas. Você pode ajustar tudo quando quiser nas configurações do seu espaço.</p>
        <Button onClick={onFinish}>Ir para o início</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 pt-10 pb-8 space-y-6 relative">
      {onSkip && !postSubmit && (
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 z-10 h-9 w-9 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition"
          aria-label="Fechar e continuar depois"
          title={typeof skipsRemaining === 'number' ? `Você pode adiar mais ${skipsRemaining} vez(es)` : 'Fechar'}
        >
          <X className="w-4 h-4" />
        </button>
      )}
      {/* Header com respiro: logo maior, mb próprio, e space-y-4 entre
          logo → badge → título → subtítulo (feedback "amontoamento"). */}
      <div className="text-center space-y-4">
        <img src="/email/logo-v1.png" alt="NexvyBeauty" className="h-10 md:h-12 mx-auto mb-5" />
        <Badge variant="outline" className="px-4 py-1 text-sm">Primeiros passos</Badge>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Vamos montar seu espaço</h1>
        <p className="text-muted-foreground">Conta pra gente como seu espaço funciona — em poucos minutos deixamos tudo pronto.</p>
        {typeof skipsRemaining === 'number' && skipsRemaining > 0 && !postSubmit && (
          <p className="text-xs text-muted-foreground">Você pode adiar e voltar depois ({skipsRemaining} {skipsRemaining === 1 ? 'vez restante' : 'vezes restantes'}).</p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm font-medium">
          <span className="text-muted-foreground">Etapa {step + 1} de {steps.length}</span>
          <span className="text-muted-foreground">{pct}% {saving && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />}</span>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex gap-2 overflow-x-auto pb-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            // Navegação livre só entre os steps de dados e ANTES do apply.
            // Depois do apply os dados estão gravados; 8/9 seguem o fluxo.
            const clickable = !postSubmit && i <= LAST_DATA_STEP && step <= LAST_DATA_STEP;
            return (
              <button key={s.id} type="button" disabled={!clickable}
                onClick={() => clickable && setStep(i)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-medium whitespace-nowrap transition-colors",
                  active && "bg-primary text-primary-foreground border-primary",
                  done && !active && "bg-primary/10 border-primary/30 text-primary",
                  !active && !done && "bg-muted border-border text-muted-foreground",
                  !clickable && !active && "cursor-default",
                )}>
                <Icon className="w-3.5 h-3.5" />{i + 1}. {s.title}
              </button>
            );
          })}
        </div>
      </div>

      <Card className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3 pb-2 border-b">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <StepIcon className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-bold">{steps[step].title}</h2>
        </div>

        {/* ── 1. Seu espaço ── */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <Label>Logo do seu espaço</Label>
              <LogoUpload value={payload.empresa?.logo_url} organizationId={organizationId}
                onChange={(url) => updateEmpresa({ logo_url: url })} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Nome do seu espaço"><Input value={payload.empresa?.nome_fantasia ?? ''} onChange={e => handleNomeChange(e.target.value)} placeholder="Ex: Espaço Bella Vita" maxLength={120} /></Field>
              <Field label="CNPJ (opcional)"><Input value={payload.empresa?.cnpj ?? ''} onChange={e => updateEmpresa({ cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></Field>
              <Field label="Telefone"><Input value={payload.empresa?.telefone ?? ''} onChange={e => updateEmpresa({ telefone: e.target.value })} placeholder="(00) 00000-0000" /></Field>
              <Field label="Instagram"><Input value={payload.empresa?.instagram ?? ''} onChange={e => updateEmpresa({ instagram: e.target.value })} placeholder="@seuespaco" /></Field>
            </div>

            <div className="pt-4 border-t">
              <Label className="mb-2 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                Link de agendamento
                <HelpTip text="Esse é o endereço que suas clientes usam para agendar online. Dicas: use o nome do seu espaço, curto, sem acentos ou espaços (ex.: studio-ana-lima). Dá para mudar depois nas configurações." />
              </Label>
              <div className="flex items-stretch rounded-md border focus-within:ring-1 focus-within:ring-ring overflow-hidden">
                <span className="hidden sm:flex items-center px-3 bg-muted text-xs text-muted-foreground border-r whitespace-nowrap">
                  {publicBase}/s/
                </span>
                <Input
                  value={payload.empresa?.slug ?? ''}
                  onChange={e => {
                    setSlugTouched(true);
                    updateEmpresa({ slug: sanitizeSlugTyping(e.target.value) });
                  }}
                  onBlur={() => updateEmpresa({ slug: sanitizeSlug(payload.empresa?.slug ?? '') })}
                  placeholder="seu-espaco"
                  className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1 break-all">
                Suas clientes agendam por aqui: <span className="font-medium text-foreground">{publicBase}/s/{previewSlug}</span>
              </p>
            </div>

            <div className="pt-4 border-t">
              <Label className="mb-2 block">Cor principal</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateEmpresa({ cor_principal: c })}
                    className={cn(
                      'w-10 h-10 rounded-lg border-2 transition-all',
                      cor.toLowerCase() === c.toLowerCase() ? 'border-foreground scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
                <input
                  type="color"
                  value={cor}
                  onChange={(e) => updateEmpresa({ cor_principal: e.target.value })}
                  className="w-10 h-10 rounded-lg cursor-pointer border"
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-semibold mb-3">Endereço</h3>
              {/* Enquanto o ViaCEP busca, o grupo fica translúcido (loading discreto). */}
              <div className={cn('grid md:grid-cols-3 gap-4 transition-opacity', cepLoading && 'opacity-60')}>
                <Field label="CEP"><Input value={payload.empresa?.endereco?.cep ?? ''} onChange={e => handleCepChange(e.target.value)} /></Field>
                <Field label="Rua" className="md:col-span-2"><Input value={payload.empresa?.endereco?.rua ?? ''} onChange={e => updateEndereco({ rua: e.target.value })} /></Field>
                <Field label="Número"><Input value={payload.empresa?.endereco?.numero ?? ''} onChange={e => updateEndereco({ numero: e.target.value })} /></Field>
                <Field label="Complemento"><Input value={payload.empresa?.endereco?.complemento ?? ''} onChange={e => updateEndereco({ complemento: e.target.value })} /></Field>
                <Field label="Bairro"><Input value={payload.empresa?.endereco?.bairro ?? ''} onChange={e => updateEndereco({ bairro: e.target.value })} /></Field>
                <Field label="Cidade"><Input value={payload.empresa?.endereco?.cidade ?? ''} onChange={e => updateEndereco({ cidade: e.target.value })} /></Field>
                <Field label="UF"><Input maxLength={2} value={payload.empresa?.endereco?.uf ?? ''} onChange={e => updateEndereco({ uf: e.target.value.toUpperCase() })} /></Field>
              </div>
            </div>
          </div>
        )}

        {/* ── 2. Horários de Funcionamento ── */}
        {step === 1 && (
          <div className="space-y-6">
            <Field label="Fuso horário">
              <Select value={payload.horarios?.timezone ?? 'America/Sao_Paulo'} onValueChange={v => updateHorarios({ timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map(tz => (
                    <SelectItem key={tz} value={tz}>{TIMEZONE_LABELS[tz] ?? tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div>
              <Label className="mb-3 block">Em quais dias e horários seu espaço atende?</Label>
              <div className="space-y-2">
                {DAYS.map(([key, label]) => {
                  const day = (payload.horarios?.schedule ?? {})[key] ?? { enabled: false, start: '08:00', end: '18:00' };
                  return (
                    <div key={key} className="flex items-center gap-3 p-3 rounded-lg border">
                      <Switch checked={day.enabled} onCheckedChange={c => updateHorarios({ schedule: { ...payload.horarios?.schedule, [key]: { ...day, enabled: c } } })} />
                      <span className="font-medium w-24">{label}</span>
                      <Input type="time" value={day.start} disabled={!day.enabled} className="w-32"
                        onChange={e => updateHorarios({ schedule: { ...payload.horarios?.schedule, [key]: { ...day, start: e.target.value } } })} />
                      <span className="text-muted-foreground">às</span>
                      <Input type="time" value={day.end} disabled={!day.enabled} className="w-32"
                        onChange={e => updateHorarios({ schedule: { ...payload.horarios?.schedule, [key]: { ...day, end: e.target.value } } })} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── 3. Serviços ── */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">O que suas clientes encontram no seu espaço. Dá pra ajustar tudo depois.</p>
            <Repeater
              items={payload.servicos ?? []} onChange={items => onChange('servicos', items)}
              label="serviço" addLabel="Adicionar serviço"
              renderItem={(s, update) => (
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Nome do serviço" hint="O nome que a cliente vê ao agendar. Seja específica: 'Corte feminino', 'Manicure completa'."><Input value={s.nome ?? ''} onChange={e => update({ nome: e.target.value })} placeholder="Ex: Corte feminino" /></Field>
                  <Field label="Categoria" hint="Agrupa os serviços no agendamento online (ex.: Cabelo, Unhas, Estética). Ajuda a cliente a achar o que procura."><Input value={s.categoria ?? ''} onChange={e => update({ categoria: e.target.value })} placeholder="Ex: Cabelo, Unhas, Estética..." /></Field>
                  <Field label="Duração (min)" hint="Tempo que o serviço ocupa na agenda. Isso define quantas clientes cabem no seu dia — duração certa = agenda sem furos nem atrasos."><Input type="number" min={0} value={s.duracao_min ?? ''} onChange={e => update({ duracao_min: e.target.value === '' ? undefined : (parseInt(e.target.value) || 0) })} placeholder="60" /></Field>
                  <Field label="Preço (R$)" hint="Valor exibido no agendamento online. Dá para ajustar por profissional depois."><Input type="number" min={0} step="0.01" value={s.preco ?? ''} onChange={e => update({ preco: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0) })} placeholder="120" /></Field>
                </div>
              )}
            />
          </div>
        )}

        {/* ── 4. Seus profissionais ── */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Quem atende no seu espaço — esses nomes aparecem na agenda.</p>
            <Repeater
              items={payload.profissionais ?? []} onChange={items => onChange('profissionais', items)}
              label="profissional" addLabel="Adicionar profissional"
              renderItem={(p, update) => (
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Nome"><Input value={p.nome ?? ''} onChange={e => update({ nome: e.target.value })} placeholder="Ex: Ana Paula" /></Field>
                  <Field label="Especialidade"><Input value={p.especialidade ?? ''} onChange={e => update({ especialidade: e.target.value })} placeholder="Ex: Cabeleireira, Manicure, Esteticista..." /></Field>
                </div>
              )}
            />
          </div>
        )}

        {/* ── 5. Sua EquipIA ── */}
        {step === 4 && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              A EquipIA é a equipe de inteligência artificial do seu espaço — ela atende suas clientes no WhatsApp.
            </p>

            {/* Presets = TOGGLE: clicar adiciona à lista de agentes; clicar de
                novo ("Adicionada") remove. Identidade do preset = nome. */}
            <div>
              <Label className="mb-2 block">Comece com uma agente pronta</Label>
              <div className="grid md:grid-cols-3 gap-3">
                {EQUIPIA_PRESETS.map((p) => {
                  const selected = agentes.some(a => a.nome === p.nome);
                  return (
                    <div key={p.nome} className={cn(
                      'p-4 rounded-lg border flex flex-col gap-2 transition-colors',
                      selected ? 'border-primary bg-primary/5' : 'bg-muted/30',
                    )}>
                      <div className="font-medium text-sm">{p.nome}</div>
                      <p className="text-xs text-muted-foreground flex-1">{p.papel}</p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">Tom: {p.tom}</span>
                        <Button type="button" size="sm" variant={selected ? 'default' : 'outline'}
                          onClick={() => selected
                            ? setAgentes(agentes.filter(a => a.nome !== p.nome))
                            : setAgentes([...agentes, { ...p }])}>
                          {selected ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Adicionada</> : 'Adicionar'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Lista dos agentes adicionados — nome, tom (POR agente) e papel
                editáveis; remover pelo ícone de lixeira. */}
            {agentes.length > 0 && (
              <div className="space-y-3">
                <Label className="block">Suas agentes ({agentes.length})</Label>
                {agentes.map((a, i) => (
                  <Card key={i} className="p-4 space-y-3 bg-muted/20">
                    <div className="flex items-start gap-3">
                      <div className="grid md:grid-cols-2 gap-3 flex-1">
                        <Field label="Nome">
                          <Input value={a.nome} onChange={e => updateAgente(i, { nome: e.target.value })} placeholder="Ex: Lia" />
                        </Field>
                        <Field label="Tom de voz">
                          <Select value={a.tom || 'Amigável'} onValueChange={v => updateAgente(i, { tom: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {EQUIPIA_TONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeAgente(i)}
                        className="text-destructive shrink-0 mt-5" aria-label="Remover agente">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <Field label="O que ela faz?">
                      <Input value={a.papel} onChange={e => updateAgente(i, { papel: e.target.value })}
                        placeholder="Ex: Responde clientes no WhatsApp e agenda horários" />
                    </Field>
                  </Card>
                ))}
              </div>
            )}

            <Button type="button" variant="outline"
              onClick={() => setAgentes([...agentes, { nome: '', tom: 'Amigável', papel: '' }])}>
              <Plus className="w-4 h-4 mr-1" />Adicionar agente personalizado
            </Button>

            <p className="text-xs text-muted-foreground">
              Você encontra e adiciona outros agentes depois, na área Agentes de IA do painel.
            </p>
          </div>
        )}

        {/* ── 6. Seus usuários da Plataforma ── */}
        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Aqui você convida quem vai ter <strong>login na plataforma</strong> (recepção, sócia, gerente) — não são
              os profissionais que atendem, esses você já cadastrou na etapa anterior. Se preferir, pule e convide depois.
            </p>
            <Repeater
              items={payload.usuarios ?? []} onChange={items => onChange('usuarios', items)}
              label="usuário" addLabel="Adicionar usuário"
              renderItem={(u, update) => (
                <div className="space-y-3">
                  <div className="grid md:grid-cols-3 gap-3">
                    <Field label="Nome"><Input value={u.nome ?? ''} onChange={e => update({ nome: e.target.value })} /></Field>
                    <Field label="E-mail"><Input type="email" value={u.email ?? ''} onChange={e => update({ email: e.target.value })} /></Field>
                    <Field label="Perfil">
                      <Select value={u.perfil ?? 'attendant'} onValueChange={v => update({ perfil: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Administrador</SelectItem>
                          <SelectItem value="manager">Gestor</SelectItem>
                          <SelectItem value="attendant">Atendente</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <p className="text-xs text-muted-foreground">A senha é definida pela própria pessoa através do convite enviado por e-mail.</p>
                </div>
              )}
            />
          </div>
        )}

        {/* ── 7. Resumo ── */}
        {step === 6 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Confira se está tudo certo. Ao confirmar, a gente aplica essas configurações e começa a montar seu espaço.</p>

            {/* Seu acesso master — PRIMEIRO card, destacado: deixa claro quem é
                a usuária administradora (e-mail da compra, mascarado). */}
            <div className="p-4 rounded-lg border-2 border-primary/40 bg-primary/5 space-y-1.5">
              <div className="font-semibold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" /> Seu acesso de administradora
              </div>
              {ownerEmail && <div className="font-medium">{maskEmail(ownerEmail)}</div>}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {ownerEmail
                  ? 'Esse é o e-mail da sua compra — ele é o acesso master do espaço. '
                  : 'O e-mail da sua compra é o acesso master do espaço. '}
                {pedeSenha
                  ? <>No <span className="font-medium text-foreground">último passo</span> você cria sua senha — não precisa procurar nada no e-mail. Depois, entre sempre por <span className="font-medium text-foreground">app.nexvybeauty.com.br</span>.</>
                  : <>Entre sempre por <span className="font-medium text-foreground">app.nexvybeauty.com.br</span> com esse e-mail. Esqueceu a senha? Use “Esqueci minha senha” na tela de login.</>}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <SummaryCard label="Seu espaço" value={payload.empresa?.nome_fantasia || '—'} />
              <SummaryCard label="Link de agendamento" value={`${publicBase}/s/${previewSlug}`} />
              <SummaryCard label="Fuso horário" value={payload.horarios?.timezone ? (TIMEZONE_LABELS[payload.horarios.timezone] ?? payload.horarios.timezone) : '—'} />
              <SummaryCard label="Serviços" value={`${payload.servicos?.length ?? 0} cadastrado(s)`} />
              <SummaryCard label="Profissionais" value={`${payload.profissionais?.length ?? 0} cadastrado(s)`} />
              <SummaryCard label="EquipIA" value={agentes.length
                ? `${agentes.length} agente(s): ${agentes.map(a => `${a.nome || 'Sem nome'} (${a.tom || 'Amigável'})`).join(', ')}`
                : '—'} />
              <SummaryCard label="Usuários da Plataforma" value={`${payload.usuarios?.length ?? 0} convite(s)`} />
            </div>

            {/* LGPD via-1 — obrigatório pra enviar */}
            <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
              <Checkbox
                id="lgpd-consent"
                checked={lgpdAccepted}
                onCheckedChange={(c) => setLgpdAccepted(c === true)}
                className="mt-0.5"
              />
              <label htmlFor="lgpd-consent" className="text-sm leading-relaxed cursor-pointer">
                Li e concordo com os{' '}
                <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline text-primary" onClick={e => e.stopPropagation()}>Termos de Uso</a>
                {' '}e a{' '}
                <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline text-primary" onClick={e => e.stopPropagation()}>Política de Privacidade</a>
                {' '}— meus dados são tratados pela Nexvy como Controladora
              </label>
            </div>
          </div>
        )}

        {/* ── 8. Conectar seu WhatsApp (pós-apply) ── */}
        {step === 7 && (
          <ConectarWhatsAppStep
            organizationId={organizationId}
            onConnected={(id) => { setInstanceId(id); setStep(8); }}
            onSkip={() => { setInstanceId(null); setStep(8); }}
          />
        )}

        {/* ── 9. Montando seu Espaço (pós-apply) ── */}
        {step === 8 && (
          <MontandoEspacoStep
            organizationId={organizationId}
            instanceId={instanceId}
            // Fluxo público: o espaço está montado, mas ela ainda não tem senha
            // — sem esta etapa o redirect cairia numa sessão anterior do
            // navegador (o bug do super_admin). Fluxo logado: termina aqui.
            onFinish={pedeSenha ? () => setStep(PASSWORD_STEP) : onFinish}
          />
        )}

        {/* ── 10. Crie sua senha e entre (só no fluxo público por token) ──
            Terminal: a edge queima o token ao definir a senha, então daqui não
            se volta pro wizard — o próprio step navega pra Home já logada. */}
        {pedeSenha && step === PASSWORD_STEP && (
          <CriarSenhaStep token={token!} sessionToken={sessionToken!} ownerEmail={ownerEmail} />
        )}

        {/* Footer de navegação — só nos steps de dados (1-7). Os steps 8/9 têm
            os próprios CTAs (onConnected/onSkip/onFinish). */}
        {step <= LAST_DATA_STEP && (
          <div className="flex justify-between items-center pt-4 border-t">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep(s => Math.max(0, s - 1))}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            {step < LAST_DATA_STEP ? (
              <Button onClick={() => setStep(s => Math.min(LAST_DATA_STEP, s + 1))}>
                Continuar <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleApply} disabled={submitting || !lgpdAccepted}>
                {submitting
                  ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Montando...</>
                  : <>Confirmar e montar meu espaço <CheckCircle2 className="w-4 h-4 ml-1" /></>}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// Interrogação pequena ao lado de um label; conteúdo no Tooltip do shadcn.
function HelpTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Ajuda" className="text-muted-foreground hover:text-foreground transition-colors">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {label}
        {hint && <HelpTip text={hint} />}
      </Label>
      {children}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg border bg-muted/30">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}

function Repeater<T extends Record<string, any>>({
  items, onChange, label, addLabel, renderItem,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  label: string;
  addLabel: string;
  renderItem: (item: T, update: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  const add = () => onChange([...items, {} as T]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<T>) => onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={add}><Plus className="w-4 h-4 mr-1" />{addLabel}</Button>
      </div>
      {items.length === 0 && (
        <p className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
          Nenhum {label} cadastrado. Clique em "{addLabel}" para começar.
        </p>
      )}
      {items.map((it, i) => (
        <Card key={i} className="p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold capitalize">{label} {i + 1}</h4>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)} className="text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          {renderItem(it, p => update(i, p))}
        </Card>
      ))}
    </div>
  );
}

function LogoUpload({ value, organizationId, onChange }: { value?: string; organizationId: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadOnboardingFile(file, organizationId);
      onChange(url);
    } finally { setUploading(false); }
  };
  return (
    <label className="flex items-center gap-4 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
      <input type="file" accept="image/*" onChange={handle} className="hidden" />
      {value ? (
        <img src={value} alt="Logo" className="w-16 h-16 rounded-lg object-contain bg-muted" />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
          <Upload className="w-6 h-6 text-muted-foreground" />
        </div>
      )}
      <div className="text-sm">
        <div className="font-medium">{uploading ? 'Enviando...' : value ? 'Trocar logo' : 'Enviar logo'}</div>
        <div className="text-muted-foreground text-xs">PNG, JPG ou SVG — recomendado 512×512px</div>
      </div>
    </label>
  );
}
