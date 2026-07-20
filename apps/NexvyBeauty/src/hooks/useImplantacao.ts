import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// Cor default do espaço (laranja canônico — espelha CompanySettings/GuidedOnboarding).
export const DEFAULT_PRIMARY_COLOR = '#F97316';

// ─── Contrato NexvyBeauty (labels aprovados pelo Marcelo) ───────────────────
// A key `empresa` é mantida (compat com autosave/apply); na UI o step chama-se
// "Seu espaço". Campos novos: slug (link de agendamento) e cor_principal.
// Os nomes das RPCs NÃO mudam (save_onboarding_draft*, submit_onboarding*,
// apply-onboarding).
export interface ImplantacaoPayload {
  empresa: {
    nome_fantasia?: string;
    cnpj?: string;
    telefone?: string;
    instagram?: string;
    logo_url?: string;
    /** Link de agendamento público: {publicBase}/s/{slug}. Mantido sanitizado. */
    slug?: string;
    /** Cor principal do espaço (hex). */
    cor_principal?: string;
    /** Esteira demo: segmento/sub-vertical (default por sub-vertical do ticket). */
    segmento?: string;
    /** Esteira demo: ticket médio (R$) — insumo da fórmula do dinheiro (sumidos × ticket). */
    ticket_medio?: number;
    endereco?: {
      cep?: string; rua?: string; numero?: string; complemento?: string;
      bairro?: string; cidade?: string; uf?: string;
    };
  };
  horarios: {
    timezone?: string;
    schedule?: Record<string, { enabled: boolean; start: string; end: string }>;
  };
  servicos: Array<{ nome?: string; categoria?: string; duracao_min?: number; preco?: number }>;
  profissionais: Array<{ nome?: string; especialidade?: string }>;
  equipia: { nome?: string; tom?: string };
  usuarios: Array<{ nome?: string; email?: string; perfil?: string }>;
}

export const EMPTY_PAYLOAD: ImplantacaoPayload = {
  empresa: { endereco: {} },
  horarios: {
    timezone: 'America/Sao_Paulo',
    schedule: {
      monday: { enabled: true, start: '08:00', end: '18:00' },
      tuesday: { enabled: true, start: '08:00', end: '18:00' },
      wednesday: { enabled: true, start: '08:00', end: '18:00' },
      thursday: { enabled: true, start: '08:00', end: '18:00' },
      friday: { enabled: true, start: '08:00', end: '18:00' },
      saturday: { enabled: false, start: '08:00', end: '12:00' },
      sunday: { enabled: false, start: '08:00', end: '12:00' },
    },
  },
  servicos: [],
  profissionais: [],
  equipia: { nome: 'Lia', tom: 'Amigável' },
  usuarios: [],
};

interface UseImplantacaoOptions {
  token?: string;
}

function sessionKey(token: string) {
  return `onboarding_session_${token}`;
}

