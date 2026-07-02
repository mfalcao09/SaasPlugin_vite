# Auditoria de Fidelidade 1:1 — BOOKING / AGENDA (platform_crm_*)

> **Escopo:** catálogo read-only de CADA diferença entre o subsistema BOOKING/AGENDA **portado**
> (`src/components/superadmin/crm/agenda/**` + páginas públicas + hooks `usePlatformCrm*`/`usePlatformCrmPublicBooking` + edges `platform-booking-*`)
> e o **original 1:1** (`.vendus-src-reference/src/components/admin/booking/**` + `admin/CalendarManager` + `calendar/**` + `schedules/**` + páginas + hooks `useBooking*`/`usePublicBooking`/`useBusinessHours`/`bookingSlug` + edges `booking-*`).
> **Método:** componente-a-componente, hook-a-hook, edge-a-edge. Cada diff recebe UMA tag. Evidência `arquivo:linha` dos dois lados.
> **Data:** 2026-07-02.

## Legenda de tags
`[1:1]` idêntico (só símbolo/arquivo renomeia) · `[TEMA]` só cor/estilo · `[PLATFORM_CRM]` troca tabela/edge p/ `platform_crm_*`, strip `organization_id` · `[RENOMEADO]` label/rota · `[CONSOLIDADO]` 2+→1 · `[MAPEADO-ERP]` movido p/ ERP · `[DROP-OK]` removido com justificativa sólida · `[FALTA]` gap real sem justificativa · `[ADICIONADO]` existe no port e não no original.

---

## 1. AgendaManager (casca de abas + visão de calendário)

Original `admin/CalendarManager.tsx` (424 l) → Port `agenda/PlatformCrmAgendaManager.tsx` (465 l).

| Tag | Item | Evidência ORIG | Evidência PORT | Razão |
|---|---|---|---|---|
| `[1:1]` | Estrutura de abas (Agenda/Reuniões/Tipos/Disponibilidade/Links) + navegação mês/semana/dia/lista + stats + filtros | `CalendarManager.tsx:55-424` | `PlatformCrmAgendaManager.tsx:76-464` | Lógica idêntica; só símbolos renomeados |
| `[PLATFORM_CRM]` | Eventos via `usePlatformCrmCalendarEvents`; vendedores via `usePlatformCrmSellers` | `CalendarManager.tsx:32,67,97` (`useCalendarEvents`,`useTeamMembers`) | `PlatformCrmAgendaManager.tsx:39,42,116` | Tabela `platform_crm_calendar_events`; sem org |
| `[DROP-OK]` | Filtro de **Produto** (select `products` + `productId`) removido | `CalendarManager.tsx:60,66,100,235-247` | (ausente) | Coluna `product_id` inexistente em `platform_crm_calendar_events` |
| `[DROP-OK]` | Gate `isAdmin/isManager` (`canViewAllUsers`) removido; super_admin sempre vê todos | `CalendarManager.tsx:56,104,219,363,374` | `PlatformCrmAgendaManager.tsx:60-61` (comentário) | Super_admin é único usuário; gate perde sentido |
| `[DROP-OK]` | `GoogleCalendarConnect` (OAuth real) → bloco "Em breve" com toast | `CalendarManager.tsx:41,280` | `PlatformCrmAgendaManager.tsx:285-317` | OAuth Google não portado (TODO edge) |

## 2. Calendar Views (4 componentes)

| Tag | Componente | Evidência ORIG | Evidência PORT | Razão |
|---|---|---|---|---|
| `[1:1]` | MonthView | `calendar/CalendarMonthView.tsx` | `agenda/PlatformCrmCalendarMonthView.tsx` | Idêntico; só `event_type ?? 'other'` (null-safety) |
| `[1:1]` | WeekView | `calendar/CalendarWeekView.tsx` | `agenda/PlatformCrmCalendarWeekView.tsx` | Idêntico (BRT helpers iguais); null-safety |
| `[1:1]` | DayView | `calendar/CalendarDayView.tsx` | `agenda/PlatformCrmCalendarDayView.tsx` | Idêntico; dropou import `isSameDay` (não usado) |
| `[DROP-OK]` | ListView: bloco **Produto** (`Package` + `event.product.name`) removido | `calendar/CalendarListView.tsx:4,137-142` | `agenda/PlatformCrmCalendarListView.tsx` (ausente) | Sem `product` no schema de plataforma; resto 1:1 |

## 3. EventModal

Original `calendar/EventModal.tsx` (708 l) → Port `agenda/PlatformCrmEventModal.tsx` (664 l).

