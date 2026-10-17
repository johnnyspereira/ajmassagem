'use client';

/* Blob URLs are authenticated, short-lived previews and cannot use the image optimizer. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RotateCw,
} from 'lucide-react';
import type { Message } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { mediaSources, withMediaSlot } from '@/lib/inbox/media';
import { visibleMessageText } from '@/lib/inbox/message-text';

export function MediaAttachment({ message }: { message: Message }) {
  const [attempt, setAttempt] = useState(0);
  const [asset, setAsset] = useState<{ url: string; mime: string } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const sourceUrl = message.media_url;
  const externalId = message.message_id;
  const name =
    message.content_type === 'document'
      ? visibleMessageText(message.content_text) || 'Documento'
      : 'Anexo';

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setAsset(null);
    setError('');
    setLoading(true);
    async function load() {
      for (const source of mediaSources({
        media_url: sourceUrl,
        message_id: externalId,
      })) {
        try {
          const response = await fetch(source, {
            credentials: 'same-origin',
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          if (!blob.size || /^(text\/html|application\/json)/i.test(blob.type))
            throw new Error('Resposta inválida');
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setAsset({ url: objectUrl, mime: blob.type });
          setLoading(false);
          return;
        } catch {
          if (controller.signal.aborted) return;
        }
      }
      if (!controller.signal.aborted) {
        setError(
          'Não foi possível carregar este ficheiro. Pode tentar recuperá-lo do WhatsApp.'
        );
        setLoading(false);
      }
    }
    void withMediaSlot(controller.signal, load);
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sourceUrl, externalId, attempt]);

  async function recover() {
    if (recovering) return;
    setRecovering(true);
    try {
      const response = await fetch('/api/whatsapp/baileys/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: message.conversation_id,
          message_limit: 100,
        }),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (result.queued)
        setError(
          'Recuperação pedida. Aguarde a sincronização e tente novamente.'
        );
      else setAttempt((value) => value + 1);
    } catch {
      setError(
        'Não foi possível recuperar o ficheiro. Verifique a ligação ao WhatsApp.'
      );
    } finally {
      setRecovering(false);
    }
  }

  if (loading)
    return (
      <div
        role="status"
        className="bg-muted/50 flex min-h-20 items-center gap-2 rounded-xl p-3 text-xs"
      >
        <Loader2 className="size-4 animate-spin" />A carregar ficheiro…
      </div>
    );
  if (!asset)
    return (
      <div className="bg-muted/50 max-w-72 space-y-2 rounded-xl p-3 text-xs">
        <p role="status">{error}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="inline-flex items-center gap-1 underline"
          >
            <RotateCw className="size-3" />
            Tentar novamente
          </button>
          <button
            type="button"
            disabled={recovering}
            onClick={() => void recover()}
            className="inline-flex items-center gap-1 underline disabled:opacity-50"
          >
            {recovering && <Loader2 className="size-3 animate-spin" />}Recuperar
            do WhatsApp
          </button>
        </div>
      </div>
    );

  const pdf = asset.mime.includes('pdf') || /\.pdf(?:$|\s)/i.test(name);
  return (
    <div className="max-w-full space-y-2">
      {message.content_type === 'image' && (
        <button
          type="button"
          onClick={() => setPreview(true)}
          aria-label="Ampliar imagem"
          className="block max-w-full"
        >
          <img
            src={asset.url}
            alt={message.content_text || 'Imagem partilhada'}
            className="max-h-72 w-72 max-w-full rounded-xl object-contain"
            onError={() => {
              setError('Não foi possível apresentar a imagem.');
              setAsset(null);
            }}
          />
        </button>
      )}
      {message.content_type === 'audio' && (
        <audio
          src={asset.url}
          controls
          preload="metadata"
          className="h-11 w-64 max-w-full"
          onError={() =>
            setError(
              'Este navegador não conseguiu reproduzir o áudio. Pode descarregar o ficheiro.'
            )
          }
        />
      )}
      {message.content_type === 'video' && (
        <video
          src={asset.url}
          controls
          preload="metadata"
          className="max-h-72 max-w-full rounded-xl"
          onError={() =>
            setError(
              'Este navegador não conseguiu reproduzir o vídeo. Pode descarregar o ficheiro.'
            )
          }
        />
      )}
      {message.content_type === 'document' && (
        <a
          href={asset.url}
          download={pdf ? undefined : name}
          onClick={(event) => {
            if (pdf) {
              event.preventDefault();
              setPreview(true);
            }
          }}
          className="bg-muted/50 hover:bg-muted flex max-w-full items-center gap-2 rounded-xl p-3 text-sm"
        >
          <FileText className="size-5 shrink-0" />
          <span className="min-w-0 truncate">{name}</span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
      )}
      {error && (
        <p role="status" className="max-w-64 text-xs">
          {error}
        </p>
      )}
      <a
        href={asset.url}
        download={message.content_type === 'document' ? name : undefined}
        className="text-muted-foreground inline-flex items-center gap-1 text-[11px] underline"
      >
        <Download className="size-3" />
        Descarregar
      </a>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-4xl">
          <DialogTitle>
            {message.content_type === 'image' ? 'Imagem' : name}
          </DialogTitle>
          <DialogDescription>
            Pré-visualização do ficheiro da conversa.
          </DialogDescription>
          {message.content_type === 'image' ? (
            <img
              src={asset.url}
              alt={message.content_text || 'Imagem partilhada'}
              className="min-h-0 max-w-full object-contain"
            />
          ) : (
            <iframe
              src={asset.url}
              title={name}
              className="h-[65dvh] w-full rounded-lg border"
            />
          )}
          <a
            href={asset.url}
            download={pdf ? undefined : ''}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-xs underline"
          >
            {pdf ? 'Abrir PDF noutra janela' : 'Descarregar imagem'}
          </a>
        </DialogContent>
      </Dialog>
    </div>
  );
}
