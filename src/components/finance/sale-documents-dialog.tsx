'use client';

import { useEffect, useState } from 'react';
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type DocumentRow = {
  id: string;
  file_name: string;
  byte_size: number;
  created_at: string;
};
export function SaleDocumentsButton({
  saleId,
  canUpload,
}: {
  saleId: string;
  canUpload: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Paperclip /> Comprovativos
      </Button>
      <SaleDocumentsDialog
        saleId={open ? saleId : null}
        canUpload={canUpload}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
export function SaleDocumentsDialog({
  saleId,
  canUpload = true,
  onClose,
}: {
  saleId: string | null;
  canUpload?: boolean;
  onClose: () => void;
}) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const [inputKey, setInputKey] = useState(0);
  useEffect(() => {
    if (!saleId) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      setDocuments([]);
      setFile(null);
      try {
        const response = await fetch(
          `/api/finance/sale-documents?sale=${encodeURIComponent(saleId)}`,
          { signal: controller.signal, cache: 'no-store' }
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error || 'Não foi possível consultar os comprovativos.'
          );
        if (!controller.signal.aborted) setDocuments(body.documents || []);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Falha ao consultar comprovativos.'
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [saleId, version]);
  async function upload() {
    if (!saleId || !file || saving) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Escolha um ficheiro até 10 MB.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const form = new FormData();
      form.set('sale', saleId);
      form.set('file', file);
      const response = await fetch('/api/finance/sale-documents', {
        method: 'POST',
        body: form,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error || 'Não foi possível anexar o comprovativo.'
        );
      setFile(null);
      setInputKey((value) => value + 1);
      setVersion((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Falha ao anexar comprovativo. O pagamento não foi alterado.'
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open={!!saleId}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b p-4 pr-10">
          <DialogTitle>Comprovativos da venda</DialogTitle>
          <DialogDescription>
            Documentos internos da equipa. Anexar não confirma pagamentos nem
            envia ficheiros ao cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          {canUpload && (
            <div className="bg-muted/20 space-y-3 rounded-xl border p-4">
              <label className="grid gap-2 text-sm font-medium">
                Anexar comprovativo
                <Input
                  key={inputKey}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  disabled={saving}
                  onChange={(event) => {
                    setFile(event.target.files?.[0] || null);
                    setError('');
                  }}
                />
              </label>
              <p className="text-muted-foreground text-xs">
                PDF, JPG, PNG ou WebP · até 10 MB por ficheiro. Pode anexar mais
                de um comprovativo à mesma venda.
              </p>
              <Button onClick={() => void upload()} disabled={!file || saving}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Paperclip className="size-4" />
                )}
                {saving ? 'A anexar…' : 'Anexar à venda'}
              </Button>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="text-destructive border-destructive/30 space-y-2 rounded-lg border p-3 text-sm"
            >
              <p>{error}</p>
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => setVersion((value) => value + 1)}
              >
                Atualizar lista
              </Button>
            </div>
          )}
          {loading ? (
            <p role="status" className="flex gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> A consultar
              comprovativos…
            </p>
          ) : documents.length ? (
            <ul className="divide-y rounded-xl border">
              {documents.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="flex min-w-0 flex-1 gap-2">
                    <FileText className="text-primary mt-1 size-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-all">
                        {document.file_name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {Math.max(1, Math.round(document.byte_size / 1024))} KB
                        ·{' '}
                        {new Date(document.created_at).toLocaleDateString(
                          'pt-PT'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`/api/finance/sale-documents?id=${document.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-10 items-center gap-1 rounded-md border px-3 text-sm"
                    >
                      <ExternalLink className="size-3.5" /> Abrir
                    </a>
                    <a
                      href={`/api/finance/sale-documents?id=${document.id}&download=1`}
                      className="inline-flex min-h-10 items-center rounded-md border px-3"
                      aria-label={`Descarregar ${document.file_name}`}
                    >
                      <Download className="size-4" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            !error && (
              <p className="text-muted-foreground py-5 text-center text-sm">
                Ainda não existem comprovativos nesta venda.
              </p>
            )
          )}
        </div>
        <DialogFooter className="m-0 shrink-0 rounded-none px-4 py-3">
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
