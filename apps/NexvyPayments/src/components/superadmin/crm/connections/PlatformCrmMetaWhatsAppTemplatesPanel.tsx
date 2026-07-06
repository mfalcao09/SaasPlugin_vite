import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Plus, RefreshCw, FileText, AlertCircle, Sparkles, Trash2, Star, X, Check,
} from 'lucide-react';
import {
  usePlatformCrmMetaWATemplates, useSyncPlatformCrmMetaWATemplates, useSubmitPlatformCrmMetaWATemplate,
  useGeneratePlatformCrmMetaWATemplateAI, useDeletePlatformCrmMetaWATemplate, useSetPlatformCrmDefaultReengagementTemplate,
  type PlatformCrmMetaWAConnection, type PlatformCrmMetaWATemplate,
} from '@/components/superadmin/crm/data/usePlatformCrmMetaWhatsApp';
import { toast } from 'sonner';

const statusVariant: Record<string, string> = {
  APPROVED: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  PENDING: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  REJECTED: 'bg-red-500/15 text-red-700 border-red-500/30',
  PAUSED: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
  APPROVED_PAUSED: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
  DISABLED: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
  IN_APPEAL: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
};

interface Component {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: any;
  buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone_number?: string }>;
}

interface FormState {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  headerEnabled: boolean;
  headerFormat: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerText: string;
  body: string;
  bodyExamples: string[];
  footerEnabled: boolean;
  footer: string;
  buttons: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone_number?: string }>;
}

const EMPTY_FORM: FormState = {
  name: '',
  language: 'pt_BR',
  category: 'UTILITY',
  headerEnabled: false,
  headerFormat: 'TEXT',
  headerText: '',
  body: '',
  bodyExamples: [],
  footerEnabled: false,
  footer: '',
  buttons: [],
};

function detectVars(text: string): number[] {
  const re = /\{\{(\d+)\}\}/g;
  const found = new Set<number>();
  let m;
  while ((m = re.exec(text)) !== null) found.add(parseInt(m[1], 10));
  return Array.from(found).sort((a, b) => a - b);
}

function buildComponents(f: FormState): Component[] {
  const comps: Component[] = [];
  if (f.headerEnabled) {
    if (f.headerFormat === 'TEXT' && f.headerText.trim()) {
      comps.push({ type: 'HEADER', format: 'TEXT', text: f.headerText.trim() });
    } else if (f.headerFormat !== 'TEXT') {
      comps.push({ type: 'HEADER', format: f.headerFormat });
    }
  }
  const bodyVars = detectVars(f.body);
  const bodyComp: Component = { type: 'BODY', text: f.body };
  if (bodyVars.length) {
    const examples = bodyVars.map((_, i) => f.bodyExamples[i] || `exemplo${i + 1}`);
    bodyComp.example = { body_text: [examples] };
  }
  comps.push(bodyComp);
  if (f.footerEnabled && f.footer.trim()) comps.push({ type: 'FOOTER', text: f.footer.trim() });
  if (f.buttons.length) comps.push({ type: 'BUTTONS', buttons: f.buttons });
  return comps;
}

function componentsToForm(name: string, language: string, category: any, comps: Component[]): FormState {
  const f: FormState = { ...EMPTY_FORM, name, language, category };
  for (const c of comps || []) {
    if (c.type === 'HEADER') {
      f.headerEnabled = true;
      f.headerFormat = (c.format ?? 'TEXT') as any;
      if (c.format === 'TEXT') f.headerText = c.text || '';
    } else if (c.type === 'BODY') {
      f.body = c.text || '';
      f.bodyExamples = c.example?.body_text?.[0] || [];
    } else if (c.type === 'FOOTER') {
      f.footerEnabled = true; f.footer = c.text || '';
    } else if (c.type === 'BUTTONS') {
      f.buttons = (c.buttons || []) as any;
    }
  }
  return f;
}

