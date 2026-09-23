import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Хлебные крошки" className="border-b border-line bg-surface print:hidden">
      <ol className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-1 px-4 py-2 text-sm">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-status-gray" />}
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="text-brand hover:underline">
                {c.label}
              </Link>
            ) : (
              <span className="text-ink">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
