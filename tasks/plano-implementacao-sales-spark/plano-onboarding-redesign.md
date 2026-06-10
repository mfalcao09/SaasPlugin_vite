# Plano — Redesign do Onboarding (sistema todo, sem Lovable, cores do serviço)

> **Data:** 2026-06-10 · **Status:** aguardando validação de Marcelo
> **Escopo:** NexvyOficinas primeiro (padrão replicável pros outros 4 SaaS via cascade)

---

## 1. Diagnóstico (lido do código, não presumido)

### 1.1 Existem DOIS onboardings — e os dois são CRM-cêntricos

| Camada | Arquivo | Para quem | Passos hoje |
|---|---|---|---|
| **A. Wizard da plataforma** | `components/superadmin/FirstAccessSuperAdminModal.tsx` (480 l.) | Super admin (você), 1º acesso | Senha → Nome → **Plano** → WhatsApp/Evolution → E-mail (Lovable) → Empresa |
| **B. Onboarding do cliente** | `components/onboarding/GuidedOnboarding.tsx` (1.166 l.) | Admin da empresa cliente | Welcome → Identidade → **Produto+cérebro IA** → **WhatsApp** → **Agente IA (SDR/Closer)** → Equipe → Done |

**Problemas:**
- O onboarding **B** é 100% vendas: copy "pronto para vender", produto/agente/WhatsApp. **Zero menção ao ERP Oficina** (clientes, veículos, OS, orçamentos, financeiro) — que é o módulo-âncora do NexvyOficinas.
- **B** é renderizado só em `Index.tsx` (/crm) e `Admin.tsx` — o cliente que entra pelo **Hub** novo nunca o vê; e quando vê, é convidado a configurar só o CRM.
- O wizard **A** termina com "Bons negócios!" → dashboard do CRM. Não apresenta módulos, não leva ao Hub.
- **A não tem passo de identidade visual** → a plataforma continua "Vendus" verde até alguém achar a tela de branding escondida.

### 1.2 Lovable Cloud no e-mail (UI apenas — backend já é Resend ✅)

- `FirstAccessSuperAdminModal.tsx:445-460` — StepEmail abre `https://lovable.dev/projects/f6728bcf-…?view=cloud&section=email` (**URL hardcoded do projeto remix!**)
- `useSuperAdminSetupChecklist.ts:44-47` — item "Configure o domínio de envio na Lovable Cloud", navigateTo `lovable-email`
- `docs/content/superAdmin.tsx:303-309`, `docs/content/admin.tsx:824` — instruções "Lovable Cloud → Emails", DNS `_lovable`
- **Backend já desacoplado:** `process-email-queue`, `send-transactional-email`, `send-invite-email`, `preview-transactional-email` usam **RESEND_API_KEY**. Já existe `EmailSettings.tsx` (329 l.) no super-admin. Só falta a UI do wizard apontar pro caminho certo.

### 1.3 Verde herdado do sales-spark (raiz identificada)

| Onde | O quê | Fix |
|---|---|---|
| `src/index.css:19-103` | `--primary/--accent/--ring: 83 81% 44%` (lime `#84CC16`) light+dark | → `24 95% 53%` (laranja `#F97316`) |
| `usePlatformBranding.ts:132` | fallback `primary_color || '#84CC16'` | → `'#F97316'` |
| `index.html` | boot-spinner `#84CC16` + `theme-color #84CC16` + apple-title "Vendus" | → laranja + "NexvyOficinas" |
| ~15 componentes | `green-*/emerald-*` hardcoded (ConversationList, SystemHealth, GuidedOnboarding…) | **manter onde é semântico** (success/online), trocar onde é marca |

> O wizard em si usa `bg-primary` (token) — ele fica laranja "de graça" ao corrigir a raiz. O branding dinâmico (`platform_settings.primary_color`) continua sobrescrevendo — white-label preservado.

---

## 2. Visão-alvo

**Onboarding em duas camadas, ambas module-aware:**

- **Wizard A (plataforma):** Senha → **Identidade da plataforma (nome+logo+cor)** → Plano → E-mail (Resend nativo) → WhatsApp → Empresa → **fim no Hub de Módulos**
- **Onboarding B (cliente):** Welcome (tom do setor) → Identidade → **Seleção de módulos** (cards do `MODULE_DEFINITIONS`) → **mini-setup por módulo escolhido** (Oficina: serviços-padrão; CRM: produto+agente — reusa steps atuais; Atendimento: WhatsApp) → Equipe → Done **no Hub**, com módulos escolhidos destacados

