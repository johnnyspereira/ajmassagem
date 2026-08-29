import type { AppointmentMessageRow } from '@/lib/clinic/appointment-messages';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const STATUS_COPY: Record<
  AppointmentStatus,
  { title: string; message: string }
> = {
  scheduled: {
    title: 'Agendamento marcado',
    message: 'O seu agendamento foi marcado.',
  },
  confirmed: {
    title: 'Agendamento confirmado',
    message: 'A sua presença foi confirmada.',
  },
  in_progress: {
    title: 'Atendimento iniciado',
    message: 'O seu atendimento foi iniciado.',
  },
  completed: {
    title: 'Atendimento concluído',
    message: 'O seu atendimento foi concluído. Obrigado pela preferência.',
  },
  cancelled: {
    title: 'Agendamento cancelado',
    message: 'O seu agendamento foi cancelado.',
  },
  no_show: {
    title: 'Falta registada',
    message: 'O seu agendamento foi registado como falta.',
  },
};

function appointmentDetails(appointment: AppointmentMessageRow) {
  return {
    client: appointment.contact?.name?.trim() || 'Cliente',
    service: appointment.service?.name || 'Atendimento',
    professional:
      appointment.professional?.full_name ||
      appointment.professional?.email ||
      'Equipa da clínica',
    date: dateLabel(appointment.scheduled_start),
  };
}

function emailShell(input: {
  businessName: string;
  preheader: string;
  title: string;
  greeting: string;
  message: string;
  appointment: AppointmentMessageRow;
  actionUrl?: string | null;
  actionLabel?: string;
}) {
  const details = appointmentDetails(input.appointment);
  const brand = input.businessName.trim() || 'Clínica';
  const text = [
    input.greeting,
    input.message,
    `Serviço: ${details.service}`,
    `Data e hora: ${details.date}`,
    `Profissional: ${details.professional}`,
    input.actionUrl ? `${input.actionLabel}: ${input.actionUrl}` : null,
    `Equipa ${brand}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const button = input.actionUrl
    ? `<p style="margin:28px 0"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:700">${escapeHtml(input.actionLabel || 'Abrir')}</a></p>`
    : '';
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.title)}</title></head><body style="margin:0;background:#f5f3ff;font-family:Arial,sans-serif;color:#17202a"><span style="display:none">${escapeHtml(input.preheader)}</span><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 14px;background:#f5f3ff"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(31,19,55,.09)"><tr><td style="background:#132b20;color:#fff;padding:24px 30px;font-size:20px;font-weight:700">${escapeHtml(brand)}</td></tr><tr><td style="padding:34px 30px"><p style="margin:0 0 10px;color:#7c3aed;font-weight:700">Agenda</p><h1 style="margin:0 0 20px;font-size:28px">${escapeHtml(input.title)}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(input.greeting)}</p><p style="font-size:16px;line-height:1.6">${escapeHtml(input.message)}</p><table role="presentation" width="100%" style="margin-top:24px;background:#f8fafc;border-radius:12px;padding:18px"><tr><td style="padding:5px"><strong>Serviço</strong><br>${escapeHtml(details.service)}</td></tr><tr><td style="padding:5px"><strong>Data e hora</strong><br>${escapeHtml(details.date)}</td></tr><tr><td style="padding:5px"><strong>Profissional</strong><br>${escapeHtml(details.professional)}</td></tr></table>${button}<p style="margin:28px 0 0;color:#64748b;font-size:14px">Com os melhores cumprimentos,<br>Equipa ${escapeHtml(brand)}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: `${input.title} — ${brand}`, text, html };
}

export function appointmentConfirmationEmail(input: {
  appointment: AppointmentMessageRow;
  businessName: string;
  anamnesisUrl?: string | null;
}) {
  const name = input.appointment.contact?.name?.trim();
  return emailShell({
    businessName: input.businessName,
    preheader: 'Recebemos o seu agendamento.',
    title: 'Confirmação do seu agendamento',
    greeting: name ? `Olá, ${name}.` : 'Olá.',
    message:
      'Recebemos o seu agendamento. Para confirmar a presença ou pedir outro horário, responda ao WhatsApp da clínica.',
    appointment: input.appointment,
    actionUrl: input.anamnesisUrl,
    actionLabel: 'Preencher ficha de anamnese',
  });
}

export function appointmentStatusMessage(input: {
  appointment: AppointmentMessageRow;
  businessName: string;
  status: AppointmentStatus;
}) {
  const copy = STATUS_COPY[input.status];
  const details = appointmentDetails(input.appointment);
  const name = input.appointment.contact?.name?.trim();
  return [
    name ? `Olá, ${name}.` : 'Olá.',
    '',
    `*${copy.title}*`,
    copy.message,
    '',
    `Serviço: ${details.service}`,
    `Data e hora: ${details.date}`,
    `Profissional: ${details.professional}`,
    '',
    `Equipa ${input.businessName.trim() || 'da clínica'}`,
  ].join('\n');
}

export function appointmentStatusEmail(input: {
  appointment: AppointmentMessageRow;
  businessName: string;
  status: AppointmentStatus;
}) {
  const copy = STATUS_COPY[input.status];
  const name = input.appointment.contact?.name?.trim();
  return emailShell({
    businessName: input.businessName,
    preheader: copy.message,
    title: copy.title,
    greeting: name ? `Olá, ${name}.` : 'Olá.',
    message: copy.message,
    appointment: input.appointment,
  });
}
