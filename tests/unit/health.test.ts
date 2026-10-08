import { describe, expect, it } from 'vitest';
import { expenseHealth, incomeHealth, taskHealth } from '@/lib/health';
import { incomeItems } from '@/lib/income';
import type { StatusInput } from '@/lib/status';

const task = (p: Partial<StatusInput>): StatusInput => ({
  status: 'NOT_STARTED',
  startDate: null,
  endDate: null,
  completedAt: null,
  ...p,
});

describe('линия задач', () => {
  const today = '2026-10-07';
  it('зелёная, когда нет просрочек и всё начато вовремя', () => {
    const l = taskHealth(
      [task({ status: 'DONE', endDate: '2026-10-01' }), task({ startDate: '2026-11-01' })],
      today,
    );
    expect(l.health).toBe('green');
    expect(l.fill).toBe(0.5);
  });
  it('жёлтая, когда пора начинать', () => {
    expect(
      taskHealth([task({ startDate: '2026-10-01', endDate: '2026-11-01' })], today).health,
    ).toBe('yellow');
  });
  it('красная при просрочке', () => {
    const l = taskHealth([task({ status: 'IN_PROGRESS', endDate: '2026-10-06' })], today);
    expect(l.health).toBe('red');
    expect(l.reasons[0]).toContain('просрочено: 1 задача');
  });
});

describe('линия расходов', () => {
  it('зелёная в пределах лимита', () => {
    expect(expenseHealth([{ cost: 100, costFact: 50 }], 200).health).toBe('green');
  });
  it('жёлтая без лимита и при факте больше плана задачи', () => {
    expect(expenseHealth([{ cost: 100, costFact: 50 }], null).health).toBe('yellow');
    expect(expenseHealth([{ cost: 100, costFact: 120 }], 200).health).toBe('yellow');
  });
  it('красная, когда факт больше предельных', () => {
    expect(expenseHealth([{ cost: 100, costFact: 250 }], 200).health).toBe('red');
  });
});

describe('линия доходов', () => {
  const base = {
    config: { midDate: null, finalDate: null, margin: 30, variant: 0 },
    deals: [],
    expenses: 1_000_000,
    salesStart: '2026-01-01',
    forumStart: '2026-12-31',
  };
  it('красная, когда продано намного меньше ожидаемого', () => {
    const l = incomeHealth({ ...base, items: incomeItems([]), today: '2026-10-07' });
    expect(l.health).toBe('red');
    expect(l.mark).not.toBeNull();
  });
  it('до старта продаж зелёная, если план покрывает цель', () => {
    const l = incomeHealth({ ...base, items: incomeItems([]), today: '2025-12-01' });
    expect(l.health).toBe('green');
  });
});