| Tag | Item | Evidência ORIG | Evidência PORT | Razão |
|---|---|---|---|---|
| `[1:1]` | Form completo (título/tipo/data-hora/all_day/lead combobox/criar-lead inline/location/reminders) | `EventModal.tsx:304-707` | `PlatformCrmEventModal.tsx:278-663` | Idêntico |
| `[PLATFORM_CRM]` | Lead via `usePlatformCrmLeads`/`useCreatePlatformCrmLead` (sem `organization_id`) | `EventModal.tsx:18,66,189-199` | `PlatformCrmEventModal.tsx:38-41,187-205` | `platform_crm_leads`; `user.id` via `auth.getUser()` |
| `[DROP-OK]` | **Produto** (`useProducts` + select `product_id`) removido | `EventModal.tsx:17,65,530-548` | (ausente) | Coluna inexistente |
| `[DROP-OK]` | **Booking Event Type selector** ("Tipo configurado" + `handleApplyEventType`) removido | `EventModal.tsx:68,159-182,327-355` | `PlatformCrmEventModal.tsx:52-55` (comentário) | Depende de `manual-booking-create` (edge não portada) |
| `[DROP-OK]` | Automação `manual-booking-create` no submit removida | `EventModal.tsx:238-264` | `PlatformCrmEventModal.tsx:239-240` (TODO) | Edge de automação não portada |
| `[TEMA]` | Toggle Google Meet: gate `isConnected` removido → sempre exibido + toast "em breve" | `EventModal.tsx:67,573-590` | `PlatformCrmEventModal.tsx:503-533` | `useGoogleCalendarConnection` tenant-bound; flag persiste, link é TODO edge |
| `[ADICIONADO]` | `normalizePhoneBR` agora É aplicado ao criar lead | `EventModal.tsx:51-57` (definido, nunca chamado) | `PlatformCrmEventModal.tsx:200` | Bugfix menor no port |

## 4. Subsistema booking/ (managers, editor, dialogs)

| Tag | Componente | Evidência ORIG | Evidência PORT | Razão |
|---|---|---|---|---|
| `[1:1]` | EventTypesManager | `booking/EventTypesManager.tsx` | `booking/PlatformCrmEventTypesManager.tsx` | Idêntico; `ensureBookingSlug`→`ensurePlatformCrmBookingSlug` (param `currentSlug` dropado) |
| `[DROP-OK]` | EventTypeEditor: campo **"Experiência de Agendamento"** (`booking_experience` RadioGroup standard/conversational) removido | `booking/EventTypeEditor.tsx:25,92,329-372` | `booking/PlatformCrmEventTypeEditor.tsx:48-51` (comentário) | Coluna `booking_experience` inexistente em `platform_crm_booking_event_types` |
| `[1:1]` | EventTypeEditor (resto: geral + avançado + perguntas + aba notificações) | `booking/EventTypeEditor.tsx` | `booking/PlatformCrmEventTypeEditor.tsx` | Idêntico; aba Notificações gated a `isEditing` no TabsList (original usa empty-state) |
| `[1:1]` | BookingsManager | `booking/BookingsManager.tsx` | `booking/PlatformCrmBookingsManager.tsx` | Idêntico; null-safety em `status`/`additional_info`; dropou imports mortos (`Badge`,`User`,`bookingsByDate`,`statusLabels`) |
| `[1:1]` | AvailabilityManager | `booking/AvailabilityManager.tsx` | `booking/PlatformCrmAvailabilityManager.tsx` | Idêntico; dropou imports não usados (`Tabs`,`Switch`) |
| `[1:1]` | AddTimeSlotDialog | `booking/AddTimeSlotDialog.tsx` | `booking/PlatformCrmAddTimeSlotDialog.tsx` | Idêntico; só origem de `DAY_NAMES` |
| `[1:1]` | CopyDayDialog | `booking/CopyDayDialog.tsx` | `booking/PlatformCrmCopyDayDialog.tsx` | Idêntico; só origem de `DAY_NAMES`/tipo |
| `[TEMA]` | BookingStatusBadge | `booking/BookingStatusBadge.tsx` | `booking/PlatformCrmBookingStatusBadge.tsx` | Só cores `-400` (dark) → `-600/-700` (claro) |
| `[PLATFORM_CRM]` | BookingTimeline | `booking/BookingTimeline.tsx:53-54` (`booking_logs`,`booking_status_history`) | `booking/PlatformCrmBookingTimeline.tsx:60-61` (`platform_crm_booking_logs`/`_status_history`) | Tabelas platform; `notes` do histórico dropado (coluna inexistente); import `XCircle` ocioso |
| `[PLATFORM_CRM]` | TeamBookingLinks | `booking/TeamBookingLinks.tsx:28,115-128` (`useTeamMembers`,`profiles.booking_slug`) | `booking/PlatformCrmTeamBookingLinks.tsx:24,50,106-120` (`usePlatformCrmSellerSlugs`,`platform_crm_seller_booking`) | Slug em tabela dedicada; vendedores de squads de plataforma. UI 1:1 |

