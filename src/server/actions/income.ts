'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { defaultIncomeItem, isIncomeGroup, type IncomeItemValue } from '@/lib/income';
import { run, UserError, type ActionResult } from '@/server/action-utils';
import { getIncomeItems } from '@/server/queries';

const amount = z.number().int().min(0).max(2_000_000_000);
const qty = z.number().int().min(0).max(1_000_000);
const label = z.string().trim().min(1, 'Укажите название позиции').max(120);

const patchSchema = z.object({
  key: z.string().min(1).max(40),
  price: amount.optional(),
  planQty: qty.optional(),
  factQty: qty.optional(),
  planManual: z.boolean().optional(),
  label: label.optional(),
  /** Вернуть убранную позицию по умолчанию */
  removed: z.literal(false).optional(),
});

async function requireForum(forumId: number) {
  const forum = await prisma.forum.findUnique({ where: { id: forumId }, select: { id: true } });
  if (!forum) throw new UserError('Форум не найден');
}

/** Изменение цены, количества, названия позиций доходов; ручной план или автоподбор. */
export async function saveIncomeItems(
  forumId: number,
  patches: z.input<typeof patchSchema>[],
): Promise<ActionResult<IncomeItemValue[]>> {
  return run(async () => {
    await requireEditor();
    const list = z.array(patchSchema).min(1, 'Нет изменений').max(20).parse(patches);
    await requireForum(forumId);
    const custom = await prisma.incomeItem.findMany({
      where: { forumId, key: { in: list.map((p) => p.key) }, removed: false },
      select: { key: true },
    });
    const known = new Set(custom.map((c) => c.key));
    for (const p of list) {
      if (!defaultIncomeItem(p.key) && !known.has(p.key))
        throw new UserError('Позиция доходов не найдена — обновите страницу');
    }
    await prisma.$transaction(
      list.map(({ key, ...data }) => {
        const d = defaultIncomeItem(key);
        // Название как у позиции по умолчанию — храним пустым, чтобы работало склонение
        const lbl = data.label !== undefined && d && data.label === d.label ? null : data.label;
        const update = { ...data, ...(data.label !== undefined ? { label: lbl } : {}) };
        return prisma.incomeItem.upsert({
          where: { forumId_key: { forumId, key } },
          update,
          create: { forumId, key, price: d?.price ?? 0, ...update },
        });
      }),
    );
    return getIncomeItems(forumId);
  });
}

/** Новая позиция доходов в группе «Партнёрства» или «Билеты». */
export async function addIncomeItem(
  forumId: number,
  input: { group: string; label: string; price: number },
): Promise<ActionResult<IncomeItemValue[]>> {
  return run(async () => {
    await requireEditor();
    const data = z
      .object({
        group: z.string().refine(isIncomeGroup, 'Неизвестная группа'),
        label,
        price: amount,
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
      },
    });
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
    return getIncomeItems(forumId);
  });
}
