# RPC chamadas pelo frontend & Realtime

## RPC chamadas via `supabase.rpc(...)` no frontend

Garanta que TODAS estas funções existam no novo schema (já presentes em
`00000000000004_functions.sql`):

| Função | Origem |
|---|---|
| `calculate_commission` | hooks/useCommissions |
| `cancel_booking_by_token` | pages/BookingConfirmation |
| `create_product_tag_package` | hooks de produto |
| `delete_lead_cascade` | hooks/useLeads |
| `delete_product_safe` | hooks de produto |
| `delete_team_member` | hooks/useTeam |
| `get_auth_user_id_by_email` | admin |
| `get_invitation_by_token` | pages/AcceptInvite |
| `get_organization_effective_limits` | hooks/useOrganizationPlan |
| `get_product_performance` | dashboards |
| `inbox_list_conversations` | hooks/useAttendancePanel |
| `increment_form_views` | PublicForm |
| `increment_funnel_views` | PublicChat |
| `initialize_user_permissions` | hooks/useUserPermissions |
| `mark_super_admin_password_changed` | wizard primeiro acesso |
| `process_pending_queue` | admin |
| `reschedule_booking_by_token` | pages/BookingConfirmation |

Funções SECURITY DEFINER adicionais usadas por triggers/policies (não chamadas via supabase.rpc mas obrigatórias): `has_role`, `is_super_admin`, `has_sector_access`, `user_belongs_to_organization`, `user_in_sector_organization`, `user_sector_ids`, `get_user_organization`, `is_within_business_hours`, `evaluate_routing_rules`, `apply_tag_automations`, `distribute_lead`, `try_acquire_conversation_lock`, `release_bot_lock`, `try_lock_bot`, `pick_prompt_variant`, `record_variant_impression`, `record_variant_score`, `enqueue_email`, `read_email_batch`, `move_to_dlq`, `delete_email`, `enforce_single_attendant`, etc. (61 SECURITY DEFINER no total — todas inclusas no dump).

## Realtime publication (`supabase_realtime`)

A publication retornou vazia para o role `authenticated` no projeto fonte, mas o app
faz subscribe das tabelas abaixo via `supabase.channel().on('postgres_changes', ...)`.
Adicionar antes do app subir:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.webchat_conversations,
  public.webchat_messages,
  public.notifications,
  public.admin_notifications,
  public.lead_queue,
  public.agent_tool_executions,
  public.tasks,
  public.leads;
```

Audite com `rg "channel\\(|postgres_changes" src` no código para confirmar a lista
exata; sem entrada na publication, o subscribe conecta mas nunca recebe eventos.