**Arquitetura B:** extrair os steps atuais (Product/WhatsApp/Agent) em um **registry por módulo** — o wizard compõe a sequência dinamicamente pelos módulos marcados. Disparo movido para o **ModuleHub** (1º acesso de admin de org nova), não mais só /crm.

---

## 3. Fases (cada uma com critério verificável)

### Fase 1 — Tema laranja + des-Lovable (quick wins) — ~1 sessão
1. `index.css` light+dark → laranja; `usePlatformBranding` fallback; `index.html` (spinner, theme-color, apple-title)
2. StepEmail do wizard → config Resend nativa: campo `support_email` + status da `RESEND_API_KEY` + botão "enviar e-mail de teste" (usa `preview-transactional-email`/`send-transactional-email` existentes)
3. Checklist: copy + navigateTo → tela `EmailSettings` interna
4. Docs (`superAdmin.tsx`, `admin.tsx`, `desenvolvedor.tsx`): remover Lovable Cloud → instruções Resend (domínio, SPF/DKIM via Resend)
5. Copy do wizard A: "Bons negócios!" → neutro; botão final → "Ir para o Hub de Módulos" (`navigate('/')`)

**Verificação:** build ok · screenshot wizard/hub/login sem verde-lime e sem "Lovable" · grep `lovable` zerado em `components/superadmin` + `hooks` de setup · e-mail de teste chega.

### Fase 2 — Passo "Identidade da plataforma" no wizard A — pequena
- Novo step 2: nome da plataforma + logo (upload `platform-assets`) + cor primária (color picker, default laranja) → grava `platform_settings` (campos já existem; `usePlatformBranding` aplica na hora)
- Elimina "Vendus" e verde na origem pra qualquer remix/cascade futuro

**Verificação:** wizard novo em org zerada → plataforma sai nomeada e na cor escolhida sem tocar em telas escondidas.

### Fase 3 — Onboarding B module-aware (o grosso) — 1-2 sessões
1. Registry de steps por módulo (`onboarding/steps/{oficina,crm,inbox}.tsx`) — steps CRM atuais viram o pacote `crm` (reuso ~80%)
2. Step "Quais módulos sua oficina vai usar?" (cards de `MODULE_DEFINITIONS`, ERP pré-marcado no NexvyOficinas) → persiste em `organization_settings.enabled_modules` (jsonb)
3. Mini-setup Oficina: cadastrar 3-5 tipos de serviço padrão (ex.: troca de óleo, revisão, freios) + opcional 1ª OS de exemplo
4. Disparo no ModuleHub (1º acesso de admin) + Hub destaca módulos habilitados
5. Copy global: "vender" → "gerir sua oficina" (tom por SaaS via config)

**Verificação:** org nova → onboarding oferece módulos → escolher só ERP pula steps de CRM → Done leva ao Hub com ERP destacado · escolher CRM+Atendimento reproduz fluxo atual.

### Fase 4 — Cascade pros outros 4 SaaS
- Tema (cor por SaaS), copy de setor e módulos default viram **config** (1 arquivo por SaaS) — entra no `cascade-core.sh`

---

## 4. Decisões tomadas (Marcelo, 2026-06-10)

1. **Seleção de módulos no onboarding B:** ✅ **travada pelo plano contratado** — o plano define os módulos; o onboarding configura só o que o cliente comprou (alavanca de upsell preservada). Implica: `platform_plans` ganha relação com módulos (ex.: coluna `modules` jsonb) e o registry de steps filtra por ela.
2. **Mini-setup do ERP Oficina:** ✅ **só serviços-padrão** (lista pronta pra marcar — troca de óleo, revisão, freios, suspensão, alinhamento…) — **sem** OS de exemplo (dados 100% limpos).
3. **Ordem:** ⏸️ **execução aguarda OK formal** — Marcelo vai validar este documento antes de eu iniciar a Fase 1. Nada será implementado até a aprovação.

---

## 5. Fora de escopo (registrado, não esquecido)

- Vídeo/estética do login (pausado por decisão de 2026-06-10 — "perfumaria depois")
- MCP Magnific (aguardando suporte/entitlement)
- 56 help_articles re-import · destino do domínio raiz
