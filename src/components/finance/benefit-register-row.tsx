'use client';
import Link from 'next/link';
import {
  ChevronDown,
  Gift,
  PackageCheck,
  Send,
  Loader2,
  CalendarClock,
  ArrowRightLeft,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BenefitValidityButton } from './benefit-validity-button';
import {
  benefitState,
  BENEFIT_STATE_LABEL,
  packRemaining,
  voucherRemaining,
} from '@/lib/finance/benefit-availability';
import type { FinanceClientPack, FinanceVoucher } from '@/types';
import styles from './benefits.module.css';

const money = (amount: number, currency = 'EUR') =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(
    amount
  );
const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('pt-PT', {
        dateStyle: 'medium',
        timeZone: 'Europe/Lisbon',
      }).format(new Date(value))
    : 'Sem limite de validade';

export function BenefitRegisterRow({
  voucher,
  pack,
  now,
  onConvert,
  onResend,
  sending,
  canConvert,
  onUpdated,
}: {
  voucher?: FinanceVoucher;
  pack?: FinanceClientPack;
  now: number;
  onConvert: () => void;
  onResend?: () => void;
  sending?: boolean;
  canConvert: boolean;
  onUpdated: () => void;
}) {
  const item = (voucher || pack)!;
  const kind = voucher ? 'voucher' : 'pack';
  const remaining = voucher ? voucherRemaining(voucher) : packRemaining(pack!);
  const state = benefitState(item, remaining, now);
  const available = state === 'available' || state === 'expiring';
  const person = voucher?.owner || pack?.contact;
  const contactId = voucher?.owner_contact_id || pack?.contact_id;
  const name =
    person?.name || voucher?.recipient_name || 'Cliente não associado';
  const description = voucher
    ? voucher.service?.name || 'Cartão de valor'
    : pack?.pack?.name || 'Pack de sessões';
  const sessions = !voucher || voucher.voucher_type === 'service';
  const total = pack?.balances?.reduce(
    (sum, balance) => sum + Number(balance.total_sessions),
    0
  );
  const saleId = voucher?.issued_sale_id || pack?.sale_id;
  const Icon = voucher ? Gift : PackageCheck;
  return (
    <article className={styles.registerRow} data-state={state}>
      <div className={styles.rowMain}>
        <div className={styles.rowIdentity}>
          <span className={styles.rowIcon}>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold break-words">{name}</p>
            <p className="text-muted-foreground mt-0.5 text-sm break-words">
              {description}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {item.code || 'Sem código'}
            </p>
          </div>
        </div>
        <div className={styles.rowBalance}>
          <p className="font-semibold tabular-nums">
            {sessions
              ? `${remaining} ${remaining === 1 ? 'sessão' : 'sessões'}${total ? ` / ${total}` : ''}`
              : money(remaining, voucher!.currency)}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {available
              ? 'Por utilizar'
              : remaining > 0
                ? 'Saldo registado'
                : 'Sem saldo'}
          </p>
        </div>
        <div className={styles.rowValidity}>
          <p className="text-sm font-medium">{date(item.expires_at)}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {state === 'expiring'
              ? `Termina em ${Math.max(1, Math.ceil((Date.parse(item.expires_at!) - now) / 86_400_000))} dia(s)`
              : 'Validade'}
          </p>
        </div>
        <Badge
          variant="secondary"
          className={styles.stateBadge}
          data-state={state}
        >
          {BENEFIT_STATE_LABEL[state]}
        </Badge>
      </div>
      {pack && (
        <div className={styles.modalityBalances}>
          {pack.balances?.map((balance) => (
            <span key={balance.id}>
              <span>{balance.service?.name || 'Modalidade'}</span>
              <strong>
                {balance.remaining_sessions}/{balance.total_sessions}
              </strong>
            </span>
          ))}
        </div>
      )}
      <details className={styles.rowDetails}>
        <summary>
          <span>Detalhes e opções</span>
          <ChevronDown className="size-4" />
        </summary>
        <div className={styles.detailsBody}>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Código e PIN</p>
              <p className="mt-1 font-medium break-all">
                {item.code || 'Sem código'} · PIN{' '}
                {item.pin_code || 'Não definido'}
              </p>
            </div>
            {voucher && (
              <div>
                <p className="text-muted-foreground text-xs">
                  Valor pago pelo voucher
                </p>
                <p className="mt-1 font-medium">
                  {voucher.paid_amount != null
                    ? money(Number(voucher.paid_amount), voucher.currency)
                    : 'Valor pago não registado'}
                </p>
              </div>
            )}
            {pack && (
              <div>
                <p className="text-muted-foreground text-xs">
                  Sessões utilizadas
                </p>
                <p className="mt-1 font-medium">
                  {pack.balances?.reduce(
                    (sum, balance) => sum + Number(balance.used_sessions),
                    0
                  ) || 0}{' '}
                  de {total || 0}
                </p>
              </div>
            )}
          </div>
          {state === 'expired' && remaining > 0 && (
            <p className="text-sm">
              O saldo mantém-se registado, mas a validade terminou. O
              proprietário pode rever a validade antes de uma nova utilização.
            </p>
          )}
          <div className={styles.rowActions}>
            {contactId && (
              <Link
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                href={`/contacts/${contactId}?tab=benefits`}
              >
                Cliente 360
              </Link>
            )}
            {available && contactId && (
              <Link
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                href={`/agenda?contact=${contactId}&new=1`}
              >
                <CalendarClock /> Agendar cliente
              </Link>
            )}
            <BenefitValidityButton
              kind={kind}
              id={item.id}
              code={item.code}
              expiresAt={item.expires_at}
              status={item.status}
              onUpdated={onUpdated}
            />
            {saleId && (
              <Link
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                href={`/finance?tab=sales#sale-${saleId}`}
              >
                Ver compra
              </Link>
            )}
            {available && canConvert && (
              <Button variant="outline" size="sm" onClick={onConvert}>
                <ArrowRightLeft />
                {pack ? 'Converter sessões' : 'Converter em saldo'}
              </Button>
            )}
            {voucher && (
              <Button
                variant="outline"
                size="sm"
                onClick={onResend}
                disabled={!saleId || !person?.email || sending}
                title={
                  !person?.email
                    ? 'Adicione um email ao cliente para reenviar o PDF.'
                    : undefined
                }
              >
                {sending ? <Loader2 className="animate-spin" /> : <Send />}{' '}
                Reenviar PDF
              </Button>
            )}
          </div>
        </div>
      </details>
    </article>
  );
}
