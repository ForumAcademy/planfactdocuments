import 'server-only';
import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';
import { addDays, dayOfWeek, dbToISO, formatDate, todayMsk, type ISODate } from '@/lib/dates';
import { isOverdue, lagDays, shouldStart, STATUS_LABEL, type TaskStatusCode } from '@/lib/status';

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
  employees: { id: number; fullName: string; email: string | null; active: boolean }[];
}

export async function getSettings() {
  return prisma.reminderSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
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
        email: e.email,
        active: e.active,
      })),
    });
  }
  return out;
}

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function transport() {
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function appUrl(): string {
  return (process.env.APP_URL || '').replace(/\/$/, '');
}

function digestHtml(name: string, items: ReminderItem[]): string {
  const url = appUrl();
  const rows = items
    .map(
      (i) => `<tr>
<td style="padding:6px 8px;border-bottom:1px solid #E3E7EF;color:${i.kind === 'overdue' ? '#D93838' : i.kind === 'due_soon' ? '#0A0A9F' : '#D93838'};white-space:nowrap">${KIND_LABEL[i.kind]}${i.lag ? ` (+${i.lag} дн.)` : ''}</td>
<td style="padding:6px 8px;border-bottom:1px solid #E3E7EF">${esc(i.forumName)}</td>
<td style="padding:6px 8px;border-bottom:1px solid #E3E7EF">${url ? `<a href="${url}/forums/${i.forumId}/tasks?q=${encodeURIComponent(i.description.slice(0, 40))}" style="color:#111">` : ''}№${i.number}. ${esc(i.description)}${url ? '</a>' : ''}</td>
<td style="padding:6px 8px;border-bottom:1px solid #E3E7EF;white-space:nowrap">${formatDate(i.endDate)}</td>
<td style="padding:6px 8px;border-bottom:1px solid #E3E7EF;white-space:nowrap">${STATUS_LABEL[i.status]}</td>
</tr>`,
    )
    .join('');
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
<div style="background:#060670;color:#fff;padding:12px 16px;font-size:18px;font-weight:bold">Статус форумы</div>
<p>Здравствуйте, ${esc(name)}!</p>
<p>Ваши задачи, требующие внимания:</p>
<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#F4F6FA;text-align:left">
<th style="padding:6px 8px">Что</th><th style="padding:6px 8px">Форум</th><th style="padding:6px 8px">Задача</th><th style="padding:6px 8px">Срок</th><th style="padding:6px 8px">Статус</th>
</tr></thead><tbody>${rows}</tbody></table>
${url ? `<p><a href="${url}" style="color:#0A0A9F">Открыть «Статус форумы»</a></p>` : ''}
<p style="color:#8A94A6;font-size:12px">Письмо отправлено автоматически.</p></div>`;
}

async function weeklyHtml(today: ISODate): Promise<string> {
  const forums = await prisma.forum.findMany({
    where: { archived: false },
    include: {
      tasks: {
        select: {
          id: true,
          number: true,
          description: true,
          status: true,
          endDate: true,
          startDate: true,
        },
      },
    },
    orderBy: { startDate: 'asc' },
  });
  const blocks = forums.map((f) => {
    const t = f.tasks.map((x) => ({
      ...x,
      s: {
        status: x.status,
        startDate: dbToISO(x.startDate),
        endDate: dbToISO(x.endDate),
        completedAt: null,
      },
    }));
    const done = t.filter((x) => x.status === 'DONE').length;
    const inWork = t.filter((x) => x.status === 'IN_PROGRESS').length;
    const overdue = t
      .filter((x) => isOverdue(x.s, today))
      .sort((a, b) => lagDays(b.s, today) - lagDays(a.s, today));
    const top = overdue
      .slice(0, 10)
      .map(
        (x) =>
          `<li>№${x.number}. ${esc(x.description)} — <b style="color:#D93838">+${lagDays(x.s, today)} дн.</b></li>`,
      )
      .join('');
    return `<h3 style="margin:16px 0 4px">${esc(f.name)} (${formatDate(dbToISO(f.startDate))})</h3>
<p style="margin:0">Всего задач: ${t.length}; выполнено: <b>${done}</b>; в работе: <b>${inWork}</b>; просрочено: <b style="color:#D93838">${overdue.length}</b></p>
${top ? `<p style="margin:6px 0 0">Топ-10 просрочек:</p><ol>${top}</ol>` : ''}`;
  });
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
<div style="background:#060670;color:#fff;padding:12px 16px;font-size:18px;font-weight:bold">Статус форумы — сводка на ${formatDate(today)}</div>
${blocks.join('') || '<p>Активных форумов нет.</p>'}
${appUrl() ? `<p><a href="${appUrl()}" style="color:#0A0A9F">Открыть «Статус форумы»</a></p>` : ''}</div>`;
}

export interface RunResult {
  day: ISODate;
  reminders: number;
  emailsSent: number;
  emailsSkipped: number;
  errors: number;
  weekly: boolean;
  smtp: boolean;
  message: string;
}

/**
 * Ежедневный запуск: по одному письму-дайджесту на ответственного,
 * повторные письма об одной задаче в тот же день не отправляются.
 */
export async function runReminders(opts: { force?: boolean } = {}): Promise<RunResult> {
  const today = todayMsk();
  const settings = await getSettings();
  const smtp = smtpConfigured();
  const result: RunResult = {
    day: today,
    reminders: 0,
    emailsSent: 0,
    emailsSkipped: 0,
    errors: 0,
    weekly: false,
    smtp,
    message: '',
  };
  if (!settings.enabled && !opts.force) {
    result.message = 'Напоминания выключены в настройках';
    return result;
  }
  const items = await collectReminders(today, settings.daysBefore);
  result.reminders = items.length;
  if (!smtp) {
    result.message = 'SMTP не настроен — напоминания доступны только на сайте (колокольчик)';
    return result;
  }

  // Уже отправленное сегодня
  const sent = await prisma.reminderLog.findMany({ where: { dayKey: today, status: 'sent' } });
  const sentKey = new Set(sent.map((s) => `${s.taskId}:${s.employeeId}:${s.kind}`));

  // Группируем по сотруднику
  const byEmployee = new Map<number, { name: string; email: string; items: ReminderItem[] }>();
  for (const it of items) {
    for (const e of it.employees) {
      if (!e.active || !e.email) continue;
      if (sentKey.has(`${it.taskId}:${e.id}:${it.kind}`)) continue;
      if (!byEmployee.has(e.id))
        byEmployee.set(e.id, { name: e.fullName, email: e.email, items: [] });
      byEmployee.get(e.id)!.items.push(it);
    }
  }

  const tx = transport();
  const from = `"Статус форумы" <${process.env.SMTP_USER}>`;
  let budget = Math.max(0, settings.maxEmailsPerRun);

  // Одному адресу — одно письмо, даже если он указан у нескольких сотрудников
  const byEmail = new Map<string, { name: string; ids: number[]; items: ReminderItem[] }>();
  for (const [id, v] of byEmployee) {
    const key = v.email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, { name: v.name, ids: [], items: [] });
    const g = byEmail.get(key)!;
    g.ids.push(id);
    for (const it of v.items)
      if (!g.items.some((x) => x.taskId === it.taskId && x.kind === it.kind)) g.items.push(it);
  }

  for (const [email, g] of byEmail) {
    if (budget <= 0) {
      result.emailsSkipped++;
      continue;
    }
    const order: ReminderKind[] = ['overdue', 'due_soon', 'should_start'];
    g.items.sort(
      (a, b) =>
        order.indexOf(a.kind) - order.indexOf(b.kind) ||
        (a.endDate ?? '').localeCompare(b.endDate ?? ''),
    );
    const subject = `Статус форумы: задач требуют внимания — ${g.items.length}`;
    let status = 'sent';
    let error: string | null = null;
    try {
      await tx.sendMail({ from, to: email, subject, html: digestHtml(g.name, g.items) });
      result.emailsSent++;
      budget--;
    } catch (e) {
      status = 'error';
      error = e instanceof Error ? e.message.slice(0, 500) : String(e);
      result.errors++;
    }
    await prisma.reminderLog.createMany({
      data: g.items.flatMap((it) =>
        g.ids
          .filter((id) => it.employees.some((e) => e.id === id))
          .map((id) => ({
            dayKey: today,
            kind: it.kind,
            taskId: it.taskId,
            employeeId: id,
            recipient: email,
            subject,
            status,
            error,
          })),
      ),
    });
  }

  // Еженедельная сводка руководителю — по понедельникам
  const managers = settings.managerEmails
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
  if (settings.weeklySummary && managers.length && (dayOfWeek(today) === 1 || opts.force)) {
    const already = await prisma.reminderLog.findFirst({
      where: { dayKey: today, kind: 'weekly', status: 'sent' },
    });
    if (!already && budget > 0) {
      const subject = `Статус форумы: еженедельная сводка на ${formatDate(today)}`;
      let status = 'sent';
      let error: string | null = null;
      try {
        await tx.sendMail({
          from,
          to: managers.join(', '),
          subject,
          html: await weeklyHtml(today),
        });
        result.emailsSent++;
        result.weekly = true;
      } catch (e) {
        status = 'error';
        error = e instanceof Error ? e.message.slice(0, 500) : String(e);
        result.errors++;
      }
      await prisma.reminderLog.create({
        data: {
          dayKey: today,
          kind: 'weekly',
          recipient: managers.join(', '),
          subject,
          status,
          error,
        },
      });
    }
  }

  result.message = `Отправлено писем: ${result.emailsSent}${result.emailsSkipped ? `, отложено из-за лимита: ${result.emailsSkipped}` : ''}${result.errors ? `, ошибок: ${result.errors}` : ''}`;
  return result;
}
