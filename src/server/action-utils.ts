import 'server-only';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AuthError } from '@/lib/auth';
import { firstZodError } from '@/lib/validation';

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/** Единая обработка ошибок server actions: понятные сообщения на русском. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: firstZodError(e) };
    if (e instanceof AuthError) return { ok: false, error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { ok: false, error: 'Такое значение уже существует' };
      if (e.code === 'P2003')
        return {
          ok: false,
          error: 'Значение используется в других записях — его можно только архивировать',
        };
      if (e.code === 'P2025')
        return { ok: false, error: 'Запись не найдена (возможно, уже удалена)' };
    }
    if (e instanceof Prisma.PrismaClientInitializationError) {
      return {
        ok: false,
        error: 'База данных недоступна. Попробуйте ещё раз через несколько секунд.',
      };
    }
    if (e instanceof UserError) return { ok: false, error: e.message };
    // NEXT_REDIRECT и прочие служебные ошибки Next.js пробрасываем дальше
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    console.error(e);
    return { ok: false, error: 'Не удалось выполнить операцию. Попробуйте ещё раз.' };
  }
}

/** Ошибка с сообщением для пользователя. */
export class UserError extends Error {}
