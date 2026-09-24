import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { Logo } from '@/components/layout/logo';

export const metadata: Metadata = { title: 'Вход — Статус форумы' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="sr-only">Статус форумы</h1>
          <Logo variant="black" className="mx-auto h-auto w-full max-w-md" />
          <p className="mt-4 text-sm text-status-gray">
            Статус форумов — планирование и контроль подготовки
          </p>
        </div>
        {reason === 'updated' && (
          <p
            className="mb-3 rounded-md border border-brand/30 bg-brand-light px-3 py-2 text-sm text-brand-dark"
            data-testid="login-updated"
          >
            Сайт обновлён. Войдите снова, чтобы продолжить работу.
          </p>
        )}
        <div className="rounded-md border border-line bg-white p-6 shadow-sm">
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}
