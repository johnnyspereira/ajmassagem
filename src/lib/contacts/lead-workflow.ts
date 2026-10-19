import type { LeadRow } from './lead-workspace';
import { leadTimestamp } from './lead-workspace';

export const LEAD_STATUSES = {
  new: 'Por tratar',
  contacted: 'Em contacto',
  interested: 'Interessado',
  scheduled: 'Agendado',
  not_interested: 'Sem interesse',
} as const;
export type LeadStatus = keyof typeof LEAD_STATUSES;
export const LEAD_MESSAGES = {
  first_contact: 'Primeiro contacto',
  recovery: 'Recuperar cliente',
  benefit: 'Benefício perto do prazo',
  follow_up: 'Seguimento sem resposta',
} as const;
export type LeadMessageKind = keyof typeof LEAD_MESSAGES;
export interface LeadWorkflowSettings {
  recoveryDays: number;
  followupDays: number;
  templates: Record<LeadMessageKind, string>;
}
export interface LeadFollowup {
  contact_id: string;
  status: LeadStatus;
  next_followup_at: string | null;
  last_contacted_at: string | null;
  notes: string | null;
  updated_at?: string;
}
export interface LeadActivity {
  id: string;
  status: LeadStatus;
  contacted: boolean;
  next_followup_at: string | null;
  notes: string | null;
  created_at: string;
}
export interface LeadWorkflow {
  settings: LeadWorkflowSettings;
  items: LeadFollowup[];
}
export type LeadWorkFilter =
  | 'all'
  | 'recover'
  | 'due'
  | 'new'
  | 'contacted'
  | 'interested'
  | 'scheduled'
  | 'not_interested';
export const DEFAULT_LEAD_SETTINGS: LeadWorkflowSettings = {
  recoveryDays: 60,
  followupDays: 3,
  templates: {
    first_contact:
      'Olá {primeiro_nome}! Sou da {empresa}. Como podemos ajudar? Se quiser, posso explicar os nossos serviços e ajudá-lo a escolher uma sessão e um horário.',
    recovery:
      'Olá {primeiro_nome}! Aqui é da {empresa}. Como tem passado? Gostaríamos de voltar a recebê-lo. Quer que o ajude a encontrar um horário para a sua próxima sessão?',
    benefit:
      'Olá {primeiro_nome}! Tem um benefício disponível na {empresa} com validade a terminar em {dias_validade} dia(s). Quer que o ajude a marcar a sua sessão?',
    follow_up:
      'Olá {primeiro_nome}! Retomo o nosso contacto para saber se ainda tem interesse em marcar uma sessão na {empresa}. Se quiser, posso ajudá-lo a encontrar um horário conveniente.',
  },
};
export const LEAD_VARIABLES = [
  'primeiro_nome',
  'nome',
  'empresa',
  'dias_sem_sessao',
  'ultima_sessao',
  'dias_validade',
] as const;
export function parseLeadSettings(value: unknown): LeadWorkflowSettings | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as LeadWorkflowSettings;
  if (
    !Number.isInteger(s.recoveryDays) ||
    s.recoveryDays < 1 ||
    s.recoveryDays > 3650 ||
    !Number.isInteger(s.followupDays) ||
    s.followupDays < 1 ||
    s.followupDays > 365 ||
    !s.templates ||
    typeof s.templates !== 'object'
  )
    return null;
  const templates = {} as Record<LeadMessageKind, string>;
  for (const kind of Object.keys(LEAD_MESSAGES) as LeadMessageKind[]) {
    const text = s.templates[kind];
    if (typeof text !== 'string' || !text.trim() || text.length > 2000)
      return null;
    const variables = [...text.matchAll(/\{([^{}]+)\}/g)].map(
      (match) => match[1]
    );
    if (
      variables.some(
        (variable) => !(LEAD_VARIABLES as readonly string[]).includes(variable)
      )
    )
      return null;
    templates[kind] = text.trim();
  }
  return {
    recoveryDays: s.recoveryDays,
    followupDays: s.followupDays,
    templates,
  };
}
export function suggestedLeadMessage(
  row: LeadRow,
  item?: LeadFollowup
): LeadMessageKind {
  return item?.last_contacted_at
    ? 'follow_up'
    : row.expiring !== undefined
      ? 'benefit'
      : row.totalSessions
        ? 'recovery'
        : 'first_contact';
}
export function renderLeadMessage(
  template: string,
  row: LeadRow,
  company: string,
  zone: string
) {
  const name = row.contact.name?.trim() || 'cliente';
  const values: Record<string, string> = {
    nome: name,
    primeiro_nome: row.contact.name?.trim().split(/\s+/)[0] || 'cliente',
    empresa: company,
    dias_sem_sessao:
      row.daysSinceSession === undefined
        ? 'sem registo'
        : String(row.daysSinceSession),
    ultima_sessao: row.lastSession
      ? new Intl.DateTimeFormat('pt-PT', {
          timeZone: zone,
          dateStyle: 'medium',
        }).format(leadTimestamp(row.lastSession))
      : 'sem sessão registada',
    dias_validade:
      row.expiring === undefined
        ? 'sem prazo identificado'
        : String(row.expiring),
  };
  return template.replace(
    /\{([^{}]+)\}/g,
    (match, key: string) => values[key] ?? match
  );
}
export function matchesLeadWork(
  row: LeadRow,
  item: LeadFollowup | undefined,
  filter: LeadWorkFilter,
  settings: LeadWorkflowSettings,
  now: number
) {
  if (filter === 'all') return true;
  if (filter === 'recover')
    return (
      !row.nextAppointment &&
      row.daysSinceSession !== undefined &&
      row.daysSinceSession >= settings.recoveryDays &&
      (!item?.next_followup_at ||
        leadTimestamp(item.next_followup_at) <= now) &&
      !['scheduled', 'not_interested'].includes(item?.status || 'new')
    );
  if (filter === 'due')
    return Boolean(
      !row.nextAppointment &&
      item?.next_followup_at &&
      leadTimestamp(item.next_followup_at) <= now &&
      !['scheduled', 'not_interested'].includes(item.status)
    );
  return (item?.status || 'new') === filter;
}
