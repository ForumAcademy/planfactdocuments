import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { BellServer } from '@/components/layout/bell-server';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { getSession } from '@/lib/auth';
import { isSessionCurrent } from '@/lib/app-version';
import { VersionWatcher } from '@/components/layout/version-watcher';
import { StaleCacheRefresher } from '@/components/layout/stale-cache-refresher';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!isSessionCurrent(session)) redirect('/login?reason=updated');
  return (
    <ConfirmProvider>
      <AppHeader
        bell={
          <Suspense fallback={null}>
            <BellServer />
          </Suspense>
        }
      />
      {children}
      <VersionWatcher />
      <StaleCacheRefresher />
    </ConfirmProvider>
  );
}
