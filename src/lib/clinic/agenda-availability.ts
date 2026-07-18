export type AgendaResource = {
  id: string;
  startsAt: string;
  endsAt: string;
  professionalId?: string | null;
  roomId?: string | null;
  status?: string | null;
  label?: string | null;
  kind: 'appointment' | 'time_block';
};

export type AvailabilityRequest = {
  startsAt: Date;
  endsAt: Date;
  professionalId?: string | null;
  roomId?: string | null;
  excludeAppointmentId?: string | null;
  excludeBlockId?: string | null;
  globalResource?: boolean;
};

export function intervalsOverlap(
  firstStart: Date,
  firstEnd: Date,
  secondStart: Date,
  secondEnd: Date
) {
  return firstStart < secondEnd && firstEnd > secondStart;
}

function sharesResource(item: AgendaResource, request: AvailabilityRequest) {
  if (request.globalResource) return true;
  if (item.kind === 'time_block' && !item.professionalId && !item.roomId) {
    return true;
  }

  return Boolean(
    (request.professionalId &&
      item.professionalId === request.professionalId) ||
    (request.roomId && item.roomId === request.roomId)
  );
}

export function findAvailabilityConflicts(
  resources: AgendaResource[],
  request: AvailabilityRequest
) {
  return resources.filter((item) => {
    if (
      (item.kind === 'appointment' &&
        item.id === request.excludeAppointmentId) ||
      (item.kind === 'time_block' && item.id === request.excludeBlockId)
    ) {
      return false;
    }
    if (
      item.kind === 'appointment' &&
      ['cancelled', 'no_show'].includes(item.status ?? '')
    ) {
      return false;
    }
    if (!sharesResource(item, request)) return false;

    return intervalsOverlap(
      request.startsAt,
      request.endsAt,
      new Date(item.startsAt),
      new Date(item.endsAt)
    );
  });
}

export function availabilityConflictMessage(conflicts: AgendaResource[]) {
  if (!conflicts.length) return null;
  const appointments = conflicts.filter(
    (item) => item.kind === 'appointment'
  ).length;
  const blocks = conflicts.length - appointments;
  const parts = [
    appointments
      ? `${appointments} marcação${appointments === 1 ? '' : 'ões'}`
      : '',
    blocks ? `${blocks} bloqueio${blocks === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return `O horário entra em conflito com ${parts.join(' e ')}. Escolha outro horário, profissional ou sala.`;
}

export function snapMinutesToGrid(minutes: number, step = 15) {
  return Math.round(minutes / step) * step;
}
