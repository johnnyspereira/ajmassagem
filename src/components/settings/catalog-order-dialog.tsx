'use client';
import { useState } from 'react';
import { ArrowUp, ArrowDown, ChevronsUp, ListOrdered } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { moveCatalogItem, type CatalogKind } from '@/lib/clinic/catalog-order';
export function CatalogOrderDialog({
  kind,
  items,
  onSaved,
}: {
  kind: CatalogKind;
  items: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [ordered, setOrdered] = useState(items);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const response = await fetch('/api/clinic/catalog-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ids: ordered.map((item) => item.id) }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Não foi possível guardar a ordem.');
      toast.success('Ordem do catálogo guardada.');
      setOpen(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao guardar.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        disabled={items.length < 2}
        onClick={() => {
          setOrdered(items);
          setOpen(true);
        }}
      >
        <ListOrdered className="size-4" />
        Organizar ordem
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!saving) setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Escolher o que aparece primeiro</DialogTitle>
            <DialogDescription>
              Ordene todos os itens, incluindo os inativos. A ordem fica
              guardada para a equipa nesta área da Clínica. Novos itens aparecem
              no fim.
            </DialogDescription>
          </DialogHeader>
          <ol className="max-h-[55dvh] space-y-2 overflow-y-auto pr-1">
            {ordered.map((item, index) => (
              <li
                key={item.id}
                className="flex min-w-0 items-center gap-2 rounded-xl border p-2"
              >
                <span className="text-muted-foreground w-6 shrink-0 text-center text-xs">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 text-sm break-words">
                  {item.name}
                </span>
                {[
                  { label: 'Colocar primeiro', to: 0, Icon: ChevronsUp },
                  { label: 'Subir', to: index - 1, Icon: ArrowUp },
                  { label: 'Descer', to: index + 1, Icon: ArrowDown },
                ].map(({ label, to, Icon }) => (
                  <Button
                    key={label}
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    aria-label={`${label}: ${item.name}`}
                    title={label}
                    disabled={
                      saving || to < 0 || to >= ordered.length || to === index
                    }
                    onClick={() =>
                      setOrdered((current) =>
                        moveCatalogItem(current, index, to)
                      )
                    }
                  >
                    <Icon className="size-4" />
                  </Button>
                ))}
              </li>
            ))}
          </ol>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? 'A guardar…' : 'Guardar ordem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
