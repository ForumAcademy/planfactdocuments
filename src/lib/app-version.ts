/**
 * Версия кода сайта. На Vercel — хеш коммита, из которого собран сайт
 * (подставляется при сборке в next.config.ts). Меняется только при изменении кода,
 * поэтому изменения данных и переменных окружения выход из системы не вызывают.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

/** Сессия действительна, только если выдана текущей версией сайта. */
export function isSessionCurrent(data: { loggedIn?: boolean; version?: string }): boolean {
  return Boolean(data.loggedIn) && data.version === APP_VERSION;
}
