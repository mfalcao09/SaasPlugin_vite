import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Tipos (espelho do OpenAPI v2 da Salvy) ─────────────────
export type SalvyNumberStatus = 'pending' | 'active' | 'blocked' | 'canceled';

export interface SalvyNumber {
  id: string;
  name: string | null;
  phoneNumber: string; // E.164, ex: +5511912341234
  status: SalvyNumberStatus;
  createdAt: string;
  canceledAt: string | null;
  cancelReason: string | null;
  redirectPhoneNumber: string | null;
  redirectExpiresAt: string | null;
  costCenter: string | null;
  employeeId: string | null;
  customFields: Record<string, string> | null;
}

export interface SalvySmsMessage {
  id: string;
  receivedAt: string;
  originPhoneNumber: string;
  destinationPhoneNumber: string;
  message: string;
  detections?: {
    whatsapp?: {
      verificationCode: string;
    };
  };
}

export interface SalvyAreaCode {
  areaCode: number;
  available: boolean;
}

export type SalvyCancelReason =
  | 'unnecessary'
  | 'whatsapp-ban'
  | 'technical-issues'
  | 'company-canceled';

// ─── Invoke helper ──────────────────────────────────────────
// Toda chamada passa pelo salvy-proxy (JWT super-admin; key só server-side).
async function salvyInvoke<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('salvy-proxy', {
    body: { action, ...payload },
  });
  if (error) {
    // FunctionsHttpError não expõe o body direto; tenta extrair a mensagem real.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw new Error(error.message || 'Falha ao chamar a integração Salvy');
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// ─── Queries (read-only) ────────────────────────────────────
export function useSalvyNumbers() {
  return useQuery({
    queryKey: ['salvy-numbers'],
    queryFn: async () => {
      const data = await salvyInvoke<{ numbers: SalvyNumber[] }>('list_numbers');
      return data.numbers;
    },
  });
}

export function useSalvyNumber(id: string | null) {
  return useQuery({
    queryKey: ['salvy-number', id],
    queryFn: async () => {
      const data = await salvyInvoke<{ number: SalvyNumber }>('get_number', { id });
      return data.number;
    },
    enabled: !!id,
  });
}

export function useSalvySms(id: string | null, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['salvy-sms', id, page, pageSize],
    queryFn: async () => {
      const data = await salvyInvoke<{ smsMessages: SalvySmsMessage[] }>('list_sms', {
        id,
        page,
        pageSize,
      });
      return data.smsMessages;
    },
    enabled: !!id,
    // OTP tem janela curta — mantém a lista fresca enquanto a tela está aberta.
    refetchInterval: 15_000,
  });
}

export function useSalvyAreaCodes(enabled = true) {
  return useQuery({
    queryKey: ['salvy-area-codes'],
    queryFn: async () => {
      const data = await salvyInvoke<{ areaCodes: SalvyAreaCode[] }>('list_area_codes');
      return data.areaCodes;
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

// ─── Mutations (billable / destrutiva) ──────────────────────
export function useCreateSalvyNumber() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { areaCode: number; name?: string; costCenter?: string }) => {
      const data = await salvyInvoke<{ number: SalvyNumber }>('create_number', {
        ...input,
        confirm: true, // o dialog da UI já confirmou custo com o operador
      });
      return data.number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salvy-numbers'] });
    },
  });
}

export function useCancelSalvyNumber() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: SalvyCancelReason }) => {
      await salvyInvoke<{ ok: boolean }>('cancel_number', {
        ...input,
        confirm: true, // type-to-confirm já validado na UI
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['salvy-numbers'] });
      queryClient.invalidateQueries({ queryKey: ['salvy-number', vars.id] });
    },
  });
}

// ─── Util ───────────────────────────────────────────────────
/** +5511912341234 → "+55 11 91234-1234" (fallback: retorna como veio). */
export function formatSalvyPhone(e164: string | null | undefined): string {
  if (!e164) return '—';
  const m = e164.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return e164;
  return `+55 ${m[1]} ${m[2]}-${m[3]}`;
}
