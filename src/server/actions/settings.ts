'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { run, type ActionResult } from '@/server/action-utils';
import { headers } from 'next/headers';
import { appUrl, runReminders, type RunResult } from '@/server/reminders';
import {
  getBotInfo,
  sendTelegram,
  telegramConfigured,
  tgApi,
  webhookSecret,
} from '@/server/telegram';

const schema = z.object({
  daysBefore: z.number().int().min(0, 'Не меньше 0').max(60, 'Не больше 60'),
  weeklySummary: z.boolean(),
  telegramPersonal: z.boolean(),
  telegramGroup: z.boolean(),
});

export async function saveReminderSettings(input: z.input<typeof schema>): Promise<ActionResult> {
  return run(async () => {
    await requireEditor();
    const d = schema.parse(input);
    await prisma.reminderSettings.upsert({ where: { id: 1 }, update: d, create: { id: 1, ...d } });
    revalidatePath('/', 'layout');
    return null;
  });
}

/** Ручной запуск рассылки (для проверки настроек SMTP). */
export async function runRemindersNow(): Promise<ActionResult<RunResult>> {
  return run(async () => {
    await requireEditor();
    const r = await runReminders({ force: true });
    revalidatePath('/settings');
    return r;
  });
}

/** Подключение бота: регистрирует адрес вебхука сайта в Telegram. */
export async function connectTelegramBot(): Promise<ActionResult<string>> {
  return run(async () => {
    await requireEditor();
    if (!telegramConfigured()) throw new Error('Не задан TELEGRAM_BOT_TOKEN в настройках Vercel');
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const url = `${proto}://${host}/api/telegram/webhook`;
    await tgApi('setWebhook', {
      url,
      secret_token: webhookSecret(),
      allowed_updates: ['message', 'my_chat_member'],
      drop_pending_updates: true,
    });
    const bot = await getBotInfo();
    revalidatePath('/settings');
    return bot ? `Бот @${bot.username} подключён` : 'Бот подключён';
  });
}

/** Проверочное сообщение в общий чат. */
export async function testTelegramGroup(): Promise<ActionResult> {
  return run(async () => {
    await requireEditor();
    const s = await prisma.reminderSettings.findUnique({ where: { id: 1 } });
    if (!s?.telegramGroupChatId) throw new Error('Общий чат ещё не подключён');
    await sendTelegram(
      s.telegramGroupChatId,
      'Проверка связи: сводки «Статус форумов» будут приходить в этот чат.',
      appUrl(),
    );
    return null;
  });
}

export async function disconnectTelegramGroup(): Promise<ActionResult> {
  return run(async () => {
    await requireEditor();
    await prisma.reminderSettings.update({
      where: { id: 1 },
      data: { telegramGroupChatId: null, telegramGroupTitle: null },
    });
    revalidatePath('/settings');
    return null;
  });
}
