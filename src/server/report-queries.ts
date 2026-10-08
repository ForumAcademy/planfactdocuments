import 'server-only';
import { prisma } from '@/lib/db';
import { isSortDir, type SortDir } from '@/lib/report/donut-layout';
import { isAutoSource, type AutoSource } from '@/lib/report/auto-charts';
import type { PaletteKey } from '@/lib/report/palette';

export type ReportKind = 'main' | 'ae';

export interface ChartDTO {
  id: number;
  title: string;
  palette: PaletteKey;
  unit: string;
  sort: SortDir;
  order: number;
  /** Вкладка: «Отчёт» или «Отчёт для АЭ» */
  report: ReportKind;
  /** Автоматическая диаграмма (строки берутся из «Расходов» и «Доходов»); null — ручная */
  source: AutoSource | null;
  /** Когда строки автоматической диаграммы обновлены (ISO); null — ещё ни разу */
  refreshedAt: string | null;
  /** В подразделе «Архив» */
  archived: boolean;
  items: { id: number; name: string; amount: number; note: string | null; order: number }[];
}

export async function getReportCharts(forumId: number): Promise<ChartDTO[]> {
  const charts = await prisma.reportChart.findMany({
    where: { forumId },
    include: { items: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  return charts.map((c) => ({
    id: c.id,
    title: c.title,
    palette: c.palette,
    unit: c.unit,
    sort: isSortDir(c.sort) ? c.sort : 'desc',
    order: c.order,
    report: c.report === 'ae' ? 'ae' : 'main',
    source: isAutoSource(c.source) ? c.source : null,
    refreshedAt: c.refreshedAt?.toISOString() ?? null,
    archived: c.archived,
    items: c.items.map((i) => ({
      id: i.id,
      name: i.name,
      amount: Number(i.amount),
      note: i.note,
      order: i.order,
    })),
  }));
}