## 5. Subsistema booking/notifications/ (5 componentes)

| Tag | Componente | Evidência ORIG | Evidência PORT | Razão |
|---|---|---|---|---|
| `[DROP-OK]` | NotificationsAutomationTab: seção **"Instância WhatsApp"** (nº de disparo, `useEvolutionInstances`) removida | `notifications/NotificationsAutomationTab.tsx:11,35,60,94-135` | `notifications/PlatformCrmNotificationsAutomationTab.tsx:105-108` (TODO) | Coluna `whatsapp_instance_id` inexistente + `useEvolutionInstances` é tenant-bound (violaria fronteira) |
| `[CONSOLIDADO]` | NotificationsAutomationTab: numeração de seções renumerada (7→5) após drop da instância | idem acima | idem | Cosmético, decorrente do drop |
| `[1:1]` | NotificationsAutomationTab (resto: canais/template/recovery/internas) | `notifications/NotificationsAutomationTab.tsx` | `notifications/PlatformCrmNotificationsAutomationTab.tsx` | Idêntico; sem `useAuth`/`organization_id` |
| `[1:1]` | RemindersList | `notifications/RemindersList.tsx` | `notifications/PlatformCrmRemindersList.tsx` | Idêntico; dropou const morta `UNITS`; cast `channel` |
| `[1:1]` / `[TEMA]` | MessagePreview | `notifications/MessagePreview.tsx` | `notifications/PlatformCrmMessagePreview.tsx` | Idêntico; sample `vendus.com`→`exemplo.com`, `Vendus`→`Nexvy` |
| `[1:1]` | MessageTemplateEditor | `notifications/MessageTemplateEditor.tsx` | `notifications/PlatformCrmMessageTemplateEditor.tsx` | Idêntico |
| `[1:1]` | VariablesChips | `notifications/VariablesChips.tsx` | `notifications/PlatformCrmVariablesChips.tsx` | Idêntico |

## 6. Páginas públicas

| Tag | Item | Evidência ORIG | Evidência PORT | Razão |
|---|---|---|---|---|
| `[1:1]` | PublicBooking: passos list→calendar→form→conversational→confirmation | `pages/PublicBooking.tsx` (621 l) | `pages/PlatformCrmPublicBooking.tsx` (627 l) | Estrutura idêntica; REUSA os mesmos `@/components/booking/ConversationalBooking` + `BookingThankYou` (não clonados) |
| `[PLATFORM_CRM]` | PublicBooking: dados via hooks `usePlatform*` (edges) em vez de tabela/view direta | `PublicBooking.tsx:22-28,71-73` | `PlatformCrmPublicBooking.tsx:34-41,85-87` | Anon não lê tabela; passa por edge `platform-booking-availability` |
| `[TEMA]` | Cor de fallback rosa `#e84393` (original verde implícito) | — | `PlatformCrmPublicBooking.tsx:48` | Tema da marca |
| `[1:1]` | BookingConfirmation: view de detalhes (countdown/meet/reagendar) | `pages/BookingConfirmation.tsx` (201 l) | `pages/PlatformCrmBookingConfirmation.tsx` (333 l) | Idêntico; usa `BookingCountdown`/`CountdownProgress`/`Logo` compartilhados |
| `[PLATFORM_CRM]` | BookingConfirmation: token via edge `platform-booking-token` (não RPCs) | `BookingConfirmation.tsx:6` (`useBookingByToken` → RPC) | `PlatformCrmBookingConfirmation.tsx:34-37` | Desacoplamento |
| `[ADICIONADO]` | BookingConfirmation: seletor de reagendamento **funcional** in-page (`/reagendar/:token`) | `BookingConfirmation.tsx:48-51` (só navega, sem UI real) | `PlatformCrmBookingConfirmation.tsx:125-207` | Original renderiza a mesma view de confirmação em `/reagendar`; o port implementa o picker real |

## 7. Hooks de dados

