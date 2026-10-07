import { diffDays, formatDate } from './dates';

/**
 * Доходы форума: партнёрства и билеты. У каждой статьи — цена одной единицы,
 * индивидуальная скидка (%), плановое и фактически проданное количество.
 * Билеты продаются в три стадии — «Старт продаж», «Середина», «Финальная стадия»: у каждой
 * статьи-билета указана её стадия (например, «Участник» на старте и «Участник» на середине —
 * две статьи со своими ценами), итог складывается из всех стадий. У партнёрств стадий нет. Позиции по умолчанию можно переименовать
 * или убрать, свои (например, «Билет для своих» со скидкой 20%) — добавить в любую группу.
 */

/** Этапы продаж: чем ближе форум, тем дороже */
export const PRICE_STAGES = [
  { key: 'start', label: 'Старт продаж', short: 'Старт' },
  { key: 'mid', label: 'Середина', short: 'Середина' },
  { key: 'final', label: 'Финальная стадия', short: 'Финал' },
] as const;
export type PriceStageKey = (typeof PRICE_STAGES)[number]['key'];

export type Triple = [number, number, number];

const sum3 = (t: Triple) => t[0] + t[1] + t[2];

/** Настройки доходов форума: с какой даты начинаются «Середина» и «Финальная стадия» */
export interface IncomeConfig {
  /** null — период от старта продаж до форума делится на три равные части */
  midDate: string | null;
  finalDate: string | null;
}

export const DEFAULT_INCOME_CONFIG: IncomeConfig = { midDate: null, finalDate: null };

export const INCOME_GROUPS = [
  { key: 'partners', label: 'Партнёрства', color: '#0A0A9F' },
  { key: 'tickets', label: 'Билеты', color: '#1E9E5A' },
] as const;

export type IncomeGroup = (typeof INCOME_GROUPS)[number];
export type IncomeGroupKey = IncomeGroup['key'];

export interface IncomeItemDef {
  key: string;
  group: IncomeGroupKey;
  label: string;
  /** Стоимость единицы по умолчанию, руб. */
  price: number;
  /** Типовое количество для автоподбора плана, шт. */
  mix: number;
  /** Склонение для рекомендации: 1, 2, 5 */
  words: [string, string, string];
}

export const INCOME_ITEMS: IncomeItemDef[] = [
  {
    key: 'general',
    group: 'partners',
    label: 'Генеральный партнёр',
    price: 3_000_000,
    mix: 1,
    words: ['генерального партнёра', 'генеральных партнёра', 'генеральных партнёров'],
  },
  {
    key: 'strategic',
    group: 'partners',
    label: 'Стратегический партнёр',
    price: 1_500_000,
    mix: 2,
    words: ['стратегического партнёра', 'стратегических партнёра', 'стратегических партнёров'],
  },
  {
    key: 'partner',
    group: 'partners',
    label: 'Партнёр',
    price: 500_000,
    mix: 5,
    words: ['партнёра', 'партнёра', 'партнёров'],
  },
  {
    key: 'vip',
    group: 'tickets',
    label: 'VIP',
    price: 150_000,
    mix: 20,
    words: ['VIP-билет', 'VIP-билета', 'VIP-билетов'],
  },
  {
    key: 'participant',
    group: 'tickets',
    label: 'Участник',
    price: 95_000,
    mix: 150,
    words: ['билет участника', 'билета участника', 'билетов участника'],
  },
];
export const INCOME_KEYS = INCOME_ITEMS.map((i) => i.key);

/** Типовое количество своей позиции для автоподбора: партнёрство — 1, билет — 20 */
const CUSTOM_MIX: Record<IncomeGroupKey, number> = { partners: 1, tickets: 20 };

/** Целевая наценка над расходами: доход = расходы + 30% */
export const INCOME_MARGIN = 0.3;

export function isIncomeGroup(v: unknown): v is IncomeGroupKey {
  return INCOME_GROUPS.some((g) => g.key === v);
}

