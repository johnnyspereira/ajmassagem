'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { Message, MessageReaction } from '@/types';
import {
  Check,
  CheckCheck,
  XCircle,
  MapPin,
  LayoutTemplate,
  CornerDownLeft,
  Sparkles,
  Languages,
  Loader2,
  RotateCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ReplyQuote } from './reply-quote';
import { MediaAttachment } from './media-attachment';
import { MessageReactions } from './message-reactions';
import { InteractivePreview } from '@/components/interactive/interactive-preview';
import { useTranslations } from 'next-intl';

interface MessageBubbleProps {
  message: Message;
  /** Consecutive messages from the same side are rendered as one WhatsApp-style group. */
  groupedWithPrevious?: boolean;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
  onRetry?: () => void;
}

function StatusIcon({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'sending':
      return (
        <Loader2 className="text-primary-foreground/90 h-3 w-3 animate-spin" />
      );
    case 'sent':
      return <Check className="text-muted-foreground h-3 w-3" />;
    case 'delivered':
      return <CheckCheck className="text-muted-foreground h-3 w-3" />;
    case 'read':
      return <CheckCheck className="h-3 w-3 text-blue-400" />;
    case 'failed':
      return <XCircle className="h-3 w-3 text-red-400" />;
    default:
      return null;
  }
}

