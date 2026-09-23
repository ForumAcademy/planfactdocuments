import 'server-only';
import {
  formatGroupDaily,
  formatPersonalDigest,
  formatWeekly,
  type TgItem,
  type WeeklyForum,
} from '@/lib/telegram-format';
import { sendTelegram, telegramConfigured } from './telegram';
import { appUrl, canLinkButton } from '@/lib/telegram-format';

export { appUrl };
import { autoArchivePastForums } from './queries';
import { prisma } from '@/lib/db';
import { addDays, dayOfWeek, dbToISO, todayMsk, type ISODate } from '@/lib/dates';
import { isOverdue, lagDays, shouldStart, type TaskStatusCode } from '@/lib/status';

export type ReminderKind = 'overdue' | 'due_soon' | 'should_start';

export const KIND_LABEL: Record<ReminderKind, string> = {
  overdue: 'Просрочено',
  due_soon: 'Скоро срок',
  should_start: 'Пора начинать',
};

export interface ReminderItem {
  kind: ReminderKind;
  taskId: number;
  number: number;
  description: string;
  status: TaskStatusCode;
  startDate: ISODate | null;
  endDate: ISODate | null;
  lag: number;
  forumId: number;
  forumName: string;
  employees: { id: number; fullName: string; active: boolean }[];
}

export async function getSettings() {
  // Обычно запись уже есть — читаем без записи в базу
  return (
    (await prisma.reminderSettings.findUnique({ where: { id: 1 } })) ??
    prisma.reminderSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } })
  );
}

/** Все напоминания на сегодня по активным форумам. */
export async function collectReminders(
  today: ISODate = todayMsk(),
  daysBefore?: number,
): Promise<ReminderItem[]> {
  const n = daysBefore ?? (await getSettings()).daysBefore;
  const soon = addDays(today, n);
  const tasks = await prisma.task.findMany({
    where: { status: { not: 'DONE' }, forum: { archived: false } },
    include: { forum: true, employees: true },
    orderBy: [{ endDate: 'asc' }, { order: 'asc' }],
  });
  const out: ReminderItem[] = [];
  for (const t of tasks) {
    const s = {
      status: t.status,
      startDate: dbToISO(t.startDate),
      endDate: dbToISO(t.endDate),
      completedAt: null,
    };
    let kind: ReminderKind | null = null;
    if (isOverdue(s, today)) kind = 'overdue';
    else if (s.endDate && s.endDate >= today && s.endDate <= soon) kind = 'due_soon';
    else if (shouldStart(s, today)) kind = 'should_start';
    if (!kind) continue;
    out.push({
      kind,
      taskId: t.id,
      number: t.number,
      description: t.description,
      status: t.status,
      startDate: s.startDate,
      endDate: s.endDate,
      lag: lagDays(s, today),
      forumId: t.forumId,
      forumName: t.forum.name,
      employees: t.employees.map((e) => ({
        id: e.id,
        fullName: e.fullName,
        active: e.active,
      })),
    });
  }
  return out;
}

/** Данные для еженедельной сводки по активным форумам. */
async function weeklyData(today: ISODate): Promise<WeeklyForum[]> {
  const forums = await prisma.forum.findMany({
    where: { archived: false },
    include: {
      tasks: {
        select: { number: true, description: true, status: true, endDate: true, startDate: true },
      },
    },
    orderBy: { startDate: 'asc' },
  });
  return forums.map((f) => {
    const t = f.tasks.map((x) => ({
      ...x,
      s: {
        status: x.status,
        startDate: dbToISO(x.startDate),
        endDate: dbToISO(x.endDate),
        completedAt: null,
      },
    }));
    return {
      name: f.name,
      date: dbToISO(f.startDate)!,
      total: t.length,
      done: t.filter((x) => x.status === 'DONE').length,
      inProgress: t.filter((x) => x.status === 'IN_PROGRESS').length,
      overdue: t
        .filter((x) => isOverdue(x.s, today))
        .map((x) => ({ number: x.number, description: x.description, lag: lagDays(x.s, today) }))
        .sort((a, b) => b.lag - a.lag),
    };
  });
}

export interface RunResult {
  day: ISODate;
  reminders: number;
  telegramSent: number;
  errors: number;
  weekly: boolean;
  telegram: boolean;
  message: string;
}

const KIND_ORDER: ReminderKind[] = ['overdue', 'due_soon', 'should_start'];

function sortItems(list: ReminderItem[]) {
  list.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      (a.endDate ?? '').localeCompare(b.endDate ?? ''),
  );
}

function errText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}

function toTg(i: ReminderItem): TgItem {
  return {
    kind: i.kind,
    taskId: i.taskId,
    number: i.number,
    description: i.description,
    status: i.status,
    endDate: i.endDate,
    lag: i.lag,
    forumId: i.forumId,
    forumName: i.forumName,
    employees: i.employees.map((e) => e.fullName),
  };
}

/**
 * Ежедневный запуск напоминаний в Telegram:
 * — личные сообщения ответственным, которые подключились к боту;
 * — сводка в общий чат команды (по понедельникам — ещё и еженедельная).
 * Повторные сообщения об одной задаче в тот же день не отправляются.
 */
