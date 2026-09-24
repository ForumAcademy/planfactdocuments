'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/', label: 'Форумы', match: (p: string) => p === '/' || p.startsWith('/forums') },
  { href: '/database', label: 'База данных', match: (p: string) => p.startsWith('/database') },
  { href: '/settings', label: 'Напоминания', match: (p: string) => p.startsWith('/settings') },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white',
            l.match(pathname) && 'bg-white/15 text-white',
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Меню разделов на телефоне: кнопка ☰ открывает список под шапкой. */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  // Переход по ссылке — меню закрывается
  React.useEffect(() => setOpen(false), [pathname]);
  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex size-9 items-center justify-center rounded-md text-white/90 hover:bg-white/10"
        aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
        aria-expanded={open}
        data-testid="mobile-menu"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 top-14 z-40 bg-black/30" onClick={() => setOpen(false)} />
          <nav className="fixed inset-x-0 top-14 z-50 border-t border-white/10 bg-brand-dark px-2 pb-3 pt-1 shadow-lg">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'block rounded-md px-3 py-3 text-base text-white/85 hover:bg-white/10',
                  l.match(pathname) && 'bg-white/15 font-medium text-white',
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
