import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, filterTasks, filtersToQuery, parseFilters, sortTasks } from '@/lib/filters';
import type { DictsDTO, TaskDTO } from '@/lib/types';

const today = '2026-09-23'; // среда
const base: TaskDTO = {
  id: 1,
  number: 1,
  stageId: 1,
  blockId: 1,
  description: 'Задача',
  termText: '',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  needsClarification: false,
  datesManual: false,
  status: 'NOT_STARTED',
  completedAt: null,
  comment: null,
  order: 1,
  roleIds: [1],
  employeeIds: [],
};
const t = (p: Partial<TaskDTO>): TaskDTO => ({ ...base, ...p });
const tasks = [
  t({ id: 1, number: 3, order: 3, description: 'Согласовать Площадку', endDate: '2026-09-20' }),
  t({
    id: 2,
    number: 1,
    order: 1,
    stageId: 2,
    status: 'IN_PROGRESS',
    endDate: '2026-09-25',
    comment: 'ЖДЁМ ответа',
    employeeIds: [7],
  }),
  t({
    id: 3,
    number: 2,
    order: 2,
    blockId: 2,
    status: 'DONE',
    endDate: '2026-10-30',
    roleIds: [2, 3],
  }),
  t({ id: 4, number: 4, order: 4, needsClarification: true, endDate: '2026-11-30' }),
];
const dicts: DictsDTO = {
  stages: [
    { id: 1, name: '1', order: 1, color: '#000', archived: false },
    { id: 2, name: '2', order: 2, color: '#000', archived: false },
  ],
  blocks: [
    { id: 1, name: 'Б', order: 1, archived: false },
    { id: 2, name: 'А', order: 2, archived: false },
  ],
  roles: [],
  employees: [],
};

describe('фильтры', () => {
  it('поиск по описанию и комментарию без учёта регистра', () => {
    expect(filterTasks(tasks, { ...EMPTY_FILTERS, q: 'площадку' }, today).map((x) => x.id)).toEqual(
      [1],
    );
    expect(filterTasks(tasks, { ...EMPTY_FILTERS, q: 'ждем' }, today).map((x) => x.id)).toEqual([
      2,
    ]);
  });
  it('этап, блок, роль, ответственный, статус', () => {
    expect(filterTasks(tasks, { ...EMPTY_FILTERS, stage: [2] }, today).map((x) => x.id)).toEqual([
      2,
    ]);
    expect(filterTasks(tasks, { ...EMPTY_FILTERS, block: [2] }, today).map((x) => x.id)).toEqual([
      3,
    ]);
    expect(filterTasks(tasks, { ...EMPTY_FILTERS, role: [3] }, today).map((x) => x.id)).toEqual([
      3,
    ]);
    expect(filterTasks(tasks, { ...EMPTY_FILTERS, emp: [7] }, today).map((x) => x.id)).toEqual([2]);
    expect(
      filterTasks(tasks, { ...EMPTY_FILTERS, status: ['DONE', 'IN_PROGRESS'] }, today).map(
        (x) => x.id,
      ),
    ).toEqual([2, 3]);
  });
  it('сроки: просрочено, неделя, 14 дней, без даты, диапазон', () => {
    expect(
      filterTasks(tasks, { ...EMPTY_FILTERS, due: 'overdue' }, today).map((x) => x.id),
    ).toEqual([1]);
    expect(filterTasks(tasks, { ...EMPTY_FILTERS, due: 'week' }, today).map((x) => x.id)).toEqual([
      2,
    ]);
    expect(filterTasks(tasks, { ...EMPTY_FILTERS, due: '14d' }, today).map((x) => x.id)).toEqual([
      2,
    ]);
    expect(filterTasks(tasks, { ...EMPTY_FILTERS, due: 'nodate' }, today).map((x) => x.id)).toEqual(
      [4],
    );
    expect(
      filterTasks(tasks, { ...EMPTY_FILTERS, from: '2026-09-21', to: '2026-10-31' }, today).map(
        (x) => x.id,
      ),
    ).toEqual([2, 3]);
  });
  it('комбинация фильтров', () => {
    expect(
      filterTasks(
        tasks,
        { ...EMPTY_FILTERS, stage: [1], status: ['NOT_STARTED'], due: 'overdue' },
        today,
      ).map((x) => x.id),
    ).toEqual([1]);
  });
  it('URL туда и обратно', () => {
    const f = {
      ...EMPTY_FILTERS,
      stage: [1, 2],
      status: ['DONE' as const],
      due: 'week' as const,
      q: 'тест',
      sort: 'end' as const,
      dir: 'desc' as const,
    };
    expect(parseFilters(new URLSearchParams(filtersToQuery(f)))).toEqual(f);
  });
  it('сортировка', () => {
    expect(sortTasks(tasks, null, 'asc', dicts, today).map((x) => x.id)).toEqual([2, 3, 1, 4]);
    expect(sortTasks(tasks, 'end', 'desc', dicts, today).map((x) => x.id)).toEqual([4, 3, 2, 1]);
    expect(sortTasks(tasks, 'block', 'asc', dicts, today).map((x) => x.id)[0]).toBe(3);
  });
});
