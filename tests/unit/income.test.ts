import { describe, expect, it } from 'vitest';
import { forecastQuantities, incomeItems, incomeSum, incomeTarget } from '@/lib/income';

describe('доходы', () => {
  it('подставляет цены по умолчанию и сохранённые значения', () => {
    const items = incomeItems([{ key: 'vip', price: 160_000, planQty: 3, factQty: 1 }]);
    expect(items.map((i) => i.key)).toEqual([
      'general',
      'strategic',
      'partner',
      'vip',
      'participant',
    ]);
    expect(items.find((i) => i.key === 'participant')).toMatchObject({ price: 95_000, planQty: 0 });
    expect(items.find((i) => i.key === 'vip')).toMatchObject({
      price: 160_000,
      planQty: 3,
      factQty: 1,
    });
    expect(incomeSum(items, 'planQty')).toBe(480_000);
    expect(incomeSum(items, 'factQty')).toBe(160_000);
  });

  it('цель — расходы + 30%', () => {
    expect(incomeTarget(10_000_000)).toBe(13_000_000);
    expect(incomeTarget(0)).toBe(0);
  });

  it('калькулятор добирает цель в структуре плана с минимальным перебором', () => {
    const items = incomeItems([
      { key: 'partner', price: 500_000, planQty: 2, factQty: 0 },
      { key: 'participant', price: 95_000, planQty: 10, factQty: 0 },
    ]);
    const target = 13_000_000;
    const q = forecastQuantities(items, target);
    const sum = items.reduce((s, i) => s + i.price * q[i.key], 0);
    expect(sum).toBeGreaterThanOrEqual(target);
    expect(sum - target).toBeLessThan(95_000);
    expect(q.general).toBe(0);
    expect(q.vip).toBe(0);
    expect(q.partner).toBeGreaterThan(0);
  });

  it('пустой план — типовая структура; без цели — нули', () => {
    const items = incomeItems([]);
    const q = forecastQuantities(items, 30_000_000);
    expect(Object.values(q).every((n) => n >= 0)).toBe(true);
    expect(q.general + q.strategic + q.partner).toBeGreaterThan(0);
    expect(items.reduce((s, i) => s + i.price * q[i.key], 0)).toBeGreaterThanOrEqual(30_000_000);
    expect(Object.values(forecastQuantities(items, 0)).every((n) => n === 0)).toBe(true);
  });
});
