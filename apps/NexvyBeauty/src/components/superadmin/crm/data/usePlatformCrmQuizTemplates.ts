import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import {
  PlatformCrmCaptureFunnel,
  PlatformCrmCaptureFunnelInsert,
  generateFunnelSlug,
} from './usePlatformCrmCaptureFunnels';

/**
 * CRM de PLATAFORMA (super_admin) — TEMPLATES DE QUIZ da captação, desacoplados do tenant.
 * Toca APENAS `platform_crm_quiz_templates` + `platform_crm_capture_funnels`.
 * Sem organization_id / product_id — a RLS super_admin-only isola os dados.
 *
 * Adaptação vs original (`data/quizTemplates.ts` estático + `useCreateFunnel`):
 * - Os templates vêm da tabela `platform_crm_quiz_templates` (o schema platform já os
 *   persiste em DB) em vez do array estático `QUIZ_TEMPLATES` do bundle.
 * - "Usar template" cria um funil `channel_type='quiz'` em `platform_crm_capture_funnels`
 *   copiando `flow_json` → `flow_blocks` (sem product_id — plataforma não tem produtos).
 * - `usage_count` do template é incrementado best-effort após o clone.
 */

export type PlatformCrmQuizTemplate = Tables<'platform_crm_quiz_templates'>;

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmQuizTemplates() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'quiz-templates'],
    queryFn: async (): Promise<PlatformCrmQuizTemplate[]> => {
      const { data, error } = await supabase
        .from('platform_crm_quiz_templates')
        .select('*')
        .order('usage_count', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PlatformCrmQuizTemplate[];
    },
  });
}

/** Cria um funil de quiz a partir de um template (copia flow/appearance). */
export function useCreatePlatformCrmFunnelFromQuizTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; template: PlatformCrmQuizTemplate }) => {
      const { name, template } = input;
      const flowBlocks = Array.isArray(template.flow_json)
        ? (template.flow_json as Record<string, unknown>[])
        : [];
      const startBlockId =
        flowBlocks.length > 0 ? ((flowBlocks[0].id as string | undefined) ?? null) : null;

      const payload: PlatformCrmCaptureFunnelInsert = {
        name,
        slug: `${generateFunnelSlug(name) || 'quiz'}-${Date.now().toString(36)}`,
        description: template.description,
        channel_type: 'quiz',
        status: 'draft',
        channels: {
          chat: { enabled: true, slug_override: null },
          form: { enabled: false, slug_override: null },
          widget: { enabled: false },
        },
        flow_blocks: flowBlocks as PlatformCrmCaptureFunnelInsert['flow_blocks'],
        start_block_id: startBlockId,
        appearance:
          (template.appearance_json as PlatformCrmCaptureFunnelInsert['appearance']) ?? null,
      };

      const { data, error } = await supabase
        .from('platform_crm_capture_funnels')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      // Incrementa contador de uso do template (best-effort)
      await supabase
        .from('platform_crm_quiz_templates')
        .update({ usage_count: (template.usage_count ?? 0) + 1 })
        .eq('id', template.id);

      return data as PlatformCrmCaptureFunnel;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'capture-funnels'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'quiz-templates'] });
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM funnel from quiz template:', error);
      toast.error('Erro ao clonar template');
    },
  });
}
