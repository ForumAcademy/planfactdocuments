/**
 * Доходы форума: партнёрства и билеты. У каждой позиции — цена одной единицы,
 * плановое и фактически проданное количество.
 */

export const INCOME_GROUPS = [
  {
    key: 'partners',
    label: 'Партнёрства',
    color: '#0A0A9F',
    items: [
      { key: 'general', label: 'Генеральный партнёр', price: 3_000_000 },
      { key: 'strategic', label: 'Стратегический партнёр', price: 1_500_000 },
      { key: 'partner', label: 'Партнёр', price: 500_000 },
    ],
  },
  {
    key: 'tickets',
    label: 'Билеты',
    color: '#1E9E5A',
    items: [
      { key: 'vip', label: 'VIP', price: 150_000 },
      { key: 'participant', label: 'Участник', price: 95_000 },
    ],
  },
] as const;

export type IncomeGroup = (typeof INCOME_GROUPS)[number];
export type IncomeItemKey = IncomeGroup['items'][number]['key'];

export interface IncomeItemDef {
  key: IncomeItemKey;
  label: string;
  /** Стоимость единицы по умолчанию, руб. */
  price: number;
}

export const INCOME_ITEMS: IncomeItemDef[] = INCOME_GROUPS.flatMap(
  (g): readonly IncomeItemDef[] => g.items,
);
export const INCOME_KEYS = INCOME_ITEMS.map((i) => i.key) as IncomeItemKey[];

/** Целевая наценка над расходами: доход = расходы + 30% */
export const INCOME_MARGIN = 0.3;

/** Типовая структура продаж для калькулятора, когда план ещё пуст */
const DEFAULT_MIX: Record<IncomeItemKey, number> = {
  general: 1,
  strategic: 2,
  partner: 5,
  vip: 20,
  participant: 150,
};

export function isIncomeKey(v: unknown): v is IncomeItemKey {
  return typeof v === 'string' && (INCOME_KEYS as string[]).includes(v);
}

export interface IncomeItemValue {
  key: IncomeItemKey;
  price: number;
  planQty: number;
  factQty: number;
}

/** Все позиции по порядку: сохранённые значения поверх цен по умолчанию. */
export function incomeItems(
  saved: { key: string; price: number; planQty: number; factQty: number }[],
): IncomeItemValue[] {
  const byKey = new Map(saved.map((s) => [s.key, s]));
  return INCOME_ITEMS.map((d) => {
    const s = byKey.get(d.key);
    return {
      key: d.key,
      price: s?.price ?? d.price,
      planQty: s?.planQty ?? 0,
      factQty: s?.factQty ?? 0,
    };
  });
}

export function incomeTarget(expenses: number): number {
  return Math.round(expenses * (1 + INCOME_MARGIN));
}

export function incomeSum(items: IncomeItemValue[], field: 'planQty' | 'factQty'): number {
  return items.reduce((s, i) => s + i.price * i[field], 0);
}

/**
 * Сколько единиц каждой позиции продать, чтобы доход был не меньше цели.
 * Структура продаж — как в плане (или типовая, если план пуст): количества
 * пропорционально масштабируются с округлением вниз, а остаток добирается
 * самой дешёвой позицией из структуры — так перебор над целью минимальный.
 */
export function forecastQuantities(
  items: IncomeItemValue[],
  target: number,
): Record<IncomeItemKey, number> {
  const result = Object.fromEntries(INCOME_KEYS.map((k) => [k, 0])) as Record<
    IncomeItemKey,
    number
  >;
  const priced = items.filter((i) => i.price > 0);
  if (target <= 0 || priced.length === 0) return result;

  const hasPlan = priced.some((i) => i.planQty > 0);
  const mix = priced
    .map((i) => ({ i, w: hasPlan ? i.planQty : DEFAULT_MIX[i.key] }))
    .filter((m) => m.w > 0);
  const base = mix.reduce((s, m) => s + m.i.price * m.w, 0);
  const k = target / base;

  let sum = 0;
  for (const m of mix) {
    const q = Math.floor(m.w * k);
    result[m.i.key] = q;
    sum += q * m.i.price;
  }
  if (sum < target) {
    const cheapest = mix.reduce((a, b) => (b.i.price < a.i.price ? b : a)).i;
    result[cheapest.key] += Math.ceil((target - sum) / cheapest.price);
  }
  return result;
}
