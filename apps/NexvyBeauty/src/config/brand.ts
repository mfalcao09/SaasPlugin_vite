// ─── BRAND CONFIG CENTRAL — fonte única de verdade de marca/setor ───────────
//
// ▸ PONTO DE CASCADE (Fase 4)
//   Este arquivo é o ÚNICO ponto que muda quando se forka o NexvyBeauty para
//   um novo SaaS vertical (NexvyClínicas, NexvyAdvocacia, etc.). A ideia da
//   cascade é: trocar ESTE arquivo (e os assets que ele aponta) reconfigura a
//   identidade do produto inteiro — sem caçar strings espalhadas pelo código.
//
//   Cada SaaS da família embarca o SEU próprio `brand.ts`. Os consumidores
//   (telas, hooks, copy) leem `BRAND_CONFIG` em vez de hardcodar nome/setor/cor.
//
// ▸ ESCOPO ATUAL
//   Por ora este é apenas o ponto de consolidação declarado. Os consumidores
//   ainda NÃO foram migrados para ler daqui (isso é trabalho de fases seguintes,
//   feito incrementalmente para não conflitar com tarefas paralelas em voo).
//
// ▸ AINDA HARDCODED (TODO de consolidação futura — NÃO refatorar agora):
//   1. src/index.css
//        HSL da marca duplicado nos blocos :root e .dark:
//          --primary / --accent / --ring / --sidebar-primary / --sidebar-ring
//          → `24 95% 53%` (light) e `24 95% 55%` (dark), além dos gradientes
//          (--gradient-primary/-accent/-hero) e --shadow-glow.
//        Deveria derivar de BRAND_CONFIG.primaryHsl. (Atenção: o white-label
//        dinâmico via usePlatformBranding sobrescreve essas vars em runtime —
//        o CSS é só o default/fallback estático. Ver item 3.)
//   2. src/pages/Login.tsx
//        Objeto `BRAND` local (name, tagline, accent '#F97316', backgroundVideo
//        '/login-bg.mp4', backgroundImage, metrics, logoUrl) + o catálogo de
//        variações por vertical em comentário. Deveria consumir BRAND_CONFIG
//        (name, sector, primaryColor, loginHero).
//   3. src/hooks/usePlatformBranding.ts
//        Cor de fallback '#F97316' hardcoded em múltiplos pontos (primary_color
//        default, theme_color do manifest dinâmico, meta theme-color). Deveria
//        usar BRAND_CONFIG.primaryColor como fallback.
//
//   Regra de cascade: ao consolidar, estes três passam a derivar de BRAND_CONFIG;
//   o white-label de tenant (platform_settings.primary_color) continua tendo a
//   palavra final em runtime e sobrescreve o default da marca. NUNCA hardcodar
//   cor de marca em componente — usar tokens Tailwind (bg-primary, text-primary,
//   ring, border-primary, …).
// ────────────────────────────────────────────────────────────────────────────

export const BRAND_CONFIG = {
  key: 'nexvybeauty',
  name: 'NexvyBeauty',
  tagline: 'Beleza com gestão inteligente',
  sector: {
    noun: 'salão',
    verb: 'gerir seu salão',
    clientNoun: 'cliente',
  },
  primaryColor: '#EC4899',
  primaryHsl: '330 81% 60%',
  defaultModules: ['erp_salao', 'crm_vendas', 'atendimento', 'administracao'],
  loginHero: {
    backgroundVideo: null,
    backgroundImage: null,
  },
} as const;
