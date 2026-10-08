/**
 * Автоматические диаграммы «Отчёта» и «Отчёта для АЭ»: строки считаются из вкладок «Расходы» и
 * «Доходы» и меняются вместе с ними. В базе у такой диаграммы хранятся только название, цвет,
 * единица, порядок и сортировка — строк нет.
 */
import { groupExpenses, type ExpenseTaskInput } from '../expenses';
import { isUsdUnit } from './units';
import {
  incomeSum,
  itemSum,
  plannedIncome,
  targetExpenses,
  type IncomeConfig,
  type IncomeItemValue,
  type PaidDealInput,
} from '../income';
import type { PaletteKey } from './palette';

export const AUTO_SOURCES = [
  {
    key: 'expenses-fact',
    title: 'Фактические расходы по статьям',
    palette: 'RED',
    hint: 'Факт по направлениям вкладки «Расходы»',
  },
  {
    key: 'expenses-plan',
    title: 'Плановые расходы по статьям',
    palette: 'RED',
    hint: 'План (стоимость задач) по направлениям вкладки «Расходы»',
  },
  {
    key: 'income-fact',
    title: 'Фактические доходы по статьям',
    palette: 'GREEN',
    hint: 'Факт вкладки «Доходы» вместе с оплаченными сделками воронки',
  },
  {
    key: 'income-plan',
    title: 'Плановые доходы по статьям',
    palette: 'GREEN',
    hint: 'План вкладки «Доходы»',
  },
  {
    key: 'balance',
    title: 'Расходы и доходы (факт)',
    palette: 'BLUE',
    hint: 'Итоги факта вкладок «Расходы» и «Доходы»',
  },
] as const satisfies readonly { key: string; title: string; palette: PaletteKey; hint: string }[];

export type AutoSource = (typeof AUTO_SOURCES)[number]['key'];

export function isAutoSource(v: unknown): v is AutoSource {
  return AUTO_SOURCES.some((s) => s.key === v);
}

export function autoSource(key: AutoSource) {
  return AUTO_SOURCES.find((s) => s.key === key)!;
}

/** Базовые диаграммы, которые появляются у форума сами */
export const BASE_CHARTS: Record<'main' | 'ae', AutoSource[]> = {
  main: ['expenses-fact', 'income-fact', 'balance'],
  ae: ['expenses-fact'],
};

/** Строки ReportChart для базовых диаграмм вкладки (order — с 1 по порядку) */
export function baseChartRows(forumId: number, report: 'main' | 'ae') {
  return BASE_CHARTS[report].map((key, i) => {
    const a = autoSource(key);
    return { forumId, report, source: key, title: a.title, palette: a.palette, order: i + 1 };
  });
}

export interface AutoChartInput<T extends ExpenseTaskInput> {
  tasks: T[];
  blockOf: (t: T) => string | null;
  expenseLimit: number | null;
  income: { items: IncomeItemValue[]; config: IncomeConfig; deals: PaidDealInput[] };
  salesStart: string;
  forumStart: string;
  today: string;
}

/**
 * Делитель рублёвых сумм по единице диаграммы: «млн руб.», «тыс. руб.», рубли; для «$», «тыс. $»,
 * «млн $» — ещё и курс доллара форума (руб. за 1 $).
 */
export function unitScale(unit: string, usdRate: number | null = null): number {
  const u = unit.toLowerCase();
  const base = u.includes('млрд') ? 1e9 : u.includes('млн') ? 1e6 : u.includes('тыс') ? 1e3 : 1;
  return isUsdUnit(u) && usdRate ? base * usdRate : base;
}

/** Сумма по статьям в рублях: строки без денег не показываются */
export type AutoRow = { name: string; rub: number };

/** Все автоматические источники разом — считаются один раз на страницу */
export function computeAutoRows<T extends ExpenseTaskInput>(
  input: AutoChartInput<T>,
): Record<AutoSource, AutoRow[]> {
  const { groups, fact: expFact } = groupExpenses(input.tasks, input.blockOf);
  const { config, deals } = input.income;
  const { planned } = plannedIncome({
    items: input.income.items,
    config,
    deals,
    expenses: targetExpenses(input.tasks, input.expenseLimit),
    salesStart: input.salesStart,
    forumStart: input.forumStart,
    today: input.today,
  });
  const incomeBy = (kind: 'plan' | 'fact') => {
    // Билеты одной статьи на разных стадиях цен — одна строка
    const acc = new Map<string, number>();
    for (const i of planned) {
      if (kind === 'plan' && i.factOnly) continue;
      acc.set(i.label, (acc.get(i.label) ?? 0) + itemSum(i, kind, null));
    }
    return [...acc].map(([name, rub]) => ({ name, rub }));
  };
  const rows: Record<AutoSource, AutoRow[]> = {
    'expenses-fact': groups.map((g) => ({ name: g.category.label, rub: g.fact })),
    'expenses-plan': groups.map((g) => ({ name: g.category.label, rub: g.total })),
    'income-fact': incomeBy('fact'),
    'income-plan': incomeBy('plan'),
    balance: [
      { name: 'Расходы', rub: expFact },
      { name: 'Доходы', rub: incomeSum(planned, 'fact') },
    ],
  };
  for (const k of Object.keys(rows) as AutoSource[]) rows[k] = rows[k].filter((r) => r.rub > 0);
  return rows;
}

/** Строки диаграммы в её единице измерения */
export function autoItems(rows: AutoRow[], unit: string, usdRate: number | null = null) {
  const scale = unitScale(unit, usdRate);
  return rows.map((r, k) => ({
    id: -(k + 1),
    name: r.name,
    amount: r.rub / scale,
    note: null,
    order: k,
  }));
}
