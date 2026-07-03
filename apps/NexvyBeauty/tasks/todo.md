# Portar fluxo PÚBLICO de booking (Calendly) CRM Vendus → super-admin platform_crm_*

## Achados de recon
- Tabelas platform_crm_* existem e SÃO desacopladas (sem organization_id):
  seller_booking(user_id,booking_slug,booking_bio), booking_event_types (sem thank_you/booking_experience),
  user_availability, availability_overrides, business_hours(singleton+schedule jsonb), business_holidays,
  booking_requests(host_user_id,event_type_id,confirmation_token,tracking,additional_info,lead_id),
  calendar_events(meet_link,create_meet,metadata,attendees).
- RPCs get/reschedule/cancel_booking_by_token apontam p/ public.booking_requests (TENANT/legado) → NÃO reusar
  (violaria fronteira). Rotear token via edge service-role própria (padrão do app: público só fala com edge).
- Guard: HostConfinementGuard delega a requiredHostClass() em src/lib/publicUrl.ts
  (PUBLIC_EXACT / PUBLIC_PREFIXES). Espelhar: add /agendar,/confirmar,/reagendar a PUBLIC_PREFIXES.

## Passos
- [ ] Edge platform-booking-availability (verify_jwt=false): slug→user via seller_booking, slots + info vendedor (profiles service-role) + event types ativos
- [ ] Edge platform-booking-submit (verify_jwt=false): cria platform_crm_booking_requests + calendar_events + token; dispatcher=TODO
- [ ] Edge platform-booking-token (verify_jwt=false): get/reschedule/cancel por token em platform_crm_*
- [ ] Deploy as 3 + curl real availability 200+slots
- [ ] src/hooks/usePlatformCrmPublicBooking.ts (hooks → edges)
- [ ] src/pages/PlatformCrmPublicBooking.tsx + subcomponentes (tema claro/rosa)
- [ ] src/pages/PlatformCrmBookingConfirmation.tsx (confirmar/reagendar)
- [ ] Rotas App.tsx: /agendar/:userSlug(/:eventSlug), /confirmar/:token, /reagendar/:token (públicas)
- [ ] Allowlist publicUrl.ts + tsc scoped limpo

## Review (concluído 2026-07-02)
- 3 edges deployadas (verify_jwt=false, ACTIVE): platform-booking-availability, -submit, -token.
- Curl real availability: HTTP 200 — modo B (profile+eventTypes) e modo A (18 slots/18 disp, next Monday).
- Achado-chave: RPCs *_booking_by_token apontam p/ public.booking_requests (TENANT) → não reusadas;
  token roteado via edge platform-booking-token sobre platform_crm_*. Fronteira preservada.
- Subcomponentes UI (BookingThankYou/ConversationalBooking/BookingCountdown) JÁ existiam no app,
  idênticos ao Vendus e sem acoplamento → reusados (porte, não reconstrução).
- Ponta admin (PlatformCrmTeamBookingLinks/EventTypesManager) já gerava /agendar/:slug[/:eventSlug]
  → rotas criadas casam 1:1 com os links já produzidos (antes eram links mortos).
- Guard: /agendar/ /confirmar/ /reagendar/ adicionados a PUBLIC_PREFIXES em src/lib/publicUrl.ts
  (mesmo padrão de /s/ /f/ /c/ /q/). Rotas públicas sem ProtectedRoute/SuperAdminRoute.
- tsc scoped: 23 erros TOTAL = baseline pré-existente; ZERO nos arquivos criados.
- Fixture sintético de liveness removido do banco.
- Pendente (fora do escopo, marcado TODO): platform-booking-dispatcher (envio email/WhatsApp).
