import { describe, expect, it } from 'vitest';
import {
  autoPlan,
  currentStage,
  incomeItems,
  incomeLevel,
  incomeSum,
  incomeTarget,
  planAdvice,
  hasStages,
  itemSum,
  netPrice,
  stageDates,
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
    expect(items.find((i) => i.key === 'participant')).toMatchObject({
      prices: [95_000, 95_000, 95_000],
      plan: [0, 0, 0],
    });
    expect(items.find((i) => i.key === 'vip')).toMatchObject({
      prices: [160_000, 160_000, 160_000],
      plan: [3, 0, 0],
      fact: [1, 0, 0],
    });
    expect(incomeSum(items, 'plan')).toBe(480_000);
    expect(incomeSum(items, 'fact')).toBe(160_000);
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
    const q = Object.fromEntries(plan.map((i) => [i.key, i.plan[0]]));
    expect(q).toMatchObject({ general: 1, strategic: 2, partner: 5 });
    const sum = incomeSum(plan, 'plan');
    expect(sum).toBeGreaterThanOrEqual(target);
    expect(sum - target).toBeLessThan(150_000);
  });

  it('ручной план сохраняется, остальное добирает до цели', () => {
    const items = incomeItems([
      { key: 'vip', price: 150_000, planQty: 10, factQty: 0, planManual: true },
      { key: 'participant', price: 95_000, planQty: 7, factQty: 0, planManual: true },
    ]);
    const plan = autoPlan(items, 5_000_000);
    expect(plan.find((i) => i.key === 'vip')!.plan).toEqual([10, 0, 0]);
    expect(plan.find((i) => i.key === 'participant')!.plan).toEqual([7, 0, 0]);
    expect(incomeSum(plan, 'plan')).toBeGreaterThanOrEqual(5_000_000);

    const enough = autoPlan(items, 1_000_000);
    expect(enough.filter((i) => !i.planManual).every((i) => i.plan.every((q) => q === 0))).toBe(
      true,
    );
  });

  it('рекомендация перечисляет, что продать', () => {
    const plan = autoPlan(incomeItems([]), 13_000_000);
    const advice = planAdvice(plan, 13_000_000);
    expect(advice[0]).toMatch(
      /^Чтобы выйти на цель, нужно продать за все этапы 1 генерального партнёра/,
    );
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
    expect(plan.find((i) => i.key === 'c_1')!.plan).toEqual([1, 0, 0]);
    expect(incomeSum(plan, 'plan')).toBeGreaterThanOrEqual(10_000_000);
    expect(planAdvice(plan, 10_000_000)[0]).toMatch(/шт\. «VIP\+»/);
  });
});

describe('этапы продаж билетов и скидки позиций', () => {
  const cfg = { shares: [30, 40, 30] as [number, number, number] };

  it('цена и скидка этапа: пустое значение равно предыдущему этапу', () => {
    const vip = incomeItems([
      { key: 'vip', price: 100_000, priceFinal: 150_000, discountMid: 10, planQty: 0, factQty: 0 },
    ]).find((i) => i.key === 'vip')!;
    expect(vip.prices).toEqual([100_000, 100_000, 150_000]);
    expect(vip.priceSet).toEqual([true, false, true]);
    expect(vip.discounts).toEqual([0, 10, 10]);
    expect(netPrice(vip, 2)).toBe(135_000);
  });

  it('у партнёрств нет этапов: условия старта, количество целиком в нём', () => {
    const [partner] = incomeItems([
      {
        key: 'partner',
        price: 150_000,
        priceFinal: 200_000,
        discount: 20,
        planQty: 1,
        planMid: 2,
        factQty: 1,
        factFinal: 1,
      },
    ]).filter((i) => i.key === 'partner');
    expect(hasStages(partner)).toBe(false);
    expect(partner.prices).toEqual([150_000, 150_000, 150_000]);
    expect(partner.plan).toEqual([3, 0, 0]);
    expect(itemSum(partner, 'plan', null)).toBe(360_000);
    expect(itemSum(partner, 'fact', null)).toBe(240_000);
  });

  it('итог билетов копится по всем этапам с их ценами и скидками', () => {
    const [own] = incomeItems([
      {
        id: 1,
        key: 'c_1',
        group: 'tickets',
        label: 'Билет для своих',
        price: 100_000,
        priceMid: 120_000,
        priceFinal: 150_000,
        discount: 20,
        planQty: 2,
        planMid: 1,
        planFinal: 1,
        factQty: 1,
        factMid: 1,
        planManual: true,
      },
    ]).filter((i) => i.key === 'c_1');
    expect(itemSum(own, 'plan', 0)).toBe(160_000);
    expect(itemSum(own, 'plan', 1)).toBe(96_000);
    expect(itemSum(own, 'plan', null)).toBe(160_000 + 96_000 + 120_000);
    expect(incomeSum([own], 'fact')).toBe(80_000 + 96_000);
    expect(incomeSum([own], 'fact', 2)).toBe(0);
  });

  it('автоподбор раскладывает билеты по долям этапов, со скидками не меньше цели', () => {
    const items = incomeItems([
      { key: 'participant', price: 100_000, discount: 10, planQty: 0, factQty: 0 },
    ]);
    const plan = autoPlan(items, 13_000_000, cfg);
    expect(incomeSum(plan, 'plan')).toBeGreaterThanOrEqual(13_000_000);
    const p = plan.find((i) => i.key === 'participant')!;
    expect(p.plan[1]).toBeGreaterThan(p.plan[0]);
    expect(plan.filter((i) => !hasStages(i)).every((i) => i.plan[1] === 0 && i.plan[2] === 0)).toBe(
      true,
    );
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
