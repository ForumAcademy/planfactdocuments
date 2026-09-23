import { describe, expect, it } from 'vitest';
import {
  badgeTone,
  barTone,
  countStatuses,
  doneLateDays,
  lagDays,
  progressPercent,
  shouldStart,
  statusFromLabel,
  type StatusInput,
} from '@/lib/status';

const today = '2026-09-23';
const t = (p: Partial<StatusInput>): StatusInput => ({
  status: 'NOT_STARTED',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  completedAt: null,
  ...p,
});

describe('цвет статуса', () => {
  it('«В работе» в срок — зелёный, с просрочкой — красный', () => {
    expect(badgeTone(t({ status: 'IN_PROGRESS' }), today)).toBe('green');
    expect(badgeTone(t({ status: 'IN_PROGRESS', endDate: '2026-09-23' }), today)).toBe('green');
    expect(badgeTone(t({ status: 'IN_PROGRESS', endDate: '2026-09-22' }), today)).toBe('red');
  });
  it('«Не начато» — серый бейдж, «Выполнено» — синий', () => {
    expect(badgeTone(t({ endDate: '2026-09-01' }), today)).toBe('gray');
    expect(badgeTone(t({ status: 'DONE', endDate: '2026-09-01' }), today)).toBe('blue');
  });
  it('полоса Ганта: не выполнено после срока — красная', () => {
    expect(barTone(t({ endDate: '2026-09-01' }), today)).toBe('red');
    expect(barTone(t({}), today)).toBe('gray');
    expect(barTone(t({ status: 'IN_PROGRESS' }), today)).toBe('green');
    expect(barTone(t({ status: 'DONE', endDate: '2026-09-01' }), today)).toBe('blue');
  });
});

describe('отставание', () => {
  it('+N дней для невыполненных с прошедшим сроком', () => {
    expect(lagDays(t({ endDate: '2026-09-20' }), today)).toBe(3);
    expect(lagDays(t({ status: 'IN_PROGRESS', endDate: '2026-09-22' }), today)).toBe(1);
    expect(lagDays(t({ endDate: '2026-09-23' }), today)).toBe(0);
    expect(lagDays(t({ status: 'DONE', endDate: '2026-09-01' }), today)).toBe(0);
    expect(lagDays(t({ endDate: null }), today)).toBe(0);
  });
  it('выполнено с опозданием', () => {
    expect(
      doneLateDays(t({ status: 'DONE', endDate: '2026-09-10', completedAt: '2026-09-15' })),
    ).toBe(5);
    expect(
      doneLateDays(t({ status: 'DONE', endDate: '2026-09-10', completedAt: '2026-09-09' })),
    ).toBe(0);
  });
  it('пора начинать', () => {
    expect(shouldStart(t({ startDate: '2026-09-23' }), today)).toBe(true);
    expect(shouldStart(t({ startDate: '2026-09-24' }), today)).toBe(false);
    expect(shouldStart(t({ status: 'IN_PROGRESS' }), today)).toBe(false);
  });
});

describe('счётчики', () => {
  it('считает статусы, просрочки и прогресс', () => {
    const c = countStatuses(
      [
        t({}),
        t({ status: 'IN_PROGRESS', endDate: '2026-09-01' }),
        t({ status: 'DONE' }),
        t({ endDate: '2026-09-02' }),
      ],
      today,
    );
    expect(c).toEqual({ total: 4, notStarted: 2, inProgress: 1, done: 1, overdue: 2 });
    expect(progressPercent(c)).toBe(25);
  });
  it('статус из текста', () => {
    expect(statusFromLabel('Не начато')).toBe('NOT_STARTED');
    expect(statusFromLabel(' в работе ')).toBe('IN_PROGRESS');
    expect(statusFromLabel('Выполнено')).toBe('DONE');
    expect(statusFromLabel('???')).toBeNull();
  });
});
