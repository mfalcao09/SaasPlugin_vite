import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TablesInsert } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import type { FormBlock } from './platformFormTypes';

/**
 * CRM de PLATAFORMA (super_admin) — FormBuilder: persistência dos blocos.
 *
 * O hook de dados `usePlatformCrmForms` (em crm/data/) expõe apenas a QUERY de blocos
 * (`usePlatformCrmFormBlocks`), sem mutation de save. Como não podemos editar arquivos
 * fora de `capture/form/`, este save vive local ao builder.
 *
 * Toca APENAS `platform_crm_form_blocks`. Sem organization_id (RLS super_admin isola).
 * Porte da mutation `useSaveFormBlocks` de hooks/useForms.ts (l.321), sem tenant:
 *   upsert por id → deleta os removidos → bump updated_at do form.
 */

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmSaveFormBlocks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { formId: string; blocks: FormBlock[] }) => {
      if (params.blocks.length === 0) {
        throw new Error(
          'Não é possível salvar um formulário sem blocos. Adicione pelo menos uma tela ou pergunta.',
        );
      }

      const blocksToUpsert: TablesInsert<'platform_crm_form_blocks'>[] = params.blocks.map(
        (block, index) => ({
          id: block.id,
          form_id: params.formId,
          order_index: index,
          block_type: block.block_type,
          label: block.label,
          description: block.description ?? null,
          placeholder: block.placeholder ?? null,
          required: block.required,
          options: block.options as unknown as TablesInsert<'platform_crm_form_blocks'>['options'],
          logic_rules: block.logic_rules as unknown as TablesInsert<'platform_crm_form_blocks'>['logic_rules'],
          maps_to: block.maps_to ?? null,
          score_value: block.score_value,
          score_rules: block.score_rules as unknown as TablesInsert<'platform_crm_form_blocks'>['score_rules'],
          apply_tags: block.apply_tags,
          validation: block.validation as unknown as TablesInsert<'platform_crm_form_blocks'>['validation'],
          block_settings:
            block.block_settings as unknown as TablesInsert<'platform_crm_form_blocks'>['block_settings'],
        }),
      );

      // Upsert primeiro; se falhar, o fluxo existente permanece intacto.
      const { error: upsertError } = await supabase
        .from('platform_crm_form_blocks')
        .upsert(blocksToUpsert, { onConflict: 'id' });
      if (upsertError) throw upsertError;

      // Remove blocos que não estão mais presentes.
      const keptBlockIds = params.blocks.map((b) => b.id);
      const { error: deleteError } = await supabase
        .from('platform_crm_form_blocks')
        .delete()
        .eq('form_id', params.formId)
        .not('id', 'in', `(${keptBlockIds.join(',')})`);
      if (deleteError) throw deleteError;

      // Bump updated_at do formulário.
      await supabase
        .from('platform_crm_forms')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', params.formId);

      return params.blocks;
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'form-blocks', params.formId],
      });
    },
    onError: (error: Error) => {
      toast.error('Erro ao salvar formulário: ' + error.message);
    },
  });
}
