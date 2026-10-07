/**
 * «Отчёт для АЭ»: круговые диаграммы, собранные из таблицы «Расходы».
 * Первая диаграмма — расходы по направлениям, дальше — по диаграмме на направление
 * с крупнейшими задачами (остальные сведены в одну строку).
 */
import { groupExpenses, type ExpenseTaskInput } from '../expenses';
import type { PaletteKey } from './palette';

export type AeView = 'plan' | 'fact';

export interface AeChart {
  id: number;
  title: string;
  palette: PaletteKey;
  unit: string;
  order: number;
  items: { id: number; name: string; amount: number; note: string | null; order: number }[];
}

/** Сколько задач направления показывать отдельными строками */
export const AE_TOP_TASKS = 7;

interface AeTask extends ExpenseTaskInput {
  number: number;
}

/** Единица диаграммы: млн руб., а для небольших сумм — тыс. руб. */
function unitFor(total: number): { unit: string; div: number } {
  return total >= 1_000_000
    ? { unit: 'млн руб.', div: 1_000_000 }
    : { unit: 'тыс. руб.', div: 1_000 };
}

export function buildAeCharts<T extends AeTask>(
  tasks: T[],
  blockOf: (t: T) => string | null,
  view: AeView,
  /** Предельно допустимые расходы — для диаграммы освоения в факте */
  cap: number | null,
): AeChart[] {
  const value = (t: T) => (view === 'plan' ? t.cost : (t.costFact ?? 0));
  const { groups } = groupExpenses(tasks, blockOf);
  const palette: PaletteKey = view === 'plan' ? 'BLUE' : 'GREEN';
  const suffix = view === 'plan' ? 'план' : 'факт';
  const charts: AeChart[] = [];
  let id = 0;
  const chart = (title: string, rows: { name: string; amount: number; note?: string | null }[]) => {
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const { unit, div } = unitFor(total);
    charts.push({
      id: ++id,
      title,
      palette,
      unit,
      order: charts.length,
      items: rows.map((r, k) => ({
        id: id * 1000 + k,
        name: r.name,
        amount: r.amount / div,
        note: r.note ?? null,
        order: k,
      })),
    });
  };

  const byGroup = groups
    .map((g) => ({ g, sum: g.tasks.reduce((s, t) => s + value(t), 0) }))
    .filter((x) => x.sum > 0);
  const total = byGroup.reduce((s, x) => s + x.sum, 0);
  if (!total) return [];

  chart(
    `Расходы по направлениям (${suffix})`,
    byGroup.map(({ g, sum }) => ({ name: g.category.label, amount: sum })),
  );

  if (view === 'fact' && cap && cap > 0) {
    chart(
      'Освоение предельно допустимых расходов',
      total > cap
        ? [
            { name: 'В пределах лимита', amount: cap },
            { name: 'Превышение лимита', amount: total - cap },
          ]
        : [
            { name: 'Израсходовано', amount: total },
            { name: 'Остаток', amount: cap - total },
          ],
    );
  }

  for (const { g } of byGroup) {
    const list = g.tasks.filter((t) => value(t) > 0).sort((a, b) => value(b) - value(a));
    const top = list.slice(0, AE_TOP_TASKS);
    const rest = list.slice(AE_TOP_TASKS);
    const rows: { name: string; amount: number; note?: string }[] = top.map((t) => ({
      name: `${t.number}. ${t.description}`,
      amount: value(t),
    }));
    if (rest.length) {
      rows.push({
        name: 'Остальные задачи',
        amount: rest.reduce((s, t) => s + value(t), 0),
        note: `${rest.length} шт.`,
      });
    }
    chart(`${g.category.label} (${suffix})`, rows);
  }
  return charts;
}
