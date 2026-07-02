# 📅 Plano de Porte 1:1 — Booking do CRM Vendus → super-admin (platform_crm)

> **Escopo aprovado por Marcelo (02/07).** Onda seguinte ao porte dos 3 motores.
> **Origem do escopo:** forense (agentes `ad533413` edges+fronteira, `adb7fbb1` UI/hooks/tabelas).
> **Fonte 1:1:** `apps/NexvyBeauty/.vendus-src-reference/` (Vendus). **Destino:** `apps/NexvyBeauty/src/components/superadmin/crm/agenda/` + `supabase/functions/platform-booking-*`.

## 🚨 GUARDRAIL #11 — Fronteira dura (não confundir)
- **PORTAR:** booking estilo **Calendly de REUNIÃO de venda** (event types, disponibilidade, links de vendedor, reuniões). Tabelas `platform_crm_booking_*`. Prova: event_type tem `location_type IN (google_meet,zoom,phone,in_person)`, `guest_*`, `booking_experience IN (standard,conversational)`, slug público por vendedor — é reunião, não serviço.
- **NÃO TOCAR (salão-tenant):** `migrations_salao/` → `profissionais`, `agendamentos`, `pacotes`, `pacote_clientes`, `salon_automation_*`, `salon_monthly_goals`, `servico_catalogo`; `src/pages/salao/*`. Qualquer `organization_id`/serviço/profissional-de-salão = FORA.

## Estado atual (destino)
`PlatformCrmAgendaManager.tsx` tem 4 abas stubadas (`AgendaEmBreve`, ~linhas 452/459/466/473): **Reuniões · Tipos de Evento · Disponibilidade · Links da Equipe** (a aba calendário já é real). Tabelas `platform_crm_booking_*` já existem no schema (`20260702_platform_crm_agenda.sql`).

## Mapeamento 1:1 (original Vendus → destino platform_crm)

| Aba stub | Componente ORIGINAL | Hook ORIGINAL | Tabela Vendus → destino |
|---|---|---|---|
| **Reuniões** | `admin/booking/BookingsManager.tsx` (+ `BookingTimeline`, `BookingStatusBadge`) | `useBookings.ts` | `booking_requests` → `platform_crm_booking_requests` |
| **Tipos de Evento** | `admin/booking/EventTypesManager.tsx` + `EventTypeEditor.tsx` | `useBookingEventTypes.ts` | `booking_event_types` → `platform_crm_booking_event_types` |
| **Disponibilidade** | `admin/booking/AvailabilityManager.tsx` (+ `AddTimeSlotDialog`, `CopyDayDialog`) + `admin/schedules/BusinessHoursManager.tsx` | `useUserAvailability` / `useBusinessHours` | `user_availability`/`availability_overrides`/`business_hours`/`business_holidays` → `platform_crm_user_availability`/`_availability_overrides`/`_business_hours`/`_business_holidays` |
| **Links da Equipe** | `admin/booking/TeamBookingLinks.tsx` + `seller/BookingLinkShare.tsx` | `bookingSlug.ts` (`ensureBookingSlug`) | usa `profiles.booking_slug` → **__NO_EQUIVALENT__**: platform não tem `profiles`; mapear slug p/ vendedor via `platform_crm_squad_members`/`auth.users` (decidir armazenamento do slug) |

Notificações de booking: `useBookingNotifications.ts` → `booking_notification_settings`/`booking_reminders` → `platform_crm_booking_notification_settings`/`_booking_reminders` (confirmar no schema).

## Edges de booking (server-side)

| Edge original | Vira `platform-booking-*`? | Auth | Essencial p/ liveness das abas? |
|---|---|---|---|
| `booking-availability` | Sim | **público** (verify_jwt=false) — lead externo consulta slots | Sim (aba Disponibilidade + página pública) |
| `booking-submit` | Sim | **público** | Sim (marcar reunião) |
| `booking-dispatcher` | Sim | interno service-role (cron) — dispara confirmação/lembrete | Médio (notificações) |
| `booking-reply-ai` | Sim | interno (body) — IA interpreta resposta WhatsApp | Baixo (depende de canal WhatsApp) |
| `manual-booking-create` | Sim | super_admin (`authenticatePlatformAgent`) | Médio (criar reunião manual do admin) |
| `send-booking-confirmation` | Sim (ou reusar `_shared/platform-email-send.ts`) | interno | Médio (email) |

⚠️ Desacoplamento nos edges: originais hidratam telefone de `leads` por `organization_id` e usam `profiles`/`organizations` (o "host"=vendedor). No platform: `platform_crm_leads` sem filtro de org; "host" = vendedor da plataforma (mapear via squad_members/auth.users). Canais WhatsApp/Evolution podem virar no-op documentado (igual aos 3 motores).

## Página pública de booking (`PublicBooking.tsx` / `BookingConfirmation.tsx`)
Rota pública (`/agendar/:userSlug/:eventSlug`) onde o lead externo marca reunião. **Decisão pendente com Marcelo:** entra no super-admin (`gestao.*`) como rota pública separada, ou fica fora do escopo desta onda? (É o que dá sentido de ponta-a-ponta ao booking, mas é rota pública, não super-admin logado.)

## Plano ordenado + verificação (critério binário por passo)
1. **Schema** → conferir que TODAS as `platform_crm_booking_*` + `_user_availability`/`_availability_overrides`/`_business_hours`/`_business_holidays` existem com as colunas usadas pelos hooks. Verifica: `supabase db query` lista as tabelas/colunas. Criar migration só p/ o que faltar (ex.: slug do vendedor).
2. **Edges** → portar `platform-booking-availability`/`-submit` (públicas) 1:1 (strip org, tabelas→platform). Verifica: `supabase functions deploy` + curl 200 (availability retorna slots; submit cria booking de teste + cleanup).
3. **UI** → portar as 4 abas 1:1 (tema claro/rosa), trocando `AgendaEmBreve` pelos componentes reais + hooks. Verifica: build passa; eyeball no Chrome (unregister SW) mostra as 4 abas com dados.
4. **Notificações/dispatcher** → portar `platform-booking-dispatcher` + settings/reminders. Verifica: cron + curl.
5. **Comparação lado-a-lado** com o original (guardrail #1) antes de marcar DONE.

## Como executar (sugestão)
Workflow espelhando o dos motores: fase Contrato (mapear colunas/auth/slug) → Porte (pipeline por peça) → Verificação adversarial lado-a-lado. Deploy + liveness inline (edges públicas = curl direto; sem depender de service-secret).
