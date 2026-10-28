'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { benefitState, benefitStateLabel } from '@/lib/finance/benefit-state';
import lists from './finance-lists.module.css';
import {
  BenefitValidityButton,
  useBenefitClock,
} from './benefit-validity-button';
import { Check, Download, Gift, Loader2, Phone, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { BenefitLogList } from '@/components/finance/finance-benefit-log-list';
import { Empty, Field } from '@/components/finance/finance-ui';
import { money } from '@/components/finance/finance-utils';
import { downloadVoucherPdf } from '@/lib/finance/voucher-pdf';
import { createClient } from '@/lib/supabase/client';
import type {
  Contact,
  FinanceBenefitLog,
  FinanceVoucher,
  FinanceVoucherTransferRequest,
} from '@/types';

export function VouchersView({
  vouchers,
  transferRequests,
  contacts,
  logs,
  currency,
  accountId,
  userId,
  canManage,
  brand,
  onRefresh,
  onSell,
}: {
  vouchers: FinanceVoucher[];
  transferRequests: FinanceVoucherTransferRequest[];
  contacts: Contact[];
  logs: FinanceBenefitLog[];
  currency: string;
  accountId?: string | null;
  userId: string;
  canManage: boolean;
  brand: { name: string; logoUrl?: string | null; publicUrl?: string | null };
  onRefresh: () => Promise<void>;
  onSell: () => void;
}) {
  const now = useBenefitClock();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const stateOf = (voucher: FinanceVoucher) =>
    benefitState(
      voucher.status,
      voucher.expires_at,
      Number(
        voucher.voucher_type === 'service'
          ? (voucher.remaining_uses ?? 0)
          : voucher.current_balance
      ),
      now
    );
  const visible = vouchers.filter(
    (voucher) =>
      (filter === 'all' || stateOf(voucher) === filter) &&
      [
        voucher.code,
        voucher.recipient_name,
        voucher.owner?.name,
        voucher.owner?.phone,
        voucher.service?.name,
      ]
        .join(' ')
        .toLocaleLowerCase('pt')
        .includes(query.trim().toLocaleLowerCase('pt'))
  );

  const db = useMemo(() => createClient(), []);
  const [generatingCode, setGeneratingCode] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    request: FinanceVoucherTransferRequest;
    action: 'contacted' | 'approved' | 'rejected';
  } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const activeRequests = transferRequests.filter((request) =>
    ['pending', 'contacted'].includes(request.status)
  );

  async function generatePdf(voucher: FinanceVoucher) {
    setGeneratingCode(voucher.code);
    try {
      await downloadVoucherPdf(voucher, brand);
      toast.success('PDF do voucher criado.');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível criar o PDF do voucher.'
      );
    } finally {
      setGeneratingCode(null);
    }
  }

  async function findOrCreateRecipientContact(
    request: FinanceVoucherTransferRequest
  ) {
    if (!accountId || !userId) throw new Error('Sessão inválida.');
    const normalizedPhone = request.recipient_phone.replace(/\D/g, '');
    const existing =
      contacts.find(
        (contact) =>
          contact.phone_normalized === normalizedPhone ||
          contact.phone?.replace(/\D/g, '') === normalizedPhone
      ) ?? null;
    if (existing) return existing.id;

    const { data: fetched } = await db
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .eq('phone_normalized', normalizedPhone)
      .maybeSingle();
    if (fetched?.id) return fetched.id as string;

    const { data: created, error } = await db
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: userId,
        name: request.recipient_name,
        phone: request.recipient_phone,
      })
      .select('id')
      .single();

    if (error || !created) {
      const { data: raced } = await db
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone_normalized', normalizedPhone)
        .maybeSingle();
      if (raced?.id) return raced.id as string;
      throw new Error(error?.message || 'Não foi possível criar o cliente.');
    }

    return created.id as string;
  }

  async function finishTransferDecision() {
    if (!decision || !canManage) return;
    setSavingDecision(true);
    const now = new Date().toISOString();
    try {
      if (decision.action === 'approved') {
        const contactId = await findOrCreateRecipientContact(decision.request);
        const { error: voucherError } = await db
          .from('finance_vouchers')
          .update({
            owner_contact_id: contactId,
            recipient_name: decision.request.recipient_name,
            updated_at: now,
          })
          .eq('id', decision.request.voucher_id);
        if (voucherError) throw new Error(voucherError.message);

        await db.from('finance_benefit_logs').insert({
          account_id: decision.request.account_id,
          voucher_id: decision.request.voucher_id,
          action: 'adjusted',
          performed_by_user_id: userId,
          approved_by_user_id: userId,
          notes:
            decisionNotes.trim() ||
            `Voucher transferido para ${decision.request.recipient_name}`,
          metadata: {
            transfer_request_id: decision.request.id,
            recipient_name: decision.request.recipient_name,
            recipient_phone: decision.request.recipient_phone,
            new_owner_contact_id: contactId,
          },
        });
      }

      const { error } = await db
        .from('finance_voucher_transfer_requests')
        .update({
          status: decision.action,
          reviewed_by_user_id:
            decision.action === 'contacted' ? null : userId || null,
          reviewed_at: decision.action === 'contacted' ? null : now,
          notes: decisionNotes.trim() || null,
          updated_at: now,
        })
        .eq('id', decision.request.id);
      if (error) throw new Error(error.message);

      toast.success(
        decision.action === 'approved'
          ? 'Voucher transferido para o novo cliente.'
          : decision.action === 'contacted'
            ? 'Pedido marcado como contactado.'
            : 'Pedido de transferência rejeitado.'
      );
      setDecision(null);
      setDecisionNotes('');
      await onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível tratar o pedido.'
      );
    } finally {
      setSavingDecision(false);
    }
  }

  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <div className={lists.heading + ' border-b p-4'}>
        <div>
          <h2 className="font-semibold">Vouchers emitidos</h2>
          <p className="text-muted-foreground text-xs">
            Saldo, validade e titular de cada vale.
          </p>
        </div>
        <Button onClick={onSell}>
          <Gift /> Vender voucher
        </Button>
      </div>
      <div className="space-y-3 p-4">
        <div className={lists.summaryStrip} aria-label="Estado dos vouchers">
          {[
            ['all', 'Todos'],
            ['available', 'Disponíveis'],
            ['used', 'Utilizados'],
            ['expired', 'Expirados'],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              <span>{label}</span>
              <strong>
                {value === 'all'
                  ? vouchers.length
                  : vouchers.filter((voucher) => stateOf(voucher) === value)
                      .length}
              </strong>
            </button>
          ))}
        </div>
        <label className="text-muted-foreground grid gap-2 text-xs">
          Encontrar voucher
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, telefone, código ou modalidade"
          />
        </label>
        <p className="text-muted-foreground text-xs">
          {visible.length} {visible.length === 1 ? 'voucher' : 'vouchers'} nesta
          vista · os saldos e a validade são consultados em conjunto.
        </p>
      </div>
      <details className="border-y" open={activeRequests.length > 0}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Transferências · {activeRequests.length} por tratar
        </summary>
        <div className="border-border border-b p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">
                Pedidos de transferência
              </h3>
              <p className="text-muted-foreground text-xs">
                Pedidos enviados pela página pública do voucher via QR Code.
              </p>
            </div>
            <Badge
              variant={activeRequests.length ? 'destructive' : 'secondary'}
            >
              {activeRequests.length} em aberto
            </Badge>
          </div>
          {activeRequests.length ? (
            <div className="space-y-2">
              {activeRequests.map((request) => (
                <article
                  key={request.id}
                  className="border-border bg-background rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
                      <Phone className="size-4" />
                    </span>
                    <div className="min-w-56 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{request.recipient_name}</p>
                        <Badge
                          variant={
                            request.status === 'pending'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {voucherTransferStatus(request.status)}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {request.recipient_phone} pediu o voucher{' '}
                        <span className="font-mono">
                          {request.voucher?.code ?? '—'}
                        </span>{' '}
                        em{' '}
                        {new Date(request.created_at).toLocaleString('pt-PT')}
                      </p>
                      {request.voucher?.owner ? (
                        <p className="text-muted-foreground mt-1 text-xs">
                          Titular atual:{' '}
                          {request.voucher.owner.name ||
                            request.voucher.owner.phone}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {request.status === 'pending' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canManage}
                          onClick={() => {
                            setDecision({ request, action: 'contacted' });
                            setDecisionNotes(request.notes ?? '');
                          }}
                        >
                          <Phone /> Contactado
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        disabled={!canManage}
                        onClick={() => {
                          setDecision({ request, action: 'approved' });
                          setDecisionNotes(request.notes ?? '');
                        }}
                      >
                        <Check /> Aprovar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={!canManage}
                        onClick={() => {
                          setDecision({ request, action: 'rejected' });
                          setDecisionNotes(request.notes ?? '');
                        }}
                      >
                        <X /> Rejeitar
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
              Nenhum pedido pendente neste momento.
            </p>
          )}
        </div>
      </details>
      <div className={lists.grid + ' p-4'}>
        {visible.length ? (
          visible.map((voucher) => {
            const state = stateOf(voucher);
            const serviceVoucher = voucher.voucher_type === 'service';
            return (
              <article
                key={voucher.id}
                className={lists.benefitCard}
                data-state={state}
              >
                <div className={lists.rowHeading}>
                  <div>
                    <h3>
                      {voucher.recipient_name ||
                        voucher.owner?.name ||
                        'Sem destinatário'}
                    </h3>
                    <p>
                      {serviceVoucher
                        ? voucher.service?.name || 'Voucher de serviço'
                        : 'Cartão-presente'}
                    </p>
                  </div>
                  <span className={lists.status} data-state={state}>
                    {benefitStateLabel[state] || state}
                  </span>
                </div>
                <div className={lists.balance}>
                  <strong>
                    {serviceVoucher
                      ? Number(voucher.remaining_uses ?? 0) +
                        (Number(voucher.remaining_uses ?? 0) === 1
                          ? ' sessão'
                          : ' sessões')
                      : money(
                          Number(voucher.current_balance),
                          voucher.currency || currency
                        )}
                  </strong>
                  <span>
                    {state === 'available'
                      ? 'disponíveis para utilizar'
                      : state === 'expired'
                        ? 'validade terminada'
                        : state === 'used'
                          ? 'benefício consumido'
                          : 'saldo registado'}
                  </span>
                </div>
                <div className={lists.meta}>
                  <span>
                    {voucher.expires_at
                      ? 'Validade: ' +
                        new Date(voucher.expires_at).toLocaleDateString(
                          'pt-PT',
                          { timeZone: 'Europe/Lisbon' }
                        )
                      : 'Sem limite de validade'}
                  </span>
                  <span>Código {voucher.code}</span>
                </div>
                <details className={lists.codes}>
                  <summary>Consultar PIN</summary>
                  <p>PIN: {voucher.pin_code || 'não definido'}</p>
                </details>
                <div className={lists.actions}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={generatingCode === voucher.code}
                    onClick={() => void generatePdf(voucher)}
                  >
                    {generatingCode === voucher.code ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}{' '}
                    PDF do voucher
                  </Button>
                  <BenefitValidityButton
                    kind="voucher"
                    id={voucher.id}
                    code={voucher.code}
                    expiresAt={voucher.expires_at}
                    status={voucher.status}
                  />
                </div>
                <BenefitLogList
                  logs={logs.filter((log) => log.voucher_id === voucher.id)}
                  sourceHref={
                    voucher.issued_sale_id
                      ? '/finance?tab=sales#sale-' + voucher.issued_sale_id
                      : undefined
                  }
                />
              </article>
            );
          })
        ) : (
          <div className="col-span-full">
            <Empty
              icon={Gift}
              text={
                vouchers.length
                  ? 'Nenhum voucher corresponde aos filtros.'
                  : 'Nenhum voucher emitido.'
              }
            />
          </div>
        )}
      </div>
      <Dialog
        open={Boolean(decision)}
        onOpenChange={(open) => {
          if (!open) {
            setDecision(null);
            setDecisionNotes('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {decision?.action === 'approved'
                ? 'Aprovar transferência'
                : decision?.action === 'contacted'
                  ? 'Marcar como contactado'
                  : 'Rejeitar transferência'}
            </DialogTitle>
            <DialogDescription>
              {decision
                ? `${decision.request.recipient_name} (${decision.request.recipient_phone}) · voucher ${decision.request.voucher?.code ?? '—'}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {decision?.action === 'approved' ? (
              <div className="bg-muted/50 rounded-md p-3 text-sm">
                O CRM vai encontrar ou criar este cliente pelo telefone e mudar
                o titular do voucher para ele.
              </div>
            ) : null}
            <Field label="Notas internas">
              <Textarea
                value={decisionNotes}
                onChange={(event) => setDecisionNotes(event.target.value)}
                rows={4}
                placeholder="Ex.: contacto confirmado por WhatsApp..."
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDecision(null);
                setDecisionNotes('');
              }}
            >
              Voltar
            </Button>
            <Button
              variant={
                decision?.action === 'rejected' ? 'destructive' : 'default'
              }
              onClick={() => void finishTransferDecision()}
              disabled={savingDecision || !canManage}
            >
              {savingDecision ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Check />
              )}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function voucherTransferStatus(
  status: FinanceVoucherTransferRequest['status']
) {
  return {
    pending: 'Pendente',
    contacted: 'Contactado',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    cancelled: 'Cancelado',
  }[status];
}
