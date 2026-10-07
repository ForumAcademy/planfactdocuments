import { describe, expect, it } from 'vitest';
import { AE_TOP_TASKS, buildAeCharts } from '@/lib/report/ae-report';

const task = (
  number: number,
  description: string,
  cost: number,
  costFact = 0,
  cat = 'marketing',
) => ({
  number,
  description,
  cost,
  costFact,
  expenseCategory: cat,
});

describe('buildAeCharts', () => {
  it('строит диаграмму по направлениям и по диаграмме на направление', () => {
    const tasks = [
      task(1, 'Сайт', 2_000_000),
      task(2, 'Баннеры', 500_000, 0, 'print'),
      task(3, 'Пустая', 0, 0, 'org'),
    ];
    const charts = buildAeCharts(tasks, () => null, 'plan', null);
    expect(charts.map((c) => c.title)).toEqual([
      'Расходы по направлениям (план)',
      'Маркетинг (план)',
      'Типография (план)',
    ]);
    expect(charts[0].unit).toBe('млн руб.');
    expect(charts[0].items.map((i) => i.amount)).toEqual([2, 0.5]);
    expect(charts[2].unit).toBe('тыс. руб.');
    expect(charts[2].items[0]).toMatchObject({ name: '2. Баннеры', amount: 500 });
  });

  it('сводит мелкие задачи в «Остальные задачи»', () => {
    const tasks = Array.from({ length: AE_TOP_TASKS + 3 }, (_, i) =>
      task(i + 1, `З${i + 1}`, 1000 * (i + 1)),
    );
    const [, byCat] = buildAeCharts(tasks, () => null, 'plan', null);
    expect(byCat.items).toHaveLength(AE_TOP_TASKS + 1);
    expect(byCat.items.at(-1)).toMatchObject({
      name: 'Остальные задачи',
      amount: 6,
      note: '3 шт.',
    });
  });

  it('в факте показывает освоение лимита', () => {
    const charts = buildAeCharts([task(1, 'Сайт', 100_000, 30_000)], () => null, 'fact', 100_000);
    expect(charts[1].title).toBe('Освоение предельно допустимых расходов');
    expect(charts[1].items.map((i) => [i.name, i.amount])).toEqual([
      ['Израсходовано', 30],
      ['Остаток', 70],
    ]);
    expect(buildAeCharts([task(1, 'Сайт', 100_000)], () => null, 'fact', 100_000)).toEqual([]);
  });
});
