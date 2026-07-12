import { useMemo } from 'react';
import { FunnelBlock, generateBlockId } from '@/types/funnel';
import {
  QUIZ_TEMPLATES,
  type QuizTemplate,
  type QuizCategory,
} from './platformQuizTemplates';
import { FORM_TEMPLATES } from './platformFormTemplates';
import { usePlatformCrmQuizTemplates } from '@/components/superadmin/crm/data/usePlatformCrmQuizTemplates';
import {
  usePlatformCrmFormTemplates,
  type PlatformCrmFormTemplate,
} from '@/components/superadmin/crm/data/usePlatformCrmForms';

/**
 * CRM de PLATAFORMA (super_admin) — hook da biblioteca de Templates de Quiz.
 *
 * Porte FIEL do `useQuizTemplates` (tenant): UNE o seed estático em código
 * (`QUIZ_TEMPLATES`, sempre presente) com os templates persistidos no DB da
 * plataforma (`platform_crm_quiz_templates`, via `usePlatformCrmQuizTemplates`).
 * Diferença vs tenant: sem `organization_id` — a fonte DB já é super_admin-only
 * (RLS), então não há filtro por org; o resto é 1:1 (seed + DB, seed primeiro).
 */
export function usePlatformCaptureTemplateLibrary() {
  const { data: dbTemplates, isLoading } = usePlatformCrmQuizTemplates();

  const templates = useMemo<QuizTemplate[]>(() => {
    const seed = QUIZ_TEMPLATES;
    const mapped: QuizTemplate[] = (dbTemplates ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      category: (row.category ?? 'captacao') as QuizCategory,
      objective: row.objective ?? '',
      icon: row.icon ?? '✨',
      cover_gradient: row.cover_gradient ?? 'from-emerald-500 to-teal-600',
      estimated_time: row.estimated_time ?? '60s',
      question_count: row.question_count ?? 0,
      flow_blocks: (Array.isArray(row.flow_json) ? row.flow_json : []) as unknown as FunnelBlock[],
      badges: (Array.isArray(row.badges) ? row.badges : []) as QuizTemplate['badges'],
    }));
    return [...seed, ...mapped];
  }, [dbTemplates]);

  return { templates, isLoading };
}

/**
 * CRM de PLATAFORMA (super_admin) — hook da biblioteca de Templates de FORMULÁRIO.
 *
 * Espelha `usePlatformCaptureTemplateLibrary` (quiz): UNE o seed estático em código
 * (`FORM_TEMPLATES`, sempre presente) com os templates persistidos no DB da plataforma
 * (`platform_crm_form_templates`, via `usePlatformCrmFormTemplates`). Seed primeiro; sem
 * de-dup por id (o seed usa os ids do tenant, o DB usa ids próprios — não colidem).
 */
export function usePlatformCaptureFormTemplateLibrary() {
  const { data: dbTemplates, isLoading } = usePlatformCrmFormTemplates();

  const templates = useMemo<PlatformCrmFormTemplate[]>(
    () => [...FORM_TEMPLATES, ...((dbTemplates ?? []) as PlatformCrmFormTemplate[])],
    [dbTemplates],
  );

  return { templates, isLoading };
}

/**
 * Regenera os IDs dos blocos para evitar colisão ao clonar um template para um
 * funil novo. Porte 1:1 de `cloneFlowBlocks` (tenant/useQuizTemplates).
 */
export function clonePlatformFlowBlocks(blocks: FunnelBlock[]): FunnelBlock[] {
  const idMap = new Map<string, string>();
  blocks.forEach((b) => idMap.set(b.id, generateBlockId()));
  return blocks.map((b) => {
    const newId = idMap.get(b.id)!;
    const data: any = JSON.parse(JSON.stringify(b.data || {}));
    if (Array.isArray(data.options)) {
      data.options = data.options.map((o: any) => ({
        ...o,
        next_block_id:
          (o.next_block_id && idMap.get(o.next_block_id)) || o.next_block_id || null,
      }));
    }
    return {
      ...b,
      id: newId,
      data,
      next_block_id: (b.next_block_id && idMap.get(b.next_block_id)) || null,
    };
  });
}
