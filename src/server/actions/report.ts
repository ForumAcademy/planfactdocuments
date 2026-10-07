'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { isoToDb } from '@/lib/dates';
import { optionalIsoDate } from '@/lib/validation';
import { run, UserError, type ActionResult } from '@/server/action-utils';
import { AUTO_SOURCES } from '@/lib/report/auto-charts';
import { getReportCharts, type ChartDTO } from '@/server/report-queries';

const id = z.number().int().positive();
const palette = z.enum(['RED', 'GREEN', 'BLUE']);

// Диаграммы страница обновляет сама по ответу сервера — пересобирать её целиком не нужно.
// Дата отчёта хранится в форуме (шапка страницы), её обновляем через пересборку.
function refresh(forumId: number) {
  revalidatePath(`/forums/${forumId}/report`);
  revalidatePath(`/forums/${forumId}/report-ae`);
}

export async function setReportDate(forumId: number, date: string | null): Promise<ActionResult> {
  return run(async () => {
    await requireEditor();
    const d = optionalIsoDate.parse(date);
    await prisma.forum.update({ where: { id: forumId }, data: { reportDate: isoToDb(d) } });
    refresh(forumId);
    return null;
  });
}

const chartSchema = z.object({
  id: id.optional(),
  title: z.string().trim().min(1, 'Укажите название диаграммы').max(200),
  palette,
  unit: z.string().trim().min(1, 'Укажите единицу измерения').max(50),
  /** Только при создании: вкладка и источник автоматической диаграммы */
  report: z.enum(['main', 'ae']).default('main'),
  source: z
    .enum(AUTO_SOURCES.map((a) => a.key) as [string, ...string[]])
    .nullish()
    .transform((v) => v ?? null),
});

export async function saveChart(
  forumId: number,
  input: z.input<typeof chartSchema>,
): Promise<ActionResult<ChartDTO[]>> {
  return run(async () => {
    await requireEditor();
    const d = chartSchema.parse(input);
    if (d.id) {
      await prisma.reportChart.update({
        where: { id: d.id, forumId },
        data: { title: d.title, palette: d.palette, unit: d.unit },
      });
    } else {
      const agg = await prisma.reportChart.aggregate({ where: { forumId }, _max: { order: true } });
      await prisma.reportChart.create({
        data: {
          forumId,
          title: d.title,
          palette: d.palette,
          unit: d.unit,
          report: d.report,
          source: d.source,
          order: (agg._max.order ?? 0) + 1,
        },
      });
    }
    return getReportCharts(forumId);
  });
}

const sortDir = z.enum(['desc', 'asc']);

/** Порядок статей в диаграмме отчёта: по убыванию или по возрастанию. */
export async function setChartSort(
  forumId: number,
  chartId: number,
  sort: 'desc' | 'asc',
): Promise<ActionResult<ChartDTO[]>> {
  return run(async () => {
    await requireEditor();
    await prisma.reportChart.update({
      where: { id: id.parse(chartId), forumId },
      data: { sort: sortDir.parse(sort) },
    });
    return getReportCharts(forumId);
  });
}

export async function deleteChart(
  forumId: number,
  chartId: number,
): Promise<ActionResult<ChartDTO[]>> {
  return run(async () => {
    await requireEditor();
    await prisma.reportChart.delete({ where: { id: chartId, forumId } });
    return getReportCharts(forumId);
  });
}

export async function reorderCharts(
  forumId: number,
  ids: number[],
): Promise<ActionResult<ChartDTO[]>> {
  return run(async () => {
    await requireEditor();
    const list = z.array(id).max(100).parse(ids);
    await prisma.$transaction(
      list.map((chartId, i) =>
        prisma.reportChart.update({ where: { id: chartId, forumId }, data: { order: i + 1 } }),
      ),
    );
    return getReportCharts(forumId);
  });
}

const itemsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, 'У каждой строки должно быть название').max(300),
      amount: z.number().finite().min(0, 'Сумма не может быть отрицательной').max(1e12),
      note: z
        .string()
        .trim()
        .max(100)
        .nullish()
        .transform((v) => v || null),
    }),
  )
  .max(100);

/** Заменяет строки диаграммы (порядок — как в списке); автоматическая диаграмма становится ручной. */
export async function saveChartItems(
  forumId: number,
  chartId: number,
  items: z.input<typeof itemsSchema>,
): Promise<ActionResult<ChartDTO[]>> {
  return run(async () => {
    await requireEditor();
    const list = itemsSchema.parse(items);
    const chart = await prisma.reportChart.findFirst({ where: { id: chartId, forumId } });
    if (!chart) throw new UserError('Диаграмма не найдена');
    await prisma.$transaction([
      prisma.reportChart.update({ where: { id: chartId }, data: { source: null } }),
      prisma.reportItem.deleteMany({ where: { chartId } }),
      prisma.reportItem.createMany({
        data: list.map((i, k) => ({
          chartId,
          name: i.name,
          amount: Math.round(i.amount * 100) / 100,
          note: i.note,
          order: k + 1,
        })),
      }),
    ]);
    return getReportCharts(forumId);
  });
}

/** Копирует структуру отчёта (диаграммы и строки, при желании — с суммами) из другого форума. */
export async function copyReportFrom(
  forumId: number,
  sourceForumId: number,
  withAmounts: boolean,
): Promise<ActionResult<ChartDTO[]>> {
  return run(async () => {
    await requireEditor();
    if (forumId === sourceForumId) throw new UserError('Выберите другой форум');
    const src = await prisma.reportChart.findMany({
      where: { forumId: sourceForumId, report: 'main' },
      include: { items: { orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    });
    if (!src.length) throw new UserError('В выбранном форуме нет диаграмм');
    await prisma.$transaction(async (tx) => {
      await tx.reportChart.deleteMany({ where: { forumId, report: 'main' } });
      for (const c of src) {
        await tx.reportChart.create({
          data: {
            forumId,
            title: c.title,
            palette: c.palette,
            unit: c.unit,
            sort: c.sort,
            order: c.order,
            source: c.source,
            items: {
              create: c.items.map((i) => ({
                name: i.name,
                amount: withAmounts ? i.amount : 0,
                note: withAmounts ? i.note : null,
                order: i.order,
              })),
            },
          },
        });
      }
    });
    return getReportCharts(forumId);
  });
}

const importSchema = z
  .array(
    z.object({
      title: z.string().trim().min(1, 'У каждой диаграммы должно быть название').max(200),
      palette,
      unit: z.string().trim().min(1).max(50),
      items: itemsSchema,
    }),
  )
  .min(1, 'В файле нет диаграмм')
  .max(50);

/** Загрузка отчёта из Excel: диаграммы «Отчёта» заменяются диаграммами из файла. */
export async function importReport(
  forumId: number,
  charts: z.input<typeof importSchema>,
): Promise<ActionResult<ChartDTO[]>> {
  return run(async () => {
    await requireEditor();
    const list = importSchema.parse(charts);
    await prisma.$transaction(async (tx) => {
      await tx.reportChart.deleteMany({ where: { forumId, report: 'main' } });
      for (const [k, c] of list.entries()) {
        await tx.reportChart.create({
          data: {
            forumId,
            title: c.title,
            palette: c.palette,
            unit: c.unit,
            order: k + 1,
            items: {
              create: c.items.map((i, j) => ({
                name: i.name,
                amount: Math.round(i.amount * 100) / 100,
                note: i.note,
                order: j + 1,
              })),
            },
          },
        });
      }
    });
    return getReportCharts(forumId);
  });
}
