/**
 * Работа с календарными датами без времени.
 * Внутри приложения дата — строка ISO «ГГГГ-ММ-ДД» (ISODate).
 * В БД хранится как DATE (в JS — Date на полночь UTC).
 */
export type ISODate = string;

export const TIMEZONE = 'Europe/Moscow';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && ISO_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

function toUTC(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** Сегодняшняя дата по Москве. */
export function todayMsk(now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA даёт ГГГГ-ММ-ДД
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

export function addWeeks(d: ISODate, n: number): ISODate {
  return addDays(d, n * 7);
}

/** Добавление месяцев с «прилипанием» к концу месяца (31.05 − 1 мес = 30.04). */
export function addMonths(d: ISODate, n: number): ISODate {
  const x = toUTC(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, lastDay));
  return fromUTC(x);
}

export function isWeekend(d: ISODate): boolean {
  const wd = toUTC(d).getUTCDay();
  return wd === 0 || wd === 6;
}

/** Добавляет N рабочих дней (пн–пт), не считая стартовую дату. */
export function addWorkdays(d: ISODate, n: number): ISODate {
  let cur = d;
  let left = n;
  const step = n >= 0 ? 1 : -1;
  while (left !== 0) {
    cur = addDays(cur, step);
    if (!isWeekend(cur)) left -= step;
  }
  return cur;
}

/** Разница в днях b − a. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** «2026-09-23» → «23.09.2026» */
export function formatDate(d: ISODate | null | undefined): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

/** «23.09.2026» → «2026-09-23» */
export function parseRuDate(s: string): ISODate | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
  if (!m) return isISODate(s.trim()) ? s.trim() : null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isISODate(iso) ? iso : null;
}

/** Date (полночь UTC из БД) → ISODate */
export function dbToISO(d: Date | null | undefined): ISODate | null {
  return d ? fromUTC(d) : null;
}

/** ISODate → Date для записи в поле DATE */
export function isoToDb(d: ISODate): Date;
export function isoToDb(d: ISODate | null | undefined): Date | null;
export function isoToDb(d: ISODate | null | undefined): Date | null {
  return d ? toUTC(d) : null;
}

/** Понедельник недели, в которую входит дата. */
export function startOfWeek(d: ISODate): ISODate {
  const wd = toUTC(d).getUTCDay();
  return addDays(d, wd === 0 ? -6 : 1 - wd);
}

export function dayOfWeek(d: ISODate): number {
  return toUTC(d).getUTCDay();
}

const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];
const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

export function monthName(d: ISODate, short = false): string {
  const m = Number(d.slice(5, 7)) - 1;
  return short ? MONTHS_SHORT[m] : MONTHS[m];
}
