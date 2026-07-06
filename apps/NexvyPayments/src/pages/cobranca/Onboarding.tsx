// ─── Onboarding financeiro — wizard conectar C6 + NotaAS via cofre (B6) ────
// Molde de UI: padrão multi-step `step` (CadenceWizard / ImportPayersDialog em
// Pagadores.tsx): passo 1 C6 (boleto/PIX) → passo 2 NotaAS (NFS-e) → passo 3
// revisão. Anatomia Lux: surface-card + brand-gradient no passo ativo.
//
// SEGURANÇA (CLAUDE.md §11.1, ui-cobranca-map B6): as credenciais NUNCA tocam o
// bundle/localStorage/NEXT_PUBLIC_*. O wizard só COLETA e ENVIA para uma edge
// function server-side (`cobranca-onboarding`), que cifra e grava no cofre
// `billing_credentials`. O front nunca persiste plaintext. Os campos de segredo
// vivem só em estado de componente (memória volátil) até o submit, e são
// limpos após o envio.
//
// A edge `cobranca-onboarding` pode NÃO existir ainda (TODO abaixo) — o invoke
// já está no lugar; quando a função subir, o fluxo funciona sem tocar a UI.
// ADITIVO: vive em src/pages/cobranca/ (novo), zero edição de core.

import { useState } from 'react'
import {
  Landmark, FileText, CheckCircle2, Loader2, ShieldCheck, Lock, ArrowRight, ArrowLeft, Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/layout/PageHeader'
import { db, useOrganizationId, onlyDigits, formatDocumento } from './_shared'

// ─── Passos do wizard ──────────────────────────────────────────────────────
const STEPS = [
  { key: 'c6', label: 'C6 (boleto/PIX)', icon: Landmark },
  { key: 'notaas', label: 'NotaAS (NFS-e)', icon: FileText },
  { key: 'revisao', label: 'Revisão', icon: CheckCircle2 },
] as const
type StepKey = (typeof STEPS)[number]['key']

// ─── Credenciais (estado volátil — nunca persistido no front) ──────────────
interface C6Creds { client_id: string; client_secret: string; cert_name: string; cert_pem: string; key_name: string; key_pem: string }
interface NotaAsCreds { project_key: string; cnpj: string; a1_name: string; a1_base64: string }
const EMPTY_C6: C6Creds = { client_id: '', client_secret: '', cert_name: '', cert_pem: '', key_name: '', key_pem: '' }
const EMPTY_NOTAAS: NotaAsCreds = { project_key: '', cnpj: '', a1_name: '', a1_base64: '' }

// ── lê arquivo texto (PEM) ──
async function readText(file: File): Promise<string> {
  return file.text()
}
// ── lê arquivo binário como base64 (certificado A1 .pfx/.p12) ──
async function readBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export default function Onboarding() {
  const organizationId = useOrganizationId()
  const [stepIdx, setStepIdx] = useState(0)
  const [c6, setC6] = useState<C6Creds>(EMPTY_C6)
  const [notaas, setNotaas] = useState<NotaAsCreds>(EMPTY_NOTAAS)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const step = STEPS[stepIdx].key
  const setStep = (k: StepKey) => setStepIdx(STEPS.findIndex((s) => s.key === k))

  const c6Ready = !!c6.client_id.trim() && !!c6.client_secret.trim()
  const notaasReady = !!notaas.project_key.trim() && onlyDigits(notaas.cnpj).length === 14

  // ── Envio ao cofre via edge server-side (credenciais cifradas lá) ──
  const submit = async () => {
    if (!organizationId) return
    setSubmitting(true)
    try {
      // TODO(edge): a função `cobranca-onboarding` recebe as credenciais, cifra
      // (AES/bcrypt conforme o segredo) e grava no cofre `billing_credentials`
      // server-side. Enquanto a função não sobe, este invoke falha graciosamente
      // e o toast informa. NENHUM segredo é persistido no front.
      const { error } = await db.functions.invoke('cobranca-onboarding', {
        body: {
          organization_id: organizationId,
          c6: {
            client_id: c6.client_id.trim(),
            client_secret: c6.client_secret,       // vai cifrado no cofre (server)
            cert_pem: c6.cert_pem || null,
            key_pem: c6.key_pem || null,
          },
          notaas: {
            project_key: notaas.project_key.trim(),
            cnpj: onlyDigits(notaas.cnpj),
            cert_a1_base64: notaas.a1_base64 || null,  // A1 vai cifrado no cofre (server)
          },
        },
      })
      if (error) throw error
      // Limpa os segredos da memória do componente após o envio (defesa em profundidade).
      setC6(EMPTY_C6); setNotaas(EMPTY_NOTAAS)
      setDone(true)
      toast.success('Credenciais enviadas e cifradas no cofre.')
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível concluir o onboarding (a função de cofre pode ainda não estar publicada).')
    } finally {
      setSubmitting(false)
    }
  }

  if (!organizationId) {
    return (
      <div className="p-12 text-center text-muted-foreground text-sm">
        Sua conta ainda não está vinculada a uma organização.
      </div>
    )
  }

  if (done) {
    return (
      <div className="p-6">
        <Card className="surface-card p-10 text-center max-w-lg mx-auto">
          <div className="h-14 w-14 rounded-2xl brand-gradient brand-glow text-white flex items-center justify-center mx-auto">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-foreground">Cofre configurado</h1>
          <p className="mt-2 text-muted-foreground">
            As credenciais de C6 e NotaAS foram enviadas cifradas para o cofre
            (<code className="text-value">billing_credentials</code>). Você já pode gerar faturas e emitir NFS-e.
          </p>
          <Button className="mt-6" onClick={() => { setDone(false); setStep('c6') }}>Reconfigurar</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Onboarding financeiro"
        description="Conecte o C6 (boleto/PIX) e o NotaAS (NFS-e). As credenciais vão cifradas para o cofre."
      />

      {/* Aviso de segurança */}
      <Card className="surface-card p-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl brand-gradient brand-glow text-white flex items-center justify-center flex-shrink-0">
          <Lock className="h-[18px] w-[18px]" />
        </div>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Suas chaves nunca ficam no navegador.</strong> Elas são enviadas
          diretamente a um serviço server-side que as cifra e guarda no cofre
          (<code className="text-value">billing_credentials</code>). Nada é salvo no bundle, no localStorage
          ou em logs do front.
        </p>
      </Card>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const active = i === stepIdx
          const complete = i < stepIdx
          return (
            <div key={s.key} className="flex items-center gap-2 flex-1">
              <div className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-sm flex-1 min-w-0',
                active ? 'brand-gradient brand-glow text-white' : complete ? 'bg-muted border hairline text-foreground' : 'bg-muted/50 border hairline text-muted-foreground',
              )}>
                {complete ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <Icon className="h-4 w-4 flex-shrink-0" />}
                <span className="truncate">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
            </div>
          )
        })}
      </div>

      {/* ── Passo 1: C6 ── */}
      {step === 'c6' && (
        <Card className="surface-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Conectar C6 (boleto + PIX)</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Client ID *</Label><Input value={c6.client_id} onChange={(e) => setC6((c) => ({ ...c, client_id: e.target.value }))} placeholder="client_id da C6" autoComplete="off" /></div>
            <div className="space-y-2"><Label>Client Secret *</Label><Input type="password" value={c6.client_secret} onChange={(e) => setC6((c) => ({ ...c, client_secret: e.target.value }))} placeholder="••••••••" autoComplete="new-password" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Certificado (.pem/.crt)</Label>
              <label className="block">
                <input type="file" accept=".pem,.crt,.cer" className="hidden" id="c6-cert"
                  onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const pem = await readText(f); setC6((c) => ({ ...c, cert_name: f.name, cert_pem: pem })) }} />
                <Button asChild variant="outline" className="w-full gap-2 cursor-pointer">
                  <span onClick={() => document.getElementById('c6-cert')?.click()}><Upload className="h-4 w-4" />{c6.cert_name || 'Selecionar certificado'}</span>
                </Button>
              </label>
            </div>
            <div className="space-y-2">
              <Label>Chave privada (.key/.pem)</Label>
              <label className="block">
                <input type="file" accept=".key,.pem" className="hidden" id="c6-key"
                  onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const pem = await readText(f); setC6((c) => ({ ...c, key_name: f.name, key_pem: pem })) }} />
                <Button asChild variant="outline" className="w-full gap-2 cursor-pointer">
                  <span onClick={() => document.getElementById('c6-key')?.click()}><Upload className="h-4 w-4" />{c6.key_name || 'Selecionar chave'}</span>
                </Button>
              </label>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep('notaas')} disabled={!c6Ready}>Próximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </Card>
      )}

      {/* ── Passo 2: NotaAS ── */}
      {step === 'notaas' && (
        <Card className="surface-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Conectar NotaAS (NFS-e)</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Project Key *</Label><Input value={notaas.project_key} onChange={(e) => setNotaas((n) => ({ ...n, project_key: e.target.value }))} placeholder="chave do projeto NotaAS" autoComplete="off" /></div>
            <div className="space-y-2"><Label>CNPJ do emissor *</Label><Input value={notaas.cnpj} onChange={(e) => setNotaas((n) => ({ ...n, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" inputMode="numeric" /></div>
          </div>
          <div className="space-y-2">
            <Label>Certificado A1 (.pfx/.p12)</Label>
            <label className="block">
              <input type="file" accept=".pfx,.p12" className="hidden" id="notaas-a1"
                onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const b64 = await readBase64(f); setNotaas((n) => ({ ...n, a1_name: f.name, a1_base64: b64 })) }} />
              <Button asChild variant="outline" className="w-full gap-2 cursor-pointer">
                <span onClick={() => document.getElementById('notaas-a1')?.click()}><Upload className="h-4 w-4" />{notaas.a1_name || 'Selecionar certificado A1'}</span>
              </Button>
            </label>
            <p className="text-xs text-muted-foreground">O A1 é lido localmente e enviado cifrado ao cofre — não fica no navegador.</p>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep('c6')}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
            <Button onClick={() => setStep('revisao')} disabled={!notaasReady}>Próximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </Card>
      )}

      {/* ── Passo 3: Revisão ── */}
      {step === 'revisao' && (
        <Card className="surface-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Revisão</h2>
          </div>

          <div className="space-y-3">
            <ReviewRow ok={c6Ready} title="C6 (boleto/PIX)" lines={[
              c6.client_id ? `Client ID: ${c6.client_id}` : 'Client ID pendente',
              c6.client_secret ? 'Client Secret: •••••••• (será cifrado)' : 'Client Secret pendente',
              c6.cert_name ? `Certificado: ${c6.cert_name}` : 'Certificado: não enviado',
              c6.key_name ? `Chave: ${c6.key_name}` : 'Chave: não enviada',
            ]} />
            <ReviewRow ok={notaasReady} title="NotaAS (NFS-e)" lines={[
              notaas.project_key ? `Project Key: ${notaas.project_key}` : 'Project Key pendente',
              notaas.cnpj ? `CNPJ: ${formatDocumento(onlyDigits(notaas.cnpj))}` : 'CNPJ pendente',
              notaas.a1_name ? `Certificado A1: ${notaas.a1_name}` : 'A1: não enviado',
            ]} />
          </div>

          <div className="rounded-xl bg-muted/50 border hairline p-3 flex items-start gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            Ao concluir, tudo é enviado a uma função server-side que cifra e grava no cofre. Nenhum segredo permanece no navegador.
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep('notaas')} disabled={submitting}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
            <Button onClick={submit} disabled={!c6Ready || !notaasReady || submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Concluir e cifrar no cofre
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Linha de revisão (ok = badge dourado; pendente = outline) ─────────────
function ReviewRow({ ok, title, lines }: { ok: boolean; title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border hairline p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">{title}</span>
        {ok
          ? <Badge className="brand-gradient text-white border-0">Pronto</Badge>
          : <Badge variant="outline">Incompleto</Badge>}
      </div>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {lines.map((l, i) => <li key={i} className="tabular-nums">{l}</li>)}
      </ul>
    </div>
  )
}