export function defaultIncomeItem(key: string): IncomeItemDef | undefined {
  return INCOME_ITEMS.find((i) => i.key === key);
}

export interface IncomeItemValue {
  key: string;
  group: IncomeGroupKey;
  label: string;
  /** Стадия продаж статьи (0 — старт, 1 — середина, 2 — финал); у партнёрств всегда 0 */
  stage: number;
  /** Цена 1 ед., руб., и индивидуальная скидка, % — одинаковы по всем стадиям (тройка ради расчётов по стадиям) */
  prices: Triple;
  discounts: Triple;
  /** План и факт по стадиям, шт.: количество стоит только в стадии статьи */
  plan: Triple;
  fact: Triple;
  /** План задан вручную; иначе количество подбирается под цель автоматически */
  planManual: boolean;
  /** Статья только для факта (например, продажа с индивидуальной скидкой); в плане её нет */
  factOnly: boolean;
}

export interface SavedIncomeItem {
  id?: number;
  key: string;
  price: number;
  discount?: number;
  planQty: number;
  factQty: number;
  stage?: number;
  planManual?: boolean;
  factOnly?: boolean;
  label?: string | null;
  group?: string | null;
  removed?: boolean;
}

/** Количество в стадии: [0, n, 0] и т. п. */
export function atStage(n: number, stage: number): Triple {
  const t: Triple = [0, 0, 0];
  t[stage] = n;
  return t;
}

const clampStage = (n: number | undefined) => Math.min(2, Math.max(0, Math.round(n ?? 0)));

/** Статья с новыми ценой, скидкой, количеством или стадией */
export function withValues(
  i: IncomeItemValue,
  p: { price?: number; discount?: number; planQty?: number; factQty?: number; stage?: number },
): IncomeItemValue {
  const stage = hasStages(i) ? clampStage(p.stage ?? i.stage) : 0;
  const price = p.price ?? i.prices[i.stage];
  const discount = p.discount ?? i.discounts[i.stage];
  return {
    ...i,
    stage,
    prices: [price, price, price],
    discounts: [discount, discount, discount],
    plan: atStage(p.planQty ?? sum3(i.plan), stage),
    fact: atStage(p.factQty ?? sum3(i.fact), stage),
  };
}

/**
 * Все позиции по порядку: позиции по умолчанию (кроме убранных) с сохранёнными значениями,
 * затем свои позиции в порядке добавления; внутри таблицы они разложены по группам.
 */
export function incomeItems(saved: SavedIncomeItem[]): IncomeItemValue[] {
  const byKey = new Map(saved.map((s) => [s.key, s]));
  const value = (
    s: SavedIncomeItem | undefined,
    base: Pick<IncomeItemValue, 'key' | 'group' | 'label'> & { price: number },
  ): IncomeItemValue => {
    const stage = base.group === 'tickets' ? clampStage(s?.stage) : 0;
    const d = s?.discount ?? 0;
    return {
      key: base.key,
      group: base.group,
      label: base.label,
      stage,
      prices: [base.price, base.price, base.price],
      discounts: [d, d, d],
      plan: atStage(s?.planQty ?? 0, stage),
      fact: atStage(s?.factQty ?? 0, stage),
      planManual: s?.planManual ?? false,
      factOnly: s?.factOnly ?? false,
    };
  };
  const defaults = INCOME_ITEMS.filter((d) => !byKey.get(d.key)?.removed).map((d) => {
    const s = byKey.get(d.key);
    return value(s, {
      key: d.key,
      group: d.group,
      label: s?.label?.trim() || d.label,
      price: s?.price ?? d.price,
    });
  });
  const custom = saved
    .filter((s) => !defaultIncomeItem(s.key) && !s.removed && isIncomeGroup(s.group))
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .map((s) =>
      value(s, {
        key: s.key,
        group: s.group as IncomeGroupKey,
        label: s.label?.trim() || 'Позиция',
        price: s.price,
      }),
    );
  return [...defaults, ...custom];
}

