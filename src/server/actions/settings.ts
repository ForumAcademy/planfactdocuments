'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { run, type ActionResult } from '@/server/action-utils';
import { runReminders, type RunResult } from '@/server/reminders';

const schema = z.object({
  enabled: z.boolean(),
  daysBefore: z.number().int().min(0, 'Не меньше 0').max(60, 'Не больше 60'),
  managerEmails: z
    .string()
    .max(1000)
    .refine(
      (s) =>
        s
          .split(/[,;\s]+/)
          .filter(Boolean)
          .every((e) => z.email().safeParse(e).success),
      'Проверьте адреса e-mail (через запятую)',
    ),
  weeklySummary: z.boolean(),
  maxEmailsPerRun: z.number().int().min(1).max(500),
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
