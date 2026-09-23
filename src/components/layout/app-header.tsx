import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { logoutAction } from '@/app/login/actions';
import { NavLinks } from './nav-links';
import { Logo } from './logo';

export function AppHeader({ bell }: { bell?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 bg-brand-dark text-white shadow-sm print:hidden">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center text-white" aria-label="На главную">
          <Logo className="h-8 w-auto sm:h-9" />
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-1">
          {bell}
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-white/90 hover:bg-white/10"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
