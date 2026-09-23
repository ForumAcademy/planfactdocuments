import type { Prisma, PrismaClient, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { isoToDb, isISODate, todayMsk, type ISODate } from '@/lib/dates';
import { computeTaskDates, mergeNoteIntoComment, type ForumRefs } from '@/lib/plan';
import { STATUS_LABEL } from '@/lib/status';
import { ensureDictionaries, key } from './dictionaries';

type Db = PrismaClient | Prisma.TransactionClient;

const isoOrNull = z
  .string()
  .nullable()
  .refine((v) => v === null || isISODate(v), 'Неверная дата');

export const planRowSchema = z.object({
  number: z.number().int().nullable(),
  stage: z.string().max(200),
  block: z.string().max(200),
  description: z.string().min(1, 'Нет описания задачи').max(4000),
  termText: z.string().max(500),
  roles: z.array(z.string().max(200)).max(20),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE']),
  comment: z.string().max(4000),
  employees: z.array(z.string().max(200)).max(20),
  startDate: isoOrNull,
  endDate: isoOrNull,
  completedAt: isoOrNull,
});
export type PlanRowInput = z.infer<typeof planRowSchema>;

export interface ImportResult {
  added: number;
  updated: number;
}

/**
 * Сохраняет строки плана в форум.
 * replace — удаляет текущие задачи; append — добавляет, а строки с совпадающим № обновляет.
 */
export async function importPlanRows(
  db: Db,
  forum: ForumRefs & { id: number },
  rows: PlanRowInput[],
  mode: 'replace' | 'append',
  userName: string,
): Promise<ImportResult> {
  const maps = await ensureDictionaries(db, {
    stages: rows.map((r) => r.stage),
    blocks: rows.map((r) => r.block),
    roles: rows.flatMap((r) => r.roles),
    employees: rows.flatMap((r) => r.employees),
  });

  if (mode === 'replace') {
    await db.task.deleteMany({ where: { forumId: forum.id } });
  }
  const existing =
    mode === 'append'
      ? await db.task.findMany({
          where: { forumId: forum.id },
          include: { roles: true, employees: true, stage: true, block: true },
        })
      : [];
  const byNumber = new Map(existing.map((t) => [t.number, t]));
  let nextNumber = existing.reduce((m, t) => Math.max(m, t.number), 0);
  let nextOrder = existing.reduce((m, t) => Math.max(m, t.order), 0);
  const today = todayMsk();
  const result: ImportResult = { added: 0, updated: 0 };

  for (const row of rows) {
    const stage = row.stage ? maps.stages.get(key(row.stage)) : undefined;
    const blockId = row.block ? maps.blocks.get(key(row.block)) : undefined;
    const roleIds = row.roles.map((r) => maps.roles.get(key(r))).filter((x): x is number => !!x);
    const employeeIds = row.employees
      .map((e) => maps.employees.get(key(e)))
      .filter((x): x is number => !!x);

    const computed = computeTaskDates(row.termText, stage, forum);
    const hasDates = Boolean(row.startDate && row.endDate);
    const startDate: ISODate = hasDates ? row.startDate! : computed.startDate;
    const endDate: ISODate = hasDates ? row.endDate! : computed.endDate;
    const datesManual =
      hasDates && (startDate !== computed.startDate || endDate !== computed.endDate);
    const needsClarification = hasDates
      ? datesManual
        ? false
        : computed.needsClarification
      : computed.needsClarification;
    const comment = hasDates
      ? row.comment.trim() || null
      : mergeNoteIntoComment(row.comment, computed.note);
    const completedAt = row.status === 'DONE' ? (row.completedAt ?? null) : null;

    const data = {
      stageId: stage?.id ?? null,
      blockId: blockId ?? null,
      description: row.description,
      termText: row.termText,
      startDate: isoToDb(startDate),
      endDate: isoToDb(endDate),
      needsClarification,
      datesManual,
      status: row.status as TaskStatus,
      completedAt: isoToDb(completedAt),
      comment,
    };

    const prev = row.number !== null ? byNumber.get(row.number) : undefined;
    if (prev) {
      await db.task.update({
        where: { id: prev.id },
        data: {
          ...data,
          roles: { set: roleIds.map((id) => ({ id })) },
          employees: { set: employeeIds.map((id) => ({ id })) },
        },
      });
      const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
      if (prev.status !== row.status)
        changes.push({
          field: 'Статус',
          oldValue: STATUS_LABEL[prev.status],
          newValue: STATUS_LABEL[row.status],
        });
      if (prev.description !== row.description)
        changes.push({ field: 'Описание', oldValue: prev.description, newValue: row.description });
      if ((prev.comment ?? '') !== (comment ?? ''))
        changes.push({ field: 'Комментарий', oldValue: prev.comment, newValue: comment });
      changes.push({ field: 'Импорт из Excel', oldValue: null, newValue: `обновлено ${today}` });
      await db.taskHistory.createMany({
        data: changes.map((c) => ({ ...c, taskId: prev.id, changedBy: userName })),
      });
      result.updated++;
    } else {
      const number = row.number ?? ++nextNumber;
      nextNumber = Math.max(nextNumber, number);
      await db.task.create({
        data: {
          ...data,
          forumId: forum.id,
          number,
          order: ++nextOrder,
          roles: { connect: roleIds.map((id) => ({ id })) },
          employees: { connect: employeeIds.map((id) => ({ id })) },
          history: {
            create: { field: 'Создание', newValue: 'Импорт плана', changedBy: userName },
          },
        },
      });
      result.added++;
    }
  }
  return result;
}

/** Пересчитывает даты задач, у которых даты не менялись вручную. */
export async function recalcForumDates(db: Db, forum: ForumRefs & { id: number }): Promise<number> {
  const tasks = await db.task.findMany({
    where: { forumId: forum.id, datesManual: false },
    include: { stage: true },
  });
  for (const t of tasks) {
    const c = computeTaskDates(t.termText, t.stage, forum);
    await db.task.update({
      where: { id: t.id },
      data: {
        startDate: isoToDb(c.startDate),
        endDate: isoToDb(c.endDate),
        needsClarification: c.needsClarification,
      },
    });
  }
  return tasks.length;
}
