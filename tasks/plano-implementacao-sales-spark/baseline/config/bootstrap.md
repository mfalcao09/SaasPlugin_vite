# Bootstrap — Primeiro acesso e ordem de subida

## Pré-requisitos no novo projeto Supabase

1. **Habilitar extensões** (já no dump):
   `pg_cron`, `pg_net`, `pgmq`, `supabase_vault`, `pg_trgm`, `pgcrypto`, `pg_stat_statements`,
   `uuid-ossp`, `vector` (0.8+), `plpgsql`.

## Ordem de execução

```
1. CREATE EXTENSIONs                           -> 00000000000001_extensions_and_types.sql
2. CREATE TABLEs + GRANTs                      -> 00000000000002_tables.sql
3. Constraints, indexes, foreign keys          -> 00000000000003_constraints_and_indexes.sql
4. Functions (todas as SECURITY DEFINER, has_role, is_super_admin, etc.)
                                               -> 00000000000004_functions.sql
5. Triggers e views                            -> 00000000000005_triggers_and_views.sql
6. RLS Policies                                -> 00000000000006_rls_policies.sql
7. Seeds (platform_plans, help_*, form_templates, platform_releases)
                                               -> seeds.sql
8. Storage buckets + policies                  -> storage-setup.sql
9. Deploy de todas as edge functions           (supabase functions deploy --no-verify-jwt)
10. Configurar Secrets do projeto              -> secrets-list.md
11. Configurar Auth (providers, site URL, redirect URLs, Send Email Hook)
                                               -> auth-config.md
12. Provisionar Lovable Emails (ou Resend) e rodar `email_domain--setup_email_infra`
    (cria queues pgmq, RPC `enqueue_email`, vault secret, cron `process-email-queue`)
13. Registrar cron jobs                        -> cron-webhooks.md
14. Habilitar Realtime nas tabelas             -> realtime.md
```

## Fluxo do primeiro super admin

1. Definir secret `SUPER_ADMIN_EMAIL` no projeto.
2. Abrir o app — a primeira tela de login mostra signup.
3. Usuário cria conta com `SUPER_ADMIN_EMAIL`.
4. Trigger `handle_new_user` cria `public.profiles`.
5. Trigger `claim_first_super_admin` (ou função homônima chamada por
   `ensure-default-super-admin`) insere `('user_id', 'super_admin')` em `user_roles`.
6. Se o usuário já existir mas não foi promovido (cenário de remix), o super admin
   roda manualmente a edge `bootstrap-super-admin` (botão "Sincronizar Super Admin"
   em `BootstrapSuperAdminCard`). Ela faz `auth.admin.listUsers()` e insere o papel.
7. Na primeira sessão como super admin, o hook `useSuperAdminFirstAccess` força o
   wizard de setup enquanto:
   - `platform_settings.default_password_changed = false`, OU
   - `platform_settings.remix_setup_completed = false`, OU
   - `COUNT(organizations) = 0`.

## Checklist obrigatório do wizard (`useSuperAdminSetupChecklist`)

| Item | Obrigatório? | Como satisfazer |
|---|---|---|
| Trocar senha padrão | sim | Wizard "Primeiro acesso"; chama `mark_super_admin_password_changed()` |
| E-mail transacional | não | Cloud → Emails (Lovable) ou setar `RESEND_API_KEY` |
| Pelo menos 1 plano ativo | sim | `platform_plans.is_active=true` — seeds.sql já cria "Empresa Master" |
| Servidor WhatsApp (Evolution) | não | `platform_settings.evolution_go_url` + `evolution_go_global_api_key` |
| Criar primeira empresa | sim | UI Super Admin → Organizações → "Nova" (chama `create-organization-admin`) |

Após todos os obrigatórios = TRUE → wizard marca `platform_settings.remix_setup_completed = true`.

## Dependências de ordem para criar uma Organização

Pré-requisitos antes da primeira `INSERT INTO organizations`:
1. `platform_plans` precisa ter ≥1 plano ativo (FK opcional, mas o UI exige escolher).
2. `profiles` do super admin existe (FK `platform_audit_logs.actor_id → profiles.id`).
   Caso o super admin tenha sido criado **antes** da trigger `handle_new_user`,
   inserir manualmente:
   ```sql
   INSERT INTO public.profiles (id, email, full_name)
   VALUES ('<super_admin_uuid>', '<super_admin_email>', 'Super Admin')
   ON CONFLICT (id) DO NOTHING;
   ```

## Realtime / Publication

A publication `supabase_realtime` no projeto fonte está **vazia** quando consultada
com o role `authenticated`. Tabelas que o app assina em runtime (precisam estar na
publication para Realtime funcionar — adicionar via migration):
- `webchat_conversations`
- `webchat_messages`
- `notifications`
- `admin_notifications`
- `lead_queue`
- `processed_messages`
- `agent_tool_executions`

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.webchat_conversations,
  public.webchat_messages,
  public.notifications,
  public.admin_notifications,
  public.lead_queue,
  public.agent_tool_executions;
```
(Confirme em produção observando os `supabase.channel(...).on('postgres_changes',...)` que falham.)
