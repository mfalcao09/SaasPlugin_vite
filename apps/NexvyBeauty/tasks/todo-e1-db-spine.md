# EIXO 1 — Espinha de Banco (D3 multiproduto) — worktree feat/e1-db-spine

> Sessão dedicada. Banco compartilhado `fzhlbwhdejumkyqosuvq` (prod). Fronteiras invioláveis: **não** tocar ERP, `cakto_*`, `affiliate_*`, nem as tabelas salão (org-scoped) — elas são só a planta.
> Aplicação = via MCP `apply_migration` / acesso concedido pelo Marcelo (F0). Nada "pronto" sem check provado.

## F0 — Acesso ao prod (BLOQUEADOR)
- [ ] Canal de aplicação aberto (MCP Supabase OU CLI reautenticado) → check: `select 1` responde.

## F1 — Baseline / reconciliação (paga G3)
- [ ] `supabase db pull` (ou introspecção) do schema REAL das 23 tabelas `platform_crm_*` + `platform_crm_products` + `platform_crm_user_product_assignments` + `leads.product_id`.
- [ ] Versionar em `migrations_platform_crm/` (IF NOT EXISTS, idempotente).
- **Check:** `db diff` ~vazio pra essas tabelas.

## F4 — Backend das 9 abas stub (paga G4)
- [ ] Criar 9 tabelas `platform_crm_*` product-scoped (SQL draft: `20260706_platform_crm_product_hub_tables.sql`).
- [ ] Regenerar `types.ts`.
- [ ] Religar `useProductHubStubs.ts` → chamadas reais (Cérebro, Materiais, Playbook, Objeções, Catálogo, CTAs, Pós-venda actions+logs, e-mail templates).
- **Check por aba:** criar registro → persiste → recarrega → permanece.

## F6 — RLS opção (c): isolamento rep+produto (decisão Marcelo travada)
- [ ] Aplicar `20260706_platform_crm_rls_product_isolation.sql` (helper SECURITY DEFINER + policy rep SELECT em leads).
- **Check:** 2 JWTs — rep do produto A não vê leads do produto B nem de outro rep; super_admin vê tudo.

## Decisões travadas
- Model A + RLS (c): decididos pelo Marcelo.
- F6 ownership = `assigned_to` (não sdr/closer). SELECT-only nesta rodada (rep-write = follow-on).
- F4 tabelas mantêm `_super_admin_only`; rep-read de enablement (objeções/materiais) = possível extensão F6.

## Review
_(preencher ao fim, com os checks provados)_
