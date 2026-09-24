import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { todayMsk } from '@/lib/dates';
import { runReminders } from '@/server/reminders';

/** Запись в журнал: когда сработал утренний запуск и что он сделал. */
async function logAutoRun(day: string, subject: string, status: string, error: string | null) {
  try {
    await prisma.reminderLog.create({
      data: {
        dayKey: day,
        channel: 'system',
        kind: 'auto_run',
        recipient: 'Автоматический запуск',
        subject: subject.slice(0, 500),
        status,
        error,
      },
    });
  } catch (e) {
    console.error('журнал автозапуска', e);
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Ежедневный запуск напоминаний (Vercel Cron). Защищён CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  // Если CRON_SECRET задан — проверяем его. Если не задан — принимаем только запуск
  // планировщика Vercel (иначе без переменной напоминания молча не уходили бы).
  // Повторный вызов безопасен: в один день одно и то же не отправляется дважды.
  const ok = secret
    ? auth === `Bearer ${secret}`
    : (req.headers.get('user-agent') ?? '').startsWith('vercel-cron');
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runReminders();
    await logAutoRun(result.day, result.message, 'sent', null);
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    await logAutoRun(
      todayMsk(),
      'Автоматический запуск не удался',
      'error',
      String(e).slice(0, 500),
    );
    return NextResponse.json({ error: 'Ошибка при отправке напоминаний' }, { status: 500 });
  }
}
