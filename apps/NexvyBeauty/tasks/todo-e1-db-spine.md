# EIXO 1 — Espinha de Banco (D3 multiproduto) — worktree feat/e1-db-spine

> Banco compartilhado `fzhlbwhdejumkyqosuvq` (prod). Aplicação via MCP Supabase (`apply_migration`/`execute_sql`).
> Fronteiras respeitadas: não tocou ERP, `cakto_*`, `affiliate_*`, nem tabelas salão.

## F0 — Acesso ao prod
- [x] MCP Supabase conectado → `select 1` OK.

## F1 — Baseline / reconciliação (paga G3) ✅
- [x] Introspecção do schema REAL (23 `platform_crm_*` c/ product_id + 3 twins remote-only).
- [x] Versionado em `20260706_platform_crm_f1_baseline_reconciliation.sql` (DDL fiel do catálogo, idempotente).
- **Check:** os 3 twins já existem no prod → `IF NOT EXISTS` = no-op = diff vazio by construction. ✅

## F4 — 9 tabelas do hub ✅ (DB) / ⏳ (religação de stubs)
- [x] Criadas 9 tabelas `platform_crm_*` product-scoped (`20260706_platform_crm_product_hub_tables.sql`) — aplicado via MCP.
- [x] Verificado: 9/9 tabelas, RLS on, 1 policy `_super_admin_only` cada, `search_vector` GENERATED funcional.
- [x] **Check DB:** insert → persistiu em chamada separada (found 1/1/1) → cleanup (deleted 3), zero resíduo. ✅
- [ ] Regenerar `types.ts` (gerado, 680k — instalar via subagente).
- [ ] Religar `useProductHubStubs.ts` (10 hooks + mutações) → chamadas reais (subagente Sonnet).
- [ ] Check por aba na UI (create → reload → permanece).

## F6 — RLS opção (c): isolamento rep+produto ✅
- [x] Aplicado `20260706_platform_crm_rls_product_isolation.sql` (helper SECURITY DEFINER + policy rep SELECT).
- [x] **Check 2 JWTs (4 personas):** repA vê só leadA(prod1); repB vê só leadB(prod2); super_admin vê ambos; repZ(sem atribuição) vê 0. Zero resíduo (BEGIN…ROLLBACK). ✅

## Decisões travadas
- Model A + RLS (c). F6 ownership = `assigned_to`, SELECT-only (rep-write = follow-on). F6b (tabelas-filhas) documentado, não aplicado.
- Twins SEM `organization_id` (convenção platform_crm_*). CHECKs espelhados do salão real (sem inventar).

## Review
**Espinha de banco (F1/F4/F6) APLICADA E PROVADA no prod `fzhlb…`:**
- F1: 3 twins remote-only versionados fiel ao catálogo real.
- F4: 9 tabelas criadas + RLS + persistência provada por round-trip cross-transaction.
- F6: isolamento rep/produto provado com 4 personas via JWT simulado, super_admin/service_role intactos.

**Pendente (metade app da F4):** instalar types.ts regenerado + religar os 10 stubs → check por aba na UI.
**Coordenação de merge:** F4 religação toca `CatalogSync.tsx`/`ChatTab.tsx`, que `feat/beauty-lux-l4` também alterou → conflito previsível (2 arquivos).
