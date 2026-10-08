'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { isoToDb } from '@/lib/dates';
import {
  defaultIncomeItem,
  isIncomeGroup,
  sameSnapshot,
  type IncomeConfig,
  type IncomeItemValue,
  type PlanSnapshot,
} from '@/lib/income';
import { run, UserError, type ActionResult } from '@/server/action-utils';
import { getIncomeConfig, getIncomeItems, getIncomePlanHistory } from '@/server/queries';

/** Линия доходов над вкладками форума берёт эти данные из layout — обновить его */
function refreshStatusLines(forumId: number) {
  revalidatePath(`/forums/${forumId}`, 'layout');
}

const amount = z.number().int().min(0).max(2_000_000_000);
const qty = z.number().int().min(0).max(1_000_000);
const label = z.string().trim().min(1, 'Укажите название позиции').max(120);

const stage = z.number().int().min(0).max(2);

const patchSchema = z.object({
  key: z.string().min(1).max(40),
  price: amount.optional(),
  /** Индивидуальная скидка, % */
  discount: z.number().min(0).max(100).optional(),
  planQty: qty.optional(),
  factQty: qty.optional(),
  /** Стадия продаж билета */
  stage: stage.optional(),
  planManual: z.boolean().optional(),
  label: label.optional(),
  /** Вернуть убранную позицию по умолчанию */
  removed: z.literal(false).optional(),
});

