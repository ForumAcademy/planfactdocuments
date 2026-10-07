'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { isoToDb, todayMsk } from '@/lib/dates';
import { DEAL_STAGES, isDealStage, type DealStageKey, type DealValue } from '@/lib/funnel';
import { run, UserError, type ActionResult } from '@/server/action-utils';
import { getDeals, toDealValue } from '@/server/queries';

/** Линия доходов над вкладками форума берёт эти данные из layout — обновить его */
function refreshStatusLines(forumId: number) {
  revalidatePath(`/forums/${forumId}`, 'layout');
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Неверная дата');
const text = (max: number) => z.string().trim().max(max);
const STAGE_KEYS = DEAL_STAGES.map((s) => s.key) as [DealStageKey, ...DealStageKey[]];
const stageKey = z.enum(STAGE_KEYS);
const statusKey = z.enum([...STAGE_KEYS, 'refused']);

const dealSchema = z.object({
  company: z.string().trim().min(1, 'Укажите компанию').max(200),
  source: text(120).optional(),
  manager: text(120).optional(),
  enteredAt: isoDate.nullable().optional(),
  incomeKey: z.string().max(40).nullable().optional(),
  qty: z.number().int().min(0).max(100_000).optional(),
  amount: z.number().int().min(0).max(2_000_000_000).optional(),
  status: statusKey.optional(),
  lostStage: stageKey.nullable().optional(),
  decisionDate: isoDate.nullable().optional(),
  paidDate: isoDate.nullable().optional(),
  comment: text(1000).optional(),
});
type DealInput = z.input<typeof dealSchema>;

function toData<T extends Partial<z.output<typeof dealSchema>>>(p: T) {
  const { enteredAt, decisionDate, paidDate, ...rest } = p;
  return {
    ...rest,
    ...(enteredAt !== undefined ? { enteredAt: isoToDb(enteredAt) } : {}),
    ...(decisionDate !== undefined ? { decisionDate: isoToDb(decisionDate) } : {}),
    ...(paidDate !== undefined ? { paidDate: isoToDb(paidDate) } : {}),
  };
}

async function requireForum(forumId: number) {
  const forum = await prisma.forum.findUnique({ where: { id: forumId }, select: { id: true } });
  if (!forum) throw new UserError('Форум не найден');
}

/** Новая сделка в воронке */
export async function createDeal(
  forumId: number,
  input: DealInput,
): Promise<ActionResult<DealValue>> {
  return run(async () => {
    await requireEditor();
    const p = dealSchema.parse(input);
    await requireForum(forumId);
    const today = todayMsk();
    const d = await prisma.deal.create({
      data: {
        forumId,
        enteredAt: isoToDb(today),
        stageChangedAt: isoToDb(today),
        ...toData(p),
      },
    });
    refreshStatusLines(forumId);
    return toDealValue(d);
  });
}

/**
 * Правка сделки. При смене этапа запоминается дата перехода; при отказе — этап, на котором
 * отказались (если не указан, — тот, где сделка стояла); при оплате — дата оплаты.
 */
export async function updateDeal(
  forumId: number,
  id: number,
  patch: Partial<DealInput>,
): Promise<ActionResult<DealValue>> {
  return run(async () => {
    await requireEditor();
    const p = dealSchema.partial().parse(patch);
    const cur = await prisma.deal.findFirst({ where: { id, forumId } });
    if (!cur) throw new UserError('Сделка не найдена — обновите страницу');
    const today = todayMsk();
    const extra: Record<string, unknown> = {};
    if (p.status && p.status !== cur.status) {
      extra.stageChangedAt = isoToDb(today);
      if (p.status === 'refused') {
        if (p.lostStage === undefined)
          extra.lostStage = isDealStage(cur.status) ? cur.status : null;
        if (p.decisionDate === undefined && !cur.decisionDate) extra.decisionDate = isoToDb(today);
      } else {
        extra.lostStage = null;
      }
      if (p.status === 'paid' && p.paidDate === undefined && !cur.paidDate)
        extra.paidDate = isoToDb(today);
    }
    const d = await prisma.deal.update({ where: { id }, data: { ...toData(p), ...extra } });
    refreshStatusLines(forumId);
    return toDealValue(d);
  });
}

export async function deleteDeal(forumId: number, id: number): Promise<ActionResult<null>> {
  return run(async () => {
    await requireEditor();
    await prisma.deal.deleteMany({ where: { id, forumId } });
    refreshStatusLines(forumId);
    return null;
  });
}

const normCompany = (s: string) =>
  s
    .toLowerCase()
    .replace(/[«»"'`“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Загрузка сделок из Excel: сделка с той же компанией обновляется, новые добавляются,
 * сделки, которых нет в файле, остаются как есть. У одной компании может быть несколько
 * сделок: n-я строка компании в файле обновляет её n-ю сделку.
 */
export async function importDeals(
  forumId: number,
  rows: DealInput[],
): Promise<ActionResult<{ deals: DealValue[]; added: number; updated: number }>> {
  return run(async () => {
    await requireEditor();
    const list = z.array(dealSchema).min(1, 'В файле нет сделок').max(5000).parse(rows);
    await requireForum(forumId);
    const existing = await prisma.deal.findMany({ where: { forumId }, orderBy: { id: 'asc' } });
    const byName = new Map<string, typeof existing>();
    for (const d of existing) {
      const k = normCompany(d.company);
      byName.set(k, [...(byName.get(k) ?? []), d]);
    }
    let added = 0;
    let updated = 0;
    const ops = [];
    for (const p of list) {
      const cur = byName.get(normCompany(p.company))?.shift();
      const data = toData(p);
      if (cur) {
        const changedStage = p.status && p.status !== cur.status;
        ops.push(
          prisma.deal.update({
            where: { id: cur.id },
            data: { ...data, ...(changedStage ? { stageChangedAt: isoToDb(todayMsk()) } : {}) },
          }),
        );
        updated++;
      } else {
        ops.push(
          prisma.deal.create({
            data: { forumId, ...data, stageChangedAt: data.enteredAt ?? null },
          }),
        );
        added++;
      }
    }
    await prisma.$transaction(ops);
    refreshStatusLines(forumId);
    return { deals: await getDeals(forumId), added, updated };
  });
}

/**
 * Оплаченная сделка попадает в факт доходов сама. Исключить её из факта (например, дубль)
 * или вернуть обратно.
 */
export async function setDealExcluded(
  forumId: number,
  dealId: number,
  excluded: boolean,
): Promise<ActionResult<DealValue>> {
  return run(async () => {
    await requireEditor();
    const deal = await prisma.deal.findFirst({ where: { id: dealId, forumId } });
    if (!deal) throw new UserError('Сделка не найдена — обновите страницу');
    if (deal.incomeStatus === 'added')
      throw new UserError('Эта оплата уже внесена в «Продано» вручную');
    const d = await prisma.deal.update({
      where: { id: dealId },
      data: { incomeStatus: excluded ? 'rejected' : null },
    });
    refreshStatusLines(forumId);
    return toDealValue(d);
  });
}
