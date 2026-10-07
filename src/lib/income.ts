/**
 * Доходы форума: партнёрства и билеты. У каждой позиции — цена одной единицы на каждом
 * из трёх этапов продаж («Старт продаж», «Середина», «Финальная стадия»), плановое
 * количество и фактически проданное по этапам. Скидки двух видов — индивидуальные и
 * партнёрские: в плане это доля от выручки, в факте — суммы по позициям.
 * Позиции по умолчанию можно переименовать или убрать, свои — добавить в любую группу.
 */

/** Этапы цен: чем ближе форум, тем дороже */
export const PRICE_STAGES = [
  { key: 'start', label: 'Старт продаж', short: 'Старт' },
  { key: 'mid', label: 'Середина', short: 'Середина' },
  { key: 'final', label: 'Финальная стадия', short: 'Финал' },
] as const;
export type PriceStageKey = (typeof PRICE_STAGES)[number]['key'];

/** Виды скидок */
export const DISCOUNTS = [
  { key: 'personal', label: 'Индивидуальные скидки' },
  { key: 'partner', label: 'Партнёрские скидки' },
] as const;

/** Настройки доходов форума: даты смены цен, структура плана по этапам, плановые скидки */
export interface IncomeConfig {
  /** С какой даты действуют цены «Середины» и «Финальной стадии»; null — делим период поровну */
  midDate: string | null;
  finalDate: string | null;
  /** Доля плановых продаж на каждом этапе, % */
  shares: [number, number, number];
  /** Плановые скидки, % от выручки */
  discountPersonal: number;
  discountPartner: number;
}

export const DEFAULT_SHARES: [number, number, number] = [30, 40, 30];

export const DEFAULT_INCOME_CONFIG: IncomeConfig = {
  midDate: null,
  finalDate: null,
  shares: DEFAULT_SHARES,
  discountPersonal: 0,
  discountPartner: 0,
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
  /** Цена на «Старте продаж» */
  price: number;
  /** Цена «Середины» и «Финальной стадии» */
  priceMid: number;
  priceFinal: number;
  /** Цена этапа задана вручную (иначе — как на предыдущем этапе) */
  priceMidSet: boolean;
  priceFinalSet: boolean;
  planQty: number;
  /** Продано по ценам «Старта», «Середины» и «Финала» */
  factQty: number;
  factMid: number;
  factFinal: number;
  /** Фактические скидки по позиции, руб. */
  discountPersonal: number;
  discountPartner: number;
  /** План задан вручную; иначе количество подбирается под цель автоматически */
  planManual: boolean;
}

export interface SavedIncomeItem {
  id?: number;
  key: string;
  price: number;
  priceMid?: number | null;
  priceFinal?: number | null;
  planQty: number;
  factQty: number;
  factMid?: number;
  factFinal?: number;
  discountPersonal?: number;
  discountPartner?: number;
  planManual?: boolean;
  label?: string | null;
  group?: string | null;
  removed?: boolean;
}

/**
 * Все позиции по порядку: позиции по умолчанию (кроме убранных) с сохранёнными значениями,
 * затем свои позиции в порядке добавления; внутри таблицы они разложены по группам.
 */
