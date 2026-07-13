import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface ImplantacaoPayload {
  empresa: {
    razao_social?: string;
    nome_fantasia?: string;
    cnpj?: string;
    telefone?: string;
    instagram?: string;
    site?: string;
    logo_url?: string;
    endereco?: {
      cep?: string; rua?: string; numero?: string; complemento?: string;
      bairro?: string; cidade?: string; uf?: string;
    };
  };
  horarios: {
    timezone?: string;
    schedule?: Record<string, { enabled: boolean; start: string; end: string }>;
  };
  negocios: Array<any>;
  agentes: Array<any>;
  setores: Array<any>;
  equipes: Array<any>;
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
  negocios: [],
  agentes: [],
  setores: [],
  equipes: [],
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
  const saveTimer = useRef<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Carrega ou cria submission
  useEffect(() => {
    let active = true;
    async function load() {
      // Sem token e sem login: nada a carregar
      if (!token && !user?.id) { setLoading(false); return; }
      setLoading(true);
      try {
        let data: any;
        let nextSession: string | null = null;
        if (token) {
          // Recupera session_token salvo (se já abriu antes nesta aba)
          const stored = sessionStorage.getItem(sessionKey(token));
          const { data: r, error: e } = await supabase.rpc('validate_onboarding_token', {
            _token: token,
            _session_token: stored,
            _ip: null,
            _ua: navigator.userAgent.slice(0, 200),
          });
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
        const loaded = data.payload && Object.keys(data.payload).length > 0
          ? { ...EMPTY_PAYLOAD, ...data.payload }
          : EMPTY_PAYLOAD;
        if (!loaded.empresa?.nome_fantasia) {
          const { data: org } = await supabase.from('organizations')
            .select('name,cnpj,phone,instagram,website,logo_url,address')
            .eq('id', data.organization_id).maybeSingle();
          if (org) {
            loaded.empresa = {
              ...loaded.empresa,
              nome_fantasia: loaded.empresa?.nome_fantasia || org.name || '',
              cnpj: loaded.empresa?.cnpj || org.cnpj || '',
              telefone: loaded.empresa?.telefone || org.phone || '',
              instagram: loaded.empresa?.instagram || (org as any).instagram || '',
              site: loaded.empresa?.site || (org as any).website || '',
              logo_url: loaded.empresa?.logo_url || org.logo_url || '',
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
  }, [user?.id, token]);

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
    updateSection, submit,
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
