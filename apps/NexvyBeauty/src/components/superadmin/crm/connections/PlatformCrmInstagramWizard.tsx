import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, Copy, CheckCircle2, AlertTriangle, Info, Instagram, ShieldAlert } from 'lucide-react';
import {
  useDraftPlatformCrmInstagramConnection,
  useSavePlatformCrmInstagramConnection,
  type PlatformCrmInstagramConnection,
} from '@/components/superadmin/crm/data/usePlatformCrmInstagram';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: PlatformCrmInstagramConnection | null;
}

const TOTAL_STEPS = 5;

export function PlatformCrmInstagramWizard({ open, onClose, editing }: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    display_name: '',
    app_id: '',
    app_secret: '',
    fb_page_id: '',
    ig_business_account_id: '',
    page_access_token: '',
  });
  const [draftId, setDraftId] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [webhookOk, setWebhookOk] = useState(false);

  const draft = useDraftPlatformCrmInstagramConnection();
  const save = useSavePlatformCrmInstagramConnection();

  // Conexão em edição com credenciais já cifradas no banco: campos de segredo
  // deixam de ser obrigatórios (em branco = manter o atual). Fallback em
  // status==='active' cobre o caso de a coluna cifrada não vir no select.
  const hasStoredSecret = !!editing && (!!editing.app_secret_encrypted || editing.status === 'active');
  const hasStoredToken = !!editing && (!!editing.page_access_token_encrypted || editing.status === 'active');

  // Reset / hydrate on open
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        display_name: editing.display_name ?? '',
        app_id: editing.app_id ?? '',
        app_secret: '',
        fb_page_id: editing.fb_page_id ?? '',
        ig_business_account_id: editing.ig_business_account_id ?? '',
        page_access_token: '',
      });
      setDraftId(editing.id);
      setVerifyToken(editing.webhook_verify_token ?? '');
      setWebhookUrl(
        editing.id
          ? `${(import.meta.env.VITE_SUPABASE_URL as string) ?? ''}/functions/v1/platform-instagram-webhook/${editing.id}`
          : ''
      );
      setWebhookOk(!!editing.webhook_subscribed_at);
      setStep(editing.status === 'draft' ? 3 : 4);
    } else {
      setStep(1);
      setDraftId(null);
      setWebhookUrl('');
      setVerifyToken('');
      setWebhookOk(false);
      setForm({ display_name: '', app_id: '', app_secret: '', fb_page_id: '', ig_business_account_id: '', page_access_token: '' });
    }
  }, [editing, open]);

  // Poll webhook_subscribed_at while in step 3
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    if (step !== 3 || !draftId || webhookOk) return;
    pollRef.current = window.setInterval(async () => {
      const { data } = await supabase
        .from('platform_crm_instagram_connections')
        .select('webhook_subscribed_at')
        .eq('id', draftId)
        .maybeSingle();
      if ((data as any)?.webhook_subscribed_at) {
        setWebhookOk(true);
        if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      }
    }, 3000);
    return () => { if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; } };
  }, [step, draftId, webhookOk]);

  const handleCreateDraft = async () => {
    if (!form.display_name.trim()) { toast.error('Dê um nome para esta conexão'); return; }
    const res = await draft.mutateAsync({
      display_name: form.display_name.trim(),
      connection_id: draftId ?? undefined,
    });
    setDraftId(res.connection_id);
    setWebhookUrl(res.webhook_url);
    setVerifyToken(res.verify_token);
    setWebhookOk(!!res.webhook_subscribed_at);
    setStep(3);
  };

  const handleActivate = async () => {
    if (!draftId) return;
    if (!form.app_id || !form.fb_page_id || !form.ig_business_account_id || (!form.page_access_token && !hasStoredToken)) {
      toast.error(hasStoredToken ? 'Preencha App ID, Page ID e IG Account ID' : 'Preencha todos os campos');
      return;
    }
    const res: any = await save.mutateAsync({
      connection_id: draftId,
      display_name: form.display_name.trim() || undefined,
      app_id: form.app_id,
      app_secret: form.app_secret || undefined,
      fb_page_id: form.fb_page_id,
      ig_business_account_id: form.ig_business_account_id,
      // Em branco em conexão existente = manter o token salvo (edge decripta e reusa)
      page_access_token: form.page_access_token || undefined,
    });
    if (res?.ok) onClose();
  };

  const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success('Copiado'); };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5 text-pink-500" />
            Instagram Direct (Meta) — Passo {step} de {TOTAL_STEPS}
          </DialogTitle>
          <DialogDescription>
            Conexão BYO: você usa seu próprio Meta App, sua Página do Facebook e sua conta Instagram profissional.
            Credenciais ficam criptografadas.
          </DialogDescription>
        </DialogHeader>

        {/* ---------------- STEP 1: Pré-requisitos ---------------- */}
        {step === 1 && (
          <div className="space-y-4">
            <Alert className="border-pink-500/40">
              <ShieldAlert className="h-4 w-4 text-pink-600" />
              <AlertTitle>Esta conexão é SEPARADA do WhatsApp Oficial</AlertTitle>
              <AlertDescription className="text-sm">
                Use credenciais, webhook e Verify Token <strong>exclusivos do Instagram</strong>.
                Não reaproveite a URL nem o token do WhatsApp aqui.
              </AlertDescription>
            </Alert>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Pré-requisitos</AlertTitle>
              <AlertDescription className="space-y-1.5 mt-2 text-sm">
                <p>• Conta Instagram convertida em <strong>Business ou Creator</strong>.</p>
                <p>• <strong>Página do Facebook</strong> vinculada a essa conta IG.</p>
                <p>• Conta Meta Business + Meta App próprio (não use o do WhatsApp).</p>
                <p>• Permissões: <code>instagram_basic</code>, <code>instagram_manage_messages</code>, <code>pages_manage_metadata</code>, <code>pages_messaging</code>, <code>pages_show_list</code>.</p>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* ---------------- STEP 2: Criar Meta App ---------------- */}
        {step === 2 && (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Crie seu Meta App</AlertTitle>
              <AlertDescription className="space-y-1.5 mt-2 text-sm">
                <p>1. Acesse <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-primary underline">Meta for Developers</a> e crie um App tipo <strong>Business</strong>.</p>
                <p>2. Adicione o produto <strong>Instagram</strong> (Instagram Messaging API) e/ou <strong>Messenger</strong>.</p>
                <p>3. Vincule sua <strong>Página do Facebook</strong> e sua conta <strong>Instagram Business</strong>.</p>
                <p>4. Em Configurações → Básico anote <strong>App ID</strong> e <strong>App Secret</strong>.</p>
              </AlertDescription>
            </Alert>
            <Button asChild variant="outline" className="w-full">
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />Abrir Meta for Developers
              </a>
            </Button>
            <div className="space-y-2">
              <Label>Nome da conexão</Label>
              <Input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="Ex.: Instagram @minhamarca"
              />
              <p className="text-xs text-muted-foreground">Usado só internamente para identificar essa conexão.</p>
            </div>
          </div>
        )}

        {/* ---------------- STEP 3: Webhook ---------------- */}
        {step === 3 && (
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Essa URL é exclusiva da conexão Instagram</AlertTitle>
              <AlertDescription className="text-sm">
                Não use a URL do WhatsApp aqui. Cada conexão tem URL e Verify Token próprios.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>URL de callback</Label>
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => copy(webhookUrl)}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Verify Token</Label>
              <div className="flex gap-2">
                <Input readOnly value={verifyToken} className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => copy(verifyToken)}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>No painel do seu Meta App</AlertTitle>
              <AlertDescription className="space-y-1.5 mt-2 text-sm">
                <p>1. Vá em <strong>Instagram</strong> (ou <strong>Webhooks</strong>) → <strong>Configurar webhooks</strong>.</p>
                <p>2. Cole a <strong>URL de callback</strong> acima.</p>
                <p>3. Cole o <strong>Verify Token</strong> acima.</p>
                <p>4. Deixe <strong>mTLS / certificado de cliente desativado</strong>.</p>
                <p>5. Clique em <strong>Verificar e salvar</strong>. Só isso.</p>
                <p>6. <strong>Não precisa assinar campos aqui</strong>: a UI da Meta não permite assinar <code>messages</code> sem Advanced Access. A assinatura é feita <strong>automaticamente via API</strong> quando você clicar em "Validar e ativar" no final deste assistente.</p>
              </AlertDescription>
            </Alert>

            {webhookOk ? (
              <Alert className="border-green-500/40 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle>Webhook verificado pela Meta ✅</AlertTitle>
                <AlertDescription>Pode avançar para colar suas credenciais.</AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>Aguardando a Meta validar...</AlertTitle>
                <AlertDescription className="text-sm">
                  Quando você clicar em "Verificar e salvar" no Meta, a confirmação aparece aqui automaticamente.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ---------------- STEP 4: Credenciais ---------------- */}
        {step === 4 && (
          <div className="space-y-3">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Onde encontrar cada dado</AlertTitle>
              <AlertDescription className="text-sm space-y-1.5 mt-2">
                <p><strong>App ID</strong> + <strong>App Secret</strong>: Meta App → Configurações → Básico.</p>
                <p><strong>Page Access Token</strong>: Graph API Explorer → escolha o App → "Get Page Access Token" → troque por long-lived em <code>/oauth/access_token</code>.</p>
                <p><strong>Instagram Business Account ID</strong>: <code>GET /{'{page-id}'}?fields=instagram_business_account</code>.</p>
                <p><strong>Facebook Page ID</strong>: aparece no painel da página ou em <code>/me/accounts</code>.</p>
              </AlertDescription>
            </Alert>

            {editing && (
              <div>
                <Label>Nome da conexão</Label>
                <Input
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  placeholder="Ex.: Instagram @minhamarca"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>App ID</Label>
                <Input value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value })} />
              </div>
              <div>
                <Label>App Secret {hasStoredSecret && <span className="text-xs text-muted-foreground">(em branco mantém)</span>}</Label>
                <Input
                  type="password"
                  value={form.app_secret}
                  onChange={(e) => setForm({ ...form, app_secret: e.target.value })}
                  placeholder={hasStoredSecret ? '•••• deixe em branco para manter o atual' : undefined}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Facebook Page ID</Label>
                <Input value={form.fb_page_id} onChange={(e) => setForm({ ...form, fb_page_id: e.target.value })} />
              </div>
              <div>
                <Label>Instagram Business Account ID</Label>
                <Input value={form.ig_business_account_id} onChange={(e) => setForm({ ...form, ig_business_account_id: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Page Access Token (longa duração) {hasStoredToken && <span className="text-xs text-muted-foreground">(em branco mantém)</span>}</Label>
              <Input
                type="password"
                value={form.page_access_token}
                onChange={(e) => setForm({ ...form, page_access_token: e.target.value })}
                placeholder={hasStoredToken ? '•••• deixe em branco para manter o atual' : undefined}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Use um Page Access Token com permissões de Instagram Messaging. Recomendamos usar token de longa duração (60 dias).
            </p>
          </div>
        )}

        {/* ---------------- STEP 5: Resumo ---------------- */}
        {step === 5 && (
          <div className="space-y-4">
            <Alert className="border-green-500/40 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>Pronto para ativar</AlertTitle>
              <AlertDescription className="text-sm">
                Vamos validar suas credenciais na Graph API, criptografá-las e inscrever sua Página no app.
              </AlertDescription>
            </Alert>

            <div className="rounded-md border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Webhook</span>
                {webhookOk ? <Badge className="bg-green-500/15 text-green-700 border-green-500/30">Verificado pela Meta</Badge>
                : <Badge variant="secondary">Pendente</Badge>}
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">App ID</span><span className="font-mono text-xs">{form.app_id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Page ID</span><span className="font-mono text-xs">{form.fb_page_id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">IG Account ID</span><span className="font-mono text-xs">{form.ig_business_account_id}</span></div>
            </div>

            {!webhookOk && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  O webhook ainda não foi verificado pela Meta. Você pode ativar mesmo assim, mas só vai receber mensagens depois que a Meta validar o webhook.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && step < 5 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>Voltar</Button>
          )}
          {step === 1 && <Button onClick={() => setStep(2)}>Avançar</Button>}
          {step === 2 && (
            <Button onClick={handleCreateDraft} disabled={draft.isPending || !form.display_name.trim()}>
              {draft.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar URL e Verify Token
            </Button>
          )}
          {step === 3 && <Button onClick={() => setStep(4)}>Avançar para credenciais</Button>}
          {step === 4 && <Button onClick={() => setStep(5)}>Revisar e ativar</Button>}
          {step === 5 && (
            <Button onClick={handleActivate} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Validar e ativar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
