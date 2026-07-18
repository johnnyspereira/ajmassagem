import type { ClinicAppointment, ClinicService, Contact } from '@/types';

export type AppointmentMessageAction =
  'confirmation' | 'reminder' | 'pending_confirmation';

export type AppointmentMessageOptions = {
  clinicAddress?: string | null;
  directions?: string | null;
  parkingInfo?: string | null;
  paymentMethods?: string | null;
  anamnesisUrl?: string | null;
  anamnesisIntro?: string | null;
};

export type AppointmentMessageRow = Omit<
  ClinicAppointment,
  'contact' | 'service' | 'professional'
> & {
  contact?: Pick<Contact, 'id' | 'name' | 'phone'> | null;
  service?: Pick<ClinicService, 'name'> | null;
  professional?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function appointmentTimeRange(appointment: AppointmentMessageRow) {
  const start = new Date(appointment.scheduled_start);
  const end = new Date(appointment.scheduled_end);
  return `${pad(start.getHours())}:${pad(start.getMinutes())}-${pad(
    end.getHours()
  )}:${pad(end.getMinutes())}`;
}

export function appointmentDateTimeLabel(appointment: AppointmentMessageRow) {
  const start = new Date(appointment.scheduled_start);
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);
}

export function appointmentSentAtLabel(value: string | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function appointmentContactLabel(
  contact: AppointmentMessageRow['contact']
) {
  if (!contact) return 'Contato não vinculado';
  return contact.name?.trim() || contact.phone || 'Contato sem nome';
}

function contactGreeting(contact: AppointmentMessageRow['contact']) {
  const name = contact?.name?.trim();
  return name ? `Olá, ${name}.` : 'Olá.';
}

function professionalLabel(appointment: AppointmentMessageRow) {
  return (
    appointment.professional?.full_name ||
    appointment.professional?.email ||
    'nossa equipa'
  );
}

export function buildAppointmentMessage(
  appointment: AppointmentMessageRow,
  action: AppointmentMessageAction,
  businessName: string,
  options: AppointmentMessageOptions = {}
) {
  const service = appointment.service?.name ?? 'seu atendimento';
  const start = new Date(appointment.scheduled_start);
  const date = new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(start);
  const time = new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);
  const professional = professionalLabel(appointment);
  const prefix = contactGreeting(appointment.contact);
  const brand = businessName.trim() || 'nossa clínica';
  const price = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: appointment.currency || 'EUR',
  }).format(Number(appointment.price ?? 0));

  if (action === 'pending_confirmation') {
    return [
      `Olá${appointment.contact?.name ? `, ${appointment.contact.name.split(' ')[0]}` : ''}. ✨`,
      '',
      `Ainda aguardamos a confirmação da sua sessão de *${service}*, marcada para *${date} às ${time}*.`,
      '',
      'Responda *CONFIRMAR* para garantir a sua presença ou *REAGENDAR* caso precise de outro horário.',
      '',
      `Com os melhores cumprimentos,\nEquipa ${brand}`,
    ].join('\n');
  }

  const details = [
    '✨ *Detalhes do seu agendamento* ✨',
    '',
    prefix,
    '',
    `💆 Serviço: ${service}`,
    `📅 Data: ${date}`,
    `🕕 Horário: ${time}`,
    `💵 Valor: ${price}`,
    `🙎🏻‍♂️ Profissional: ${professional}`,
    options.clinicAddress ? `📍 Morada: ${options.clinicAddress}` : null,
    '',
    '*Para sua comodidade:*',
    options.directions ? `🚇 ${options.directions}` : null,
    options.parkingInfo ? `🚙 ${options.parkingInfo}` : null,
    options.paymentMethods ? `📲 Pagamento: ${options.paymentMethods}` : null,
    '',
    action === 'reminder'
      ? 'Esta é uma lembrança da sua sessão. Caso precise de apoio, responda a esta mensagem.'
      : 'Para confirmar a sua presença, responda *CONFIRMAR*. Para solicitar outro horário, responda *REAGENDAR*.',
  ].filter((line): line is string => line !== null);

  if (options.anamnesisUrl) {
    details.push(
      '',
      'Para uma experiência personalizada e segura, pedimos que preencha previamente a sua ficha de anamnese:',
      `👉 ${options.anamnesisUrl}`,
      '',
      options.anamnesisIntro ||
        'O preenchimento é rápido e confidencial, levando apenas alguns minutos. ✨'
    );
  }
  details.push('', `Com os melhores cumprimentos,\nEquipa ${brand} 💚`);
  return details.join('\n');
}

export function canMessageAppointment(appointment: AppointmentMessageRow) {
  return Boolean(appointment.contact?.id && appointment.contact?.phone);
}