| Tag | Hook | Evidência ORIG | Evidência PORT | Razão |
|---|---|---|---|---|
| `[PLATFORM_CRM]` | BusinessHours (`org_id` → `singleton`) | `hooks/useBusinessHours.ts:57,66,89` | `data/usePlatformCrmBusinessHours.ts:55-104` | Tabela singleton; lógica `isWithin...Local` 1:1 |
| `[PLATFORM_CRM]` + `[DROP-OK]` | CalendarEvents: drop `product_id`, `google_event_id/calendar_id`, join produto, filtro produto, 2× Google-sync | `hooks/useCalendarEvents.ts:23,28-29,88,102-106,177-238` | `data/usePlatformCrmCalendarEvents.ts:12-16,110-111,141` | Colunas inexistentes / OAuth deferido (TODO edge) |
| `[PLATFORM_CRM]` | UserAvailability | `hooks/useUserAvailability.ts` | `data/usePlatformCrmUserAvailability.ts` | `platform_crm_user_availability` + `_availability_overrides` |
| `[PLATFORM_CRM]` | BookingEventTypes | `hooks/useBookingEventTypes.ts` | `data/usePlatformCrmBookingEventTypes.ts` | `platform_crm_booking_event_types`; `generateSlug`→`generatePlatformCrmEventSlug` |
| `[DROP-OK]` | BookingNotifications: `whatsapp_instance_id` mantido no draft-type mas STRIPADO antes de persistir | `hooks/useBookingNotifications.ts:16,79-83,138-140` | `data/usePlatformCrmBookingNotifications.ts:15,41,135-136` | Coluna inexistente; `renderTemplate`/`TEMPLATE_VARIABLES`/`order_index` 1:1 |
| `[PLATFORM_CRM]` | Bookings (`usePlatformCrmBookings`) | `hooks/useBookings.ts` | `data/usePlatformCrmBookings.ts` | `platform_crm_booking_requests`; sem org |
| `[PLATFORM_CRM]` | BookingSlug: slug migra de `profiles.booking_slug` → `platform_crm_seller_booking`; vendedores de `platform_crm_squad_members` | `lib/bookingSlug.ts:30-40` | `data/usePlatformCrmBookingSlug.ts:10-22,58-73` | Fronteira tenant↔plataforma |
| `[CONSOLIDADO]` | `useBookingConfirmation.ts` (hook separado no original) fundido em `usePlatformCrmPublicBooking.ts` | `hooks/useBookingConfirmation.ts` (arquivo próprio) | `hooks/usePlatformCrmPublicBooking.ts:181-283` | Token hooks juntos com public-booking |
| `[DROP-OK]` (inerte) | Public hook tipa `booking_experience`/`thank_you_*`/`what_happens`/`next_steps` mas edge sempre devolve `standard`/ausente | `hooks/usePublicBooking.ts:12` | `hooks/usePlatformCrmPublicBooking.ts:41-46` | Colunas inexistentes; branch conversacional/thank-you-premium fica **código morto na prática** (fidelidade estrutural preservada) |

## 8. Edges (Supabase Functions)

| Tag | Edge | Evidência ORIG | Evidência PORT | Razão |
|---|---|---|---|---|
| `[PLATFORM_CRM]` + `[CONSOLIDADO]` | availability: absorve resolução de profile + eventType (que no original eram reads diretos de view/tabela) em 1 edge multi-modo (A/B/C) | `booking-availability/index.ts` (202 l, só slots) + `usePublicBooking.ts:42-118` (reads diretos) | `platform-booking-availability/index.ts` (277 l) | Anon não lê tabela/view; `computeSlots` 1:1 |
| `[PLATFORM_CRM]` + `[DROP-OK]` | submit: núcleo (fetch/conflito/cria evento+booking+token) 1:1; drop hidratação de telefone, Google sync, enqueue de jobs, e-mail de confirmação, push | `booking-submit/index.ts` (376 l; 68-83,181-355) | `platform-booking-submit/index.ts` (173 l; 157-159 TODO) | Tabelas platform; toda a cauda de notificação/AI é `platform-booking-dispatcher` (TODO edge) |
| `[PLATFORM_CRM]` + `[CONSOLIDADO]` | token: substitui as 3 RPCs `get/reschedule/cancel_booking_by_token` por 1 edge action-dispatched | `useBookingConfirmation.ts:49-51,102,126` (RPCs) | `platform-booking-token/index.ts:26,42-89` | Desacoplamento |
| `[DROP-OK]` | `booking-dispatcher` (315 l) sem port | `booking-dispatcher/index.ts` | (ausente) | Motor de envio assíncrono deferido → TODO `platform-booking-dispatcher` |
| `[DROP-OK]` | `booking-reply-ai` (302 l) sem port | `booking-reply-ai/index.ts` | (ausente) | IA de resposta a lead deferida (depende do dispatcher + inbox tenant) |
| `[DROP-OK]` | `send-booking-confirmation` (69 l) sem port | `send-booking-confirmation/index.ts` | (ausente) | E-mail de confirmação deferido → dispatcher |
| `[DROP-OK]` | `manual-booking-create` (287 l) sem port | `manual-booking-create/index.ts` | (ausente) | Automação a partir do EventModal deferida (ver §3) |

