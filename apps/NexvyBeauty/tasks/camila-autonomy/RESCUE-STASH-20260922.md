# Rescue inventory — `stash@{0}` vs `origin/main` (`41d8305`)

Gerado em `rescue/camila-stash-20260922`. **Stash intacto** (sem apply, sem drop).

## Checks desta rodada

| Item | Valor |
|------|-------|
| Local HEAD | `41d8305` (#207 harness na main) |
| Branch | `rescue/camila-stash-20260922` |
| Tracked no stash show | 46 |
| Mesmo blob que main | **18** |
| Ainda diferem | **23** |
| Untracked (^3) | 228 |
| Migrations CRM no stash | 13 (hold=3) |
| `stash@{0}` | ainda listado |

## Slice A — docs/tasks (tracked, diferem)
- `apps/NexvyBeauty/tasks/camila-autonomy/DECISION-LOG.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/PRD-00-MASTER.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/MODEL-PORTA-JUIZ.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/PLAN-v1.2.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/PRD-13-PORTA-JUIZ-COMPLETO.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/loop-state.json`

## Slice B — runtime HOT (uma edge por PR)
- `apps/NexvyBeauty/supabase/functions/_shared/platform-crm-lead-context.test.ts`
- `apps/NexvyBeauty/supabase/functions/_shared/platform-crm-lead-context.ts`
- `apps/NexvyBeauty/supabase/functions/_shared/platform-zapi-proxy.ts`
- `apps/NexvyBeauty/supabase/functions/leads-extraction-webhook/index.ts`
- `apps/NexvyBeauty/supabase/functions/leads-import-profiles/index.ts`
- `apps/NexvyBeauty/supabase/functions/leads-import-video/index.ts`
- `apps/NexvyBeauty/supabase/functions/platform-camila-conductor/index.ts`
- `apps/NexvyBeauty/supabase/functions/platform-start-whatsapp-conversation/index.ts`
- `apps/NexvyBeauty/supabase/functions/platform-whatsapp-qr-send/index.ts`

## Slice C — cockpit / deno.lock
- `.github/workflows/nexvybeauty-cockpit.yml`
- `apps/NexvyBeauty/deno.lock`

## Slice D — UI / src (triagem; muitos podem ser drift)
- `apps/NexvyBeauty/src/components/superadmin/crm/data/usePlatformCrmLeads.ts`
- `apps/NexvyBeauty/src/components/superadmin/crm/data/usePlatformCrmLeadsManager.ts`
- `apps/NexvyBeauty/src/components/superadmin/crm/kanban/PlatformCrmKanban.tsx`
- `apps/NexvyBeauty/src/components/superadmin/crm/leads/PlatformCrmLeadsTable.tsx`
- `apps/NexvyBeauty/src/pages/ClientesDeVoltaLandingPage.tsx`

## Slice E — other tracked diff
- `apps/NexvyBeauty/supabase/functions/tmp-eval-agents/goldens.ts`

## Noise — mesmo blob que main (não precisa PR)
- `apps/NexvyBeauty/src/cockpit/Painel.tsx`
- `apps/NexvyBeauty/src/components/admin/AutoNotificationSettings.tsx`
- `apps/NexvyBeauty/src/components/admin/agents/AgentSchedulingTab.tsx`
- `apps/NexvyBeauty/src/components/admin/forms/FormResponseDetail.tsx`
- `apps/NexvyBeauty/src/components/admin/integrations/AIProviderConfigs.tsx`
- `apps/NexvyBeauty/src/components/dashboard/Dashboard.tsx`
- `apps/NexvyBeauty/src/components/layout/MobileMoreMenu.tsx`
- `apps/NexvyBeauty/src/components/layout/Sidebar.tsx`
- `apps/NexvyBeauty/src/components/layout/UnifiedShell.tsx`
- `apps/NexvyBeauty/src/components/layout/WhatsAppDisconnectedBanner.tsx`
- `apps/NexvyBeauty/src/components/product/EmptyState.tsx`
- `apps/NexvyBeauty/src/components/superadmin/platform-shell/registry.tsx`
- `apps/NexvyBeauty/src/config/modules.ts`
- `apps/NexvyBeauty/src/pages/Admin.tsx`
- `apps/NexvyBeauty/src/pages/Index.tsx`
- `apps/NexvyBeauty/src/pages/PublicSalaoBooking.tsx`
- `apps/NexvyBeauty/src/pages/SuperAdmin.tsx`
- `apps/NexvyBeauty/supabase/functions/_shared/post-sale-engine.ts`

## Untracked — migrations HOLD (sem GO de banco)
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260917_test_window_bypass.sql`
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260918_prd12_seed_pilot_preselected.sql`
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260918_prd12_unschedule_legacy_camila_crons.sql`

## Untracked — migrations candidatas (git only, 1 SQL/PR; NÃO apply DB)
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260913_camila_conductor_cohorts.sql`
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260913_camila_learning_controller.sql`
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260914_camila_learning_canary_15.sql`
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260915_cut_apresentar_sequence_prompt.sql`
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260915_denied_idempotency_retry.sql`
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260915_opening_part_approach_script.sql`
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260916_authorize_do_not_contact.sql`
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260916_path_a_soft_hard_optout.sql`
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260919_lead_universe_dedup_multifase.sql`
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260920_harness_owns_reply_window.sql`

## Untracked — docs/tasks (amostra / total)
- total docs-like: 173
- `apps/NexvyBeauty/tasks/camila-autonomy/E2E-PLAN.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/LEARNING-CASE-JOICE-OPT-OUT.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/MONDAY-TEST-RUNBOOK.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/PRD-10-PATH-A-REOPEN-MASTER.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/PROMPT-BLOCK-OPT-OUT-SITE.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/RULE-OPT-OUT-REMARKETING.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/RULES-AUTOMATED-COLD.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/CONTRACT-ANSWERS.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/GLOSSARY.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/PLAN-v1.1.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/PRD-11-EXECUTION-LOOP.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/PRD-12-PILOT-LIVE-WIRE.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/README.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/aliases-v1.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/CODEX-REVIEW-L1-BLOCKED.md`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L1-shadow-20260918T014437Z.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L1-shadow-20260918T030008Z.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L1-shadow-20260918T030653Z.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L1-shadow-20260918T072832Z.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L1-shadow-latest.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L2-wire-20260918T020104Z.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L2-wire-20260918T030008Z.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L2-wire-20260918T030653Z.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L2-wire-20260918T072832Z.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L2-wire-20260918T083425Z.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L2-wire-latest.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L2b-integration-20260918T030653Z.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L2b-integration-20260918T042918Z.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L2b-integration-20260918T053846Z.json`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/evidence/L2b-integration-20260918T060250Z.json`
- … +143

## Untracked — testes
- total: 9
- `apps/NexvyBeauty/supabase/functions/_shared/camila-cohort-migration.test.ts`
- `apps/NexvyBeauty/supabase/functions/_shared/camila-conductor-wiring.test.ts`
- `apps/NexvyBeauty/supabase/functions/_shared/camila-learning-migration.test.ts`
- `apps/NexvyBeauty/supabase/functions/_shared/cold-outreach/camila-cohort.test.ts`
- `apps/NexvyBeauty/supabase/functions/_shared/cold-outreach/path-a-canary-harness.test.ts`
- `apps/NexvyBeauty/supabase/functions/_shared/commercial-truth-wiring.test.ts`
- `apps/NexvyBeauty/supabase/functions/_shared/commercial-truth.test.ts`
- `apps/NexvyBeauty/supabase/functions/_shared/platform-whatsapp-qr-transport-hardening.test.ts`
- `apps/NexvyBeauty/tasks/camila-autonomy/e2e/phase-a-synthetic.test.ts`

## Untracked — other code (total 33)
- `apps/NexvyBeauty/.cursor/settings.json`
- `apps/NexvyBeauty/public/og-nexvybeauty-hero.source.jpg`
- `apps/NexvyBeauty/src/lib/harness-derived-ui.ts`
- `apps/NexvyBeauty/supabase/functions/_shared/cold-outreach/camila-cohort.ts`
- `apps/NexvyBeauty/supabase/functions/_shared/cold-outreach/path-a-canary-harness.ts`
- `apps/NexvyBeauty/supabase/functions/_shared/commercial-truth.ts`
- `apps/NexvyBeauty/supabase/migrations_salao/20260914_profiles_org_id_immutable.sql`
- `apps/NexvyBeauty/supabase/migrations_salao/20260914_rls_p0_lock_backup_tables.sql`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/loop/verify_harness_integration.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/loop/verify_harness_pilot.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/loop/verify_harness_shadow.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/loop/verify_harness_wire.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/camila-harness/ops/__pycache__/chip_status_check.cpython-314.pyc`
- `apps/NexvyBeauty/tasks/camila-autonomy/e2e/d2_canary2_aline.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/e2e/d2_canary3_beatriz.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/e2e/d2_canary45_adriana_leticia.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/e2e/d2_canary_finish.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/e2e/d2_canary_run.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/e2e/d3_pairs_10.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/e2e/path_a_f4_canary.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/e2e/path_a_f6_canary_r2.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/e2e/run_phase_a.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/evidence/PRD-09/camila-prompt-apresentar-cut-20260915.txt`
- `apps/NexvyBeauty/tasks/camila-autonomy/evidence/PRD-09/harness-review/board-camila-harness-engineering.jpg`
- `apps/NexvyBeauty/tasks/camila-autonomy/evidence/PRD-09/harness-review/board-v2-camila-harness-engineering.jpg`
- `apps/NexvyBeauty/tasks/camila-autonomy/path-a-reopen-loop/run_path_a_loop.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/path-a-reopen-loop/verify/verify_f0_contract.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/path-a-reopen-loop/verify/verify_f2_kernel.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/path-a-reopen-loop/verify/verify_f3_shadow.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/path-a-reopen-loop/verify/verify_f4_canary_reopen.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/path-a-reopen-loop/verify/verify_f5_r2_shadow.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/path-a-reopen-loop/verify/verify_f6_canary_r2.py`
- `apps/NexvyBeauty/tasks/camila-autonomy/path-a-reopen-loop/verify/verify_f7_ramp.py`

## Ordem de corte (inalterada do handoff)
1. Docs/testes sem mudança de função
2. Uma edge por PR (lista HOT)
3. Migrations uma a uma só no git; HOLD fora até GO de banco
4. Nunca `stash drop` até fatias valiosas commitadas

