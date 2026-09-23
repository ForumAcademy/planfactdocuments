/** Тексты сообщений бота Telegram (HTML-разметка Telegram). Без обращений к сети — удобно тестировать. */
import { formatDate, type ISODate } from './dates';
import { STATUS_LABEL, type TaskStatusCode } from './status';

export type TgKind = 'overdue' | 'due_soon' | 'should_start';

export interface TgItem {
  kind: TgKind;
  taskId: number;
  number: number;
  description: string;
  status: TaskStatusCode;
  endDate: ISODate | null;
  lag: number;
  forumId: number;
  forumName: string;
  employees: string[];
}

const KIND_TITLE: Record<TgKind, string> = {
  overdue: '🔴 Просрочено',
  due_soon: '🔵 Скоро срок',
  should_start: '🔴 Пора начинать',
};
const ORDER: TgKind[] = ['overdue', 'due_soon', 'should_start'];

export const tgEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** «@Ivan», «https://t.me/ivan», «ivan» → «ivan» */
export function normalizeTgUsername(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = s
    .trim()
    .replace(/^https?:\/\/(www\.)?t(elegram)?\.me\//i, '')
    .replace(/^@/, '')
    .toLowerCase();
  return /^[a-z0-9_]{3,32}$/.test(v) ? v : null;
}

function line(i: TgItem, withPeople: boolean): string {
  const lag = i.lag > 0 ? ` <b>+${i.lag} дн.</b>` : '';
  const who = withPeople && i.employees.length ? ` — ${tgEscape(i.employees.join(', '))}` : '';
  return `• №${i.number}. ${tgEscape(i.description)} (срок ${formatDate(i.endDate) || '—'}${lag}; ${STATUS_LABEL[i.status].toLowerCase()})${who}`;
}

function grouped(items: TgItem[], withPeople: boolean, perKindLimit = 50): string[] {
  const out: string[] = [];
  for (const kind of ORDER) {
    const list = items.filter((i) => i.kind === kind);
    if (!list.length) continue;
    out.push('', `<b>${KIND_TITLE[kind]} (${list.length})</b>`);
    const byForum = new Map<string, TgItem[]>();
    for (const i of list) {
      if (!byForum.has(i.forumName)) byForum.set(i.forumName, []);
      byForum.get(i.forumName)!.push(i);
    }
    let shown = 0;
    for (const [forum, rows] of byForum) {
      out.push(`<i>${tgEscape(forum)}</i>`);
      for (const r of rows) {
        if (shown >= perKindLimit) break;
        out.push(line(r, withPeople));
        shown++;
      }
    }
    if (list.length > shown) out.push(`…и ещё ${list.length - shown}`);
  }
  return out;
}

/** Личный дайджест ответственному. */
export function formatPersonalDigest(name: string, items: TgItem[], appUrl?: string): string {
  return [
    `<b>Статус форумов</b>`,
    `${tgEscape(name)}, ваши задачи, требующие внимания:`,
    ...grouped(items, false),
    ...(appUrl ? ['', `<a href="${appUrl}">Открыть сайт</a>`] : []),
  ].join('\n');
}

/** Ежедневная сводка в общий чат команды. */
export function formatGroupDaily(items: TgItem[], today: ISODate, appUrl?: string): string {
  return [
    `<b>Статус форумов — сводка на ${formatDate(today)}</b>`,
    ...grouped(items, true, 25),
    ...(appUrl ? ['', `<a href="${appUrl}">Открыть сайт</a>`] : []),
  ].join('\n');
}

export interface WeeklyForum {
  name: string;
  date: ISODate;
  total: number;
  done: number;
  inProgress: number;
  overdue: { number: number; description: string; lag: number }[];
}

/** Еженедельная сводка по форумам. */
export function formatWeekly(forums: WeeklyForum[], today: ISODate, appUrl?: string): string {
  const parts = [`<b>Статус форумов — еженедельная сводка на ${formatDate(today)}</b>`];
  if (!forums.length) parts.push('', 'Активных форумов нет.');
  for (const f of forums) {
    parts.push(
      '',
      `<b>${tgEscape(f.name)}</b> (${formatDate(f.date)})`,
      `Всего: ${f.total} · 🟢 выполнено: ${f.done} · 🔵 в работе: ${f.inProgress} · 🔴 просрочено: ${f.overdue.length}`,
    );
    const top = [...f.overdue].sort((a, b) => b.lag - a.lag).slice(0, 10);
    if (top.length) {
      parts.push('Топ-10 просрочек:');
      top.forEach((o, k) =>
        parts.push(`${k + 1}. №${o.number}. ${tgEscape(o.description)} — <b>+${o.lag} дн.</b>`),
      );
    }
  }
  if (appUrl) parts.push('', `<a href="${appUrl}">Открыть сайт</a>`);
  return parts.join('\n');
}

/** Делит длинный текст на части ≤ limit символов по границам строк (лимит Telegram — 4096). */
export function splitMessage(text: string, limit = 3900): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let cur = '';
  for (const ln of text.split('\n')) {
    const piece = ln.length > limit ? ln.slice(0, limit - 1) + '…' : ln;
    if (cur && cur.length + 1 + piece.length > limit) {
      parts.push(cur);
      cur = piece;
    } else cur = cur ? `${cur}\n${piece}` : piece;
  }
  if (cur) parts.push(cur);
  return parts;
}