async function requireForum(forumId: number) {
  const forum = await prisma.forum.findUnique({ where: { id: forumId }, select: { id: true } });
  if (!forum) throw new UserError('Форум не найден');
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Неверная дата');
const configSchema = z
  .object({
    midDate: isoDate.nullable(),
    finalDate: isoDate.nullable(),
    /** Наценка цели над расходами, % */
    margin: z.number().int().min(0).max(1000),
    variant: z.number().int().min(0).max(1_000_000),
  })
  .partial();

const configData = (p: z.output<typeof configSchema>) => ({
  ...(p.midDate !== undefined ? { priceMidDate: isoToDb(p.midDate) } : {}),
  ...(p.finalDate !== undefined ? { priceFinalDate: isoToDb(p.finalDate) } : {}),
  ...(p.margin !== undefined ? { incomeMargin: p.margin } : {}),
  ...(p.variant !== undefined ? { incomeVariant: p.variant } : {}),
});

/** Настройки доходов форума: даты стадий продаж билетов, наценка цели, вариант автоподбора. */
export async function saveIncomeConfig(
  forumId: number,
  patch: z.input<typeof configSchema>,
): Promise<ActionResult<IncomeConfig>> {
  return run(async () => {
    await requireEditor();
    const p = configSchema.parse(patch);
    await requireForum(forumId);
    await prisma.forum.update({
      where: { id: forumId },
      data: configData(p),
    });
    refreshStatusLines(forumId);
    return getIncomeConfig(forumId);
  });
}

/** Запись правок статей: позиции по умолчанию создаются при первой правке */
async function itemWrites(forumId: number, list: z.output<typeof patchSchema>[]) {
  const custom = await prisma.incomeItem.findMany({
    where: { forumId, key: { in: list.map((p) => p.key) }, removed: false },
    select: { key: true },
  });
  const known = new Set(custom.map((c) => c.key));
  for (const p of list) {
    if (!defaultIncomeItem(p.key) && !known.has(p.key))
      throw new UserError('Позиция доходов не найдена — обновите страницу');
  }
  return list.map(({ key, ...data }) => {
    const d = defaultIncomeItem(key);
    // Название как у позиции по умолчанию — храним пустым, чтобы работало склонение
    const lbl = data.label !== undefined && d && data.label === d.label ? null : data.label;
    const update = { ...data, ...(data.label !== undefined ? { label: lbl } : {}) };
    return prisma.incomeItem.upsert({
      where: { forumId_key: { forumId, key } },
      update,
      create: { forumId, key, price: d?.price ?? 0, ...update },
    });
  });
}

/** Изменение цены, количества, названия позиций доходов; ручной план или автоподбор. */
export async function saveIncomeItems(
  forumId: number,
  patches: z.input<typeof patchSchema>[],
): Promise<ActionResult<IncomeItemValue[]>> {
  return run(async () => {
    await requireEditor();
    const list = z.array(patchSchema).min(1, 'Нет изменений').max(100).parse(patches);
    await requireForum(forumId);
    await prisma.$transaction(await itemWrites(forumId, list));
    refreshStatusLines(forumId);
    return getIncomeItems(forumId);
  });
}

/** Новая позиция доходов в группе «Партнёрства» или «Билеты»; factOnly — статья только для факта. */
export async function addIncomeItem(
  forumId: number,
  input: {
    group: string;
    label: string;
    price: number;
    discount?: number;
    stage?: number;
    factOnly?: boolean;
  },
): Promise<ActionResult<IncomeItemValue[]>> {
  return run(async () => {
    await requireEditor();
    const data = z
      .object({
        group: z.string().refine(isIncomeGroup, 'Неизвестная группа'),
        label,
        price: amount,
        discount: z.number().min(0).max(100).optional(),
        stage: stage.optional(),
        factOnly: z.boolean().optional(),
      })
      .parse(input);
    await requireForum(forumId);
    await prisma.incomeItem.create({
      data: {
        forumId,
        key: `c_${randomUUID().slice(0, 8)}`,
        group: data.group,
        label: data.label,
        price: data.price,
        discount: data.discount ?? 0,
        stage: data.group === 'tickets' ? (data.stage ?? 0) : 0,
        factOnly: data.factOnly ?? false,
      },
    });
    refreshStatusLines(forumId);
    return getIncomeItems(forumId);
  });
}

/** Убрать позицию доходов: свою — удалить, позицию по умолчанию — скрыть. */
export async function removeIncomeItem(
  forumId: number,
  key: string,
): Promise<ActionResult<IncomeItemValue[]>> {
  return run(async () => {
    await requireEditor();
    await requireForum(forumId);
    const d = defaultIncomeItem(key);
    if (d) {
      await prisma.incomeItem.upsert({
        where: { forumId_key: { forumId, key } },
        update: { removed: true },
        create: { forumId, key, price: d.price, removed: true },
      });
    } else {
      await prisma.incomeItem.deleteMany({ where: { forumId, key } });
    }
    refreshStatusLines(forumId);
    return getIncomeItems(forumId);
  });
}

const HISTORY_MAX = 30;

const snapshotSchema = z.object({
  margin: z.number().int().min(0).max(1000),
  variant: z.number().int().min(0).max(1_000_000),
  items: z
    .array(
      z.object({
        key: z.string().min(1).max(40),
        planQty: qty,
        planManual: z.boolean(),
        price: amount,
        discount: z.number().min(0).max(100),
        stage,
      }),
    )
    .max(100),
});

/**
 * Запомнить план, который сейчас на экране «Доходов» (после ручной правки или автообновления),
 * чтобы «Вернуть» могла к нему откатиться. Такой же, как последний, — не записывается.
 */
export async function recordIncomePlan(
  forumId: number,
  snapshot: PlanSnapshot,
): Promise<ActionResult<PlanSnapshot[]>> {
  return run(async () => {
    await requireEditor();
    const snap = snapshotSchema.parse(snapshot);
    const history = await getIncomePlanHistory(forumId);
    const last = history.at(-1);
    if (last && sameSnapshot(last, snap)) return history;
    const next = [...history, snap].slice(-HISTORY_MAX);
    await prisma.forum.update({
      where: { id: forumId },
      data: { incomePlanHistory: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  });
}

/**
 * «Вернуть» и «Другой вариант»: правки статей и настроек одной транзакцией. undo — убрать из
 * истории последний снимок (текущий план), тогда предыдущий станет текущим.
 */
export async function applyIncomePlan(
  forumId: number,
  input: {
    patches: z.input<typeof patchSchema>[];
    config: z.input<typeof configSchema>;
    undo?: boolean;
  },
): Promise<
  ActionResult<{ items: IncomeItemValue[]; config: IncomeConfig; history: PlanSnapshot[] }>
> {
  return run(async () => {
    await requireEditor();
    const list = z.array(patchSchema).max(100).parse(input.patches);
    const cfg = configSchema.parse(input.config);
    await requireForum(forumId);
    const history = await getIncomePlanHistory(forumId);
    const nextHistory = input.undo ? history.slice(0, -1) : history;
    await prisma.$transaction([
      ...(list.length ? await itemWrites(forumId, list) : []),
      prisma.forum.update({
        where: { id: forumId },
        data: {
          ...configData(cfg),
          incomePlanHistory: nextHistory as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
    refreshStatusLines(forumId);
    const [items, config] = await Promise.all([getIncomeItems(forumId), getIncomeConfig(forumId)]);
    return { items, config, history: nextHistory };
  });
}
