import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Вход — Статус форумы' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-md bg-brand-dark text-lg font-bold text-white">
            СФ
          </div>
          <h1 className="text-2xl font-semibold text-ink">Статус форумы</h1>
          <p className="mt-1 text-sm text-status-gray">
            Планирование и контроль подготовки форумов
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
