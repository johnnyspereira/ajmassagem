'use client';
import Link from 'next/link';
import { useRef } from 'react';
import { Menu } from 'lucide-react';
import styles from './jp-massagem-public-site.module.css';
export function PublicMobileMenu({
  navigation,
  portal,
}: {
  navigation: Array<{ href: string; label: string }>;
  portal: boolean;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  return (
    <details
      ref={details}
      className={styles.mobileMenu}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && details.current) {
          details.current.open = false;
          details.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary aria-label="Abrir navegação">
        <Menu aria-hidden="true" />
      </summary>
      <nav
        aria-label="Navegação móvel"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a') && details.current)
            details.current.open = false;
        }}
      >
        {navigation.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
        {portal && <Link href="/portal">Área do cliente</Link>}
      </nav>
    </details>
  );
}
