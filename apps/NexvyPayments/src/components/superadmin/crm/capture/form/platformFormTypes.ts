/**
 * CRM de PLATAFORMA (super_admin) — FormBuilder (F5): tipos locais desacoplados.
 *
 * O `@/types/forms` compartilhado é uma versão REDUZIDA (não tem `FormOptionAction`,
 * `SelectOption.score/actions` nem `TemperatureThresholds`). Como não podemos editar
 * arquivos fora de `capture/form/`, este shim:
 *   1. Re-exporta tudo de `@/types/forms` (reuso direto do que já existe).
 *   2. Acrescenta os tipos ausentes que o editor de blocos porta da fonte Vendus.
 *   3. Adapta as ROWS de plataforma (`PlatformCrmForm`/`PlatformCrmFormBlock`) para o
 *      shape `Form`/`FormBlock` que os componentes portados esperam — SEM organization_id.
 *
 * Portado de src/types/forms.ts (versão completa) do CRM Vendus. Sem tenant.
 */
import type {
  FormBlock,
  FormBlockType,
  SelectOption as BaseSelectOption,
  ScaleOptions,
  FormTheme,
  FormSettings as BaseFormSettings,
  DistributionRule,
  FormStatus,
  RoundRobinConfig,
  CustomScripts,
} from '@/types/forms';
import { createFormBlock as baseCreateFormBlock } from '@/types/forms';
import type {
  PlatformCrmForm,
  PlatformCrmFormBlock,
} from '@/components/superadmin/crm/data/usePlatformCrmForms';

// Re-exporta o núcleo do tipo compartilhado (reuso direto).
export type {
  FormBlock,
  FormBlockType,
  ScaleOptions,
  FormTheme,
  DistributionRule,
  FormStatus,
  RoundRobinConfig,
  CustomScripts,
  LogicRule,
  ScoreRule,
  BlockConfig,
  FormHeadingWeight,
  FormLetterSpacing,
  FormLogoSize,
  FormLogoPosition,
  FormLayoutType,
  FormProgressPosition,
} from '@/types/forms';
export {
  BLOCK_CONFIGS,
  getBlockConfig,
  createFormBlock,
  generateSlug,
  isMediaBlock,
  MEDIA_BLOCK_TYPES,
  toEmbedUrl,
} from '@/types/forms';

// ─── CRM automation types (Phase 2) — já presentes no shared, re-export ──────
export type {
  FormBlockAutomation,
  FormBlockCrmSettings,
  LeadTemperature,
  AutomationOperator,
} from '@/types/forms';

// ─── Extensões ausentes no shared @/types/forms ─────────────────────────────

/**
 * Ações por opção (routing/automação disparados ao escolher a opção).
 * Gravadas inline na opção; o backend processa a união das ações no submit.
 */
export type FormOptionAction =
  | { type: 'redirect'; url: string; new_tab?: boolean }
  | { type: 'add_tags'; tag_ids: string[] }
  | { type: 'start_ai_agent'; agent_id: string }
  | { type: 'start_ai_outreach'; agent_id: string; objective?: string }
  | { type: 'open_calendar'; event_type_id: string; ask_email?: boolean }
  | { type: 'assign_sector'; sector_id: string }
  | { type: 'assign_user'; user_id: string; as?: 'human' | 'closer' | 'sdr' }
  | { type: 'go_to_block'; target_block_id: string }
  | {
      type: 'set_custom_field';
      field_key: string;
      value_source: 'option_label' | 'option_value' | 'static';
      static_value?: string;
      _value?: string;
    };

/** SelectOption enriquecida com score por opção + ações inline. */
export interface SelectOption extends BaseSelectOption {
  actions?: FormOptionAction[];
  /** Pontos somados ao score do lead quando esta opção é escolhida. */
  score?: number;
}

/** Faixas para classificar o lead em frio/morno/quente pelo score acumulado. */
export interface TemperatureThresholds {
  warm_min: number;
  hot_min: number;
}

/** FormSettings + thresholds de temperatura (ausente no shared). */
export interface FormSettings extends BaseFormSettings {
  temperature_thresholds?: TemperatureThresholds;
}

