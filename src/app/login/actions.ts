'use server';

import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

// Запасной счётчик в памяти — если БД временно недоступна.
const memoryAttempts = new Map<string, number[]>();

async function tooManyAttempts(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  try {
    const count = await prisma.loginAttempt.count({ where: { ip, createdAt: { gte: since } } });
    if (count >= MAX_ATTEMPTS) return true;
    await prisma.loginAttempt.create({ data: { ip } });
    if (Math.random() < 0.05) {
      await prisma.loginAttempt.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } },
      });
    }
    return false;
  } catch {
    const now = Date.now();
    const list = (memoryAttempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (list.length >= MAX_ATTEMPTS) return true;
    list.push(now);
    memoryAttempts.set(ip, list);
    return false;
  }
}

function safeNext(next: FormDataEntryValue | null): string {
  const s = typeof next === 'string' ? next : '';
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/login') ? s : '/';
}

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get('password') ?? '');
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';

  if (await tooManyAttempts(ip)) {
    return { error: 'Слишком много попыток входа. Подождите минуту и попробуйте снова.' };
  }
  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) {
    return { error: 'Пароль не настроен: задайте переменную окружения APP_PASSWORD_HASH.' };
  }
  if (!password || !(await bcrypt.compare(password, hash))) {
    return { error: 'Неверный пароль' };
  }

  const session = await getSession();
  session.loggedIn = true;
  session.userName = 'Общий вход';
  session.role = 'ADMIN';
  session.loginAt = Date.now();
  await session.save();
  redirect(safeNext(formData.get('next')));
}

export async function logoutAction() {
  const session = await getSession();
  session.destroy();
  redirect('/login');
}
