'use client';

import Link from 'next/link';
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
