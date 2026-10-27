'use client';
import { useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  LifeBuoy,
  MessageCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
export function PortalHelpLauncher({
  onLearn,
  onContact,
}: {
  onLearn: () => void;
  onContact: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed right-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-40 min-[900px]:right-6 min-[900px]:bottom-6">
      {open && (
        <div className="bg-background mb-3 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-2xl">
          <div className="bg-primary text-primary-foreground p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  Olá! Como podemos ajudar?
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground hover:bg-white/10"
                onClick={() => setOpen(false)}
                aria-label="Fechar ajuda"
              >
                <X />
              </Button>
            </div>
          </div>
          <div className="space-y-2 p-3">
            <button
              onClick={() => {
                onLearn();
                setOpen(false);
              }}
              className="hover:bg-muted flex w-full items-center gap-3 rounded-xl p-3 text-left"
            >
              <span className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
                <BookOpen />
              </span>
              <span className="flex-1">
                <b className="block text-sm">Encontrar uma resposta</b>
                <span className="text-muted-foreground text-xs">
                  Guias rápidos sobre o Portal 360
                </span>
              </span>
              <ChevronRight className="text-muted-foreground size-4" />
            </button>
            <button
              onClick={() => {
                onContact();
                setOpen(false);
              }}
              className="hover:bg-muted flex w-full items-center gap-3 rounded-xl p-3 text-left"
            >
              <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
                <LifeBuoy />
              </span>
              <span className="flex-1">
                <b className="block text-sm">Falar com a equipa</b>
                <span className="text-muted-foreground text-xs">
                  Abra um pedido de suporte
                </span>
              </span>
              <ChevronRight className="text-muted-foreground size-4" />
            </button>
          </div>
        </div>
      )}
      <Button
        size="lg"
        className="rounded-full shadow-xl"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Fechar ajuda' : 'Precisa de ajuda?'}
        aria-expanded={open}
      >
        {open ? <X /> : <MessageCircle />}
        <span className="hidden min-[900px]:inline">
          {open ? 'Fechar' : 'Precisa de ajuda?'}
        </span>
      </Button>
    </div>
  );
}
