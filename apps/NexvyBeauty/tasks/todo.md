# NexvyBeauty — Controle por PLANO (backend / quotas)

> Módulos FIXOS (Salão+CRM+Atendimento). Diferenciação = PLANO, por QUANTITATIVO.
> Worktree: `SaasPlugin_vite` (main). Supabase: `fzhlbwhdejumkyqosuvq`.
> Decisões Marcelo (2026-06-20): max_ai_agents = 0/0/3/5 (Trial/Starter/Pro/Enterprise);
> max_users = só membros ativos contam (convite pendente não reserva); item 4 = fazer no main.

## Estado real (mapeado antes de codar)
- Tiers no DB: **Trial / Starter / Pro / Enterprise** (não Básico/Pro/Premium).
- `platform_plans` e `organizations` NÃO versionados no repo (baseline só no DB + dump).
- `max_users` e `max_connections` (= "Conexões WhatsApp") JÁ existem e configurados.
- Sem Supabase MCP nesta sessão → aplicar via **Supabase CLI `--linked`** (logada/linkada).

## Plano e verificação (cada passo com check binário)
- [x] **Item 1 — instâncias WhatsApp**: `max_connections` JÁ é a quota e JÁ é enforced em
  `evolution-proxy` (create_instance_self). Decisão: **reusar** (não criar coluna nova).
  → check: documentado em COMMENT ON COLUMN na migration. ✅
- [x] **Item 2 — agentes IA (`max_ai_agents`)**: coluna em `platform_plans` (NOT NULL DEFAULT 0)
  + override nullable em `organizations` + na RPC `get_organization_effective_limits`
  (limits.max_ai_agents). Enforcement: **trigger BEFORE INSERT** em `product_agents` +
  pré-check de UX em `useCreateAgent`. → check: dry-run SQL EXIT 0; typecheck limpo. ✅
- [x] **Item 3 — usuários (`max_users`)**: enforcement via **trigger BEFORE INSERT OR UPDATE OF
  organization_id** em `profiles` (conta `id <> NEW.id`; 1º dono passa; convite pendente não
  conta) + pré-check de UX em `useCreateInvitation`. → check: dry-run SQL EXIT 0. ✅
- [x] **Item 4 — enabled_modules no provisioning**: `provisionPlatformPlan` agora seta
  `enabled_modules: ['erp_salao','crm_vendas','atendimento']` no UPDATE da org (linhas 135-140,
  sem tocar a linha 171 que diverge de afiliados). → check: typecheck N/A (Deno); merge limpo. ✅
- [x] **Item 5 — números dos tiers**: alinhado com Marcelo (0/0/3/5). Seed por slug na migration.
- [x] **APLICADA ao DB de produção** (2026-06-20, via `supabase db query --linked -f`).
  → smoke: seed 0/0/3/5 OK; colunas (pp=1, org=1) + triggers (2) OK; RPC retorna max_ai_agents.
  → teste negativo (rolled-back): ambos os triggers BLOQUEIAM (agents_blocked=t, users_blocked=t).

## Arquivos
- `supabase/migrations_salao/20260620_plan_quotas.sql` (NOVO) — colunas + seed + RPC + 2 triggers.
- `supabase/functions/_shared/cakto-plan-provisioning.ts` — enabled_modules no provisioning.
- `src/hooks/useProductAgents.ts` — pré-check UX max_ai_agents + onError com mensagem real.
- `src/hooks/useTeamInvitations.ts` — pré-check UX max_users no convite.

## Coordenação (sessão afiliados — worktree SaasPlugin_vite-afiliados / feat/afiliados-proprios)
- Migration nova `20260620_plan_quotas.sql` NÃO colide com `20260620_affiliate_*.sql` deles.
- `cakto-plan-provisioning.ts`: editei só o UPDATE (não a linha 171) → merge limpo.
- Pasta `migrations_salao/` é compartilhada contra o MESMO DB: ao aplicar, ambos os conjuntos
  (afiliados + este) precisam landar. Este é independente (não toca tabelas affiliate_*).

## Review
- CONCLUÍDO e aplicado em produção (2026-06-20). Provas:
  - typecheck dos 2 hooks: sem erros.
  - dry-run da migration (ROLLBACK): EXIT 0, sem persistir.
  - impacto pré-apply: 0 de 3 orgs acima de qualquer limite.
  - apply real: smoke tests OK (seed 0/0/3/5, colunas, 2 triggers, RPC com max_ai_agents).
  - teste negativo (override forçado, rolled-back): ambos triggers bloqueiam com mensagem correta;
    nada persistiu (agentes_qtest=0, profiles_qtest=0). Override por-org honrado (escape hatch OK).
- Caveat conhecido: orgs que já criaram agentes/usuários acima do novo limite mantêm os
  existentes (trigger só bloqueia NOVAS criações). Coerente com feature_ai_agents=false.
- Follow-up opcional (fora de escopo): gatear o AgentStep do onboarding por plano (hoje o
  pré-check só mostra toast se Trial/Starter tentar criar agente — não quebra, mas não esconde).
