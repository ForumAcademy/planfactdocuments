import { describe, expect, it } from 'vitest';
import { forumUsdRate, usdRateOn, type UsdRateDTO } from '@/lib/usd';

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

describe('курс доллара форума', () => {
  const rates: UsdRateDTO[] = [
    { id: 1, date: '2026-01-10', rate: 78, forumId: null },
    { id: 2, date: '2026-10-01', rate: 85, forumId: null },
    { id: 3, date: '2026-09-01', rate: 90, forumId: 7 },
  ];
  const today = '2026-10-08';
  it('свои курсы форума важнее общих', () => {
    const f = { id: 7, startDate: '2026-11-01', endDate: null };
    expect(forumUsdRate(rates, f, today)?.rate).toBe(90);
  });
  it('без своих курсов — общий курс на сегодня', () => {
    const f = { id: 8, startDate: '2026-11-01', endDate: '2026-11-03' };
    expect(forumUsdRate(rates, f, today)?.rate).toBe(85);
  });
  it('прошедший форум — общий курс на дату окончания', () => {
    const f = { id: 9, startDate: '2026-03-01', endDate: '2026-03-02' };
    expect(forumUsdRate(rates, f, today)?.rate).toBe(78);
  });
});