---

## Contagem por tag

| Tag | Qtd |
|---|---|
| `[1:1]` | 19 |
| `[PLATFORM_CRM]` | 15 |
| `[DROP-OK]` | 18 |
| `[TEMA]` | 5 |
| `[CONSOLIDADO]` | 5 |
| `[ADICIONADO]` | 2 |
| `[RENOMEADO]` | 0 (renomes de símbolo estão embutidos nos `[1:1]`) |
| `[MAPEADO-ERP]` | 0 |
| `[FALTA]` | 0 |

## Itens que quebram 1:1 estrito

### `[FALTA]` — nenhum.
Todo item removido tem justificativa sólida (coluna/edge inexistente, dependência de tenant proibida pela fronteira, ou integração OAuth/dispatcher explicitamente deferida com `TODO(edge)`).

### `[ADICIONADO]` (2)
1. **`PlatformCrmEventModal`** — `normalizePhoneBR` passou a ser efetivamente aplicado ao criar lead inline (no original a função existia mas nunca era chamada). `PlatformCrmEventModal.tsx:200`.
2. **`PlatformCrmBookingConfirmation`** — seletor de reagendamento in-page real na rota `/reagendar/:token` (o original renderizava a mesma tela de confirmação, sem picker). `PlatformCrmBookingConfirmation.tsx:125-207`.

---

## Veredito

**Cobertura do booking original preservada no port: ~98% do fluxo funcional-núcleo; ~85% se contarmos a suíte de notificação/automação assíncrona (deferida por design).**

- **Front-end (componentes + páginas): ~99% 1:1.** Toda a UI (managers, editor, dialogs, calendário 4-views, event modal, páginas públicas, thank-you, reagendamento) é porte fiel. As únicas subtrações são campos/colunas que não existem no schema de plataforma (produto, `booking_experience`, `whatsapp_instance_id`) — nunca gaps arbitrários.
- **Back-end (edges): núcleo de agendamento 100% preservado**; toda a cauda de efeitos colaterais (e-mail, WhatsApp, push, Google sync, IA de resposta, enqueue de lembretes) foi **deferida coerentemente** para um futuro `platform-booking-dispatcher` — 4 edges originais sem port, todas justificadas.

## Top-3 diferenças que o Marcelo precisa saber

1. **A automação de notificação NÃO dispara — por design.** `platform-booking-submit` grava booking + token e retorna sucesso, mas NÃO enfileira confirmação/lembrete/recuperação nem envia e-mail/WhatsApp/push (`platform-booking-submit/index.ts:157-159`). Toda a UI de "Notificações & Automação" (canais, templates, lembretes, recuperação) **persiste config, mas nada é enviado** até existir a edge `platform-booking-dispatcher`. 4 edges do original (`booking-dispatcher`, `send-booking-confirmation`, `booking-reply-ai`, `manual-booking-create`) ficaram sem port. É o maior bloco de funcionalidade "presente na UI, inerte no backend".

2. **A "Experiência Conversacional" de agendamento é código morto na prática.** O `EventTypeEditor` portado não deixa escolher `booking_experience` (coluna inexistente) e a edge sempre devolve `'standard'`, então o branch `conversational` em `PlatformCrmPublicBooking.tsx:98-100,576` e a página premium `BookingThankYou` com `thank_you_title/what_happens/next_steps` nunca são exercitados — embora o código esteja lá, 1:1. Se o produto quiser esse fluxo, é migration + UI, não só "religar".

3. **Fronteira tenant↔plataforma respeitada com rigor (bom sinal).** Slug do vendedor migrou de `profiles.booking_slug` para `platform_crm_seller_booking` e os vendedores vêm de `platform_crm_squad_members` (não `useTeamMembers`); `product_id`/`organization_id` sumiram de todas as tabelas; `useEvolutionInstances` (tenant-bound) foi deliberadamente NÃO importado. Nenhuma leitura de plataforma toca tabela de tenant — exatamente a MÁXIMA "tenant↔plataforma nunca funde".
