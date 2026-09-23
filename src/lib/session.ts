import type { SessionOptions } from 'iron-session';

export type AppRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface SessionData {
  loggedIn?: boolean;
  /** Имя для истории изменений. В MVP — общий вход. */
  userName?: string;
  role?: AppRole;
  loginAt?: number;
  /** Версия сайта на момент входа: после обновления кода сессия завершается. */
  version?: string;
}

export const SESSION_COOKIE = 'sf_session';
export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 дней

export function getSessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET не задан или короче 32 символов');
  }
  return secret;
}

export function sessionOptions(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE,
    password: getSessionPassword(),
    ttl: SESSION_TTL,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    },
  };
}
