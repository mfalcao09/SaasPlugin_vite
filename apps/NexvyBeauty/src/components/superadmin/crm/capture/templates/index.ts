// CRM de PLATAFORMA (super_admin) — barrel da biblioteca de Templates de captação.
// Porte fiel do QuizTemplateLibrary + FormTemplatesSection (tenant/Vendus).
export { PlatformCrmCaptureTemplatesLibrary } from './PlatformCrmCaptureTemplatesLibrary';
export { PlatformCrmQuizCreateWithAI } from './create/PlatformCrmQuizCreateWithAI';
export {
  usePlatformCaptureTemplateLibrary,
  usePlatformCaptureFormTemplateLibrary,
  clonePlatformFlowBlocks,
} from './usePlatformCaptureTemplateLibrary';
export { FORM_TEMPLATES } from './platformFormTemplates';
export {
  QUIZ_TEMPLATES,
  CATEGORY_LABELS,
  BADGE_LABELS,
  type QuizTemplate,
  type QuizCategory,
  type QuizBadge,
} from './platformQuizTemplates';
