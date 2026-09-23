'use client';

import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
      <p className="mt-2 text-sm text-ink/70">
        Не удалось загрузить страницу. Возможно, база данных просыпается после паузы — попробуйте
        ещё раз.
      </p>
      {error.digest && <p className="mt-1 text-xs text-status-gray">Код ошибки: {error.digest}</p>}
      <Button className="mt-5" onClick={reset}>
        Повторить
      </Button>
    </div>
  );
}