/** Этапы продаж есть только у билетов */
export function hasStages(i: Pick<IncomeItemValue, 'group'>): boolean {
  return i.group === 'tickets';
}

/** Цена со скидкой на этапе */
export function netPrice(i: IncomeItemValue, stage: number): number {
  return i.prices[stage] * (1 - Math.min(100, Math.max(0, i.discounts[stage])) / 100);
}

/** Количество: на этапе или всего (stage = null) */
export function qtyOf(i: IncomeItemValue, kind: 'plan' | 'fact', stage: number | null): number {
  return stage === null ? sum3(i[kind]) : i[kind][stage];
}

/** Сумма позиции с учётом скидок: на этапе или накопительно за все этапы (stage = null) */
export function itemSum(i: IncomeItemValue, kind: 'plan' | 'fact', stage: number | null): number {
  const stages = stage === null ? [0, 1, 2] : [stage];
  return Math.round(stages.reduce((s, k) => s + i[kind][k] * netPrice(i, k), 0));
}

/** Скидки позиции в рублях: на этапе или за все этапы */
export function itemDiscount(
  i: IncomeItemValue,
  kind: 'plan' | 'fact',
  stage: number | null,
): number {
  const stages = stage === null ? [0, 1, 2] : [stage];
  return Math.round(stages.reduce((s, k) => s + i[kind][k] * (i.prices[k] - netPrice(i, k)), 0));
}

/** Итог плана или факта с учётом скидок: на этапе или накопительно (по умолчанию) */
export function incomeSum(
  items: IncomeItemValue[],
  kind: 'plan' | 'fact',
  stage: number | null = null,
): number {
  return items.reduce((s, i) => s + itemSum(i, kind, stage), 0);
}

/**
 * Даты этапов: старт — начало продаж; «Середина» и «Финал» — заданные даты, а если
 * их нет — период от старта продаж до форума делится на три равные части.
 */
export function stageDates(
  cfg: Pick<IncomeConfig, 'midDate' | 'finalDate'>,
  salesStart: string,
  forumStart: string,
): [string, string, string] {
  const t0 = Date.parse(salesStart);
  const t1 = Date.parse(forumStart);
  const at = (k: number) =>
    new Date(t0 + Math.round(((t1 - t0) * k) / 3 / 86_400_000) * 86_400_000)
      .toISOString()
      .slice(0, 10);
  const mid = cfg.midDate ?? (t1 > t0 ? at(1) : salesStart);
  const fin = cfg.finalDate ?? (t1 > t0 ? at(2) : mid);
  return [salesStart, mid, fin < mid ? mid : fin];
}

/** Текущий этап на дату */
export function currentStage(dates: [string, string, string], today: string): number {
  if (today >= dates[2]) return 2;
  if (today >= dates[1]) return 1;
  return 0;
}

export function incomeTarget(expenses: number): number {
  return Math.round(expenses * (1 + INCOME_MARGIN));
}

/**
 * Уровень дохода относительно расходов и цели:
 * `loss` — не покрывает расходы, `covered` — расходы покрыты, но цель не достигнута,
 * `target` — цель (расходы + 30%) достигнута.
 */
export type IncomeLevel = 'loss' | 'covered' | 'target';

export function incomeLevel(value: number, expenses: number, target: number): IncomeLevel {
  if (target > 0 && value >= target) return 'target';
  if (expenses > 0 && value >= expenses) return 'covered';
  return expenses > 0 ? 'loss' : 'covered';
}

const mixOf = (i: IncomeItemValue) => defaultIncomeItem(i.key)?.mix ?? CUSTOM_MIX[i.group];

