import { describe, expect, it } from 'vitest';
import {
  autoPlan,
  currentStage,
  incomeItems,
  incomeLevel,
  incomeSum,
  incomeTarget,
  salesAdvice,
  withDeals,
  dealItem,
  factDiscountPct,
  qtyOf,
  hasStages,
  withValues,
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
  });
});

describe('стадии продаж и скидки статей', () => {
  it('стадия есть только у билетов; цена и скидка — у статьи', () => {
    const items = incomeItems([
      { key: 'partner', price: 500_000, discount: 20, planQty: 3, factQty: 1, stage: 2 },
      {
        id: 1,
        key: 'c_1',
        group: 'tickets',
        label: 'Участник',
        price: 120_000,
        discount: 10,
        planQty: 5,
        factQty: 2,
        stage: 1,
        planManual: true,
      },
    ]);
    const partner = items.find((i) => i.key === 'partner')!;
    expect(hasStages(partner)).toBe(false);
    expect(partner.stage).toBe(0);
    expect(itemSum(partner, 'plan', null)).toBe(1_200_000);
    const mid = items.find((i) => i.key === 'c_1')!;
    expect(mid.stage).toBe(1);
    expect(mid.plan).toEqual([0, 5, 0]);
    expect(netPrice(mid, mid.stage)).toBe(108_000);
    expect(incomeSum([mid], 'plan', 1)).toBe(540_000);
    expect(incomeSum([mid], 'plan', 0)).toBe(0);
    expect(incomeSum([mid], 'fact')).toBe(216_000);
  });

  it('смена стадии переносит количество', () => {
    const [vip] = incomeItems([{ key: 'vip', price: 150_000, planQty: 4, factQty: 1 }]).filter(
      (i) => i.key === 'vip',
    );
    const moved = withValues(vip, { stage: 2, price: 180_000 });
    expect(moved.plan).toEqual([0, 0, 4]);
    expect(moved.fact).toEqual([0, 0, 1]);
    expect(itemSum(moved, 'plan', 2)).toBe(720_000);
  });

  it('итог копится по всем стадиям; автоподбор ставит количество в стадию статьи', () => {
    const items = incomeItems([
      { key: 'participant', price: 80_000, planQty: 0, factQty: 0 },
      {
        id: 1,
        key: 'c_1',
        group: 'tickets',
        label: 'Участник',
        price: 100_000,
        discount: 10,
        planQty: 0,
        factQty: 0,
        stage: 2,
      },
    ]);
    const plan = autoPlan(items, 13_000_000);
    expect(incomeSum(plan, 'plan')).toBeGreaterThanOrEqual(13_000_000);
    const fin = plan.find((i) => i.key === 'c_1')!;
    expect(fin.plan[0] + fin.plan[1]).toBe(0);
    expect(
      [0, 1, 2].reduce((s, k) => s + incomeSum(plan, 'plan', k), 0) - incomeSum(plan, 'plan'),
    ).toBe(0);
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

describe('автоподбор и завершённые стадии', () => {
  it('на завершённой стадии автоплан равен проданному, цель добирают открытые стадии', () => {
    const items = incomeItems([
      { key: 'participant', price: 80_000, planQty: 0, factQty: 7 },
      {
        id: 1,
        key: 'c_1',
        group: 'tickets',
        label: 'Участник',
        price: 100_000,
        planQty: 0,
        factQty: 0,
        stage: 2,
      },
    ]);
    const plan = autoPlan(items, 13_000_000, 2);
    expect(plan.find((i) => i.key === 'participant')!.plan).toEqual([7, 0, 0]);
    expect(incomeSum(plan, 'plan')).toBeGreaterThanOrEqual(13_000_000);
  });
});

describe('статьи только для факта', () => {
  it('не попадают в план и автоподбор, но входят в факт', () => {
    const items = incomeItems([
      {
        id: 1,
        key: 'c_1',
        group: 'tickets',
        label: 'Компания X',
        price: 100_000,
        discount: 35,
        planQty: 0,
        factQty: 2,
        factOnly: true,
      },
    ]);
    const plan = autoPlan(items, 13_000_000);
    const x = plan.find((i) => i.key === 'c_1')!;
    expect(x.factOnly).toBe(true);
    expect(x.plan).toEqual([0, 0, 0]);
    expect(incomeSum(plan, 'fact')).toBe(130_000);
  });
});

describe('рекомендация на сегодня', () => {
  const dates: [string, string, string] = ['2026-03-01', '2026-06-01', '2026-09-01'];
  const items = () =>
    incomeItems([
      { key: 'general', price: 3_000_000, planQty: 1, factQty: 1, planManual: true },
      { key: 'strategic', price: 1_500_000, planQty: 2, factQty: 0, planManual: true },
      { key: 'partner', price: 500_000, planQty: 0, factQty: 0, planManual: true },
      { key: 'vip', price: 150_000, planQty: 0, factQty: 0, planManual: true },
      { key: 'participant', price: 100_000, planQty: 10, factQty: 4, planManual: true },
      ...[
        [1, 20, 10],
        [2, 10, 0],
      ].map(([stage, planQty, factQty]) => ({
        id: stage,
        key: `c_${stage}`,
        group: 'tickets',
        label: 'Участник',
        price: 100_000,
        planQty,
        factQty,
        stage,
        planManual: true,
      })),
    ]);

  it('до старта продаж рекомендации нет', () => {
    expect(salesAdvice(items(), 10_000_000, dates, '2026-11-01', '2026-02-01')).toEqual([]);
  });

  it('не больше двух предложений: что продано и что продать до форума', () => {
    // план 10 млн; продано 3 млн + 4 и 10 билетов = 4,4 млн; недобор старта перекрывается билетами
    const a = salesAdvice(items(), 10_000_000, dates, '2026-11-01', '2026-07-15');
    expect(a).toHaveLength(2);
    expect(a[0]).toBe(
      'Продано 4 400 000 ₽ (44% цели), до форума 109 дней и осталось продать на 5 600 000 ₽.',
    );
    expect(a[1]).toMatch(
      /^Нужно продать 2 стратегических партнёра и 26 билетов участника — около 2 билетов в неделю, пока действует цена стадии «Середина» \(до 01\.09\.2026\)\.$/,
    );
  });

  it('цель достигнута', () => {
    const a = salesAdvice(items(), 4_000_000, dates, '2026-11-01', '2026-07-15');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatch(/^Цель достигнута/);
  });
});

describe('оплаченные сделки воронки в факте', () => {
  const dates: [string, string, string] = ['2026-03-01', '2026-06-01', '2026-09-01'];
  const base = () =>
    incomeItems([
      { key: 'participant', price: 100_000, planQty: 10, factQty: 2, planManual: true },
      {
        id: 1,
        key: 'c_mid',
        group: 'tickets',
        label: 'Участник',
        price: 120_000,
        planQty: 10,
        factQty: 0,
        stage: 1,
        planManual: true,
      },
    ]);
  const deal = (p: Partial<Parameters<typeof withDeals>[1][number]>) => ({
    status: 'paid',
    incomeKey: 'participant',
    qty: 1,
    amount: 100_000,
    paidDate: '2026-04-01',
    incomeStatus: null,
    ...p,
  });

  it('сделка ложится в статью направления на стадии цены по дате оплаты', () => {
    const items = base();
    expect(dealItem(items, deal({}), dates, '2026-07-01')!.key).toBe('participant');
    expect(dealItem(items, deal({ paidDate: '2026-07-01' }), dates, '2026-07-01')!.key).toBe(
      'c_mid',
    );
    // финальной статьи нет — остаётся направление
    expect(dealItem(items, deal({ paidDate: '2026-10-01' }), dates, '2026-10-01')!.key).toBe(
      'participant',
    );
    expect(dealItem(items, deal({ incomeKey: null }), dates, '2026-07-01')!.key).toBe(
      'participant',
    );
  });

  it('факт: ручное + сделки по своим суммам; индивидуальные скидки дают среднюю', () => {
    const items = withDeals(
      base(),
      [
        deal({ amount: 90_000 }), // скидка 10%
        deal({ qty: 2, amount: 160_000 }), // скидка 20%
        deal({ incomeStatus: 'rejected' }),
        deal({ incomeStatus: 'added' }),
        deal({ status: 'invoice' }),
      ],
      dates,
      '2026-07-01',
    );
    const p = items.find((i) => i.key === 'participant')!;
    expect(p.deals).toEqual({ count: 2, qty: 3, sum: 250_000 });
    expect(qtyOf(p, 'fact', null)).toBe(5);
    expect(itemSum(p, 'fact', null)).toBe(450_000);
    // 500 000 по цене, продано на 450 000 — средняя скидка 10%
    expect(factDiscountPct(p)).toBe(10);
    expect(incomeSum(items, 'fact')).toBe(450_000);
  });

  it('завершённая стадия: автоплан равен проданному вместе со сделками', () => {
    const items = withDeals(
      incomeItems([{ key: 'participant', price: 100_000, planQty: 0, factQty: 1 }]),
      [deal({ qty: 2, amount: 150_000 })],
      dates,
      '2026-07-01',
    );
    const plan = autoPlan(items, 1_000_000, 1);
    expect(plan.find((i) => i.key === 'participant')!.plan).toEqual([3, 0, 0]);
  });
});
