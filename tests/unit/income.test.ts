import { describe, expect, it } from 'vitest';
import { incomeItems, incomeLevel, incomeSum, incomeTarget } from '@/lib/income';

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

  it('уровень дохода: убыток, расходы покрыты, цель достигнута', () => {
    expect(incomeLevel(0, 1_000, 1_300)).toBe('loss');
    expect(incomeLevel(1_000, 1_000, 1_300)).toBe('covered');
    expect(incomeLevel(1_299, 1_000, 1_300)).toBe('covered');
    expect(incomeLevel(1_300, 1_000, 1_300)).toBe('target');
  });
});