export async function runReminders(opts: { force?: boolean } = {}): Promise<RunResult> {
  const today = todayMsk();
  const settings = await getSettings();
  const telegram = telegramConfigured();
  const result: RunResult = {
    day: today,
    reminders: 0,
    telegramSent: 0,
    errors: 0,
    weekly: false,
    telegram,
    message: '',
  };
  // Прошедшие форумы уходят в архив и больше не попадают в напоминания
  await autoArchivePastForums();
  const items = await collectReminders(today, settings.daysBefore);
  result.reminders = items.length;
  if (!telegram) {
    result.message = 'Бот Telegram не настроен — напоминания видны только на сайте (колокольчик)';
    return result;
  }

  const sentLogs = await prisma.reminderLog.findMany({
    where: { dayKey: today, status: 'sent', channel: 'telegram' },
  });
  const sentKey = new Set(sentLogs.map((s) => `${s.taskId}:${s.employeeId}:${s.kind}`));
  const sentOnce = (kind: string) => sentLogs.some((s) => s.kind === kind);
  const url = appUrl();
  // Ссылка «Открыть сайт» — кнопкой под сообщением; если кнопку сделать нельзя — ссылкой в тексте
  const textUrl = canLinkButton(url) ? undefined : url;
  // Пояснения для итогового сообщения: почему что-то не отправилось
  const notes: string[] = [];
  let personalSent = 0;
  let personalSkipped = 0;

  // Личные сообщения
  if (settings.telegramPersonal) {
    const linked = await prisma.employee.findMany({
      where: { active: true, telegramChatId: { not: null } },
    });
    const chatOf = new Map(linked.map((e) => [e.id, e.telegramChatId!]));
    if (linked.length === 0) {
      notes.push('ни один сотрудник ещё не подключился к боту — личные сообщения некому отправить');
    }
    const byChat = new Map<string, { name: string; ids: number[]; items: ReminderItem[] }>();
    for (const it of items) {
      for (const e of it.employees) {
        const chat = chatOf.get(e.id);
        if (!chat) continue;
        if (sentKey.has(`${it.taskId}:${e.id}:${it.kind}`)) {
          personalSkipped++;
          continue;
        }
        if (!byChat.has(chat)) byChat.set(chat, { name: e.fullName, ids: [], items: [] });
        const g = byChat.get(chat)!;
        if (!g.ids.includes(e.id)) g.ids.push(e.id);
        if (!g.items.some((x) => x.taskId === it.taskId && x.kind === it.kind)) g.items.push(it);
      }
    }
    for (const [chat, g] of byChat) {
      sortItems(g.items);
      const subject = `Задач требуют внимания — ${g.items.length}`;
      let status = 'sent';
      let error: string | null = null;
      try {
        await sendTelegram(chat, formatPersonalDigest(g.name, g.items.map(toTg), textUrl), url);
        result.telegramSent++;
        personalSent++;
      } catch (e) {
        status = 'error';
        error = errText(e);
        result.errors++;
      }
      await prisma.reminderLog.createMany({
        data: g.items.flatMap((it) =>
          g.ids
            .filter((id) => it.employees.some((e) => e.id === id))
            .map((id) => ({
              dayKey: today,
              channel: 'telegram',
              kind: it.kind,
              taskId: it.taskId,
              employeeId: id,
              recipient: g.name,
              subject,
              status,
              error,
            })),
        ),
      });
    }
  }

  if (settings.telegramPersonal && personalSent === 0 && personalSkipped > 0) {
    notes.push('личные напоминания по этим задачам сегодня уже отправлялись — повтор будет завтра');
  }
  if (!settings.telegramPersonal) notes.push('личные напоминания выключены');

  // Общий чат команды
  const group = settings.telegramGroupChatId;
  if (!settings.telegramGroup) notes.push('сводка в общий чат выключена');
  else if (!group) notes.push('общий чат команды не подключён (команда /connect в чате)');
  if (settings.telegramGroup && group) {
    const recipient = `Чат «${settings.telegramGroupTitle ?? group}»`;
    const send = async (kind: string, subject: string, text: string) => {
      let status = 'sent';
      let error: string | null = null;
      try {
        await sendTelegram(group, text, url);
        result.telegramSent++;
      } catch (e) {
        status = 'error';
        error = errText(e);
        result.errors++;
      }
      await prisma.reminderLog.create({
        data: { dayKey: today, channel: 'telegram', kind, recipient, subject, status, error },
      });
    };
    if (!items.length) notes.push('задач, требующих внимания, нет — сводка в чат не нужна');
    if (items.length && (opts.force || !sentOnce('group_daily'))) {
      const sorted = [...items];
      sortItems(sorted);
      await send(
        'group_daily',
        `Ежедневная сводка — задач: ${items.length}`,
        formatGroupDaily(sorted.map(toTg), today, textUrl),
      );
    }
    const isMonday = dayOfWeek(today) === 1 || Boolean(opts.force);
    if (settings.weeklySummary && isMonday && (opts.force || !sentOnce('weekly'))) {
      await send(
        'weekly',
        'Еженедельная сводка',
        formatWeekly(await weeklyData(today), today, textUrl),
      );
      result.weekly = true;
    }
  }

  result.message =
    `Отправлено сообщений в Telegram: ${result.telegramSent}` +
    (result.errors ? `, ошибок: ${result.errors} (подробности — в журнале ниже)` : '') +
    (notes.length ? `. ${notes.map((n) => n[0].toUpperCase() + n.slice(1)).join('. ')}.` : '.');
  return result;
}
