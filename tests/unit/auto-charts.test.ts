import { describe, expect, it } from 'vitest';
import { autoItems, computeAutoRows, unitScale } from '@/lib/report/auto-charts';
import { incomeItems } from '@/lib/income';

const task = (cost: number, costFact: number, expenseCategory: string) => ({
  description: 'Задача',
  cost,
  costFact,
  expenseCategory,
});

const rows = (deals = [] as Parameters<typeof computeAutoRows>[0]['income']['deals']) =>
  computeAutoRows({
    tasks: [
      task(3_000_000, 1_500_000, 'marketing'),
      task(1_000_000, 500_000, 'marketing'),
      task(800_000, 250_000, 'print'),
      task(900_000, 0, 'org'),
    ],
    blockOf: () => null,
    expenseLimit: null,
    income: {
      items: incomeItems([{ key: 'partner', price: 500_000, planQty: 0, factQty: 2 }]),
      config: { midDate: null, finalDate: null, margin: 30, variant: 0 },
      deals,
    },
    salesStart: '2026-01-01',
    forumStart: '2026-12-01',
    today: '2026-10-07',
  });

describe('автоматические диаграммы отчёта', () => {
  it('расходы по направлениям: факт и план, без пустых', () => {
    const r = rows();
    expect(r['expenses-fact']).toEqual([
      { name: 'Маркетинг', rub: 2_000_000 },
      { name: 'Типография', rub: 250_000 },
    ]);
    expect(r['expenses-plan'].map((x) => x.name)).toContain('Организационные расходы');
  });

  it('доходы по статьям и итог «расходы и доходы»', () => {
    const r = rows();
    expect(r['income-fact']).toEqual([{ name: 'Партнёр', rub: 1_000_000 }]);
    expect(r.balance).toEqual([
      { name: 'Расходы', rub: 2_250_000 },
      { name: 'Доходы', rub: 1_000_000 },
    ]);
  });

  it('суммы — в единице диаграммы', () => {
    expect(unitScale('млн руб.')).toBe(1e6);
    expect(unitScale('тыс. руб.')).toBe(1e3);
    expect(unitScale('руб.')).toBe(1);
    expect(autoItems([{ name: 'А', rub: 2_500_000 }], 'млн руб.')[0].amount).toBe(2.5);
  });
});
