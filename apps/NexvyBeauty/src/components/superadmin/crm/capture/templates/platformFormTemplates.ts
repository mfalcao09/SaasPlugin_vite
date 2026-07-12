/**
 * CRM de PLATAFORMA (super_admin) — SEED estático da biblioteca de Templates de FORMULÁRIO.
 *
 * Porte FIEL (1:1) do seed do tenant `form_templates`
 * (`.vendus-src-reference/supabase/migrations_shared/00000000000007_seeds.sql`) para o
 * namespace platform. Garante que a galeria de Templates de Formulário NUNCA nasça vazia
 * — a tabela de DB `platform_crm_form_templates` começa sem linhas (regressão observada:
 * a seção só lia o DB, então sumia).
 *
 * Espelha o que o quiz já faz (`platformQuizTemplates.ts` = seed + DB via
 * `usePlatformCaptureTemplateLibrary`). Aqui o shape é o próprio `PlatformCrmFormTemplate`
 * (Tables row), para o clone `useCreatePlatformCrmFormFromTemplate` consumir sem adaptação
 * (ele lê `blocks`/`settings`/`theme`/`description`; o UPDATE de `usage_count` num id de
 * seed simplesmente casa zero linhas — best-effort, sem erro).
 *
 * Parity-check: 3 templates, idênticos ao seed do tenant (ids preservados).
 */
import type { PlatformCrmFormTemplate } from '@/components/superadmin/crm/data/usePlatformCrmForms';

const SEED_TS = '2026-01-22T19:21:19.004880+00:00';

export const FORM_TEMPLATES: PlatformCrmFormTemplate[] = [
  {
    id: 'a4b04b84-0cda-4210-be1b-c46532c7570b',
    name: 'Qualificação Rápida',
    description: 'Formulário simples para qualificar leads rapidamente',
    category: 'qualification',
    thumbnail_url: null,
    blocks: [
      {
        label: 'Bem-vindo!',
        block_type: 'welcome_screen',
        description:
          'Responda algumas perguntas rápidas para conhecermos melhor suas necessidades.',
      },
      {
        label: 'Qual é o seu nome?',
        maps_to: 'name',
        required: true,
        block_type: 'text',
        placeholder: 'Digite seu nome completo',
      },
      {
        label: 'Qual é o seu email?',
        maps_to: 'email',
        required: true,
        block_type: 'email',
        placeholder: 'seu@email.com',
      },
      {
        label: 'Qual é o seu telefone?',
        maps_to: 'phone',
        required: true,
        block_type: 'phone',
        placeholder: '(00) 00000-0000',
      },
      {
        label: 'Qual é o nome da sua empresa?',
        maps_to: 'company',
        required: false,
        block_type: 'text',
        placeholder: 'Nome da empresa',
      },
      {
        label: 'Quantos funcionários sua empresa tem?',
        options: [
          { label: '1 a 10', value: '1-10' },
          { label: '11 a 50', value: '11-50' },
          { label: '51 a 200', value: '51-200' },
          { label: 'Mais de 200', value: '200+' },
        ],
        required: true,
        block_type: 'select',
        score_rules: [
          { score: 10, value: '200+' },
          { score: 7, value: '51-200' },
          { score: 5, value: '11-50' },
        ],
      },
      {
        label: 'Obrigado!',
        block_type: 'end_screen',
        description: 'Entraremos em contato em breve.',
      },
    ],
    theme: { primary_color: '#8B5CF6' },
    settings: {},
    is_public: true,
    is_system: true,
    usage_count: 0,
    created_by: null,
    created_at: SEED_TS,
    updated_at: SEED_TS,
  },
  {
    id: '26c83065-73ea-417d-961f-1744d14aa453',
    name: 'Diagnóstico Completo',
    description: 'Formulário para entender profundamente as necessidades do lead',
    category: 'diagnostic',
    thumbnail_url: null,
    blocks: [
      {
        label: 'Vamos fazer um diagnóstico',
        block_type: 'welcome_screen',
        description:
          'Em poucos minutos, vamos entender sua situação atual e como podemos ajudar.',
      },
      { label: 'Qual é o seu nome?', maps_to: 'name', required: true, block_type: 'text' },
      { label: 'Seu melhor email', maps_to: 'email', required: true, block_type: 'email' },
      { label: 'WhatsApp para contato', maps_to: 'phone', required: true, block_type: 'phone' },
      { label: 'Empresa', maps_to: 'company', required: true, block_type: 'text' },
      { label: 'Seu cargo', maps_to: 'position', required: false, block_type: 'text' },
      {
        label: 'De 1 a 10, qual sua urgência em resolver esse problema?',
        options: { max: 10, min: 1 },
        required: true,
        block_type: 'scale',
        score_rules: [
          { min: 8, score: 10 },
          { min: 5, score: 5 },
        ],
      },
      {
        label: 'Descreva brevemente seu principal desafio',
        maps_to: 'notes',
        required: true,
        block_type: 'textarea',
      },
      {
        label: 'Você tem orçamento disponível para investir em uma solução?',
        required: true,
        block_type: 'yes_no',
        score_rules: [{ score: 15, value: true }],
      },
      {
        label: 'Diagnóstico recebido!',
        block_type: 'end_screen',
        description: 'Um especialista entrará em contato em até 24h.',
      },
    ],
    theme: { primary_color: '#6366F1' },
    settings: {},
    is_public: true,
    is_system: true,
    usage_count: 0,
    created_by: null,
    created_at: SEED_TS,
    updated_at: SEED_TS,
  },
  {
    id: 'a0d59d08-3b4a-47eb-b075-c1bd2d14b71c',
    name: 'Captação Simples',
    description: 'Formulário minimalista para captar leads rapidamente',
    category: 'general',
    thumbnail_url: null,
    blocks: [
      { label: 'Nome', maps_to: 'name', required: true, block_type: 'text' },
      { label: 'Email', maps_to: 'email', required: true, block_type: 'email' },
      { label: 'Telefone', maps_to: 'phone', required: false, block_type: 'phone' },
      {
        label: 'Pronto!',
        block_type: 'end_screen',
        description: 'Você receberá novidades em breve.',
      },
    ],
    theme: { primary_color: '#10B981' },
    settings: {},
    is_public: true,
    is_system: true,
    usage_count: 0,
    created_by: null,
    created_at: SEED_TS,
    updated_at: SEED_TS,
  },
];
