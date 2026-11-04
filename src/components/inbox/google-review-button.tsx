'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** Key by account and conversation so a delayed response cannot enter another chat. */
export function GoogleReviewButton({
  conversationId,
  disabled,
  onPrepared,
}: {
  conversationId: string;
  disabled: boolean;
  onPrepared: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
    },
    []
  );

  async function prepare() {
    if (pending.current || disabled) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/inbox/google-review-invitation?conversationId=${encodeURIComponent(conversationId)}`,
        {
          cache: 'no-store',
          signal: controller.signal,
        }
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || 'Não foi possível preparar o pedido de avaliação.'
        );
      if (typeof data.message !== 'string' || !data.message.trim())
        throw new Error('O pedido de avaliação está vazio.');
      if (controller.signal.aborted) return;
      onPrepared(data.message);
      toast.success(
        'Pedido de avaliação preparado. Reveja e clique em Enviar.'
      );
    } catch (error) {
      if (!controller.signal.aborted)
        toast.error(
          error instanceof Error
            ? error.message
            : 'Não foi possível preparar a mensagem.'
        );
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-11 max-w-full shrink-0 rounded-xl px-3 text-xs"
      disabled={disabled || loading}
      onClick={() => void prepare()}
      title="Preparar uma mensagem para este cliente avaliar a nova página no Google"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Star className="size-4 text-amber-600" />
      )}
      Pedir avaliação Google
    </Button>
  );
}
