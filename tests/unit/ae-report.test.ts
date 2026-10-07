import { describe, expect, it } from 'vitest';
import { AE_CHART_TITLE, buildAeChart } from '@/lib/report/ae-report';

const task = (cost: number, costFact: number, expenseCategory: string) => ({
  description: 'Задача',
  cost,
  costFact,
  expenseCategory,
});

describe('buildAeChart', () => {
  it('одна красная диаграмма факта по направлениям, без пустых', () => {
    const chart = buildAeChart(
      [
        task(3_000_000, 1_500_000, 'marketing'),
        task(1_000_000, 500_000, 'marketing'),
        task(800_000, 250_000, 'print'),
        task(900_000, 0, 'org'),
      ],
      () => null,
    );
    expect(chart).toMatchObject({ title: AE_CHART_TITLE, palette: 'RED', unit: 'млн руб.' });
    expect(chart.items.map((i) => [i.name, i.amount])).toEqual([
      ['Маркетинг', 2],
      ['Типография', 0.25],
    ]);
  });

  it('без факта — пустая диаграмма', () => {
    expect(buildAeChart([task(1000, 0, 'org')], () => null).items).toEqual([]);
  });
});
