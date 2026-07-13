import { useMemo, useState } from 'react';
import { Building2, Clock, Package, Bot, Tag, Users, CheckCircle2, ChevronLeft, ChevronRight, Plus, Trash2, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ImplantacaoPayload, uploadOnboardingFile } from '@/hooks/useImplantacao';
import { cn } from '@/lib/utils';

interface Props {
  payload: ImplantacaoPayload;
  status: string;
  saving: boolean;
  organizationId: string;
  onChange: <K extends keyof ImplantacaoPayload>(key: K, value: ImplantacaoPayload[K]) => void;
  onSubmit: () => Promise<boolean>;
  onSkip?: () => void;
  skipsRemaining?: number;
}

const STEPS = [
  { id: 'empresa', title: 'Empresa', icon: Building2 },
  { id: 'horarios', title: 'Horários', icon: Clock },
  { id: 'negocios', title: 'Negócios', icon: Package },
  { id: 'agentes', title: 'Agentes IA', icon: Bot },
  { id: 'setores', title: 'Setores', icon: Tag },
  { id: 'equipes', title: 'Equipes', icon: Users },
  { id: 'revisao', title: 'Revisão', icon: CheckCircle2 },
] as const;

const DAYS: Array<[keyof NonNullable<ImplantacaoPayload['horarios']['schedule']>, string]> = [
  ['monday','Segunda'],['tuesday','Terça'],['wednesday','Quarta'],['thursday','Quinta'],
  ['friday','Sexta'],['saturday','Sábado'],['sunday','Domingo'],
];

