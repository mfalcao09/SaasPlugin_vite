# Port — Naming map: CBA ↔ NexvyBeauty

> **Onda 0 / referência OBRIGATÓRIA em toda query portada.**
> CBA = singular PT, tenant = `salao`, scoping = `salao_id`. NX = plural EN/ERP, tenant = `organizations`, scoping = `organization_id`.
> Sem este map, todo `SELECT`/`INSERT` portado quebra **em runtime** contra coluna/tabela/RLS inexistente (verificado: CBA usa `salao_id` ~393×; NX usa `organization_id`).

## Tenant & scoping
| CBA | NX |
|---|---|
| `salao` (o salão **é** o tenant) | `organizations` (o salão é uma org) |
| `salao_id` (FK de tenant) | `organization_id` |

## Salão / ERP
| CBA (singular) | NX (plural) |
|---|---|
| `agendamento` | `agendamentos` ✅ |
| `servico` | `servico_catalogo` |
| `profissional` | `profissionais` ✅ |
| `cliente` | `clientes` |
| `pacote` | `pacotes` *(a criar — Onda 2)* |
| `pacote_cliente` | `pacote_clientes` *(a criar — Onda 2)* |

## CRM (CBA prefixa `crm_`; NX não prefixa)
| CBA | NX |
|---|---|
| `crm_lead` | `leads` |
| `crm_funil` / `crm_funnel` | `pipeline_stages` (+ funil por produto) |
| `crm_oportunidade` | `deals` (deal aberto + forecasting: a criar — Onda 4) |
| `crm_nba_sugestao` | `lead_nba_sugestao` ✅ (já existe) |
| `crm_cadencia*` | `cadences` / edge fns `cadence-*` |
| `crm_campanha*` | `campaigns` / edge fns `campaign-*` |
| `crm_kb_artigo` / `crm_kb_categoria` | *(a criar — Onda 5)* |
| `crm_objecao` / `crm_playbook` | *(a criar — Onda 5)* |
| `crm_mia_acao` | copiloto `inbox-copilot` (+ ações tipadas: Onda 5) |
| `crm_daily_report` | *(a criar — Onda 6; hoje só notificação efêmera)* |
| `crm_notificacao_pref` | *(a criar — Onda 3; hoje prefs por-org, não por-usuário)* |
| `crm_score_regra` | *(a criar — Onda 4; hoje `recompute_lead_scores` com fórmula hardcoded)* |

## Regra de uso (anti-quebra-silenciosa)
1. **Pré-flight por onda:** `mcp list_tables` no projeto `fzhlbwhdejumkyqosuvq` **ANTES** de codar — confiar no disco mente (tabelas CRM podem estar só no remoto; `migrations_salao/` é pasta não-padrão).
2. Toda query portada passa por este map. Coluna de tenant **sempre** `organization_id`.
3. Pós-migration: **regenerar** `src/integrations/supabase/types.ts` do schema vivo.
4. "A criar" = a onda correspondente cria a migration (com `organization_id` + RLS por org via `profiles`).
