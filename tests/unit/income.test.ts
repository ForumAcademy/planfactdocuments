import { describe, expect, it } from 'vitest';
import {
  autoPlan,
  currentStage,
  factTotals,
  incomeItems,
  incomeLevel,
  incomeSum,
  incomeTarget,
  planAdvice,
  planTotals,
  planUnitGross,
  stageDates,
  stagePrices,
} from '@/lib/income';

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

  it('автоподбор плана: партнёрства в типовом числе, остальное — билеты, не меньше цели', () => {
    const items = incomeItems([
      { key: 'general', price: 450_000, planQty: 0, factQty: 0 },
      { key: 'strategic', price: 250_000, planQty: 0, factQty: 0 },
      { key: 'partner', price: 150_000, planQty: 1, factQty: 0 },
    ]);
    const target = incomeTarget(18_477_730);
    const plan = autoPlan(items, target);
    const q = Object.fromEntries(plan.map((i) => [i.key, i.planQty]));
    expect(q).toMatchObject({ general: 1, strategic: 2, partner: 5 });
    const sum = incomeSum(plan, 'planQty');
    expect(sum).toBeGreaterThanOrEqual(target);
    expect(sum - target).toBeLessThan(95_000);
  });

  it('ручной план сохраняется, остальное добирает до цели', () => {
    const items = incomeItems([
      { key: 'vip', price: 150_000, planQty: 10, factQty: 0, planManual: true },
      { key: 'participant', price: 95_000, planQty: 7, factQty: 0, planManual: true },
    ]);
    const plan = autoPlan(items, 5_000_000);
    expect(plan.find((i) => i.key === 'vip')!.planQty).toBe(10);
    expect(plan.find((i) => i.key === 'participant')!.planQty).toBe(7);
    expect(incomeSum(plan, 'planQty')).toBeGreaterThanOrEqual(5_000_000);

    const enough = autoPlan(items, 1_000_000);
    expect(enough.filter((i) => !i.planManual).every((i) => i.planQty === 0)).toBe(true);
  });

  it('рекомендация перечисляет, что продать', () => {
    const plan = autoPlan(incomeItems([]), 13_000_000);
    const advice = planAdvice(plan, 13_000_000);
    expect(advice[0]).toMatch(/^Чтобы выйти на цель, нужно продать 1 генерального партнёра/);
    expect(advice.join(' ')).toMatch(/билетов участника/);
    expect(planAdvice(plan, 0)).toEqual([]);
  });

  it('позиции: переименование, удаление, свои позиции', () => {
    const items = incomeItems([
      { key: 'vip', price: 150_000, planQty: 0, factQty: 0, label: 'VIP+' },
      { key: 'general', price: 3_000_000, planQty: 0, factQty: 0, removed: true },
      {
        id: 2,
        key: 'c_2',
        price: 50_000,
        planQty: 0,
        factQty: 0,
        label: 'Онлайн',
        group: 'tickets',
      },
      {
        id: 1,
        key: 'c_1',
        price: 700_000,
        planQty: 0,
        factQty: 0,
        label: 'Инфо',
        group: 'partners',
      },
    ]);
    expect(items.map((i) => i.key)).toEqual([
      'strategic',
      'partner',
      'vip',
      'participant',
      'c_1',
      'c_2',
    ]);
    expect(items.find((i) => i.key === 'vip')!.label).toBe('VIP+');
    const plan = autoPlan(items, 10_000_000);
    expect(plan.find((i) => i.key === 'c_1')!.planQty).toBe(1);
    expect(incomeSum(plan, 'planQty')).toBeGreaterThanOrEqual(10_000_000);
    expect(planAdvice(plan, 10_000_000)[0]).toMatch(/шт\. «VIP\+»/);
  });
});

describe('этапы цен и скидки', () => {
  const cfg = {
    midDate: null,
    finalDate: null,
    shares: [30, 40, 30] as [number, number, number],
    discountPersonal: 5,
    discountPartner: 5,
  };

  it('цены этапов: пустая цена равна предыдущему этапу', () => {
    const [vip] = incomeItems([
      { key: 'vip', price: 100_000, priceFinal: 150_000, planQty: 0, factQty: 0 },
    ]).filter((i) => i.key === 'vip');
    expect(stagePrices(vip)).toEqual([100_000, 100_000, 150_000]);
    expect(vip.priceMidSet).toBe(false);
    expect(vip.priceFinalSet).toBe(true);
  });

  it('план: средняя цена по долям этапов, скидки вычитаются', () => {
    const items = incomeItems([
      {
        key: 'vip',
        price: 100_000,
        priceMid: 120_000,
        priceFinal: 150_000,
        planQty: 10,
        factQty: 0,
        planManual: true,
      },
    ]).filter((i) => i.key === 'vip');
    // 0,3×100 + 0,4×120 + 0,3×150 = 123 тыс.
    expect(planUnitGross(items[0], cfg)).toBeCloseTo(123_000);
    expect(planTotals(items, cfg)).toEqual({
      gross: 1_230_000,
      personal: 61_500,
      partner: 61_500,
      net: 1_107_000,
    });
    expect(incomeSum(items, 'planQty', cfg)).toBe(1_107_000);
  });

  it('факт: продажи по ценам этапов минус скидки', () => {
    const items = incomeItems([
      {
        key: 'vip',
        price: 100_000,
        priceMid: 120_000,
        planQty: 0,
        factQty: 2,
        factMid: 1,
        factFinal: 1,
        discountPersonal: 10_000,
        discountPartner: 20_000,
      },
    ]).filter((i) => i.key === 'vip');
    expect(factTotals(items)).toEqual({
      gross: 440_000,
      personal: 10_000,
      partner: 20_000,
      net: 410_000,
    });
  });

  it('автоподбор учитывает скидки: план с учётом скидок не меньше цели', () => {
    const plan = autoPlan(incomeItems([]), 13_000_000, cfg);
    expect(incomeSum(plan, 'planQty', cfg)).toBeGreaterThanOrEqual(13_000_000);
  });

  it('даты этапов: без заданных — период до форума делится на три части', () => {
    const d = stageDates({ midDate: null, finalDate: null }, '2026-01-01', '2026-10-01');
    expect(d[0]).toBe('2026-01-01');
    expect(d[1] > '2026-03-31' && d[1] < '2026-04-03').toBe(true);
    expect(
      stageDates({ midDate: '2026-05-01', finalDate: '2026-09-01' }, '2026-01-01', '2026-10-01'),
    ).toEqual(['2026-01-01', '2026-05-01', '2026-09-01']);
    expect(currentStage(['2026-01-01', '2026-05-01', '2026-09-01'], '2026-06-10')).toBe(1);
    expect(currentStage(['2026-01-01', '2026-05-01', '2026-09-01'], '2026-09-01')).toBe(2);
  });
});
