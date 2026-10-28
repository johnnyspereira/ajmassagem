'use client';

import {
  useEffect,
  useState,
  type ComponentProps,
  type CSSProperties,
} from 'react';
import { DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import styles from './agenda-action-dialog.module.css';

/** Keeps action dialogs inside the visible screen, including the mobile keyboard. */
export function AgendaActionDialogContent({
  className,
  style,
  ...props
}: ComponentProps<typeof DialogContent>) {
  const [viewport, setViewport] = useState<CSSProperties>({});

  useEffect(() => {
    const visual = window.visualViewport;
    const update = () =>
      setViewport({
        '--agenda-viewport-top': `${visual?.offsetTop ?? 0}px`,
        '--agenda-viewport-height': `${visual?.height ?? window.innerHeight}px`,
      } as CSSProperties);
    update();
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <DialogContent
      {...props}
      className={cn(className, styles.content)}
      style={{ ...style, ...viewport }}
    />
  );
}

export function AgendaActionDialogBody({
  className,
  ...props
}: ComponentProps<'div'>) {
  return <div {...props} className={cn(styles.body, className)} />;
}