/**
 * План продаж под цель. Позиции с ручным планом остаются как есть, остальные подбираются так,
 * чтобы вместе с ручными доход (со скидками, по всем этапам) был не меньше цели. Партнёрств —
 * не больше типового числа (1 генеральный, 2 стратегических, 5 партнёров), остальное
 * добирается билетами в типовой пропорции; остаток — самой дешёвой позицией. Количество
 * ставится в стадию статьи; на завершённых стадиях (до openStage) автоплан равен проданному.
 */
export function autoPlan(
  items: IncomeItemValue[],
  target: number,
  openStage = 0,
): IncomeItemValue[] {
  // Завершённые стадии уже не продать: автоплан билетов там равен проданному
  const closed = (i: IncomeItemValue) => hasStages(i) && i.stage < openStage;
  items = items.map((i) =>
    !i.planManual && !i.factOnly && closed(i) ? { ...i, plan: [...i.fact] as Triple } : i,
  );
  const unit = new Map(items.map((i) => [i.key, netPrice(i, i.stage)]));
  const price = (i: IncomeItemValue) => unit.get(i.key)!;
  const auto = items.filter((i) => !i.planManual && !i.factOnly && !closed(i) && price(i) > 0);
  const qty = new Map<string, number>(auto.map((i) => [i.key, 0]));
  const manualSum = incomeSum(
    items.filter((i) => i.planManual || (closed(i) && !i.factOnly)),
    'plan',
  );
  let rest = target - manualSum;

  if (rest > 0 && auto.length) {
    const scale = (list: IncomeItemValue[], amount: number, cap: boolean) => {
      const base = list.reduce((s, i) => s + price(i) * mixOf(i), 0);
      if (!base) return 0;
      const k = amount / base;
      let got = 0;
      for (const i of list) {
        const m = mixOf(i);
        const q = Math.floor(m * k);
        const v = cap ? Math.min(q, m) : q;
        qty.set(i.key, v);
        got += v * price(i);
      }
      return got;
    };
    const tickets = auto.filter((i) => i.group === 'tickets');
    const partners = auto.filter((i) => i.group !== 'tickets');
    rest -= scale(partners, rest, tickets.length > 0);
    if (rest > 0 && tickets.length) rest -= scale(tickets, rest, false);
    if (rest > 0) {
      const pool = tickets.length ? tickets : partners;
      const cheapest = pool.reduce((a, b) => (price(b) < price(a) ? b : a));
      qty.set(cheapest.key, qty.get(cheapest.key)! + Math.ceil(rest / price(cheapest)));
    }
  }
  const out = items.map((i) => {
    if (i.planManual || i.factOnly || closed(i)) return i;
    const q = qty.get(i.key) ?? 0;
    return { ...i, plan: atStage(q, i.stage) };
  });
  return out;
}

