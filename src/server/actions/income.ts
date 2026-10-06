'use server';

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { INCOME_ITEMS, isIncomeKey, type IncomeItemValue } from '@/lib/income';
import { run, UserError, type ActionResult } from '@/server/action-utils';
import { getIncomeItems } from '@/server/queries';

const amount = z.number().int().min(0).max(2_000_000_000);
const qty = z.number().int().min(0).max(1_000_000);

const patchSchema = z.object({
  key: z.string().refine(isIncomeKey, 'Неизвестная позиция доходов'),
  price: amount.optional(),
  planQty: qty.optional(),
  factQty: qty.optional(),
});

/** Изменение цены, планового или фактического количества позиций доходов. */
export async function saveIncomeItems(
  forumId: number,
  patches: z.input<typeof patchSchema>[],
): Promise<ActionResult<IncomeItemValue[]>> {
  return run(async () => {
    await requireEditor();
    const list = z.array(patchSchema).min(1, 'Нет изменений').max(20).parse(patches);
    const forum = await prisma.forum.findUnique({ where: { id: forumId }, select: { id: true } });
    if (!forum) throw new UserError('Форум не найден');
    await prisma.$transaction(
      list.map(({ key, ...data }) =>
        prisma.incomeItem.upsert({
          where: { forumId_key: { forumId, key } },
          update: data,
          create: {
            forumId,
            key,
            price: data.price ?? INCOME_ITEMS.find((i) => i.key === key)!.price,
            planQty: data.planQty ?? 0,
            factQty: data.factQty ?? 0,
          },
        }),
      ),
    );
    return getIncomeItems(forumId);
  });
}
