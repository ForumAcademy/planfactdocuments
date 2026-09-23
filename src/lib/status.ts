import { diffDays, type ISODate } from './dates';

export const TASK_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE'] as const;
export type TaskStatusCode = (typeof TASK_STATUSES)[number];

export const STATUS_LABEL: Record<TaskStatusCode, string> = {
  NOT_STARTED: 'Не начато',
  IN_PROGRESS: 'В работе',
  DONE: 'Выполнено',
};

export function statusFromLabel(label: string | null | undefined): TaskStatusCode | null {
  const s = (label ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.startsWith('не нач')) return 'NOT_STARTED';
  if (s.startsWith('в работ') || s === 'в процессе') return 'IN_PROGRESS';
  if (s.startsWith('выполн') || s === 'готово' || s === 'сделано') return 'DONE';
  return null;
}

export interface StatusInput {
  status: TaskStatusCode;
  startDate: ISODate | null;
  endDate: ISODate | null;
  completedAt: ISODate | null;
}

/** Цвет для отображения: серый, зелёный (в срок), красный (просрочено), синий (выполнено). */
export type Tone = 'gray' | 'green' | 'red' | 'blue';

/** Задача не выполнена, а срок прошёл. */
export function isOverdue(t: StatusInput, today: ISODate): boolean {
  return t.status !== 'DONE' && t.endDate !== null && t.endDate < today;
}

/** Отставание в днях (+N) для невыполненной задачи с прошедшим сроком, иначе 0. */
export function lagDays(t: StatusInput, today: ISODate): number {
  return isOverdue(t, today) && t.endDate ? diffDays(t.endDate, today) : 0;
}

/** На сколько дней позже срока выполнена задача (0 — в срок). */
export function doneLateDays(t: StatusInput): number {
  if (t.status !== 'DONE' || !t.completedAt || !t.endDate) return 0;
  return Math.max(0, diffDays(t.endDate, t.completedAt));
}

/** «Пора начинать»: не начато, дата начала наступила. */
export function shouldStart(t: StatusInput, today: ISODate): boolean {
  return t.status === 'NOT_STARTED' && t.startDate !== null && t.startDate <= today;
}

/** Цвет бейджа статуса. */
export function badgeTone(t: StatusInput, today: ISODate): Tone {
  if (t.status === 'DONE') return 'blue';
  if (t.status === 'IN_PROGRESS') return isOverdue(t, today) ? 'red' : 'green';
  return 'gray';
}

/** Цвет полосы на диаграмме Ганта: просроченная невыполненная задача — красная. */
export function barTone(t: StatusInput, today: ISODate): Tone {
  if (t.status === 'DONE') return 'blue';
  if (isOverdue(t, today)) return 'red';
  if (t.status === 'IN_PROGRESS') return 'green';
  return 'gray';
}

export const TONE_COLOR: Record<Tone, string> = {
  gray: '#8A94A6',
  green: '#1E9E5A',
  red: '#D93838',
  blue: '#1F4E9E',
};

export interface StatusCounts {
  total: number;
  notStarted: number;
  inProgress: number;
  done: number;
  overdue: number;
}

export function countStatuses(tasks: StatusInput[], today: ISODate): StatusCounts {
  const c: StatusCounts = {
    total: tasks.length,
    notStarted: 0,
    inProgress: 0,
    done: 0,
    overdue: 0,
  };
  for (const t of tasks) {
    if (t.status === 'DONE') c.done++;
    else if (t.status === 'IN_PROGRESS') c.inProgress++;
    else c.notStarted++;
    if (isOverdue(t, today)) c.overdue++;
  }
  return c;
}

export function progressPercent(c: StatusCounts): number {
  return c.total ? Math.round((c.done / c.total) * 100) : 0;
}
