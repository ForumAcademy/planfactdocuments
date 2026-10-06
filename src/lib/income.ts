/**
 * Доходы форума: партнёрства и билеты. У каждой позиции — цена одной единицы,
 * плановое и фактически проданное количество. Позиции по умолчанию можно переименовать
 * или убрать, свои — добавить в любую группу.
 */

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
  price: number;
  planQty: number;
  factQty: number;
  /** План задан вручную; иначе количество подбирается под цель автоматически */
  planManual: boolean;
}

export interface SavedIncomeItem {
  id?: number;
  key: string;
  price: number;
  planQty: number;
  factQty: number;
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
  const defaults = INCOME_ITEMS.filter((d) => !byKey.get(d.key)?.removed).map((d) => {
    const s = byKey.get(d.key);
    return {
      key: d.key,
      group: d.group,
      label: s?.label?.trim() || d.label,
      price: s?.price ?? d.price,
      planQty: s?.planQty ?? 0,
      factQty: s?.factQty ?? 0,
      planManual: s?.planManual ?? false,
    };
  });
  const custom = saved
    .filter((s) => !defaultIncomeItem(s.key) && !s.removed && isIncomeGroup(s.group))
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .map((s) => ({
      key: s.key,
      group: s.group as IncomeGroupKey,
      label: s.label?.trim() || 'Позиция',
      price: s.price,
      planQty: s.planQty,
      factQty: s.factQty,
      planManual: s.planManual ?? false,
    }));
  return [...defaults, ...custom];
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

const mixOf = (i: IncomeItemValue) => defaultIncomeItem(i.key)?.mix ?? CUSTOM_MIX[i.group];

/**
 * План продаж под цель. Позиции с ручным планом остаются как есть, остальные подбираются так,
 * чтобы вместе с ручными доход был не меньше цели. Партнёрств — не больше типового числа
 * (1 генеральный, 2 стратегических, 5 партнёров), остальное добирается билетами в типовой
 * пропорции; остаток — самой дешёвой позицией, чтобы перебор был минимальным.
 */
export function autoPlan(items: IncomeItemValue[], target: number): IncomeItemValue[] {
  const auto = items.filter((i) => !i.planManual && i.price > 0);
  const qty = new Map<string, number>(auto.map((i) => [i.key, 0]));
  const manualSum = items.reduce((s, i) => s + (i.planManual ? i.price * i.planQty : 0), 0);
  let rest = target - manualSum;

  if (rest > 0 && auto.length) {
    const scale = (list: IncomeItemValue[], amount: number, cap: boolean) => {
      const base = list.reduce((s, i) => s + i.price * mixOf(i), 0);
      if (!base) return 0;
      const k = amount / base;
      let sum = 0;
      for (const i of list) {
        const w = mixOf(i);
        const q = Math.floor(w * k);
        const v = cap ? Math.min(q, w) : q;
        qty.set(i.key, v);
        sum += v * i.price;
      }
      return sum;
    };
    const tickets = auto.filter((i) => i.group === 'tickets');
    const partners = auto.filter((i) => i.group !== 'tickets');
    rest -= scale(partners, rest, tickets.length > 0);
    if (rest > 0 && tickets.length) rest -= scale(tickets, rest, false);
    if (rest > 0) {
      const pool = tickets.length ? tickets : partners;
      const cheapest = pool.reduce((a, b) => (b.price < a.price ? b : a));
      qty.set(cheapest.key, qty.get(cheapest.key)! + Math.ceil(rest / cheapest.price));
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
export function planAdvice(items: IncomeItemValue[], target: number): string[] {
  if (target <= 0) return [];
  const sum = incomeSum(items, 'planQty');
  const list = items.filter((i) => i.planQty > 0);
  const lines: string[] = [];
  if (list.length) {
    const what = list.map((i) => formatItemQty(i, i.planQty));
    const tail = what.length > 1 ? `${what.slice(0, -1).join(', ')} и ${what.at(-1)}` : what[0];
    lines.push(`Чтобы выйти на цель, нужно продать ${tail}.`);
  }
  const manualSum = items.reduce((s, i) => s + (i.planManual ? i.price * i.planQty : 0), 0);
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
    .reduce((s, i) => s + i.price * i.planQty, 0);
  if (sum > 0) {
    const share = Math.round((partnersSum / sum) * 100);
    lines.push(
      `Партнёрства дают ${share}% плана, билеты — ${100 - share}%.` +
        (share < 30 ? ' План держится на билетах: стоит усилить продажи партнёрств.' : ''),
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
  if (ticket && partner && partner.price >= ticket.price) {
    const n = Math.round(partner.price / ticket.price);
    lines.push(`Одно партнёрство «${partner.label}» заменяет ${formatItemQty(ticket, n)}.`);
  }
  return lines;
}
