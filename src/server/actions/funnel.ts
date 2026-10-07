'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { dbToISO, isoToDb, todayMsk } from '@/lib/dates';
import { DEAL_STAGES, isDealStage, type DealStageKey, type DealValue } from '@/lib/funnel';
import { currentStage, netPrice, stageDates, type IncomeItemValue } from '@/lib/income';
import { formatRub } from '@/lib/utils';
import { run, UserError, type ActionResult } from '@/server/action-utils';
import { getDeals, getIncomeConfig, getIncomeItems, toDealValue } from '@/server/queries';

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
    return toDealValue(d);
  });
}

export async function deleteDeal(forumId: number, id: number): Promise<ActionResult<null>> {
  return run(async () => {
    await requireEditor();
    await prisma.deal.deleteMany({ where: { id, forumId } });
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
    return { deals: await getDeals(forumId), added, updated };
  });
}

/** Позиция доходов, к которой относится сделка: её направление, иначе «Участник» */
function directionOf(items: IncomeItemValue[], key: string | null): IncomeItemValue | undefined {
  return (
    items.find((i) => i.key === key) ??
    items.find((i) => i.key === 'participant') ??
    items.find((i) => i.group === 'tickets') ??
    items[0]
  );
}

/**
 * Решение по оплаченной сделке: добавить в факт доходов (в статью направления или под своим
 * названием, если условия особые), отклонить или вернуть предложение.
 * Продажа ложится в этап продаж билетов по дате оплаты. Если цена за единицу совпадает
 * с ценой статьи на этом этапе — растёт её факт; иначе появляется статья только для факта
 * с ценой сделки.
 */
export async function decideDealIncome(
  forumId: number,
  dealId: number,
  decision: { action: 'add'; label?: string } | { action: 'reject' } | { action: 'reset' },
): Promise<ActionResult<{ items: IncomeItemValue[]; deal: DealValue }>> {
  return run(async () => {
    await requireEditor();
    const deal = await prisma.deal.findFirst({ where: { id: dealId, forumId } });
    if (!deal) throw new UserError('Сделка не найдена — обновите страницу');
    if (decision.action !== 'add') {
      const d = await prisma.deal.update({
        where: { id: dealId },
        data: { incomeStatus: decision.action === 'reject' ? 'rejected' : null },
      });
      return { items: await getIncomeItems(forumId), deal: toDealValue(d) };
    }
    if (deal.status !== 'paid') throw new UserError('Сделка ещё не оплачена');
    if (deal.incomeStatus === 'added') throw new UserError('Сделка уже добавлена в факт');
    const label = z.string().trim().max(120).optional().parse(decision.label);

    const forum = await prisma.forum.findUniqueOrThrow({ where: { id: forumId } });
    const [items, cfg] = await Promise.all([getIncomeItems(forumId), getIncomeConfig(forumId)]);
    const dir = directionOf(items, deal.incomeKey);
    if (!dir) throw new UserError('В «Доходах» нет статей — добавьте статью');
    const group = dir.group;
    const name = label || dir.label;
    const paidOn = dbToISO(deal.paidDate) ?? todayMsk();
    const stage =
      group === 'tickets'
        ? currentStage(
            stageDates(cfg, dbToISO(forum.salesStartDate)!, dbToISO(forum.startDate)!),
            paidOn,
          )
        : 0;
    const qty = Math.max(1, deal.qty);
    const unit = Math.round(deal.amount / qty);

    const bump = async (it: IncomeItemValue) => {
      await prisma.incomeItem.upsert({
        where: { forumId_key: { forumId, key: it.key } },
        update: { factQty: { increment: qty } },
        create: { forumId, key: it.key, price: it.prices[0], stage: it.stage, factQty: qty },
      });
      return it.key;
    };
    const fits = (i: IncomeItemValue, lbl: string) =>
      i.group === group &&
      i.label === lbl &&
      i.stage === stage &&
      Math.round(netPrice(i, stage)) === unit;

    let key: string;
    const same = items.find((i) => fits(i, name));
    if (same) key = await bump(same);
    else {
      // Цена ниже цены направления — это скидка от неё, если она считается без копеек
      let price = unit;
      let discount = 0;
      const base = dir.prices[0];
      if (unit > 0 && base > unit) {
        const disc = Math.round((1 - unit / base) * 10_000) / 100;
        if (Math.abs(Math.round(base * (1 - disc / 100)) - unit) <= 1) {
          price = base;
          discount = disc;
        }
      }
      const taken = items.some((i) => i.group === group && i.label === name);
      const lbl = !taken
        ? name
        : discount
          ? `${name} — скидка ${discount.toLocaleString('ru-RU')}%`
          : `${name} — ${formatRub(unit)}`;
      const again = items.find((i) => i.factOnly && fits(i, lbl));
      if (again) key = await bump(again);
      else {
        key = `c_${randomUUID().slice(0, 8)}`;
        await prisma.incomeItem.create({
          data: {
            forumId,
            key,
            group,
            label: lbl,
            price,
            discount,
            stage,
            factOnly: true,
            factQty: qty,
          },
        });
      }
    }
    const d = await prisma.deal.update({
      where: { id: dealId },
      data: { incomeStatus: 'added', incomeItemKey: key },
    });
    return { items: await getIncomeItems(forumId), deal: toDealValue(d) };
  });
}
