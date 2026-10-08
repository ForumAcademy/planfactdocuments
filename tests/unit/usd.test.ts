import { describe, expect, it } from 'vitest';
import { usdRateOn } from '@/lib/usd';

describe('курс доллара на дату', () => {
  const rates = [
    { date: '2026-10-01', rate: 80 },
    { date: '2026-10-08', rate: 82.5 },
    { date: '2026-11-01', rate: 85 },
  ];
  it('последний курс не позже даты', () => {
    expect(usdRateOn(rates, '2026-10-08')?.rate).toBe(82.5);
    expect(usdRateOn(rates, '2026-10-20')?.rate).toBe(82.5);
    expect(usdRateOn(rates, '2026-12-01')?.rate).toBe(85);
  });
  it('все курсы позже даты — самый ранний; курсов нет — null', () => {
    expect(usdRateOn(rates, '2026-09-01')?.rate).toBe(80);
    expect(usdRateOn([], '2026-10-08')).toBeNull();
  });
});
