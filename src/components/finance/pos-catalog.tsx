'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Box,
  Gift,
  ImagePlus,
  Loader2,
  PackageCheck,
  Plus,
  Search,
  Sparkles,
  X,
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
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import type { CartItem, CatalogItem } from './finance-types';
import styles from './pos-catalog.module.css';

function Photo({
  src,
  type,
}: {
  src?: string | null;
  type: CatalogItem['type'];
}) {
  const [failed, setFailed] = useState(false);
  const Icon =
    type === 'product' ? Box : type === 'pack' ? PackageCheck : Sparkles;
  return src && !failed ? (
    <Image
      src={src}
      alt=""
      fill
      sizes="(max-width: 639px) 50vw, 300px"
      unoptimized
      onError={() => setFailed(true)}
      className={styles.photo}
    />
  ) : (
    <div className={styles.placeholder}>
      <Icon aria-hidden="true" />
      <span>
        {type === 'product'
          ? 'Produto'
          : type === 'pack'
            ? 'Pack de sessões'
            : 'Bem-estar'}
      </span>
    </div>
  );
}

export function PosCatalog({
  mode,
  setMode,
  search,
  setSearch,
  catalog,
  cart,
  onAdd,
  onVoucher,
  onCustom,
  currency,
}: {
  mode: 'services' | 'products' | 'packs';
  setMode: (mode: 'services' | 'products' | 'packs') => void;
  search: string;
  setSearch: (value: string) => void;
  catalog: CatalogItem[];
  cart: CartItem[];
  onAdd: (item: CatalogItem) => void;
  onVoucher: () => void;
  onCustom: () => void;
  currency: string;
}) {
  const { accountId, canEditSettings } = useAuth();
  const [images, setImages] = useState<Record<string, string>>({});
  const [imageError, setImageError] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/clinic/catalog-images', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('images');
        const data = await response.json();
        if (!controller.signal.aborted) {
          setImages(data.images || {});
          setImageError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setImageError(true);
      });
    return () => controller.abort();
  }, [accountId, version]);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const timer = setTimeout(() => setPreview(url), 0);
    return () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    };
  }, [file]);
  async function save(remove = false) {
    if (!editing || busy) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('kind', editing.type);
      form.set('id', editing.id);
      if (remove) form.set('remove', 'true');
      else if (file) form.set('file', file);
      const response = await fetch('/api/clinic/catalog-images', {
        method: 'POST',
        body: form,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Não foi possível guardar a imagem.');
      setVersion((value) => value + 1);
      setEditing(null);
      setFile(null);
      setPreview('');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível guardar a imagem.'
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.catalog} aria-label="Catálogo do ponto de venda">
      <div className={styles.toolbar}>
        <div className={styles.heading}>
          <div>
            <h2>O que vamos vender?</h2>
            <p>Escolha um artigo para adicionar à venda.</p>
          </div>
          <div className={styles.tools}>
            <Button variant="outline" size="sm" onClick={onVoucher}>
              <Gift /> Voucher
            </Button>
            <Button variant="outline" size="sm" onClick={onCustom}>
              <Plus /> Item livre
            </Button>
          </div>
        </div>
        <div className={styles.tabs} aria-label="Categorias do catálogo">
          {(['services', 'products', 'packs'] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === 'services'
                ? 'Serviços'
                : value === 'products'
                  ? 'Produtos'
                  : 'Packs'}
            </button>
          ))}
        </div>
        <div className={styles.search}>
          <Search className="size-4" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar nome ou referência"
            aria-label="Pesquisar no catálogo"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Limpar pesquisa"
              onClick={() => setSearch('')}
            >
              <X />
            </Button>
          )}
        </div>
        <div className={styles.caption}>
          <span>
            {catalog.length} {catalog.length === 1 ? 'artigo' : 'artigos'}
            {search ? ' encontrados' : ' disponíveis'}
          </span>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById('finance-checkout')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              Ver venda · {cart.reduce((sum, item) => sum + item.quantity, 0)}{' '}
              itens
            </button>
          )}
        </div>
        {imageError && canEditSettings && (
          <button
            className="text-muted-foreground text-xs underline"
            onClick={() => setVersion((value) => value + 1)}
          >
            Não foi possível carregar as imagens personalizadas. Tentar
            novamente
          </button>
        )}
      </div>
      <div className={styles.grid}>
        {catalog.map((item) => {
          const key = `${item.type}:${item.id}`,
            src = images[key] || item.imageUrl;
          const quantity = cart
            .filter(
              (row) => row.itemType === item.type && row.sourceId === item.id
            )
            .reduce((sum, row) => sum + row.quantity, 0);
          return (
            <article
              key={key}
              className={styles.card}
              data-selected={quantity > 0}
            >
              <button
                type="button"
                className={styles.add}
                disabled={item.available === false}
                onClick={() => onAdd(item)}
                aria-label={`Adicionar ${item.name} à venda`}
              >
                <div className={styles.media}>
                  <Photo key={src || key} src={src} type={item.type} />
                  {quantity > 0 && (
                    <span className={styles.selected}>{quantity} na venda</span>
                  )}
                  {item.available === false && (
                    <span className={styles.stock}>Sem stock</span>
                  )}
                </div>
                <div className={styles.info}>
                  <h3>{item.name}</h3>
                  <p>{item.detail}</p>
                  {item.reference && <small>Ref. {item.reference}</small>}
                  <div className={styles.price}>
                    <strong>{formatCurrency(item.price, currency)}</strong>
                    <span aria-hidden="true">
                      <Plus className="size-4" />
                    </span>
                  </div>
                </div>
              </button>
              {canEditSettings && (
                <button
                  type="button"
                  className={styles.edit}
                  aria-label={`Alterar imagem de ${item.name}`}
                  onClick={() => {
                    setEditing(item);
                    setFile(null);
                    setPreview('');
                    setError('');
                  }}
                >
                  <ImagePlus className="size-3.5" /> Imagem
                </button>
              )}
            </article>
          );
        })}
      </div>
      {!catalog.length && (
        <div className={styles.empty}>
          <Search className="size-7" />
          <p>Nenhum artigo encontrado.</p>
          <Button variant="outline" onClick={() => setSearch('')}>
            Limpar pesquisa
          </Button>
        </div>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEditing(null);
            setFile(null);
            setPreview('');
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Imagem do catálogo</DialogTitle>
            <DialogDescription>
              {editing?.name} · Visível para a equipa no POS. Não altera a
              imagem pública do site.
            </DialogDescription>
          </DialogHeader>
          <div className={styles.preview}>
            <Photo
              key={preview || 'preview'}
              src={
                preview ||
                (editing &&
                  (images[`${editing.type}:${editing.id}`] || editing.imageUrl))
              }
              type={editing?.type || 'product'}
            />
          </div>
          <label className="grid gap-2 text-sm font-medium">
            Escolher fotografia
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setPreview('');
                setError('');
              }}
            />
            <span className="text-muted-foreground text-xs font-normal">
              JPG, PNG ou WebP, até 2 MB. Prefira imagens horizontais, sem texto
              pequeno.
            </span>
          </label>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            {editing && images[`${editing.type}:${editing.id}`] && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void save(true)}
              >
                Remover personalizada
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setFile(null);
                setPreview('');
              }}
            >
              Cancelar
            </Button>
            <Button disabled={busy || !file} onClick={() => void save()}>
              {busy && <Loader2 className="size-4 animate-spin" />}Guardar
              imagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