const plural = (n: number, [one, few, many]: [string, string, string]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

const formatNum = (n: number) => n.toLocaleString('ru-RU').replace(/ | /g, ' ');

/** «2 стратегических партнёра»; для переименованной или своей позиции — «2 шт. «Название»» */
export function formatItemQty(item: Pick<IncomeItemValue, 'key' | 'label'>, n: number): string {
  // Своя статья с названием позиции по умолчанию (например, «Участник» на середине) склоняется так же
  const d = defaultIncomeItem(item.key) ?? INCOME_ITEMS.find((x) => x.label === item.label);
  if (d && d.label === item.label) return `${formatNum(n)} ${plural(n, d.words)}`;
  return `${formatNum(n)} шт. «${item.label}»`;
}

/** Список «что продать»: статьи с одинаковым названием (одна позиция на разных стадиях) — вместе */
function mergeByLabel(list: { i: IncomeItemValue; n: number }[]): string[] {
  const out = new Map<string, { i: IncomeItemValue; n: number }>();
  for (const x of list) {
    const id = `${x.i.group}:${x.i.label}`;
    const prev = out.get(id);
    out.set(id, prev ? { i: prev.i, n: prev.n + x.n } : { ...x });
  }
  return [...out.values()].map((x) => formatItemQty(x.i, x.n));
}

/** Рекомендация по плану продаж: что продать, чтобы выйти на цель, и как сместить структуру. */
export function planAdvice(items: IncomeItemValue[], target: number): string[] {
  if (target <= 0) return [];
  const total = incomeSum(items, 'plan');
  const list = items.filter((i) => sum3(i.plan) > 0);
  const lines: string[] = [];
  if (list.length) {
    const what = mergeByLabel(list.map((i) => ({ i, n: sum3(i.plan) })));
    const tail = what.length > 1 ? `${what.slice(0, -1).join(', ')} и ${what.at(-1)}` : what[0];
    lines.push(`Чтобы выйти на цель, нужно продать за все стадии ${tail}.`);
  }
  const manualSum = incomeSum(
    items.filter((i) => i.planManual),
    'plan',
  );
  if (items.some((i) => i.planManual)) {
    lines.push(
      manualSum >= target
        ? 'Позиций, заданных вручную, уже хватает для цели — остальные не нужны.'
        : 'Позиции, заданные вручную, сохранены; остальные подобраны так, чтобы добрать до цели.',
    );
  }
  if (total < target) {
    lines.push('Для автоподбора не хватает позиций — задайте стоимость или количество вручную.');
  }
  const tickets = items.filter(hasStages);
  const byStage = PRICE_STAGES.map((st, k) => ({ st, sum: incomeSum(tickets, 'plan', k) }));
  if (incomeSum(tickets, 'plan') > 0) {
    lines.push(
      'Билеты по стадиям: ' +
        byStage.map(({ st, sum }) => `${st.label.toLowerCase()} — ${formatNum(sum)} ₽`).join(', ') +
        '.',
    );
  }
  const discount = items.reduce((s, i) => s + itemDiscount(i, 'plan', null), 0);
  if (discount > 0) {
    lines.push(`Скидки в плане — ${formatNum(discount)} ₽, они уже учтены в количестве.`);
  }
  const partnersSum = incomeSum(
    items.filter((i) => i.group !== 'tickets'),
    'plan',
  );
  if (total > 0) {
    const share = Math.round((partnersSum / total) * 100);
    lines.push(
      `Партнёрства дают ${share}% плана, билеты — ${100 - share}%.` +
        (share < 30 ? ' План держится на билетах: стоит усилить продажи партнёрств.' : ''),
    );
  }
  const cheapestOf = (g: IncomeGroupKey) =>
    items
      .filter((i) => i.group === g && !i.factOnly && i.prices[0] > 0)
      .reduce<IncomeItemValue | null>((a, b) => (!a || b.prices[0] < a.prices[0] ? b : a), null);
  // Сравниваем с самым массовым билетом плана (обычно «Участник»)
  const ticket =
    items
      .filter((i) => i.group === 'tickets' && i.prices[0] > 0 && sum3(i.plan) > 0)
      .reduce<IncomeItemValue | null>(
        (a, b) => (!a || sum3(b.plan) > sum3(a.plan) ? b : a),
        null,
      ) ?? cheapestOf('tickets');
  const partner = cheapestOf('partners');
  if (ticket && partner && partner.prices[0] >= ticket.prices[0]) {
    const n = Math.round(partner.prices[0] / ticket.prices[0]);
    lines.push(`Одно партнёрство «${partner.label}» заменяет ${formatItemQty(ticket, n)}.`);
  }
  return lines;
}

const formatRubShort = (n: number) => `${formatNum(Math.round(n))} ₽`;
const listJoin = (a: string[]) =>
  a.length > 1 ? `${a.slice(0, -1).join(', ')} и ${a.at(-1)}` : (a[0] ?? '');

/**
 * Рекомендация на сегодня — от факта: сколько уже продано, сколько времени осталось
 * до форума и до конца текущего этапа, что недобрали на закрытых этапах, идём ли по графику
 * на текущем и что и в каком темпе нужно продать до форума, чтобы выйти на цель.
 * Закрытые этапы билетов уже не продать — их недобор переносится на текущую цену.
 */
export function salesAdvice(
  items: IncomeItemValue[],
  target: number,
  dates: [string, string, string],
  forumStart: string,
  today: string,
): string[] {
  if (target <= 0 || today < dates[0]) return [];
  const fact = incomeSum(items, 'fact');
  const gap = target - fact;
  if (today >= forumStart) {
    return [
      gap > 0
        ? `Продажи завершены: продано ${formatRubShort(fact)}, до цели не хватило ${formatRubShort(gap)}.`
        : `Продажи завершены, цель достигнута: продано ${formatRubShort(fact)}.`,
    ];
  }
  const stage = currentStage(dates, today);
  const stageEnd = stage < 2 ? dates[stage + 1] : forumStart;
  const daysLeft = diffDays(today, forumStart);
  const stageDaysLeft = Math.max(1, diffDays(today, stageEnd));
  const perWeek = (n: number, days: number) => Math.ceil((n * 7) / Math.max(7, days));
  const lines: string[] = [];
  const pct = Math.floor((fact / target) * 100);
  lines.push(
    `До форума ${formatNum(daysLeft)} ${plural(daysLeft, ['день', 'дня', 'дней'])}, идёт стадия «${PRICE_STAGES[stage].label}» (до ${formatDate(stageEnd)}). ` +
      (gap > 0
        ? `Продано ${formatRubShort(fact)} — ${pct}% цели, осталось ${formatRubShort(gap)}.`
        : `Цель уже достигнута: продано ${formatRubShort(fact)}, всё дальнейшее — сверх цели.`),
  );
  if (gap <= 0) return lines;

  const tickets = items.filter(hasStages);
  const partners = items.filter((i) => !hasStages(i));
  const ticketsQty = (kind: 'plan' | 'fact', k: number) =>
    tickets.reduce((s, i) => s + i[kind][k], 0);

  // Закрытые этапы: недобор или перевыполнение
  for (let k = 0; k < stage; k++) {
    const plan = incomeSum(tickets, 'plan', k);
    const sold = incomeSum(tickets, 'fact', k);
    if (!plan && !sold) continue;
    const q = `${formatNum(ticketsQty('fact', k))} из ${formatNum(ticketsQty('plan', k))} билетов`;
    lines.push(
      sold === plan
        ? `Стадия «${PRICE_STAGES[k].label}» закрыта по плану (продано ${q}).`
        : sold < plan
          ? `Стадия «${PRICE_STAGES[k].label}» закрыта с недобором ${formatRubShort(plan - sold)} (продано ${q}) — его нужно перекрыть на оставшихся стадиях.`
          : `Стадия «${PRICE_STAGES[k].label}» закрыта с перевыполнением на ${formatRubShort(sold - plan)} (продано ${q}).`,
    );
  }

  // Текущий этап: темп продаж относительно прошедшего времени
  const stageLen = Math.max(1, diffDays(dates[stage], stageEnd));
  const passed = Math.min(1, Math.max(0, diffDays(dates[stage], today) / stageLen));
  const planNow = ticketsQty('plan', stage);
  const soldNow = ticketsQty('fact', stage);
  if (planNow > 0) {
    const expected = Math.round(planNow * passed);
    const head = `На стадии «${PRICE_STAGES[stage].label}» продано ${formatNum(soldNow)} из ${formatNum(planNow)} билетов`;
    if (soldNow >= planNow) lines.push(`${head} — план стадии уже выполнен.`);
    else if (soldNow + Math.max(1, Math.round(planNow * 0.05)) < expected)
      lines.push(
        `${head}; по графику к сегодняшнему дню должно быть около ${formatNum(expected)} — отстаём на ${formatNum(expected - soldNow)}.`,
      );
    else lines.push(`${head} — идём по графику.`);
  }

  // Что осталось продать по плану: партнёрства — весь период, билеты — текущий и следующие этапы
  const restParts = partners
    .map((i) => ({ i, n: Math.max(0, i.plan[0] - i.fact[0]) }))
    .filter((x) => x.n > 0);
  const restTickets = tickets
    .map((i) => {
      const byStage = [0, 1, 2].map((k) => (k < stage ? 0 : Math.max(0, i.plan[k] - i.fact[k])));
      return {
        i,
        byStage,
        n: sum3(byStage as Triple),
        sum: byStage.reduce((s, n, k) => s + n * netPrice(i, k), 0),
      };
    })
    .filter((x) => x.n > 0);
  const restSum =
    restParts.reduce((s, x) => s + x.n * netPrice(x.i, 0), 0) +
    restTickets.reduce((s, x) => s + x.sum, 0);

  // Плана не хватает до цели (недобор закрытых этапов или план ниже цели) — добор билетом
  const main =
    tickets
      .filter((i) => !i.factOnly && i.stage >= stage && netPrice(i, i.stage) > 0)
      .reduce<IncomeItemValue | null>(
        (a, b) =>
          !a || b.stage < a.stage || (b.stage === a.stage && sum3(b.plan) > sum3(a.plan)) ? b : a,
        null,
      ) ?? null;
  const missing = gap - restSum;
  let extra = 0;
  if (missing > 0 && main) {
    extra = Math.ceil(missing / netPrice(main, main.stage));
    const partner = partners
      .filter((i) => !i.factOnly && netPrice(i, 0) > 0)
      .reduce<IncomeItemValue | null>(
        (a, b) => (!a || netPrice(b, 0) < netPrice(a, 0) ? b : a),
        null,
      );
    lines.push(
      `Оставшегося плана не хватает до цели на ${formatRubShort(missing)}: сверх плана нужно продать ещё ${formatItemQty(main, extra)} (${PRICE_STAGES[main.stage].label.toLowerCase()})` +
        (partner && missing / netPrice(partner, 0) <= 5
          ? ` или ${formatItemQty(partner, Math.ceil(missing / netPrice(partner, 0)))}.`
          : '.'),
    );
  }

  const what = mergeByLabel([
    ...restParts,
    ...restTickets.map((x) => ({ i: x.i, n: x.n + (x.i === main ? extra : 0) })),
    ...(main && extra && !restTickets.some((x) => x.i === main) ? [{ i: main, n: extra }] : []),
  ]);
  if (what.length) lines.push(`Чтобы выйти на цель, до форума осталось продать ${listJoin(what)}.`);

  const ticketsLeft = restTickets.reduce((s, x) => s + x.n, 0) + extra;
  const stageLeft =
    restTickets.reduce((s, x) => s + x.byStage[stage], 0) + (main?.stage === stage ? extra : 0);
  if (ticketsLeft > 0) {
    lines.push(
      `Темп по билетам: около ${formatNum(perWeek(ticketsLeft, daysLeft))} в неделю до форума` +
        (stageLeft > 0 && stage < 2
          ? `; до конца стадии «${PRICE_STAGES[stage].label}» — ${formatNum(stageLeft)} шт., около ${formatNum(perWeek(stageLeft, stageDaysLeft))} в неделю, пока цена ниже.`
          : '.'),
    );
  }
  const partsLeft = restParts.reduce((s, x) => s + x.n, 0);
  if (partsLeft > 0) {
    const weeks = Math.max(1, Math.floor(daysLeft / 7));
    lines.push(
      `Партнёрства: осталось закрыть ${formatNum(partsLeft)} ${plural(partsLeft, ['пакет', 'пакета', 'пакетов'])} за ${formatNum(weeks)} ${plural(weeks, ['неделю', 'недели', 'недель'])}` +
        (daysLeft < 45
          ? ' — времени мало, крупные договоры стоит закрывать в первую очередь.'
          : '.'),
    );
  } else if (partners.some((i) => i.plan[0] > 0)) {
    lines.push('Партнёрства по плану закрыты.');
  }
  return lines;
}