export function useImplantacao({ token }: UseImplantacaoOptions = {}) {
  const { user } = useAuth();
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [payload, setPayload] = useState<ImplantacaoPayload>(EMPTY_PAYLOAD);
  const [status, setStatus] = useState<string>('draft');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  // Esteira: discrimina o wizard demo do wizard pago. Vem do validate_onboarding_token
  // (RPC retorna `mode` — migration 20260716). 'demo' → DemoWizard; senão → paga.
  const [mode, setMode] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Takeover (padrão WhatsApp Web): "Usar neste navegador" re-roda o load com
  // _takeover=true — o RPC emite session_token novo e derruba a aba anterior.
  const takeoverRef = useRef(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Carrega ou cria submission
  useEffect(() => {
    let active = true;
    async function load() {
      // Sem token e sem login: nada a carregar
      if (!token && !user?.id) { setLoading(false); return; }
      setLoading(true);
      setError(null);
      try {
        let data: any;
        let nextSession: string | null = null;
        if (token) {
          // Recupera session_token salvo (se já abriu antes nesta aba)
          const stored = sessionStorage.getItem(sessionKey(token));
          const wantsTakeover = takeoverRef.current;
          takeoverRef.current = false;
          // _takeover ainda não está nos types gerados → cast (padrão do repo
          // p/ colunas/args recém-migrados).
          const { data: r, error: e } = await supabase.rpc('validate_onboarding_token', {
            _token: token,
            _session_token: stored,
            _ip: null,
            _ua: navigator.userAgent.slice(0, 200),
            _takeover: wantsTakeover,
          } as any);
          if (e) throw e;
          data = Array.isArray(r) ? r[0] : r;
          nextSession = data?.session_token ?? stored ?? null;
          if (nextSession) sessionStorage.setItem(sessionKey(token), nextSession);
        } else {
          const { data: r, error: e } = await supabase.rpc('get_or_create_first_access_onboarding');
          if (e) throw e;
          data = Array.isArray(r) ? r[0] : r;
        }
        if (!active) return;
        if (!data) throw new Error('Submission não encontrada');
        setSubmissionId(data.submission_id);
        setOrganizationId(data.organization_id);
        setStatus(data.status);
        setSessionToken(nextSession);
        setMode(data.mode ?? null);
        const loaded = data.payload && Object.keys(data.payload).length > 0
          ? { ...EMPTY_PAYLOAD, ...data.payload }
          : EMPTY_PAYLOAD;
        if (!loaded.empresa?.nome_fantasia) {
          // slug/settings podem não estar nos types gerados → cast (mesmo
          // padrão do IdentityStep do GuidedOnboarding).
          const { data: org } = await (supabase as any).from('organizations')
            .select('name,cnpj,phone,instagram,logo_url,address,slug,settings')
            .eq('id', data.organization_id).maybeSingle();
          if (org) {
            loaded.empresa = {
              ...loaded.empresa,
              nome_fantasia: loaded.empresa?.nome_fantasia || org.name || '',
              cnpj: loaded.empresa?.cnpj || org.cnpj || '',
              telefone: loaded.empresa?.telefone || org.phone || '',
              instagram: loaded.empresa?.instagram || org.instagram || '',
              logo_url: loaded.empresa?.logo_url || org.logo_url || '',
              // Slug/cor que a org JÁ tem (backfill) — respeitados como ponto
              // de partida; o wizard deriva do nome só enquanto não há slug.
              slug: loaded.empresa?.slug || org.slug || '',
              cor_principal: loaded.empresa?.cor_principal
                || org.settings?.primary_color
                || DEFAULT_PRIMARY_COLOR,
              endereco: loaded.empresa?.endereco || (() => {
                const a: any = org.address || {};
                return {
                  cep: a.cep,
                  rua: a.rua ?? a.street,
                  numero: a.numero ?? a.number,
                  complemento: a.complemento ?? a.complement,
                  bairro: a.bairro ?? a.neighborhood,
                  cidade: a.cidade ?? a.city,
                  uf: a.uf ?? a.state,
                };
              })(),
            };
          }
        }
        setPayload(loaded);
      } catch (e: any) {
        if (!active) return;
        setError(e.message ?? 'Erro ao carregar');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [user?.id, token, reloadNonce]);

  // "Usar neste navegador": assume a sessão do link (derruba a aba anterior).
  const takeover = useCallback(() => {
    takeoverRef.current = true;
    setReloadNonce((n) => n + 1);
  }, []);

  // Autosave debounced
  const scheduleSave = useCallback((next: ImplantacaoPayload) => {
    setPayload(next);
    if (!submissionId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaving(true);
      let err: any;
      if (token && sessionToken) {
        const { error: e } = await supabase.rpc('save_onboarding_draft_public', {
          _token: token, _session_token: sessionToken, _payload: next as any,
        });
        err = e;
      } else {
        const { error: e } = await supabase.rpc('save_onboarding_draft', {
          _submission_id: submissionId, _payload: next as any,
        });
        err = e;
      }
      setSaving(false);
      if (err) console.error('autosave', err);
    }, 1500);
  }, [submissionId, token, sessionToken]);

  const updateSection = useCallback(<K extends keyof ImplantacaoPayload>(
    key: K, value: ImplantacaoPayload[K]
  ) => {
    scheduleSave({ ...payload, [key]: value });
  }, [payload, scheduleSave]);

  // Fase do wizard (telemetria p/ handoff Duda→CS — RPC barata, fire-and-forget,
  // sem debounce; a CS lê current_step p/ saber "em que página ela está").
  // RPCs criadas na migration 20260714_onboarding_fase_handoff (fora dos types → cast).
  const reportStep = useCallback((stepIndex: number, stepId: string) => {
    if (!submissionId) return;
    const args = token && sessionToken
      ? { fn: 'set_onboarding_step_public', params: { _token: token, _session_token: sessionToken, _step: stepIndex + 1, _step_id: stepId } }
      : { fn: 'set_onboarding_step', params: { _submission_id: submissionId, _step: stepIndex + 1, _step_id: stepId } };
    void (supabase.rpc as any)(args.fn, args.params)
      .then(({ error: e }: { error: unknown }) => { if (e) console.warn('set_onboarding_step', e); });
  }, [submissionId, token, sessionToken]);

  const submit = useCallback(async () => {
    if (!submissionId) return false;
    try {
      if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
      const ua = navigator.userAgent.slice(0, 200);

      if (token && sessionToken) {
        await supabase.rpc('save_onboarding_draft_public', {
          _token: token, _session_token: sessionToken, _payload: payload as any,
        });
        const { error: e1 } = await supabase.rpc('submit_onboarding_public', {
          _token: token, _session_token: sessionToken, _ip: null, _ua: ua,
        });
        if (e1) throw e1;
        const { data, error: e2 } = await supabase.functions.invoke('apply-onboarding', {
          body: { token, session_token: sessionToken },
        });
        if (e2) throw e2;
        if (data?.warnings?.length) {
          toast('Implantação concluída com avisos', { description: `${data.warnings.length} item(s) precisam de revisão` });
        } else {
          toast('Implantação concluída', { description: 'Tudo configurado com sucesso!' });
        }
      } else {
        await supabase.rpc('save_onboarding_draft', { _submission_id: submissionId, _payload: payload as any });
        const { error: e1 } = await supabase.rpc('submit_onboarding', {
          _submission_id: submissionId, _ip: null, _ua: ua,
        });
        if (e1) throw e1;
        const { data, error: e2 } = await supabase.functions.invoke('apply-onboarding', {
          body: { submission_id: submissionId },
        });
        if (e2) throw e2;
        if (data?.warnings?.length) {
          toast('Implantação concluída com avisos', { description: `${data.warnings.length} item(s) precisam de revisão` });
        } else {
          toast('Implantação concluída', { description: 'Tudo configurado com sucesso!' });
        }
      }
      setStatus('applied');
      if (token) sessionStorage.removeItem(sessionKey(token));
      return true;
    } catch (e: any) {
      toast.error('Erro ao enviar', { description: e.message ?? 'Tente novamente' });
      return false;
    }
  }, [submissionId, payload, token, sessionToken]);

  return {
    submissionId, organizationId, payload, status,
    loading, saving, error,
    updateSection, submit, reportStep, takeover,
    // Esteira: `mode` roteia demo vs pago; `sessionToken` autentica a lead na edge demo-evolution.
    mode, sessionToken, token: token ?? null,
  };
}

export async function uploadOnboardingFile(file: File, organizationId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${organizationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('onboarding-uploads').upload(path, file, {
    upsert: false, contentType: file.type,
  });
  if (error) throw error;
  const { data } = await supabase.storage.from('onboarding-uploads').createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? path;
}
