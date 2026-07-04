// CRM de PLATAFORMA (super_admin) — barrel do QuizBuilder (F4), DESACOPLADO do tenant.
// Ponto de entrada do módulo de quiz. O `PlatformCrmQuizBuilder` recebe { funnelId, onBack }
// e é aberto pelo consumidor (ex.: PlatformCrmCaptureFunnelsTab) quando channel_type === 'quiz'.
export { PlatformCrmQuizBuilder } from './PlatformCrmQuizBuilder';
