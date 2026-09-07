'use client';

import Link from 'next/link';
import { ArrowLeft, Landmark, Loader2, ShieldCheck } from 'lucide-react';

import { OwnerTreasury } from '@/components/finance/owner-treasury';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

export function PrivateManagementPage() {
  const { isOwner, profileLoading } = useAuth();

  if (profileLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <ShieldCheck className="mx-auto size-9 text-amber-700" />
        <h1 className="mt-4 text-xl font-semibold">Área reservada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A gestão privada só está disponível para o proprietário da conta.
        </p>
        <Button className="mt-5" variant="outline" render={<Link href="/finance" />}>
          <ArrowLeft /> Voltar ao Financeiro
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-emerald-50 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-amber-100 text-amber-800">
            <Landmark className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Gestão privada</h1>
            <p className="text-muted-foreground text-sm">
              Tesouraria, contas a pagar e valores a receber.
            </p>
          </div>
        </div>
        <Button variant="outline" render={<Link href="/finance" />}>
          <ArrowLeft /> Financeiro
        </Button>
      </header>
      <OwnerTreasury />
    </div>
  );
}
