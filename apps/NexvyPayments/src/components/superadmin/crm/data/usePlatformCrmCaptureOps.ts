import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TablesInsert } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import {
  PlatformCrmCaptureFunnel,
  PlatformCrmCaptureFunnelInsert,
  generateFunnelSlug,
} from './usePlatformCrmCaptureFunnels';
import { PlatformCrmForm, PlatformCrmFormInsert, PlatformCrmFormTemplate } from './usePlatformCrmForms';

/**
 * CRM de PLATAFORMA (super_admin) — captação: operações compostas (duplicar / criar de template).
 * Porte desacoplado das mutations equivalentes de `hooks/useFunnels.ts` e `hooks/useForms.ts`
 * do CRM original. Sem organization_id / product_id.
 */

const PLATFORM_CRM_KEY = 'platform-crm';

/** Duplica um funil de captação (novo slug, status draft, contadores zerados). */
export function useDuplicatePlatformCrmCaptureFunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (funnelId: string) => {
      const { data: original, error: fetchError } = await supabase
        .from('platform_crm_capture_funnels')
        .select('*')
        .eq('id', funnelId)
        .single();

      if (fetchError) throw fetchError;
      const src = original as PlatformCrmCaptureFunnel;

      const name = `${src.name} (cópia)`;
      const payload: PlatformCrmCaptureFunnelInsert = {
        name,
        slug: `${generateFunnelSlug(name) || 'funil'}-${Date.now().toString(36)}`,
        description: src.description,
        channel_type: src.channel_type,
        channels: src.channels,
        flow_blocks: src.flow_blocks,
        start_block_id: src.start_block_id,
        distribution_rule: src.distribution_rule,
        round_robin_config: src.round_robin_config,
        status: 'draft',
        theme: src.theme,
        appearance: src.appearance,
        widget_config: src.widget_config,
        ai_enabled: src.ai_enabled,
        ai_context: src.ai_context,
        default_tags: src.default_tags,
        default_temperature: src.default_temperature,
        utm_capture: src.utm_capture,
        custom_scripts: src.custom_scripts,
        facebook_pixel_id: src.facebook_pixel_id,
        google_tag_id: src.google_tag_id,
      };

      const { data, error } = await supabase
        .from('platform_crm_capture_funnels')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmCaptureFunnel;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'capture-funnels'] });
      toast.success('Funil duplicado!');
    },
    onError: (error: any) => {
      console.error('Error duplicating platform CRM funnel:', error);
      toast.error('Erro ao duplicar funil');
    },
  });
}

/** Duplica um formulário incluindo seus blocos (novo slug, status draft). */
export function useDuplicatePlatformCrmForm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formId: string) => {
      const { data: original, error: fetchError } = await supabase
        .from('platform_crm_forms')
        .select('*')
        .eq('id', formId)
        .single();

      if (fetchError) throw fetchError;
      const src = original as PlatformCrmForm;

      const name = `${src.name} (cópia)`;
      const payload: PlatformCrmFormInsert = {
        name,
        slug: `${generateFunnelSlug(name) || 'form'}-${Date.now().toString(36)}`,
        description: src.description,
        status: 'draft',
        settings: src.settings,
        theme: src.theme,
        distribution_rule: src.distribution_rule,
        round_robin_config: src.round_robin_config,
        default_temperature: src.default_temperature,
        utm_capture: src.utm_capture,
        custom_scripts: src.custom_scripts,
        facebook_pixel_id: src.facebook_pixel_id,
        google_tag_id: src.google_tag_id,
      };

      const { data: newForm, error: insertError } = await supabase
        .from('platform_crm_forms')
        .insert(payload)
        .select()
        .single();

      if (insertError) throw insertError;
      const created = newForm as PlatformCrmForm;

      // Copia os blocos do formulário original
      const { data: blocks, error: blocksError } = await supabase
        .from('platform_crm_form_blocks')
        .select('*')
        .eq('form_id', formId)
        .order('order_index', { ascending: true });

      if (blocksError) throw blocksError;

      if (blocks && blocks.length > 0) {
        const blockInserts: TablesInsert<'platform_crm_form_blocks'>[] = blocks.map(
          ({ id: _id, created_at: _createdAt, ...block }) => ({
            ...block,
            form_id: created.id,
          }),
        );
        const { error: copyError } = await supabase
          .from('platform_crm_form_blocks')
          .insert(blockInserts);

        if (copyError) throw copyError;
      }

      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'forms'] });
      toast.success('Formulário duplicado!');
    },
    onError: (error: any) => {
      console.error('Error duplicating platform CRM form:', error);
      toast.error('Erro ao duplicar formulário');
    },
  });
}

/** Cria um formulário a partir de um template (copia blocos/settings/theme). */
export function useCreatePlatformCrmFormFromTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string | null;
      // Dimensão PRODUTO (D3 F1c): carimba o produto escolhido no dialog.
      product_id?: string | null;
      template: PlatformCrmFormTemplate;
    }) => {
      const payload: PlatformCrmFormInsert = {
        name: input.name,
        slug: `${generateFunnelSlug(input.name) || 'form'}-${Date.now().toString(36)}`,
        description: input.description ?? input.template.description,
        product_id: input.product_id ?? null,
        status: 'draft',
        settings: input.template.settings ?? {},
        theme: input.template.theme ?? {},
      };

      const { data: newForm, error: insertError } = await supabase
        .from('platform_crm_forms')
        .insert(payload)
        .select()
        .single();

      if (insertError) throw insertError;
      const created = newForm as PlatformCrmForm;

      // Blocos do template (Json array com block_type/label/etc.)
      const templateBlocks = Array.isArray(input.template.blocks)
        ? (input.template.blocks as Record<string, unknown>[])
        : [];

      if (templateBlocks.length > 0) {
        const blockInserts: TablesInsert<'platform_crm_form_blocks'>[] = templateBlocks.map(
          (block, index) => ({
            form_id: created.id,
            block_type: String(block.block_type ?? 'text'),
            label: String(block.label ?? `Campo ${index + 1}`),
            description: (block.description as string | null) ?? null,
            placeholder: (block.placeholder as string | null) ?? null,
            required: Boolean(block.required ?? false),
            options: (block.options as TablesInsert<'platform_crm_form_blocks'>['options']) ?? null,
            validation:
              (block.validation as TablesInsert<'platform_crm_form_blocks'>['validation']) ?? null,
            maps_to: (block.maps_to as string | null) ?? null,
            order_index: index,
          }),
        );
        const { error: blocksError } = await supabase
          .from('platform_crm_form_blocks')
          .insert(blockInserts);

        if (blocksError) throw blocksError;
      }

      // Incrementa contador de uso do template (best-effort)
      await supabase
        .from('platform_crm_form_templates')
        .update({ usage_count: (input.template.usage_count ?? 0) + 1 })
        .eq('id', input.template.id);

      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'forms'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'form-templates'] });
      toast.success('Formulário criado a partir do template!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM form from template:', error);
      toast.error('Erro ao criar formulário do template');
    },
  });
}
