/**
 * «Отчёт для АЭ»: одна круговая диаграмма фактических расходов по направлениям
 * (верхнеуровневым статьям вкладки «Расходы»). Строится из задач, поэтому меняется сама.
 */
import { groupExpenses, type ExpenseTaskInput } from '../expenses';
import type { SortDir } from './donut-layout';
import type { PaletteKey } from './palette';

export interface AeChart {
  id: number;
  title: string;
  palette: PaletteKey;
  unit: string;
  sort: SortDir;
  order: number;
  items: { id: number; name: string; amount: number; note: string | null; order: number }[];
}

export const AE_CHART_TITLE = 'Фактические расходы по статьям';

export function buildAeChart<T extends ExpenseTaskInput>(
  tasks: T[],
  blockOf: (t: T) => string | null,
  sort: SortDir = 'desc',
): AeChart {
  const { groups } = groupExpenses(tasks, blockOf);
  return {
    id: 1,
    title: AE_CHART_TITLE,
    palette: 'RED',
    unit: 'млн руб.',
    sort,
    order: 0,
    items: groups
      .filter((g) => g.fact > 0)
      .map((g, k) => ({
        id: k + 1,
        name: g.category.label,
        amount: g.fact / 1_000_000,
        note: null,
        order: k,
      })),
  };
}
