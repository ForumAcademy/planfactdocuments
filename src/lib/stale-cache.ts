'use client';

/**
 * После правок страница не пересобирается на сервере целиком (так быстрее). Чтобы кнопка
 * «Назад» не показала старую копию из кэша браузера, помечаем кэш устаревшим; его сбросит
 * StaleCacheRefresher — уже ПОСЛЕ перехода на новую страницу, не мешая самому переходу.
 */
let stale = false;

export function markCacheStale() {
  stale = true;
}

export function consumeCacheStale(): boolean {
  const was = stale;
  stale = false;
  return was;
}
