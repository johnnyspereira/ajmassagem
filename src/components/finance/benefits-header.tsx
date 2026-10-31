'use client';
import Link from 'next/link';
import {
  ArrowRightLeft,
  Banknote,
  Mail,
  MoreHorizontal,
  RefreshCw,
  ShoppingCart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function BenefitsHeader({
  loading,
  reconciling,
  onRefresh,
  onReconcile,
  onDeliveries,
}: {
  loading: boolean;
  reconciling: boolean;
  onRefresh: () => void;
  onReconcile: () => void;
  onDeliveries: () => void;
}) {
  return (
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">
          Vouchers e packs
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Saiba o que cada cliente pode utilizar e o que precisa de atenção.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          nativeButton={false}
          render={<Link href="/finance?tab=pos" />}
          className="h-10 rounded-xl"
        >
          <ShoppingCart className="size-4" /> Nova venda
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Mais opções dos benefícios"
            className="border-border bg-card hover:bg-muted flex size-10 items-center justify-center rounded-xl border"
          >
            <MoreHorizontal className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem disabled={loading} onClick={onRefresh}>
              <RefreshCw /> Atualizar dados
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDeliveries}>
              <Mail /> Histórico de entregas
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={loading || reconciling}
              onClick={onReconcile}
            >
              <ArrowRightLeft />{' '}
              {reconciling ? 'A apurar valores...' : 'Apurar valores antigos'}
            </DropdownMenuItem>
            <DropdownMenuItem
              nativeButton={false}
              render={<Link href="/finance" />}
            >
              <Banknote /> Abrir financeiro
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
