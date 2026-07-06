# AUDITORIA RLS — NexvyPayments (baseline pós-cascade) · 2026-07-06

> **Entregável A3** · projeto Supabase `nbvaglqmcyoogolhzyzm` · executor: loop (sessão `a690757a`, iteração 6)
> **Status: PROXY_PRONTO — pronto para revisão humana (G-SEC-REV / P3).** Certificação final é do revisor.
> Pareado com `rls-audit-2026-07.html`.

## 1. Método (queries read-only versionadas — reproduzíveis via `supabase db query` ou MCP)

```sql
-- Q1: cobertura RLS das tabelas multi-tenant
WITH org_tables AS (
  SELECT c.relname AS tabela, c.relrowsecurity AS rls_on
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
    AND EXISTS (SELECT 1 FROM information_schema.columns col
                WHERE col.table_schema='public' AND col.table_name=c.relname
                  AND col.column_name='organization_id'))
SELECT count(*) AS total_com_org_id,
       count(*) FILTER (WHERE rls_on) AS com_rls_on,
       string_agg(tabela,', ') FILTER (WHERE NOT rls_on) AS sem_rls
FROM org_tables;

-- Q2: policies permissivas
SELECT tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND (qual='true' OR with_check='true')
ORDER BY tablename;

-- Q3: totais e órfãs
SELECT (SELECT count(*) FROM pg_policies WHERE schemaname='public')                       AS total_policies,
       (SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname='public')      AS tabelas_com_policy,
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
          AND NOT EXISTS (SELECT 1 FROM pg_policies p
                          WHERE p.schemaname='public' AND p.tablename=c.relname))         AS rls_on_sem_policy;
```

## 2. Resultados (2026-07-06T10:40Z)

| Métrica | Valor | Critério A3 | Veredito |
|---|---|---|---|
| Tabelas com `organization_id` | **112** | — | — |
| …com RLS ON | **112 (100%)** | 100% ON | ✅ |
| Tabelas `public` sem RLS (qualquer) | **0** | — | ✅ |
| Total de policies | **415** | — | — |
| Tabelas com ≥1 policy | **161** (todas) | — | ✅ |
| RLS ON **sem nenhuma policy** (deny-all acidental) | **0** | — | ✅ |
| Policies permissivas (`USING(true)`/`WITH CHECK(true)`) | **20** | listadas + justificadas | ver §3 |

## 3. As 20 policies permissivas — classificação e justificativa

### 3.1 `service_role` (17 policies) — **JUSTIFICADAS (redundantes-inofensivas)**
`agent_action_logs`, `agent_activation_logs`, `agent_handoff_history`, `agent_routing_rules`, `agent_specialists`, `agent_tool_executions`, `ai_prompt_experiments`, `ai_prompt_variants`, `ai_quality_evaluations`, `cakto_recovery_dispatches`, `conversation_processing_locks`, `funnel_webhook_logs`, `lead_semantic_memory`, `processed_messages`, `sent_responses`, `webhook_logs` (+1 variação).
**Por quê:** `service_role` já possui BYPASSRLS no Supabase — a policy explícita é redundante e não amplia superfície para `anon`/`authenticated`. Nenhuma ação.

### 3.2 Captação pública intencional (2) — **JUSTIFICADAS COM RESSALVA**
- `booking_requests` — "Anyone can create booking requests" (INSERT, `public`).
- `sales_leads` — "Anyone can insert sales leads" (INSERT, `public`).
**Por quê:** formulários públicos de funil (design herdado do core sales-spark). INSERT-only, sem leitura. **Ressalva:** anti-abuso (rate-limit) deve viver na edge/Traefik (§11.2), não na policy. Avaliar na limpeza se booking/funil ficam no Payments.

### 3.3 Catálogo (1) — **JUSTIFICADA**
- `platform_plans` — "Anyone authenticated can view active plans" (SELECT, `authenticated`). Catálogo de planos é público por natureza.

### 3.4 🚩 FLAG para o revisor (1) — **CORRIGIR OU JUSTIFICAR**
- `help_article_feedback` — "Users view all feedback" (SELECT, `authenticated`, `USING(true)`).
**Risco:** leitura cross-org — qualquer autenticado lê feedbacks de TODOS os tenants (texto livre pode conter PII). Severidade baixa (tabela de feedback de help center), mas viola o padrão multi-tenant.
**Correção proposta (para o lote MODO-B da Fase A, após G-SEC-REV):** trocar `USING (true)` por escopo via `organization_id`/autor (`user_id = auth.uid() OR organization_id = get_user_org()`), padrão das demais.

## 4. Escopo e próxima re-auditoria

Auditado: baseline herdado (161 tabelas do core sales-spark) no projeto novo. As tabelas do núcleo de cobrança (`migrations_cobranca/`) **ainda não existem** — cada migration nova da Fase A/B re-roda Q1–Q3 como verificação pós-lote (runbook §3.5 do plano).

## 5. Veredito do executor

Critério de máquina do A3 **atendido** (100% RLS ON + permissivas enumeradas e classificadas). **1 item aberto para decisão do revisor** (§3.4). Este doc + queries = proxy; certificação final no **G-SEC-REV** (P3, fim da Fase A).