export function ImplantacaoWizard({ payload, status, saving, organizationId, onChange, onSubmit, onSkip, skipsRemaining }: Props) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const pct = Math.round(((step + 1) / STEPS.length) * 100);
  const StepIcon = STEPS[step].icon;
  const isApplied = status === 'applied';

  const updateEmpresa = (patch: any) => onChange('empresa', { ...payload.empresa, ...patch });
  const updateEndereco = (patch: any) => onChange('empresa', { ...payload.empresa, endereco: { ...payload.empresa?.endereco, ...patch } });
  const updateHorarios = (patch: any) => onChange('horarios', { ...payload.horarios, ...patch });

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmit();
    setSubmitting(false);
  };

  if (isApplied) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold">Implantação concluída</h1>
        <p className="text-muted-foreground">Suas configurações já estão ativas. Você pode editá-las nas configurações da empresa.</p>
        <Button onClick={() => window.location.href = '/admin'}>Ir para o painel</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 relative">
      {onSkip && (
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 z-10 h-9 w-9 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition"
          aria-label="Fechar e continuar depois"
          title={typeof skipsRemaining === 'number' ? `Você pode adiar mais ${skipsRemaining} vez(es)` : 'Fechar'}
        >
          <X className="w-4 h-4" />
        </button>
      )}
      <div className="text-center space-y-3">
        <Badge variant="outline" className="px-4 py-1 text-sm">Implantação</Badge>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Configure sua operação</h1>
        <p className="text-muted-foreground">Preencha cada etapa para configurarmos sua operação completa.</p>
        {typeof skipsRemaining === 'number' && skipsRemaining > 0 && (
          <p className="text-xs text-muted-foreground">Você pode adiar e voltar depois ({skipsRemaining} {skipsRemaining === 1 ? 'vez restante' : 'vezes restantes'}).</p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm font-medium">
          <span className="text-muted-foreground">Seção {step + 1} de {STEPS.length}</span>
          <span className="text-muted-foreground">{pct}% {saving && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />}</span>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex gap-2 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <button key={s.id} type="button" onClick={() => setStep(i)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-medium whitespace-nowrap transition-colors",
                  active && "bg-primary text-primary-foreground border-primary",
                  done && !active && "bg-primary/10 border-primary/30 text-primary",
                  !active && !done && "bg-muted border-border text-muted-foreground",
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
          <h2 className="text-xl font-bold">{STEPS[step].title}</h2>
        </div>

        {step === 0 && (
          <div className="space-y-6">
            <div>
              <Label>Logo da empresa</Label>
              <LogoUpload value={payload.empresa?.logo_url} organizationId={organizationId}
                onChange={(url) => updateEmpresa({ logo_url: url })} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Razão Social"><Input value={payload.empresa?.razao_social ?? ''} onChange={e => updateEmpresa({ razao_social: e.target.value })} placeholder="Ex: GRC Soluções LTDA" /></Field>
              <Field label="Nome fantasia"><Input value={payload.empresa?.nome_fantasia ?? ''} onChange={e => updateEmpresa({ nome_fantasia: e.target.value })} placeholder="Ex: Vendus" /></Field>
              <Field label="CNPJ"><Input value={payload.empresa?.cnpj ?? ''} onChange={e => updateEmpresa({ cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></Field>
              <Field label="Telefone comercial"><Input value={payload.empresa?.telefone ?? ''} onChange={e => updateEmpresa({ telefone: e.target.value })} placeholder="(00) 00000-0000" /></Field>
              <Field label="Instagram"><Input value={payload.empresa?.instagram ?? ''} onChange={e => updateEmpresa({ instagram: e.target.value })} placeholder="@suaempresa" /></Field>
              <Field label="Site"><Input value={payload.empresa?.site ?? ''} onChange={e => updateEmpresa({ site: e.target.value })} placeholder="https://..." /></Field>
            </div>
            <div className="pt-4 border-t">
              <h3 className="font-semibold mb-3">Endereço</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <Field label="CEP"><Input value={payload.empresa?.endereco?.cep ?? ''} onChange={e => updateEndereco({ cep: e.target.value })} /></Field>
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

        {step === 1 && (
          <div className="space-y-6">
            <Field label="Fuso horário">
              <Select value={payload.horarios?.timezone ?? 'America/Sao_Paulo'} onValueChange={v => updateHorarios({ timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Sao_Paulo">America/Sao_Paulo</SelectItem>
                  <SelectItem value="America/Manaus">America/Manaus</SelectItem>
                  <SelectItem value="America/Cuiaba">America/Cuiaba</SelectItem>
                  <SelectItem value="America/Fortaleza">America/Fortaleza</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div>
              <Label className="mb-3 block">Horários de atendimento</Label>
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

        {step === 2 && (
          <Repeater
            items={payload.negocios ?? []} onChange={items => onChange('negocios', items)}
            label="negócio" addLabel="+ Adicionar negócio"
            renderItem={(n, update) => (
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Nome"><Input value={n.nome ?? ''} onChange={e => update({ nome: e.target.value })} /></Field>
                  <Field label="Status">
                    <Select value={n.status ?? 'Rascunho'} onValueChange={v => update({ status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Rascunho">Rascunho</SelectItem>
                        <SelectItem value="Em Revisão">Em Revisão</SelectItem>
                        <SelectItem value="Publicado">Publicado</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Categoria"><Input value={n.categoria ?? ''} onChange={e => update({ categoria: e.target.value })} placeholder="Ex: SaaS, Serviço local..." /></Field>
                  <Field label="Descrição curta"><Input value={n.descricao_curta ?? ''} onChange={e => update({ descricao_curta: e.target.value })} /></Field>
                </div>
                <Field label="Descrição completa"><Textarea value={n.descricao_completa ?? ''} onChange={e => update({ descricao_completa: e.target.value })} rows={3} /></Field>
                <Field label="Informações personalizadas"><Textarea value={n.personalizadas ?? ''} onChange={e => update({ personalizadas: e.target.value })} rows={2} placeholder="Valor de setup, links, regras comerciais..." /></Field>
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="ICP — Perfil de cliente ideal"><Textarea value={n.icp ?? ''} onChange={e => update({ icp: e.target.value })} rows={2} /></Field>
                  <Field label="Diferenciais (1 por linha)"><Textarea value={n.diferenciais ?? ''} onChange={e => update({ diferenciais: e.target.value })} rows={2} /></Field>
                </div>
                <div className="pt-3 border-t space-y-3">
                  <h4 className="font-semibold text-sm">Cérebro</h4>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Websites (1 por linha)"><Textarea value={n.websites ?? ''} onChange={e => update({ websites: e.target.value })} rows={2} /></Field>
                    <Field label="Vídeos YouTube"><Textarea value={n.videos ?? ''} onChange={e => update({ videos: e.target.value })} rows={2} /></Field>
                    <Field label="FAQ"><Textarea value={n.faq ?? ''} onChange={e => update({ faq: e.target.value })} rows={3} placeholder="Pergunta: ...\nResposta: ..." /></Field>
                    <Field label="Dados / Tabelas"><Textarea value={n.dados ?? ''} onChange={e => update({ dados: e.target.value })} rows={3} /></Field>
                    <Field label="Treinamento"><Textarea value={n.treinamento ?? ''} onChange={e => update({ treinamento: e.target.value })} rows={2} /></Field>
                    <Field label="Catálogo"><Textarea value={n.catalogo ?? ''} onChange={e => update({ catalogo: e.target.value })} rows={2} /></Field>
                  </div>
                </div>
              </div>
            )}
          />
        )}

        {step === 3 && (
          <Repeater
            items={payload.agentes ?? []} onChange={items => onChange('agentes', items)}
            label="agente" addLabel="+ Criar agente"
            renderItem={(a, update) => (
              <div className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Tipo de agente">
                    <Select value={a.tipo ?? 'SDR — Qualifica'} onValueChange={v => update({ tipo: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SDR — Qualifica">SDR — Qualifica</SelectItem>
                        <SelectItem value="Closer — Fecha a venda">Closer — Fecha a venda</SelectItem>
                        <SelectItem value="Suporte">Suporte</SelectItem>
                        <SelectItem value="Financeiro">Financeiro</SelectItem>
                        <SelectItem value="Administrativo">Administrativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Nome do agente"><Input value={a.nome ?? ''} onChange={e => update({ nome: e.target.value })} placeholder="Ex: Sônia, Maria..." /></Field>
                </div>
                <Field label="Missão principal"><Textarea value={a.missao ?? ''} onChange={e => update({ missao: e.target.value })} rows={2} placeholder="Qualificar leads, tirar dúvidas, vender..." /></Field>
                <Field label="Tom de voz">
                  <Select value={a.tom ?? 'Consultivo'} onValueChange={v => update({ tom: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Formal">Formal</SelectItem>
                      <SelectItem value="Consultivo">Consultivo</SelectItem>
                      <SelectItem value="Amigável">Amigável</SelectItem>
                      <SelectItem value="Técnico">Técnico</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}
          />
        )}

        {step === 4 && (
          <Repeater
            items={payload.setores ?? []} onChange={items => onChange('setores', items)}
            label="setor" addLabel="+ Adicionar setor"
            renderItem={(s, update) => (
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Nome do setor"><Input value={s.nome ?? ''} onChange={e => update({ nome: e.target.value })} placeholder="Comercial, Suporte..." /></Field>
                <Field label="Ordem"><Input type="number" min={1} value={s.ordem ?? ''} onChange={e => update({ ordem: parseInt(e.target.value) || 1 })} /></Field>
              </div>
            )}
          />
        )}

        {step === 5 && (
          <Repeater
            items={payload.equipes ?? []} onChange={items => onChange('equipes', items)}
            label="usuário" addLabel="+ Adicionar usuário"
            renderItem={(u, update) => (
              <div className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Nome"><Input value={u.nome ?? ''} onChange={e => update({ nome: e.target.value })} /></Field>
                  <Field label="Perfil">
                    <Select value={u.perfil ?? 'seller'} onValueChange={v => update({ perfil: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="manager">Gestor</SelectItem>
                        <SelectItem value="seller">Vendedor</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="E-mail"><Input type="email" value={u.email ?? ''} onChange={e => update({ email: e.target.value })} /></Field>
                  <Field label="WhatsApp"><Input value={u.whatsapp ?? ''} onChange={e => update({ whatsapp: e.target.value })} placeholder="(00) 00000-0000" /></Field>
                </div>
                <p className="text-xs text-muted-foreground">A senha é definida pelo próprio usuário através do convite enviado por e-mail.</p>
              </div>
            )}
          />
        )}

        {step === 6 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Revisão</h3>
            <p className="text-sm text-muted-foreground">Confira o resumo abaixo. Ao enviar, todas as configurações serão aplicadas automaticamente.</p>
            <div className="grid md:grid-cols-2 gap-3">
              <SummaryCard label="Empresa" value={payload.empresa?.nome_fantasia || payload.empresa?.razao_social || '—'} />
              <SummaryCard label="Fuso horário" value={payload.horarios?.timezone ?? '—'} />
              <SummaryCard label="Negócios" value={`${payload.negocios?.length ?? 0} cadastrados`} />
              <SummaryCard label="Agentes IA" value={`${payload.agentes?.length ?? 0} cadastrados`} />
              <SummaryCard label="Setores" value={`${payload.setores?.length ?? 0} cadastrados`} />
              <SummaryCard label="Equipe" value={`${payload.equipes?.length ?? 0} convites`} />
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-4 border-t">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep(s => Math.max(0, s - 1))}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}>
              Continuar <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Enviando...</> : <>Enviar implantação <CheckCircle2 className="w-4 h-4 ml-1" /></>}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
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