function MessageContent({
  message,
  t,
}: {
  message: Message;
  t: ReturnType<typeof useTranslations>;
}) {
  switch (message.content_type) {
    case 'text':
      return (
        <p className="text-sm break-words whitespace-pre-wrap">
          {message.content_text}
        </p>
      );

    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      return (
        <div className="max-w-full min-w-0">
          <MediaAttachment message={message} />
          {message.content_type !== 'document' && message.content_text && (
            <p className="mt-1 text-sm break-words whitespace-pre-wrap">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case 'template':
      return (
        <div>
          <span className="bg-primary/20 text-primary mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
            <LayoutTemplate className="h-3 w-3" />
            {t('template')}
          </span>
          {message.content_text && (
            <p className="mt-1 text-sm break-words whitespace-pre-wrap">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case 'location':
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="text-muted-foreground h-4 w-4 shrink-0" />
          <span>{message.content_text || t('locationShared')}</span>
        </div>
      );

    case 'interactive': {
      // Three cases share content_type='interactive':
      //  - OUTBOUND with payload (composer / automation / Flow send after
      //    migration 035): render the buttons/list as they appear on the phone.
      //  - INBOUND tap (customer chose an option, sender_type='customer'):
      //    no payload; show the tapped option's title with a reply affordance
      //    so agents can tell it's a tap, not the customer typing.
      //  - OUTBOUND with NO payload (legacy bot/Flow sends from before
      //    migration 035 backfilled the column): show the body text plainly —
      //    it is our own message, NOT a customer tap.
      if (message.interactive_payload) {
        return <InteractivePreview payload={message.interactive_payload} />;
      }
      if (message.sender_type === 'customer') {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase">
              <CornerDownLeft className="h-3 w-3" />
              {t('buttonReply')}
            </span>
            <p className="text-sm break-words whitespace-pre-wrap">
              {message.content_text || t('interactiveReply')}
            </p>
          </div>
        );
      }
      return (
        <p className="text-sm break-words whitespace-pre-wrap">
          {message.content_text || t('interactiveReply')}
        </p>
      );
    }

    default:
      return (
        <p className="text-sm break-words whitespace-pre-wrap">
          {message.content_text || t('unsupported')}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  groupedWithPrevious = false,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
  onRetry,
}: MessageBubbleProps) {
  const t = useTranslations('Inbox.bubble');

  const isAgent =
    message.sender_type === 'agent' || message.sender_type === 'bot';
  const time = format(new Date(message.created_at), 'HH:mm');
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  const canTranslate = !isAgent && Boolean(message.content_text?.trim());
  const translateToPortuguese = useCallback(async () => {
    const source = message.content_text?.trim();
    if (!source || translating) return;
    setTranslating(true);
    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: source, target_language: 'pt' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? 'Não foi possível traduzir a mensagem.');
        return;
      }
      if (typeof data.translation !== 'string' || !data.translation.trim()) {
        toast.error('A tradução não devolveu texto.');
        return;
      }
      setTranslation(data.translation.trim());
    } catch {
      toast.error('Não foi possível contactar a tradução por IA.');
    } finally {
      setTranslating(false);
    }
  }, [message.content_text, translating]);

  // Row alignment + width cap are owned by <MessageActions> so its hover
  // group matches the bubble's content area, not the full row.
  return (
    <div className={cn('flex flex-col', isAgent ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'relative rounded-2xl px-3 py-2',
          isAgent
            ? cn(
                'bg-primary text-primary-foreground rounded-br-md',
                groupedWithPrevious && 'rounded-tr-md'
              )
            : cn(
                'bg-muted text-foreground rounded-bl-md',
                groupedWithPrevious && 'rounded-tl-md'
              )
        )}
      >
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            onPrimary={isAgent}
          />
        )}
        <MessageContent message={message} t={t} />
        {canTranslate && (
          <div className="border-border/60 mt-2 border-t pt-1.5">
            {translation ? (
              <div className="text-muted-foreground bg-background/45 rounded-md px-2 py-1.5 text-xs whitespace-pre-wrap">
                <span className="mb-0.5 block text-[10px] font-semibold tracking-wide uppercase">
                  Tradução para português
                </span>
                {translation}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void translateToPortuguese()}
                disabled={translating}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px] disabled:opacity-60"
                title="Traduzir para português"
              >
                {translating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Languages className="h-3 w-3" />
                )}
                {translating ? 'A traduzir…' : 'Traduzir para português'}
              </button>
            )}
          </div>
        )}
        <div
          className={cn(
            'mt-1 flex items-center gap-1',
            isAgent ? 'justify-end' : 'justify-start'
          )}
        >
          {/* AI badge — only on replies the auto-reply bot generated
              (always outbound, so it sits on the primary fill). Lets
              agents tell an AI reply from their own / a Flow's at a
              glance. */}
          {message.ai_generated && (
            <span
              className="bg-primary-foreground/20 text-primary-foreground inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] leading-none font-semibold tracking-wide uppercase"
              title={t('aiBadgeTitle')}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {t('aiBadge')}
            </span>
          )}
          <span
            className={cn(
              'text-[10px]',
              // Outbound bubbles sit on the primary fill, so the
              // timestamp must read against that (not the neutral
              // foreground) — otherwise it goes low-contrast in light
              // mode. Inbound bubbles use the muted surface.
              isAgent ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}
          >
            {time}
          </span>
          {isAgent && <StatusIcon status={message.status} />}
        </div>
        {isAgent && message.status === 'sending' && (
          <div
            role="status"
            aria-live="polite"
            className="text-primary-foreground/85 mt-1.5 min-w-36"
          >
            <span className="flex items-center gap-1 text-[10px] font-medium">
              <Loader2 className="h-3 w-3 animate-spin" />A confirmar envio…
            </span>
            <span className="bg-primary-foreground/25 mt-1 block h-1 overflow-hidden rounded-full">
              <span className="bg-primary-foreground/90 block h-full w-2/3 animate-pulse rounded-full" />
            </span>
          </div>
        )}
        {isAgent && message.status === 'failed' && onRetry && (
          <div className="mt-1.5 space-y-1.5">
            {message.delivery_error ? (
              <p
                className="text-primary-foreground/80 max-w-56 text-[10px] leading-snug"
                title={message.delivery_error}
              >
                Falhou: {message.delivery_error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onRetry}
              className="text-primary-foreground/85 inline-flex items-center gap-1 text-[10px] font-medium underline-offset-2 hover:underline"
            >
              <RotateCw className="h-3 w-3" /> Tentar novamente
            </button>
          </div>
        )}
      </div>
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
}
