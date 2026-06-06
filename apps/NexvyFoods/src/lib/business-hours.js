/**
 * Verifica se a empresa está aberta com base em business_hours.
 * business_hours: { monday: "08:00-22:00", tuesday: "08:00-22:00", ... }
 * Retorna { isOpen: boolean, todayHours: string | null }
 */
export function checkBusinessHours(businessHours) {
  if (!businessHours || Object.keys(businessHours).length === 0) {
    return { isOpen: true, todayHours: null }; // sem horário configurado = sempre aberto
  }

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const now = new Date();
  const dayKey = days[now.getDay()];
  const todayHours = businessHours[dayKey];

  if (!todayHours || todayHours.trim() === '' || todayHours.toLowerCase() === 'fechado') {
    return { isOpen: false, todayHours: 'Fechado hoje' };
  }

  // Formato esperado: "HH:MM-HH:MM"
  const parts = todayHours.split('-');
  if (parts.length !== 2) {
    return { isOpen: true, todayHours }; // formato inválido = não bloqueia
  }

  const [openStr, closeStr] = parts.map(p => p.trim());
  const [openH, openM] = openStr.split(':').map(Number);
  const [closeH, closeM] = closeStr.split(':').map(Number);

  if (isNaN(openH) || isNaN(openM) || isNaN(closeH) || isNaN(closeM)) {
    return { isOpen: true, todayHours }; // formato inválido = não bloqueia
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const isOpen = nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  return { isOpen, todayHours };
}

export const DAY_LABELS = {
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
  sunday: 'Domingo',
};