'use client';
import {
  ArrowRightLeft,
  Banknote,
  FileClock,
  Landmark,
  MoreHorizontal,
  RefreshCw,
  ShoppingCart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FinanceCashSession } from '@/types';

export function FinanceHeader({
  cashSession,
  onRefresh,
  onNavigate,
  onMovement,
  canOperate = true,
  isOwner,
}: {
  cashSession: FinanceCashSession | null;
  onRefresh: () => void;
  onNavigate: (tab: string) => void;
  onMovement?: () => void;
  canOperate?: boolean;
  isOwner: boolean;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-primary mb-1 text-[10px] font-semibold tracking-[0.16em] uppercase">
          Gestão do negócio
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Vendas, recebimentos e contas com clareza.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          className="h-10 rounded-xl"
          onClick={() => onNavigate('cash')}
        >
          <Banknote className="size-4" />
          <span>{cashSession ? 'Caixa aberto' : 'Ver caixa'}</span>
          {cashSession && (
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-emerald-500"
            />
          )}
        </Button>
        <Button
          className="h-10 rounded-xl px-4"
          onClick={() => onNavigate('pos')}
        >
          <ShoppingCart className="size-4" />
          Nova venda
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Mais opções do financeiro"
            title="Mais opções"
            className="border-border bg-card hover:bg-muted flex size-10 items-center justify-center rounded-xl border"
          >
            <MoreHorizontal className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5">
            <DropdownMenuItem onClick={onRefresh}>
              <RefreshCw className="size-4" />
              Atualizar dados
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate('invoices')}>
              <FileClock className="size-4" />
              Pedidos de fatura
            </DropdownMenuItem>
            {onMovement && (
              <DropdownMenuItem disabled={!canOperate} onClick={onMovement}>
                <ArrowRightLeft className="size-4" />
                Registar entrada ou saída
              </DropdownMenuItem>
            )}
            {isOwner && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onNavigate('treasury')}>
                  <Landmark className="size-4" />
                  Gestão e tesouraria
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
