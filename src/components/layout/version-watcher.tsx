'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { APP_VERSION } from '@/lib/app-version';

const CHECK_EVERY_MS = 30_000;
const COUNTDOWN_S = 5;

/**
 * Следит за версией сайта. Если выкатили новую версию кода — показывает предупреждение,
 * через 5 секунд завершает сессию и открывает страницу входа.
 */
export function VersionWatcher() {
  const [left, setLeft] = React.useState<number | null>(null);

  // Любой ответ сервера «сайт обновлён» (переход по странице, сохранение) сразу показывает
  // предупреждение, а сам запрос «замирает» — страница не пытается разобрать чужой ответ.
  React.useEffect(() => {
    const original = window.fetch;
    const patched: typeof window.fetch = async (...args) => {
      const res = await original(...args);
      const outdated =
        res.headers.get('x-app-outdated') === '1' ||
        (res.redirected && res.url.includes('reason=updated'));
      if (outdated) {
        setLeft((l) => l ?? COUNTDOWN_S);
        return new Promise<Response>(() => undefined);
      }
      return res;
    };
    window.fetch = patched;
    return () => {
      if (window.fetch === patched) window.fetch = original;
    };
  }, []);

  React.useEffect(() => {
    let stopped = false;
    let lastCheck = 0;
    const check = async () => {
      if (stopped || document.visibilityState === 'hidden') return;
      lastCheck = Date.now();
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (version && version !== APP_VERSION) {
          stopped = true;
          setLeft(COUNTDOWN_S);
        }
      } catch {
        /* нет сети — проверим позже */
      }
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => void check();
    // При действиях пользователя проверяем чаще (не чаще раза в 15 секунд)
    const onAction = () => {
      if (Date.now() - lastCheck > 15_000) void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pointerdown', onAction, { capture: true });
    window.addEventListener('keydown', onAction, { capture: true });
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pointerdown', onAction, { capture: true });
      window.removeEventListener('keydown', onAction, { capture: true });
    };
  }, []);

  React.useEffect(() => {
    if (left === null) return;
    if (left <= 0) {
      void fetch('/api/logout', { method: 'POST' })
        .catch(() => undefined)
        .finally(() => window.location.replace('/login?reason=updated'));
      return;
    }
    const t = setTimeout(() => setLeft((s) => (s === null ? s : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [left]);

  if (left === null) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="version-title"
      data-testid="version-popup"
    >
      <div className="w-full max-w-md rounded-md bg-white p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-brand-light text-brand">
          <RefreshCw className="size-6" />
        </div>
        <h2 id="version-title" className="text-lg font-semibold">
          На сайт были внесены изменения
        </h2>
        <p className="mt-2 text-sm text-ink/70">
          Через <b className="text-ink">{Math.max(left, 0)}</b> сек. вы будете перенаправлены на
          страницу входа. Войдите снова, чтобы продолжить работу в обновлённой версии.
        </p>
      </div>
    </div>
  );
}
