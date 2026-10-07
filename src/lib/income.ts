/**
 * Доходы форума: партнёрства и билеты. У каждой позиции — цена одной единицы,
 * индивидуальная скидка (%), плановое и фактически проданное количество.
 * Билеты продаются в три этапа — «Старт продаж», «Середина», «Финальная стадия»: на каждом
 * этапе у билета свои цена, скидка, план и факт, итог складывается из всех этапов.
 * У партнёрств этапов нет — их условия хранятся как условия «Старта». Позиции по умолчанию можно переименовать
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

/** Настройки доходов форума: даты смены этапов и доли этапов для автоподбора плана */
export interface IncomeConfig {
  /** С какой даты начинаются «Середина» и «Финальная стадия»; null — период делится поровну */
  midDate: string | null;
  finalDate: string | null;
  /** Как автоподбор раскладывает план позиции по этапам, % */
  shares: Triple;
}

export const DEFAULT_SHARES: Triple = [30, 40, 30];

export const DEFAULT_INCOME_CONFIG: IncomeConfig = {
  midDate: null,
  finalDate: null,
  shares: DEFAULT_SHARES,
};

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
  /** Цена 1 ед. по этапам, руб. */
  prices: Triple;
  /** Индивидуальная скидка по этапам, % */
  discounts: Triple;
  /** Цена / скидка этапа задана своя (иначе — как на предыдущем этапе); для старта всегда true */
  priceSet: [boolean, boolean, boolean];
  discountSet: [boolean, boolean, boolean];
  /** План и факт по этапам, шт. */
  plan: Triple;
  fact: Triple;
  /** План задан вручную; иначе количество подбирается под цель автоматически */
  planManual: boolean;
}

export interface SavedIncomeItem {
  id?: number;
  key: string;
  price: number;
  priceMid?: number | null;
  priceFinal?: number | null;
  discount?: number;
  discountMid?: number | null;
  discountFinal?: number | null;
  planQty: number;
  planMid?: number;
  planFinal?: number;
  factQty: number;
  factMid?: number;
  factFinal?: number;
  planManual?: boolean;
  label?: string | null;
  group?: string | null;
  removed?: boolean;
}

/** Значения по этапам: незаданный этап берёт значение предыдущего */
function inherit(first: number, rest: (number | null | undefined)[]): Triple {
  const out: number[] = [first];
  for (const v of rest) out.push(v ?? out[out.length - 1]);
  return out as Triple;
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
  ): IncomeItemValue => ({
    key: base.key,
    group: base.group,
    label: base.label,
    prices: inherit(base.price, [s?.priceMid, s?.priceFinal]),
    discounts: inherit(s?.discount ?? 0, [s?.discountMid, s?.discountFinal]),
    priceSet: [true, s?.priceMid != null, s?.priceFinal != null],
    discountSet: [true, s?.discountMid != null, s?.discountFinal != null],
    plan: [s?.planQty ?? 0, s?.planMid ?? 0, s?.planFinal ?? 0],
    fact: [s?.factQty ?? 0, s?.factMid ?? 0, s?.factFinal ?? 0],
    planManual: s?.planManual ?? false,
  });
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
  return [...defaults, ...custom].map(flatten);
}

const sum3 = (t: Triple) => t[0] + t[1] + t[2];

/** Этапы продаж есть только у билетов */
export function hasStages(i: Pick<IncomeItemValue, 'group'>): boolean {
  return i.group === 'tickets';
}

/** Партнёрство без этапов: все условия — как на «Старте», количество — целиком в нём */
function flatten(i: IncomeItemValue): IncomeItemValue {
  if (hasStages(i)) return i;
  return {
    ...i,
    prices: [i.prices[0], i.prices[0], i.prices[0]],
    discounts: [i.discounts[0], i.discounts[0], i.discounts[0]],
    priceSet: [true, false, false],
    discountSet: [true, false, false],
    plan: [sum3(i.plan), 0, 0],
    fact: [sum3(i.fact), 0, 0],
  };
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

/** Доли этапов для автоподбора, нормированные к 1 (если все нули — поровну) */
export function shareWeights(cfg: Pick<IncomeConfig, 'shares'>): Triple {
  const total = cfg.shares.reduce((a, b) => a + Math.max(0, b), 0);
  if (!total) return [1 / 3, 1 / 3, 1 / 3];
  return cfg.shares.map((v) => Math.max(0, v) / total) as Triple;
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

/** Делит количество по долям этапов; остаток — на этап с наибольшей долей */
export function splitByShares(qty: number, w: Triple): Triple {
  const out = w.map((x) => Math.floor(qty * x)) as Triple;
  const rest = qty - sum3(out);
  const top = w.indexOf(Math.max(...w));
  out[top] += rest;
  return out;
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
 * позиции раскладывается по этапам в долях из настроек.
 */
export function autoPlan(
  items: IncomeItemValue[],
  target: number,
  cfg: Pick<IncomeConfig, 'shares'> = DEFAULT_INCOME_CONFIG,
): IncomeItemValue[] {
  const w = shareWeights(cfg);
  const unitOf = (i: IncomeItemValue) =>
    hasStages(i) ? w.reduce((s, x, k) => s + x * netPrice(i, k), 0) : netPrice(i, 0);
  const unit = new Map(items.map((i) => [i.key, unitOf(i)]));
  const price = (i: IncomeItemValue) => unit.get(i.key)!;
  const auto = items.filter((i) => !i.planManual && price(i) > 0);
  const qty = new Map<string, number>(auto.map((i) => [i.key, 0]));
  const manualSum = incomeSum(
    items.filter((i) => i.planManual),
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
    if (i.planManual) return i;
    const q = qty.get(i.key) ?? 0;
    return { ...i, plan: hasStages(i) ? splitByShares(q, w) : ([q, 0, 0] as Triple) };
  });
  // Раскладка по этапам округляет количество — добираем до цели самой дешёвой продажей
  const pool = out.filter((i) => !i.planManual && (qty.get(i.key) ?? 0) > 0);
  for (let guard = 0; guard < 3 && pool.length; guard++) {
    const gap = target - incomeSum(out, 'plan');
    if (gap <= 0) break;
    let best = { item: pool[0], stage: 0, p: Infinity };
    for (const i of pool)
      for (let k = 0; k < (hasStages(i) ? 3 : 1); k++) {
        const p = netPrice(i, k);
        if (p > 0 && p < best.p) best = { item: i, stage: k, p };
      }
    if (!Number.isFinite(best.p)) break;
    best.item.plan[best.stage] += Math.ceil(gap / best.p);
  }
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
  const d = defaultIncomeItem(item.key);
  if (d && d.label === item.label) return `${formatNum(n)} ${plural(n, d.words)}`;
  return `${formatNum(n)} шт. «${item.label}»`;
}

/** Рекомендация по плану продаж: что продать, чтобы выйти на цель, и как сместить структуру. */
export function planAdvice(items: IncomeItemValue[], target: number): string[] {
  if (target <= 0) return [];
  const total = incomeSum(items, 'plan');
  const list = items.filter((i) => sum3(i.plan) > 0);
  const lines: string[] = [];
  if (list.length) {
    const what = list.map((i) => formatItemQty(i, sum3(i.plan)));
    const tail = what.length > 1 ? `${what.slice(0, -1).join(', ')} и ${what.at(-1)}` : what[0];
    lines.push(`Чтобы выйти на цель, нужно продать за все этапы ${tail}.`);
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
      'Билеты по этапам: ' +
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
      .filter((i) => i.group === g && i.prices[0] > 0)
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
