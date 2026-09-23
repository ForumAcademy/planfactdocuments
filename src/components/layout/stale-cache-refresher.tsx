'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { consumeCacheStale } from '@/lib/stale-cache';

/** Сбрасывает кэш страниц после перехода, если до этого были правки (см. stale-cache). */
export function StaleCacheRefresher() {
  const pathname = usePathname();
  const router = useRouter();
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (consumeCacheStale()) router.refresh();
  }, [pathname, router]);
  return null;
}