/**
 * Form de plataforma no shape que os componentes portados consomem.
 * NÃO tem organization_id — a RLS super_admin-only isola os dados.
 * `products` mantido opcional (o header do builder usa `products?.name`);
 * em plataforma resolvemos via product_id (sem join automático).
 */
export interface Form {
  id: string;
  product_id: string | null;
  name: string;
  description?: string | null;
  slug: string;
  status: FormStatus;
  distribution_rule: DistributionRule;
  assigned_squad_id?: string | null;
  assigned_user_id?: string | null;
  default_temperature: string;
  round_robin_config: RoundRobinConfig;
  theme: FormTheme;
  facebook_pixel_id?: string | null;
  google_tag_id?: string | null;
  custom_scripts: CustomScripts;
  utm_capture: boolean;
  settings: FormSettings;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  views_count: number;
  submissions_count: number;
  products?: { name: string };
  /** cadência pós-submit (usada em FormSettings) */
  post_cadence_id?: string | null;
}

/**
 * Converte a ROW `platform_crm_forms` no shape `Form` acima, com defaults dos
 * campos JSONB. Espelha o `parseForm` da fonte, sem organization_id.
 */
export function parsePlatformForm(row: PlatformCrmForm): Form {
  const r = row as unknown as Record<string, unknown>;
  return {
    id: row.id,
    product_id: (r.product_id as string | null) ?? null,
    name: row.name,
    description: (r.description as string | null) ?? null,
    slug: (r.slug as string) ?? '',
    status: ((r.status as FormStatus) ?? 'draft') as FormStatus,
    distribution_rule: ((r.distribution_rule as DistributionRule) ?? 'round_robin') as DistributionRule,
    assigned_squad_id: (r.assigned_squad_id as string | null) ?? null,
    assigned_user_id: (r.assigned_user_id as string | null) ?? null,
    default_temperature: (r.default_temperature as string) ?? 'cold',
    round_robin_config:
      (r.round_robin_config as RoundRobinConfig) ?? { users: [], current_index: 0 },
    theme: (r.theme as FormTheme) ?? ({} as FormTheme),
    facebook_pixel_id: (r.facebook_pixel_id as string | null) ?? null,
    google_tag_id: (r.google_tag_id as string | null) ?? null,
    custom_scripts: (r.custom_scripts as CustomScripts) ?? { header: '', footer: '' },
    utm_capture: Boolean(r.utm_capture ?? true),
    settings: (r.settings as FormSettings) ?? ({} as FormSettings),
    created_by: (r.created_by as string | null) ?? null,
    created_at: (r.created_at as string) ?? new Date().toISOString(),
    updated_at: (r.updated_at as string) ?? new Date().toISOString(),
    views_count: Number(r.views_count ?? 0),
    submissions_count: Number(r.submissions_count ?? 0),
    post_cadence_id: (r.post_cadence_id as string | null) ?? null,
  };
}

/** Converte a ROW `platform_crm_form_blocks` no shape `FormBlock` (JSONB defaults). */
export function parsePlatformBlock(row: PlatformCrmFormBlock): FormBlock {
  const r = row as unknown as Record<string, unknown>;
  return {
    id: row.id,
    form_id: (r.form_id as string) ?? '',
    order_index: Number(r.order_index ?? 0),
    block_type: (r.block_type as FormBlockType) ?? 'text',
    label: (r.label as string) ?? '',
    description: (r.description as string) ?? undefined,
    placeholder: (r.placeholder as string) ?? undefined,
    required: Boolean(r.required ?? false),
    options: (r.options as SelectOption[] | ScaleOptions) ?? [],
    logic_rules: (r.logic_rules as FormBlock['logic_rules']) ?? [],
    maps_to: (r.maps_to as string) ?? undefined,
    score_value: Number(r.score_value ?? 0),
    score_rules: (r.score_rules as FormBlock['score_rules']) ?? [],
    apply_tags: (r.apply_tags as string[]) ?? [],
    validation: (r.validation as Record<string, unknown>) ?? {},
    block_settings: (r.block_settings as Record<string, unknown>) ?? {},
    created_at: (r.created_at as string) ?? undefined,
  };
}

// re-export explícito de createFormBlock (reuso do shared)
export { baseCreateFormBlock as _createFormBlock };
