'use client';

import * as React from 'react';
import Link, { useLinkStatus } from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const Ctx = React.createContext<{
  pending: string | null;
  setPending: (href: string | null) => void;
}>({ pending: null, setPending: () => undefined });

/**
 * Группа вкладок-ссылок. Нажатая вкладка подсвечивается сразу, пока страница загружается
 * (с индикатором), — чтобы не казалось, что нажатие не сработало.
 */
export function TabGroup({ children, ...props }: React.HTMLAttributes<HTMLElement>) {
  const [pending, setPending] = React.useState<string | null>(null);
  const pathname = usePathname();
  const sp = useSearchParams();
  const spKey = sp.toString();
  // Переход завершён — подсветка снова по фактической странице
  React.useEffect(() => setPending(null), [pathname, spKey]);
  return (
    <Ctx.Provider value={{ pending, setPending }}>
      <nav {...props}>{children}</nav>
    </Ctx.Provider>
  );
}

export function TabLink({
  href,
  active,
  className,
  activeClassName,
  inactiveClassName,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Link>, 'href'> & {
  href: string;
  active: boolean;
  activeClassName: string;
  inactiveClassName: string;
}) {
  const { pending, setPending } = React.useContext(Ctx);
  const isActive = pending ? pending === href : active;
  return (
    <Link
      href={href}
      {...props}
      aria-selected={props.role === 'tab' ? isActive : undefined}
      aria-current={props.role === 'tab' ? undefined : isActive ? 'page' : undefined}
      className={cn(className, isActive ? activeClassName : inactiveClassName)}
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (!active) setPending(href);
      }}
    >
      {children}
      <PendingSpinner />
    </Link>
  );
}

function PendingSpinner() {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="ml-1.5 size-3.5 animate-spin" aria-hidden /> : null;
}
