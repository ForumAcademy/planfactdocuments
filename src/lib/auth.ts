import 'server-only';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from './session';
import { isSessionCurrent } from './app-version';

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export class AuthError extends Error {
  constructor() {
    super('Требуется вход в систему');
  }
}

/** Проверка сессии для server actions и route handlers. Возвращает имя пользователя. */
export async function requireAuth(): Promise<{
  userName: string;
  role: NonNullable<SessionData['role']>;
}> {
  const session = await getSession();
  if (!isSessionCurrent(session)) throw new AuthError();
  return { userName: session.userName ?? 'Общий вход', role: session.role ?? 'ADMIN' };
}

/** Проверка права на изменение данных (задел под роли «Просмотр»). */
export async function requireEditor() {
  const user = await requireAuth();
  if (user.role === 'VIEWER') throw new Error('Недостаточно прав для изменения данных');
  return user;
}