function TemplatePreview({ f }: { f: FormState }) {
  return (
    <div className="bg-[#e5ddd5] rounded-lg p-3 max-w-xs">
      <div className="bg-white rounded-lg shadow-sm p-2 space-y-1 relative">
        <div className="absolute -left-2 top-0 w-3 h-3 bg-white" style={{ clipPath: 'polygon(100% 0,0 0,100% 100%)' }} />
        {f.headerEnabled && f.headerText && (
          <div className="font-semibold text-sm text-zinc-900">{f.headerText}</div>
        )}
        <div className="text-sm whitespace-pre-wrap break-words text-zinc-800">
          {f.body || <span className="text-zinc-400 italic">Corpo da mensagem…</span>}
        </div>
        {f.footerEnabled && f.footer && (
          <div className="text-[11px] text-zinc-500">{f.footer}</div>
        )}
        <div className="text-[10px] text-zinc-400 text-right">10:00 AM</div>
      </div>
      {f.buttons.length > 0 && (
        <div className="mt-1 space-y-1">
          {f.buttons.map((b, i) => (
            <div key={i} className="bg-white rounded-lg text-center py-2 text-sm text-blue-600 font-medium">
              {b.text || 'Botão'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AIGeneratorDialog({
  open, onOpenChange, connectionId, onResult,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  connectionId: string;
  onResult: (f: FormState) => void;
}) {
  const gen = useGeneratePlatformCrmMetaWATemplateAI();
  const [objective, setObjective] = useState('');
  const [tone, setTone] = useState('profissional consultivo');
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY' | 'AUTHENTICATION'>('MARKETING');
  const [language, setLanguage] = useState('pt_BR');
  const [includeOptOut, setIncludeOptOut] = useState(true);
  const [audience, setAudience] = useState('');

  const handleGenerate = async () => {
    if (!objective.trim()) { toast.error('Descreva o objetivo'); return; }
    const tpl = await gen.mutateAsync({
      connection_id: connectionId, objective, tone, category, language,
      include_optout_button: includeOptOut, audience_hint: audience,
    });
    onResult(componentsToForm(tpl.name, tpl.language, tpl.category, tpl.components as any));
    onOpenChange(false);
    toast.success('Template gerado! Revise e ajuste antes de enviar.');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Gerar template com IA</DialogTitle>
          <DialogDescription>Descreva o objetivo e a IA monta um template seguindo as best practices da Meta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Objetivo *</Label>
            <Textarea rows={3} value={objective} onChange={(e) => setObjective(e.target.value)}
              placeholder="Ex: Abrir conversa com lead que se cadastrou no webinar sobre vendas consultivas e ainda não respondeu." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="UTILITY">Utility</SelectItem>
                  <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt_BR">Português (BR)</SelectItem>
                  <SelectItem value="en_US">Inglês (US)</SelectItem>
                  <SelectItem value="es_ES">Espanhol</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Tom</Label>
            <Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="profissional consultivo" />
          </div>
          <div>
            <Label>Público (opcional)</Label>
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="leads que se cadastraram via formulário" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={includeOptOut} onCheckedChange={setIncludeOptOut} />
            <Label className="!mt-0">Incluir botão "Sair da lista" (recomendado)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={gen.isPending || !objective.trim()}>
            {gen.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Gerar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlatformCrmMetaWhatsAppTemplatesPanel({ connection, onClose }: { connection: PlatformCrmMetaWAConnection; onClose: () => void }) {
  const { data: templates = [], isLoading } = usePlatformCrmMetaWATemplates(connection.id);
  const sync = useSyncPlatformCrmMetaWATemplates();
  const submit = useSubmitPlatformCrmMetaWATemplate();
  const del = useDeletePlatformCrmMetaWATemplate();
  const setDefault = useSetPlatformCrmDefaultReengagementTemplate();
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const bodyVars = useMemo(() => detectVars(form.body), [form.body]);

  const handleSubmit = async () => {
    const name = form.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
    if (!name) { toast.error('Nome inválido'); return; }
    if (!form.body.trim()) { toast.error('Corpo obrigatório'); return; }
    if (form.body.length > 1024) { toast.error('Corpo excede 1024 chars'); return; }

    await submit.mutateAsync({
      connection_id: connection.id,
      name,
      language: form.language,
      category: form.category,
      components: buildComponents(form),
    });
    setCreating(false);
    setForm(EMPTY_FORM);
  };

  const addButton = (type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER') => {
    if (form.buttons.length >= 3) { toast.error('Máximo 3 botões'); return; }
    setForm({
      ...form,
      buttons: [
        ...form.buttons,
        type === 'QUICK_REPLY' ? { type, text: '' }
          : type === 'URL' ? { type, text: '', url: 'https://' }
          : { type, text: '', phone_number: '+5511' },
      ],
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Templates — {connection.display_name}</DialogTitle>
          <DialogDescription>
            Templates HSM aprovados pela Meta podem ser enviados fora da janela de 24h. Crie do zero ou gere com IA.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-muted-foreground">{templates.length} template(s)</div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => sync.mutate(connection.id)} disabled={sync.isPending}>
              {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sincronizar
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setCreating(true); setAiOpen(true); }}>
              <Sparkles className="h-4 w-4 mr-2" />Gerar com IA
            </Button>
            <Button size="sm" onClick={() => { setCreating(true); setForm(EMPTY_FORM); }}>
              <Plus className="h-4 w-4 mr-2" />Novo
            </Button>
          </div>
        </div>

        {creating && (
          <Card className="p-4 border-primary/40">
            <div className="grid lg:grid-cols-[1fr,auto] gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nome (snake_case)</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="abertura_webinar_v1" />
                  </div>
                  <div>
                    <Label>Idioma</Label>
                    <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt_BR">Português (BR)</SelectItem>
                        <SelectItem value="en_US">Inglês (US)</SelectItem>
                        <SelectItem value="es_ES">Espanhol</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTILITY">Utility</SelectItem>
                      <SelectItem value="MARKETING">Marketing</SelectItem>
                      <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Header */}
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.headerEnabled} onCheckedChange={(v) => setForm({ ...form, headerEnabled: v })} />
                    <Label className="!mt-0">Cabeçalho (opcional)</Label>
                  </div>
                  {form.headerEnabled && (
                    <>
                      <Select value={form.headerFormat} onValueChange={(v) => setForm({ ...form, headerFormat: v as any })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TEXT">Texto</SelectItem>
                          <SelectItem value="IMAGE">Imagem</SelectItem>
                          <SelectItem value="VIDEO">Vídeo</SelectItem>
                          <SelectItem value="DOCUMENT">Documento (PDF)</SelectItem>
                        </SelectContent>
                      </Select>
                      {form.headerFormat === 'TEXT' ? (
                        <Input maxLength={60} value={form.headerText} onChange={(e) => setForm({ ...form, headerText: e.target.value })} placeholder="Máx 60 chars" />
                      ) : (
                        <div className="text-[11px] text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded p-2">
                          Templates com mídia exigem que você suba o vídeo/imagem após a aprovação, pelo Business Manager da Meta.
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Body */}
                <div className="space-y-2 border-t pt-3">
                  <Label>Corpo * (use {'{{1}}'}, {'{{2}}'} para variáveis)</Label>
                  <Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                    placeholder="Olá {{1}}, vi que você se cadastrou no {{2}}. Posso te enviar o link?" maxLength={1024} />
                  <div className="text-xs text-muted-foreground">{form.body.length}/1024</div>
                  {bodyVars.length > 0 && (
                    <div className="space-y-2 bg-muted/40 p-3 rounded">
                      <div className="text-xs font-medium">Exemplos das variáveis (obrigatório para a Meta):</div>
                      {bodyVars.map((n, i) => (
                        <div key={n} className="flex items-center gap-2">
                          <Badge variant="outline" className="shrink-0">{'{{' + n + '}}'}</Badge>
                          <Input value={form.bodyExamples[i] || ''}
                            onChange={(e) => {
                              const next = [...form.bodyExamples];
                              next[i] = e.target.value;
                              setForm({ ...form, bodyExamples: next });
                            }}
                            placeholder={`Exemplo para variável ${n}`} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.footerEnabled} onCheckedChange={(v) => setForm({ ...form, footerEnabled: v })} />
                    <Label className="!mt-0">Rodapé (opcional, máx 60 chars)</Label>
                  </div>
                  {form.footerEnabled && (
                    <Input maxLength={60} value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} />
                  )}
                </div>

                {/* Buttons */}
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <Label className="!mt-0">Botões (até 3)</Label>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => addButton('QUICK_REPLY')} disabled={form.buttons.length >= 3}>+ Resposta rápida</Button>
                      <Button size="sm" variant="outline" onClick={() => addButton('URL')} disabled={form.buttons.length >= 3}>+ URL</Button>
                    </div>
                  </div>
                  {form.buttons.length === 0 && form.category === 'MARKETING' && (
                    <div className="text-xs text-amber-600 flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      Marketing recomenda botão "Sair da lista" para opt-out automático.
                      <button className="underline ml-1" onClick={() => setForm({ ...form, buttons: [{ type: 'QUICK_REPLY', text: 'Sair da lista' }] })}>Adicionar</button>
                    </div>
                  )}
                  {form.buttons.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0 w-24 justify-center">{b.type === 'QUICK_REPLY' ? 'Resposta' : b.type === 'URL' ? 'URL' : 'Telefone'}</Badge>
                      <Input value={b.text} placeholder="Texto do botão (máx 25)" maxLength={25}
                        onChange={(e) => {
                          const next = [...form.buttons];
                          next[i] = { ...next[i], text: e.target.value };
                          setForm({ ...form, buttons: next });
                        }} />
                      {b.type === 'URL' && (
                        <Input value={b.url ?? ''} placeholder="https://…" onChange={(e) => {
                          const next = [...form.buttons];
                          next[i] = { ...next[i], url: e.target.value };
                          setForm({ ...form, buttons: next });
                        }} />
                      )}
                      <Button size="icon" variant="ghost" onClick={() => setForm({ ...form, buttons: form.buttons.filter((_, x) => x !== i) })}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="lg:w-72 shrink-0 space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">Pré-visualização</Label>
                <TemplatePreview f={form} />
                <div className="text-[11px] text-muted-foreground">
                  Após enviar, a Meta aprova em minutos (UTILITY) a algumas horas (MARKETING). Templates aprovados permitem edição apenas do corpo e rodapé.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => { setCreating(false); setForm(EMPTY_FORM); }}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={submit.isPending || !form.name || !form.body}>
                {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Check className="h-4 w-4 mr-2" />Enviar para aprovação
              </Button>
            </div>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : templates.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nenhum template ainda. Crie um novo, gere com IA, ou clique em "Sincronizar".
          </Card>
        ) : (
          <div className="space-y-2">
            {templates.map((t: PlatformCrmMetaWATemplate) => {
              const isDefault = connection.default_reengagement_template_id === t.id;
              const body = (t.components as any[])?.find((c) => c.type === 'BODY')?.text ?? '';
              return (
                <Card key={t.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{t.name}</span>
                        <Badge variant="outline" className="text-xs">{t.language}</Badge>
                        <Badge variant="outline" className="text-xs">{t.category}</Badge>
                        <Badge className={statusVariant[t.status] ?? ''} variant="outline">{t.status}</Badge>
                        {isDefault && <Badge variant="default" className="text-xs gap-1"><Star className="h-3 w-3" />Reengajamento padrão</Badge>}
                      </div>
                      {body && <div className="text-xs text-muted-foreground line-clamp-2">{body}</div>}
                      {t.rejected_reason && (
                        <div className="text-xs text-destructive flex items-start gap-1"><AlertCircle className="h-3 w-3 mt-0.5" />{t.rejected_reason}</div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {t.status === 'APPROVED' && !isDefault && (
                        <Button size="sm" variant="ghost"
                          onClick={() => setDefault.mutate({ connection_id: connection.id, template_id: t.id })}
                          disabled={setDefault.isPending}>
                          <Star className="h-4 w-4 mr-1" />Definir padrão
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => {
                        if (confirm(`Remover template "${t.name}"?`)) del.mutate(t.id);
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <AIGeneratorDialog open={aiOpen} onOpenChange={setAiOpen} connectionId={connection.id} onResult={setForm} />
      </DialogContent>
    </Dialog>
  );
}
