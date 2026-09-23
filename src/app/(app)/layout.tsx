import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/app-header';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.loggedIn) redirect('/login');
  return (
    <ConfirmProvider>
      <AppHeader />
      {children}
    </ConfirmProvider>
  );
}
