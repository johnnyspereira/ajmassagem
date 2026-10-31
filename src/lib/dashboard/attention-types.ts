export const ATTENTION_KINDS = [
  'appointments',
  'payments',
  'benefits',
  'cash',
  'messages',
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];
export const ATTENTION_LABELS: Record<AttentionKind, string> = {
  appointments: 'Atendimentos',
  payments: 'Pagamentos',
  benefits: 'Benefícios',
  cash: 'Caixa',
  messages: 'Mensagens',
};
export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  name: string;
  contactId: string | null;
  title: string;
  detail: string;
  occurredAt: string;
  amount: number | null;
  currency: string | null;
  href: string;
  action: string;
  urgent: boolean;
};
export type AttentionData = {
  generatedAt: string;
  counts: Record<AttentionKind, number>;
  total: number;
  items: AttentionItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};
