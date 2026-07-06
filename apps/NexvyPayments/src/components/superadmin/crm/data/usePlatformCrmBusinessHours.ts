import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * HORÁRIOS de funcionamento do CRM de PLATAFORMA (super_admin) — desacoplados
 * do tenant. Port do `useBusinessHours` do CRM Vendus para as tabelas
 * `platform_crm_business_hours` + `platform_crm_business_holidays`, SEM
 * organization_id (a tabela de plataforma usa uma linha única via coluna
 * `singleton`; a RLS super_admin-only isola os dados).
 */

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Segunda',
  tue: 'Terça',
  wed: 'Quarta',
  thu: 'Quinta',
  fri: 'Sexta',
  sat: 'Sábado',
  sun: 'Domingo',
};

export const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export interface ScheduleBlock {
  start: string; // HH:MM
  end: string;
}

export type WeekSchedule = Record<DayKey, ScheduleBlock[]>;

/** Linha de `platform_crm_business_hours` com `schedule` já tipado. */
export type PlatformCrmBusinessHours = Omit<
  Tables<'platform_crm_business_hours'>,
  'schedule'
> & { schedule: WeekSchedule };

export type PlatformCrmBusinessHoliday = Tables<'platform_crm_business_holidays'>;

const PLATFORM_CRM_KEY = 'platform-crm';

const DEFAULT_SCHEDULE: WeekSchedule = {
  mon: [{ start: '09:00', end: '18:00' }],
  tue: [{ start: '09:00', end: '18:00' }],
  wed: [{ start: '09:00', end: '18:00' }],
  thu: [{ start: '09:00', end: '18:00' }],
  fri: [{ start: '09:00', end: '18:00' }],
  sat: [],
  sun: [],
};

export function usePlatformCrmBusinessHours() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'business-hours'],
    queryFn: async (): Promise<PlatformCrmBusinessHours | null> => {
      const { data, error } = await supabase
        .from('platform_crm_business_hours')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data as unknown as PlatformCrmBusinessHours | null;
    },
  });
}

export function useUpsertPlatformCrmBusinessHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      schedule?: WeekSchedule;
      timezone?: string;
      out_of_hours_message?: string;
      out_of_hours_enabled?: boolean;
    }) => {
      // Linha única via coluna `singleton` — a tabela de plataforma não tem
      // organization_id. onConflict garante idempotência do upsert.
      const payload = {
        singleton: true,
        timezone: input.timezone ?? 'America/Sao_Paulo',
        schedule: (input.schedule ?? DEFAULT_SCHEDULE) as unknown as Tables<'platform_crm_business_hours'>['schedule'],
        out_of_hours_message: input.out_of_hours_message ?? '',
        out_of_hours_enabled: input.out_of_hours_enabled ?? false,
      };
      const { data, error } = await supabase
        .from('platform_crm_business_hours')
        .upsert(payload, { onConflict: 'singleton' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'business-hours'] });
      toast.success('Horários salvos');
    },
    onError: (error: any) => {
      console.error('Error saving platform CRM business hours:', error);
      toast.error('Erro ao salvar horários');
    },
  });
}

export function usePlatformCrmBusinessHolidays() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'business-holidays'],
    queryFn: async (): Promise<PlatformCrmBusinessHoliday[]> => {
      const { data, error } = await supabase
        .from('platform_crm_business_holidays')
        .select('*')
        .order('date');
      if (error) throw error;
      return (data ?? []) as PlatformCrmBusinessHoliday[];
    },
  });
}

export function useAddPlatformCrmHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { date: string; description?: string }) => {
      const { error } = await supabase.from('platform_crm_business_holidays').insert({
        date: input.date,
        description: input.description ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'business-holidays'] });
    },
    onError: (error: any) => {
      console.error('Error adding platform CRM holiday:', error);
      toast.error('Erro ao adicionar feriado');
    },
  });
}

export function useDeletePlatformCrmHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_business_holidays')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'business-holidays'] });
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM holiday:', error);
      toast.error('Erro ao remover feriado');
    },
  });
}

/** Avaliação local de "está aberto agora?" — idêntica ao original, sem I/O. */
export function isWithinPlatformCrmBusinessHoursLocal(
  bh: PlatformCrmBusinessHours | null,
  holidays: PlatformCrmBusinessHoliday[],
  now: Date = new Date(),
): boolean {
  if (!bh) return true;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: bh.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = fmt.formatToParts(now);
    const get = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
    const wk = get('weekday').toLowerCase();
    const dayMap: Record<string, DayKey> = {
      mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun',
    };
    const day = dayMap[wk];
    const isoDate = `${get('year')}-${get('month')}-${get('day')}`;
    if (holidays.some((h) => h.date === isoDate)) return false;
    const blocks = bh.schedule?.[day] ?? [];
    if (blocks.length === 0) return false;
    const time = `${get('hour')}:${get('minute')}`;
    return blocks.some((b) => time >= b.start && time < b.end);
  } catch {
    return true;
  }
}
