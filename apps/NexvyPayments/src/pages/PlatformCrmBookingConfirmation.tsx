// PlatformCrmBookingConfirmation — página PÚBLICA (anon) de confirmação e
// reagendamento por TOKEN do módulo super-admin `platform_crm_*`.
//
// Porte 1:1 de BookingConfirmation.tsx (Vendus/CRM). Atende as duas rotas do
// original (/confirmar/:token e /reagendar/:token) com o MESMO componente.
// Diferenças (somente as pedidas):
//   (a) dados via usePlatform*ByToken (edge platform-booking-token), nunca tabela;
//   (b) tema claro/rosa (tokens do app);
//   (c) desacoplado (zero organization_id).
//
// No modo /reagendar o componente exibe um seletor mínimo de nova data/horário
// (mesma edge de disponibilidade), para o link de reagendamento ser funcional —
// no /confirmar mostra só os detalhes + botão "Reagendar" (idêntico à fonte).
import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  Video,
  User,
  Mail,
  Loader2,
  AlertCircle,
  ExternalLink,
  Globe,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePlatformBookingByToken,
  usePlatformAvailableSlots,
  usePlatformRescheduleBooking,
} from '@/hooks/usePlatformCrmPublicBooking';
import { BookingCountdown, CountdownProgress } from '@/components/booking/BookingCountdown';
import { format, parseISO, isBefore, addDays, startOfDay, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Logo } from '@/components/ui/Logo';

export default function PlatformCrmBookingConfirmation() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isRescheduleRoute = location.pathname.startsWith('/reagendar');

  const { data: booking, isLoading, error } = usePlatformBookingByToken(token);

  // Estado do reagendamento (só usado no modo /reagendar).
  const [rescheduling, setRescheduling] = useState(isRescheduleRoute);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const { data: slots, isLoading: loadingSlots } = usePlatformAvailableSlots(
    booking?.event_type?.id,
    selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined,
  );
  const reschedule = usePlatformRescheduleBooking();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Link Inválido</h1>
            <p className="text-muted-foreground">
              Este link de confirmação não é válido ou a reunião foi cancelada.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const startDate = parseISO(booking.start_time);
  const endDate = parseISO(booking.end_time);
  const isUpcoming = isBefore(new Date(), startDate);
  const isCancelled = booking.status === 'cancelled';

  const handleReschedule = () => {
    setRescheduling(true);
    navigate(`/reagendar/${token}`);
  };

  const handleJoinMeeting = () => {
    if (booking.calendar_event?.meet_link) {
      window.open(booking.calendar_event.meet_link, '_blank');
    }
  };

  // Restrições de data no reagendamento.
  const minDate = addDays(new Date(), 1);
  const maxDate = addDays(new Date(), 60);
  const isDateDisabled = (date: Date) =>
    isBefore(startOfDay(date), startOfDay(minDate)) || isAfter(startOfDay(date), startOfDay(maxDate));

  const handleConfirmReschedule = async (slot: { start: string; end: string }) => {
    if (!token || !selectedDate) return;
    // Horário fixo de Brasília (-03:00) — slots em hora local BRT.
    const newStartTime = `${format(selectedDate, 'yyyy-MM-dd')}T${slot.start}:00-03:00`;
    try {
      await reschedule.mutateAsync({
        token,
        newStartTime,
        timezone: 'America/Sao_Paulo',
      });
      setRescheduling(false);
      navigate(`/confirmar/${token}`);
    } catch {
      // erro tratado no hook
    }
  };

  // ---- Modo reagendamento (seletor de nova data/horário) ----
  if (rescheduling && !isCancelled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col">
        <div className="p-4 flex justify-center">
          <Logo size="md" />
        </div>
        <div className="flex-1 flex items-start justify-center p-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
            <Card className="overflow-hidden shadow-2xl border-0">
              <CardContent className="p-4 sm:p-6 space-y-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRescheduling(false);
                    navigate(`/confirmar/${token}`);
                  }}
                  className="-ml-2"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Voltar
                </Button>

                <div>
                  <h1 className="text-xl font-bold">Reagendar reunião</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {booking.event_type?.name} • {booking.event_type?.duration_minutes} min
                  </p>
                </div>

                <CalendarPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => setSelectedDate(d)}
                  disabled={isDateDisabled}
                  locale={ptBR}
                  className="rounded-md border pointer-events-auto"
                />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4" />
                  <span>Horário de Brasília</span>
                </div>

                {selectedDate && (
                  <div>
                    <h4 className="font-medium mb-3 capitalize">
                      {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </h4>
                    {loadingSlots ? (
                      <div className="space-y-2">
                        {[1, 2, 3, 4].map((i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : slots?.filter((s) => s.available).length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        Nenhum horário disponível nesta data. Escolha outra data.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-2">
                        {slots?.filter((s) => s.available).map((slot) => (
                          <Button
                            key={slot.start}
                            variant="outline"
                            size="sm"
                            disabled={reschedule.isPending}
                            onClick={() => handleConfirmReschedule(slot)}
                          >
                            {slot.start}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  // ---- Modo confirmação (detalhes) — idêntico à fonte ----
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col">
      {/* Header */}
      <div className="p-4 flex justify-center">
        <Logo size="md" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
          <Card className="overflow-hidden shadow-2xl border-0">
            <CardContent className="p-0">
              {/* Progress Bar */}
              {isUpcoming && !isCancelled && (
                <div className="p-6 pb-0">
                  <CountdownProgress targetDate={startDate} createdAt={parseISO(booking.created_at)} />
                </div>
              )}

              {/* Conteúdo */}
              <div className="p-4 sm:p-6 space-y-6">
                {isCancelled ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="h-8 w-8 text-destructive" />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">Reunião Cancelada</h1>
                    <p className="text-muted-foreground">Esta reunião foi cancelada.</p>
                  </div>
                ) : (
                  <>
                    {/* Countdown */}
                    {isUpcoming && (
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wide font-medium">
                          {isUpcoming ? 'Começa em' : 'Reunião em andamento'}
                        </p>
                        <BookingCountdown targetDate={startDate} size="md" />
                      </div>
                    )}

                    {/* Detalhes da reunião */}
                    <Card className="bg-muted/30">
                      <CardContent className="p-3 sm:p-4 space-y-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Calendar className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold capitalize">
                              {format(startDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(startDate, 'HH:mm')} - {format(endDate, 'HH:mm')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 p-3 rounded-lg bg-background">
                          <User className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Participante</p>
                            <p className="font-medium">{booking.guest_name}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 p-3 rounded-lg bg-background">
                          <Mail className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">E-mail</p>
                            <p className="font-medium">{booking.guest_email}</p>
                          </div>
                        </div>

                        {booking.calendar_event?.meet_link && (
                          <div className="flex items-center gap-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                            <Video className="h-5 w-5 text-primary" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-muted-foreground">Link da reunião</p>
                              <a
                                href={booking.calendar_event.meet_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline truncate block"
                              >
                                {booking.calendar_event.meet_link}
                              </a>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Ações */}
                    <div className="flex flex-col gap-3">
                      {booking.calendar_event?.meet_link && (
                        <Button size="lg" className="w-full" onClick={handleJoinMeeting} disabled={isUpcoming}>
                          {isUpcoming ? (
                            <>
                              <Clock className="h-4 w-4 mr-2" />
                              Aguarde o Horário
                            </>
                          ) : (
                            <>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Entrar na Reunião
                            </>
                          )}
                        </Button>
                      )}

                      <Button variant="outline" size="lg" className="w-full" onClick={handleReschedule}>
                        Reagendar
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
