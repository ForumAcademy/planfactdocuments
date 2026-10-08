'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { isoToDb, todayMsk } from '@/lib/dates';
import { optionalIsoDate } from '@/lib/validation';
import { run, UserError, type ActionResult } from '@/server/action-utils';
import { AUTO_SOURCES, unitScale } from '@/lib/report/auto-charts';
import { isUsdUnit } from '@/lib/report/units';
import { forumUsdRate } from '@/lib/usd';
import { getUsdRates, toForumDTO } from '@/server/queries';
import { PALETTE_KEYS, type PaletteKey } from '@/lib/report/palette';
import { getReportCharts, type ChartDTO } from '@/server/report-queries';

const id = z.number().int().positive();
const palette = z.enum(PALETTE_KEYS as [PaletteKey, ...PaletteKey[]]);

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
  /** Только при создании автоматической диаграммы: строки из «Расходов» и «Доходов», руб. */
  rows: z.lazy(() => autoRowsSchema).optional(),
});

/** Строки автоматической диаграммы — суммы в рублях */
const autoRowsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(300),
      rub: z.number().finite().min(0).max(1e12),
    }),
  )
  .max(100);

function autoItemsData(rows: z.infer<typeof autoRowsSchema>) {
  return rows.map((r, k) => ({
    name: r.name,
    amount: Math.round(r.rub * 100) / 100,
    order: k + 1,
  }));
}

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
          ...(d.source && d.rows
            ? { refreshedAt: new Date(), items: { create: autoItemsData(d.rows) } }
            : {}),
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

/** «Автообновление»: строки автоматической диаграммы заново берутся из «Расходов» и «Доходов». */
export async function refreshAutoChart(
  forumId: number,
  chartId: number,
  rows: z.input<typeof autoRowsSchema>,
): Promise<ActionResult<ChartDTO[]>> {
  return run(async () => {
    await requireEditor();
    const list = autoRowsSchema.parse(rows);
    const chart = await prisma.reportChart.findFirst({ where: { id: id.parse(chartId), forumId } });
    if (!chart) throw new UserError('Диаграмма не найдена');
    if (!chart.source) throw new UserError('Диаграмма с ручным вводом не обновляется');
    await prisma.$transaction([
      prisma.reportItem.deleteMany({ where: { chartId } }),
      prisma.reportItem.createMany({ data: autoItemsData(list).map((i) => ({ ...i, chartId })) }),
      prisma.reportChart.update({
        where: { id: chartId },
        data: { refreshedAt: new Date(), edited: false },
      }),
    ]);
    return getReportCharts(forumId);
  });
}

/** Перенос диаграммы в подраздел «Архив» и обратно; вернувшаяся встаёт последней. */
export async function setChartArchived(
  forumId: number,
  chartId: number,
  archived: boolean,
): Promise<ActionResult<ChartDTO[]>> {
  return run(async () => {
    await requireEditor();
    const chart = await prisma.reportChart.findFirst({ where: { id: id.parse(chartId), forumId } });
    if (!chart) throw new UserError('Диаграмма не найдена');
    const agg = archived
      ? null
      : await prisma.reportChart.aggregate({ where: { forumId }, _max: { order: true } });
    await prisma.reportChart.update({
      where: { id: chartId },
      data: {
        archived: z.boolean().parse(archived),
        ...(agg && { order: (agg._max.order ?? 0) + 1 }),
      },
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

const updateSchema = z.object({
  title: z.string().trim().min(1, 'Укажите название диаграммы').max(200),
  palette,
  unit: z.string().trim().min(1, 'Укажите единицу измерения').max(50),
  items: itemsSchema,
});

/**
 * Сохраняет диаграмму целиком: название, цвет, единицу и строки (порядок — как в списке).
 * Автоматическая остаётся автоматической с пометкой «изменена вручную»: её строки хранятся
 * в рублях, а «Автообновление» возвращает данные «Расходов» и «Доходов».
 */
export async function updateChart(
  forumId: number,
  chartId: number,
  input: z.input<typeof updateSchema>,
): Promise<ActionResult<ChartDTO[]>> {
  return run(async () => {
    await requireEditor();
    const d = updateSchema.parse(input);
    const chart = await prisma.reportChart.findFirst({ where: { id: id.parse(chartId), forumId } });
    if (!chart) throw new UserError('Диаграмма не найдена');
    const forum = await prisma.forum.findUniqueOrThrow({ where: { id: forumId } });
    const usdRate = forumUsdRate(await getUsdRates(), toForumDTO(forum), todayMsk())?.rate ?? null;
    if (chart.source && isUsdUnit(d.unit) && !usdRate)
      throw new UserError('Задайте курс $ в «База данных» → «Курс $»');
    const scale = chart.source ? unitScale(d.unit, usdRate) : 1;
    await prisma.$transaction([
      prisma.reportChart.update({
        where: { id: chartId },
        data: {
          title: d.title,
          palette: d.palette,
          unit: d.unit,
          ...(chart.source && { edited: true }),
        },
      }),
      prisma.reportItem.deleteMany({ where: { chartId } }),
      prisma.reportItem.createMany({
        data: d.items.map((i, k) => ({
          chartId,
          name: i.name,
          amount: Math.round(i.amount * scale * 100) / 100,
          note: i.note,
          order: k + 1,
        })),
      }),
    ]);
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
      await tx.reportChart.deleteMany({ where: { forumId, report: 'main', archived: false } });
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
