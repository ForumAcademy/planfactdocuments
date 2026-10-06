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
