import 'server-only';
import { prisma } from '@/lib/db';
import type { PaletteKey } from '@/lib/report/palette';

export interface ChartDTO {
  id: number;
  title: string;
  palette: PaletteKey;
  unit: string;
  order: number;
  items: { id: number; name: string; amount: number; order: number }[];
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
    order: c.order,
    items: c.items.map((i) => ({
      id: i.id,
      name: i.name,
      amount: Number(i.amount),
      order: i.order,
    })),
  }));
}
