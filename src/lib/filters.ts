import { addDays, startOfWeek, type ISODate } from './dates';
import { isOverdue, lagDays, TASK_STATUSES, type TaskStatusCode } from './status';
import type { DictsDTO, TaskDTO } from './types';

export type DueFilter = 'overdue' | 'week' | '14d' | 'nodate';
export type SortKey =
  'number' | 'stage' | 'block' | 'end' | 'start' | 'role' | 'employee' | 'status' | 'lag';

export interface Filters {
  stage: number[];
  block: number[];
  role: number[];
  emp: number[];
  status: TaskStatusCode[];
  due: DueFilter | null;
  from: ISODate | null;
  to: ISODate | null;
  q: string;
  sort: SortKey | null;
  dir: 'asc' | 'desc';
}

export const EMPTY_FILTERS: Filters = {
  stage: [],
  block: [],
  role: [],
  emp: [],
  status: [],
  due: null,
  from: null,
  to: null,
  q: '',
  sort: null,
  dir: 'asc',
};

const DUE: DueFilter[] = ['overdue', 'week', '14d', 'nodate'];
const SORTS: SortKey[] = [
  'number',
  'stage',
  'block',
  'end',
  'start',
  'role',
  'employee',
  'status',
  'lag',
];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function ids(v: string | null): number[] {
  return v
    ? v
        .split(',')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0)
    : [];
}

/** Состояние фильтров хранится в URL. */
export function parseFilters(sp: URLSearchParams): Filters {
  const status = (sp.get('status') ?? '')
    .split(',')
    .filter((s): s is TaskStatusCode => (TASK_STATUSES as readonly string[]).includes(s));
  const due = sp.get('due');
  const sort = sp.get('sort');
  const from = sp.get('from');
  const to = sp.get('to');
  return {
    stage: ids(sp.get('stage')),
    block: ids(sp.get('block')),
    role: ids(sp.get('role')),
    emp: ids(sp.get('emp')),
    status,
    due: DUE.includes(due as DueFilter) ? (due as DueFilter) : null,
    from: from && ISO.test(from) ? from : null,
    to: to && ISO.test(to) ? to : null,
    q: sp.get('q') ?? '',
    sort: SORTS.includes(sort as SortKey) ? (sort as SortKey) : null,
    dir: sp.get('dir') === 'desc' ? 'desc' : 'asc',
  };
}

export function filtersToQuery(f: Filters, base?: URLSearchParams): string {
  const sp = new URLSearchParams(base);
  const set = (k: string, v: string | null) => (v ? sp.set(k, v) : sp.delete(k));
  set('stage', f.stage.join(',') || null);
  set('block', f.block.join(',') || null);
  set('role', f.role.join(',') || null);
  set('emp', f.emp.join(',') || null);
  set('status', f.status.join(',') || null);
  set('due', f.due);
  set('from', f.from);
  set('to', f.to);
  set('q', f.q.trim() || null);
  set('sort', f.sort);
  set('dir', f.sort && f.dir === 'desc' ? 'desc' : null);
  return sp.toString();
}

export function hasActiveFilters(f: Filters): boolean {
  return Boolean(
    f.stage.length ||
    f.block.length ||
    f.role.length ||
    f.emp.length ||
    f.status.length ||
    f.due ||
    f.from ||
    f.to ||
    f.q.trim(),
  );
}

export function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').trim();
}

export function matchesDue(t: TaskDTO, due: DueFilter, today: ISODate): boolean {
  switch (due) {
    case 'overdue':
      return isOverdue(t, today);
    case 'week': {
      const mon = startOfWeek(today);
      return t.endDate !== null && t.endDate >= mon && t.endDate <= addDays(mon, 6);
    }
    case '14d':
      return t.endDate !== null && t.endDate >= today && t.endDate <= addDays(today, 14);
    case 'nodate':
      return t.endDate === null || t.needsClarification;
  }
}

/** Применяет фильтры (без сортировки). */
export function filterTasks(tasks: TaskDTO[], f: Filters, today: ISODate): TaskDTO[] {
  const q = normalizeSearch(f.q);
  const stage = new Set(f.stage);
  const block = new Set(f.block);
  const role = new Set(f.role);
  const emp = new Set(f.emp);
  const status = new Set(f.status);
  return tasks.filter((t) => {
    if (stage.size && !(t.stageId && stage.has(t.stageId))) return false;
    if (block.size && !(t.blockId && block.has(t.blockId))) return false;
    if (role.size && !t.roleIds.some((r) => role.has(r))) return false;
    if (emp.size && !t.employeeIds.some((e) => emp.has(e))) return false;
    if (status.size && !status.has(t.status)) return false;
    if (f.due && !matchesDue(t, f.due, today)) return false;
    if (f.from && !(t.endDate && t.endDate >= f.from)) return false;
    if (f.to && !(t.endDate && t.endDate <= f.to)) return false;
    if (q) {
      const hay = normalizeSearch(`${t.description} ${t.comment ?? ''}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const STATUS_ORDER: Record<TaskStatusCode, number> = { NOT_STARTED: 0, IN_PROGRESS: 1, DONE: 2 };

export function sortTasks(
  tasks: TaskDTO[],
  sort: SortKey | null,
  dir: 'asc' | 'desc',
  dicts: DictsDTO,
  today: ISODate,
): TaskDTO[] {
  const list = [...tasks];
  const byOrder = (a: TaskDTO, b: TaskDTO) => a.order - b.order || a.id - b.id;
  if (!sort) return list.sort(byOrder);
  const stageOrder = new Map(dicts.stages.map((s) => [s.id, s.order]));
  const blockName = new Map(dicts.blocks.map((b) => [b.id, b.name]));
  const roleName = new Map(dicts.roles.map((r) => [r.id, r.name]));
  const empName = new Map(dicts.employees.map((e) => [e.id, e.fullName]));
  const key = (t: TaskDTO): string | number | null => {
    switch (sort) {
      case 'number':
        return t.number;
      case 'stage':
        return t.stageId ? (stageOrder.get(t.stageId) ?? 999) : null;
      case 'block':
        return t.blockId ? (blockName.get(t.blockId) ?? null) : null;
      case 'end':
        return t.endDate;
      case 'start':
        return t.startDate;
      case 'role':
        return t.roleIds.map((r) => roleName.get(r)).sort()[0] ?? null;
      case 'employee':
        return t.employeeIds.map((e) => empName.get(e)).sort()[0] ?? null;
      case 'status':
        return STATUS_ORDER[t.status];
      case 'lag':
        return lagDays(t, today);
    }
  };
  const m = dir === 'asc' ? 1 : -1;
  return list.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) return byOrder(a, b);
    if (ka === null) return 1;
    if (kb === null) return -1;
    const c =
      typeof ka === 'number' && typeof kb === 'number'
        ? ka - kb
        : String(ka).localeCompare(String(kb), 'ru');
    return c * m || byOrder(a, b);
  });
}