export function incomeItems(saved: SavedIncomeItem[]): IncomeItemValue[] {
  const byKey = new Map(saved.map((s) => [s.key, s]));
  const value = (
    s: SavedIncomeItem | undefined,
    base: Pick<IncomeItemValue, 'key' | 'group' | 'label' | 'price'>,
  ): IncomeItemValue => {
    const priceMid = s?.priceMid ?? base.price;
    return {
      ...base,
      priceMid,
      priceFinal: s?.priceFinal ?? priceMid,
      priceMidSet: s?.priceMid != null,
      priceFinalSet: s?.priceFinal != null,
      planQty: s?.planQty ?? 0,
      factQty: s?.factQty ?? 0,
      factMid: s?.factMid ?? 0,
      factFinal: s?.factFinal ?? 0,
      discountPersonal: s?.discountPersonal ?? 0,
      discountPartner: s?.discountPartner ?? 0,
      planManual: s?.planManual ?? false,
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

/** Цены позиции по этапам: старт, середина, финал */
export function stagePrices(i: IncomeItemValue): [number, number, number] {
  return [i.price, i.priceMid, i.priceFinal];
}

/** Продано по этапам: старт, середина, финал */
export function stageSold(i: IncomeItemValue): [number, number, number] {
  return [i.factQty, i.factMid, i.factFinal];
}

/** Доли этапов в плане, нормированные к 1 (если все нули — поровну) */
function shareWeights(cfg: IncomeConfig): [number, number, number] {
  const sum = cfg.shares.reduce((a, b) => a + Math.max(0, b), 0);
  if (!sum) return [1 / 3, 1 / 3, 1 / 3];
  return cfg.shares.map((v) => Math.max(0, v) / sum) as [number, number, number];
}

/** Доля плановых скидок от выручки, 0…1 */
export function planDiscountRate(cfg: IncomeConfig): number {
  return Math.min(1, Math.max(0, (cfg.discountPersonal + cfg.discountPartner) / 100));
}

/** Средняя плановая цена единицы с учётом структуры продаж по этапам, без скидок */
export function planUnitGross(i: IncomeItemValue, cfg: IncomeConfig): number {
  const w = shareWeights(cfg);
  return stagePrices(i).reduce((s, p, k) => s + p * w[k], 0);
}

/** Плановая цена единицы с учётом этапов и скидок — по ней план подбирается под цель */
export function planUnitNet(i: IncomeItemValue, cfg: IncomeConfig): number {
  return planUnitGross(i, cfg) * (1 - planDiscountRate(cfg));
}

/** План по позициям: выручка по ценам этапов, скидки и итог */
export function planTotals(items: IncomeItemValue[], cfg: IncomeConfig) {
  const gross = Math.round(items.reduce((s, i) => s + planUnitGross(i, cfg) * i.planQty, 0));
  const personal = Math.round((gross * Math.max(0, cfg.discountPersonal)) / 100);
  const partner = Math.round((gross * Math.max(0, cfg.discountPartner)) / 100);
  return { gross, personal, partner, net: Math.max(0, gross - personal - partner) };
}

/** Факт по позициям: выручка по ценам этапов, скидки и итог */
export function factTotals(items: IncomeItemValue[]) {
  const gross = items.reduce(
    (s, i) => s + stagePrices(i).reduce((a, p, k) => a + p * stageSold(i)[k], 0),
    0,
  );
  const personal = items.reduce((s, i) => s + i.discountPersonal, 0);
  const partner = items.reduce((s, i) => s + i.discountPartner, 0);
  return { gross, personal, partner, net: gross - personal - partner };
}

/** Продано всего, шт. */
export function soldQty(i: IncomeItemValue): number {
  return i.factQty + i.factMid + i.factFinal;
}

/**
 * Даты этапов цен: старт — начало продаж; «Середина» и «Финал» — заданные даты, а если
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

/** Текущий этап цен на дату */
export function currentStage(dates: [string, string, string], today: string): number {
  if (today >= dates[2]) return 2;
  if (today >= dates[1]) return 1;
  return 0;
}

export function incomeTarget(expenses: number): number {
  return Math.round(expenses * (1 + INCOME_MARGIN));
}

/** Итог плана или факта с учётом этапов цен и скидок */
export function incomeSum(
  items: IncomeItemValue[],
  field: 'planQty' | 'factQty',
  cfg: IncomeConfig = DEFAULT_INCOME_CONFIG,
): number {
  return field === 'planQty' ? planTotals(items, cfg).net : factTotals(items).net;
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
 * чтобы вместе с ручными доход был не меньше цели. Партнёрств — не больше типового числа
 * (1 генеральный, 2 стратегических, 5 партнёров), остальное добирается билетами в типовой
 * пропорции; остаток — самой дешёвой позицией, чтобы перебор был минимальным.
 */
export function autoPlan(
  items: IncomeItemValue[],
  target: number,
  cfg: IncomeConfig = DEFAULT_INCOME_CONFIG,
): IncomeItemValue[] {
  const unit = new Map(items.map((i) => [i.key, planUnitNet(i, cfg)]));
  const price = (i: IncomeItemValue) => unit.get(i.key)!;
  const auto = items.filter((i) => !i.planManual && price(i) > 0);
  const qty = new Map<string, number>(auto.map((i) => [i.key, 0]));
  const manualSum = items.reduce((s, i) => s + (i.planManual ? price(i) * i.planQty : 0), 0);
  let rest = target - manualSum;

  if (rest > 0 && auto.length) {
    const scale = (list: IncomeItemValue[], amount: number, cap: boolean) => {
      const base = list.reduce((s, i) => s + price(i) * mixOf(i), 0);
      if (!base) return 0;
      const k = amount / base;
      let sum = 0;
      for (const i of list) {
        const w = mixOf(i);
        const q = Math.floor(w * k);
        const v = cap ? Math.min(q, w) : q;
        qty.set(i.key, v);
        sum += v * price(i);
      }
      return sum;
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
  return items.map((i) => (i.planManual ? i : { ...i, planQty: qty.get(i.key) ?? 0 }));
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
export function planAdvice(
  items: IncomeItemValue[],
  target: number,
  cfg: IncomeConfig = DEFAULT_INCOME_CONFIG,
): string[] {
  if (target <= 0) return [];
  const unit = (i: IncomeItemValue) => planUnitNet(i, cfg);
  const sum = incomeSum(items, 'planQty', cfg);
  const list = items.filter((i) => i.planQty > 0);
  const lines: string[] = [];
  if (list.length) {
    const what = list.map((i) => formatItemQty(i, i.planQty));
    const tail = what.length > 1 ? `${what.slice(0, -1).join(', ')} и ${what.at(-1)}` : what[0];
    lines.push(`Чтобы выйти на цель, нужно продать ${tail}.`);
  }
  const manualSum = items.reduce((s, i) => s + (i.planManual ? unit(i) * i.planQty : 0), 0);
  if (items.some((i) => i.planManual)) {
    lines.push(
      manualSum >= target
        ? 'Позиций, заданных вручную, уже хватает для цели — остальные не нужны.'
        : 'Позиции, заданные вручную, сохранены; остальные подобраны так, чтобы добрать до цели.',
    );
  }
  if (sum < target) {
    lines.push('Для автоподбора не хватает позиций — задайте стоимость или количество вручную.');
  }
  const partnersSum = items
    .filter((i) => i.group !== 'tickets')
    .reduce((s, i) => s + unit(i) * i.planQty, 0);
  const planNoDiscount = items.reduce((s, i) => s + unit(i) * i.planQty, 0);
  if (planNoDiscount > 0) {
    const share = Math.round((partnersSum / planNoDiscount) * 100);
    lines.push(
      `Партнёрства дают ${share}% плана, билеты — ${100 - share}%.` +
        (share < 30 ? ' План держится на билетах: стоит усилить продажи партнёрств.' : ''),
    );
  }
  const disc = planTotals(items, cfg);
  if (disc.personal + disc.partner > 0) {
    lines.push(
      `Скидки в плане — ${formatNum(disc.personal + disc.partner)} ₽ ` +
        `(${formatNum(cfg.discountPersonal + cfg.discountPartner)}% выручки); они уже учтены в количестве.`,
    );
  }
  const [s0, s1, s2] = shareWeights(cfg).map((w) => Math.round(w * 100));
  if (items.some((i) => i.priceMid !== i.price || i.priceFinal !== i.priceMid)) {
    lines.push(
      `План по этапам: ${s0}% продаж на старте, ${s1}% в середине и ${s2}% на финальной стадии. ` +
        'Чем больше продаж на старте, тем ниже средняя цена.',
    );
  }
  const cheapestOf = (g: IncomeGroupKey) =>
    items
      .filter((i) => i.group === g && i.price > 0)
      .reduce<IncomeItemValue | null>((a, b) => (!a || b.price < a.price ? b : a), null);
  // Сравниваем с самым массовым билетом плана (обычно «Участник»)
  const ticket =
    items
      .filter((i) => i.group === 'tickets' && i.price > 0 && i.planQty > 0)
      .reduce<IncomeItemValue | null>((a, b) => (!a || b.planQty > a.planQty ? b : a), null) ??
    cheapestOf('tickets');
  const partner = cheapestOf('partners');
  if (ticket && partner && unit(partner) >= unit(ticket) && unit(ticket) > 0) {
    const n = Math.round(unit(partner) / unit(ticket));
    lines.push(`Одно партнёрство «${partner.label}» заменяет ${formatItemQty(ticket, n)}.`);
  }
  return lines;
}
