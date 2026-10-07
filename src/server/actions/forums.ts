'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { addDays, dbToISO, diffDays, isoToDb } from '@/lib/dates';
import { computeTaskDates, mergeNoteIntoComment } from '@/lib/plan';
import { forumColorSchema, forumSchema, type ForumInput } from '@/lib/validation';
import { DEFAULT_REPORT } from '@/server/seed';
import { insertTasks } from '@/server/bulk-tasks';
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;
import { run, UserError, type ActionResult } from '@/server/action-utils';
import { importPlanRows, planRowSchema, recalcForumDates } from '@/server/plan-service';
import { syncAutoAssignments } from '@/server/auto-assign';

const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('empty') }),
  z.object({ kind: z.literal('template') }),
  z.object({ kind: z.literal('forum'), forumId: z.number().int() }),
  z.object({ kind: z.literal('excel'), rows: z.array(planRowSchema).max(3000) }),
]);
export type PlanSource = z.input<typeof sourceSchema>;

async function createDefaultReport(db: Db, forumId: number) {
  await db.reportChart.createMany({
    data: DEFAULT_REPORT.map((c, i) => ({
      forumId,
      title: c.title,
      palette: c.palette,
      order: i + 1,
    })),
  });
}

export async function createForum(
  input: ForumInput,
  source: PlanSource,
): Promise<ActionResult<{ id: number; tasks: number }>> {
  return run(async () => {
    const { userName } = await requireEditor();
    const f = forumSchema.parse(input);
    const src = sourceSchema.parse(source);
    const refs = { startDate: f.startDate, endDate: f.endDate, salesStartDate: f.salesStartDate };

    // Всё создание — одной транзакцией: либо форум целиком с планом, либо ничего
    const { forum, tasks } = await prisma.$transaction(
      async (tx) => {
        const forum = await tx.forum.create({
          data: {
            name: f.name,
            startDate: isoToDb(f.startDate),
            endDate: isoToDb(f.endDate),
            salesStartDate: isoToDb(f.salesStartDate),
            location: f.location,
            website: f.website,
            color: f.color,
          },
        });
        await createDefaultReport(tx, forum.id);
        let tasks = 0;

        if (src.kind === 'template') {
          const templates = await tx.templateTask.findMany({
            include: { roles: true, stage: true },
            orderBy: [{ order: 'asc' }, { number: 'asc' }],
          });
          await insertTasks(
            tx,
            templates.map((t, i) => {
              const d = computeTaskDates(t.termText, t.stage, refs);
              return {
                data: {
                  forumId: forum.id,
                  number: t.number,
                  order: i + 1,
                  stageId: t.stageId,
                  blockId: t.blockId,
                  description: t.description,
                  termText: t.termText,
                  startDate: isoToDb(d.startDate),
                  endDate: isoToDb(d.endDate),
                  needsClarification: d.needsClarification,
                  comment: mergeNoteIntoComment(t.comment, d.note),
                  cost: t.cost,
                },
                roleIds: t.roles.map((r) => r.id),
                employeeIds: [],
                history: 'Из типового мастер-плана',
              };
            }),
            userName,
          );
          tasks = templates.length;
          await syncAutoAssignments(tx, { forumId: forum.id });
        } else if (src.kind === 'forum') {
          tasks = await copyTasks(tx, src.forumId, forum.id, refs, userName, true);
        } else if (src.kind === 'excel') {
          const res = await importPlanRows(
            tx,
            { id: forum.id, ...refs },
            src.rows,
            'replace',
            userName,
          );
          tasks = res.added;
        }
        return { forum, tasks };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    // Главную не пересобираем: после создания открывается страница нового форума
    return { id: forum.id, tasks };
  });
}

/** Дописывает в форум задачи типового мастер-плана, которых в нём нет (по номеру). */
export async function addMissingTemplateTasks(forumId: number): Promise<ActionResult<number>> {
  return run(async () => {
    const { userName } = await requireEditor();
    const f = await prisma.forum.findUniqueOrThrow({ where: { id: forumId } });
    const refs = {
      startDate: dbToISO(f.startDate)!,
      endDate: dbToISO(f.endDate),
      salesStartDate: dbToISO(f.salesStartDate)!,
    };
    const added = await prisma.$transaction(
      async (tx) => {
        const have = await tx.task.findMany({
          where: { forumId },
          select: { number: true, order: true },
        });
        const numbers = new Set(have.map((t) => t.number));
        let order = have.reduce((m, t) => Math.max(m, t.order), 0);
        const templates = (
          await tx.templateTask.findMany({
            include: { roles: true, stage: true },
            orderBy: [{ order: 'asc' }, { number: 'asc' }],
          })
        ).filter((t) => !numbers.has(t.number));
        if (!templates.length) return 0;
        await insertTasks(
          tx,
          templates.map((t) => {
            const d = computeTaskDates(t.termText, t.stage, refs);
            return {
              data: {
                forumId,
                number: t.number,
                order: ++order,
                stageId: t.stageId,
                blockId: t.blockId,
                description: t.description,
                termText: t.termText,
                startDate: isoToDb(d.startDate),
                endDate: isoToDb(d.endDate),
                needsClarification: d.needsClarification,
                comment: mergeNoteIntoComment(t.comment, d.note),
                cost: t.cost,
              },
              roleIds: t.roles.map((r) => r.id),
              employeeIds: [],
              history: 'Дописана из типового мастер-плана',
            };
          }),
          userName,
        );
        await syncAutoAssignments(tx, { forumId });
        return templates.length;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    revalidatePath('/');
    revalidatePath(`/forums/${forumId}`, 'layout');
    return added;
  });
}

/** Копирует задачи: даты вычисляются заново, ручные даты сдвигаются на разницу дат форумов. */
async function copyTasks(
  db: Db,
  fromForumId: number,
  toForumId: number,
  refs: { startDate: string; endDate: string | null; salesStartDate: string },
  userName: string,
  resetStatus: boolean,
): Promise<number> {
  const from = await db.forum.findUnique({ where: { id: fromForumId } });
  if (!from) throw new UserError('Форум-источник не найден');
  const delta = diffDays(dbToISO(from.startDate)!, refs.startDate);
  const src = await db.task.findMany({
    where: { forumId: fromForumId },
    include: { roles: true, employees: true, stage: true },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  await insertTasks(
    db,
    src.map((t) => {
      let startDate = dbToISO(t.startDate);
      let endDate = dbToISO(t.endDate);
      let needsClarification = t.needsClarification;
      if (t.datesManual) {
        startDate = startDate ? addDays(startDate, delta) : null;
        endDate = endDate ? addDays(endDate, delta) : null;
      } else {
        const d = computeTaskDates(t.termText, t.stage, refs);
        startDate = d.startDate;
        endDate = d.endDate;
        needsClarification = d.needsClarification;
      }
      return {
        data: {
          forumId: toForumId,
          number: t.number,
          order: t.order,
          stageId: t.stageId,
          blockId: t.blockId,
          description: t.description,
          termText: t.termText,
          startDate: isoToDb(startDate),
          endDate: isoToDb(endDate),
          needsClarification,
          datesManual: t.datesManual,
          employeesManual: t.employeesManual,
          status: resetStatus ? 'NOT_STARTED' : t.status,
          completedAt: resetStatus ? null : t.completedAt,
          comment: t.comment,
          cost: t.cost,
        },
        roleIds: t.roles.map((r) => r.id),
        employeeIds: t.employees.map((e) => e.id),
        history: `Копия из форума «${from.name}»`,
      };
    }),
    userName,
  );
  await syncAutoAssignments(db, { forumId: toForumId });
  return src.length;
}

export async function updateForum(
  id: number,
  input: ForumInput,
): Promise<ActionResult<{ datesChanged: boolean; autoTasks: number }>> {
  return run(async () => {
    await requireEditor();
    const f = forumSchema.parse(input);
    const prev = await prisma.forum.findUniqueOrThrow({ where: { id } });
    await prisma.forum.update({
      where: { id },
      data: {
        name: f.name,
        startDate: isoToDb(f.startDate),
        endDate: isoToDb(f.endDate),
        salesStartDate: isoToDb(f.salesStartDate),
        location: f.location,
        website: f.website,
        color: f.color,
      },
    });
    const datesChanged =
      dbToISO(prev.startDate) !== f.startDate ||
      dbToISO(prev.endDate) !== f.endDate ||
      dbToISO(prev.salesStartDate) !== f.salesStartDate;
    const autoTasks = datesChanged
      ? await prisma.task.count({ where: { forumId: id, datesManual: false } })
      : 0;
    revalidatePath('/');
    revalidatePath(`/forums/${id}`, 'layout');
    return { datesChanged, autoTasks };
  });
}

export async function recalcDates(forumId: number): Promise<ActionResult<number>> {
  return run(async () => {
    await requireEditor();
    const f = await prisma.forum.findUniqueOrThrow({ where: { id: forumId } });
    const n = await prisma.$transaction(
      (tx) =>
        recalcForumDates(tx, {
          id: f.id,
          startDate: dbToISO(f.startDate)!,
          endDate: dbToISO(f.endDate),
          salesStartDate: dbToISO(f.salesStartDate)!,
        }),
      { timeout: 60_000 },
    );
    revalidatePath(`/forums/${forumId}`, 'layout');
    return n;
  });
}

export async function duplicateForum(id: number): Promise<ActionResult<{ id: number }>> {
  return run(async () => {
    const { userName } = await requireEditor();
    const src = await prisma.forum.findUniqueOrThrow({
      where: { id },
      include: { charts: { include: { items: true } } },
    });
    const copy = await prisma.forum.create({
      data: {
        name: `${src.name} (копия)`,
        startDate: src.startDate,
        endDate: src.endDate,
        salesStartDate: src.salesStartDate,
        location: src.location,
        website: src.website,
        color: src.color,
        reportDate: src.reportDate,
        charts: {
          create: src.charts.map((c) => ({
            title: c.title,
            palette: c.palette,
            unit: c.unit,
            order: c.order,
            items: {
              create: c.items.map((i) => ({
                name: i.name,
                amount: i.amount,
                note: i.note,
                order: i.order,
              })),
            },
          })),
        },
      },
    });
    await copyTasks(
      prisma,
      id,
      copy.id,
      {
        startDate: dbToISO(src.startDate)!,
        endDate: dbToISO(src.endDate),
        salesStartDate: dbToISO(src.salesStartDate)!,
      },
      userName,
      false,
    );
    revalidatePath('/');
    return { id: copy.id };
  });
}

export async function setForumArchived(id: number, archived: boolean): Promise<ActionResult> {
  return run(async () => {
    await requireEditor();
    // Вернули из архива вручную — автоархив больше не трогает этот форум
    await prisma.forum.update({ where: { id }, data: { archived, keepActive: !archived } });
    revalidatePath('/');
    return null;
  });
}

export async function deleteForum(id: number): Promise<ActionResult> {
  return run(async () => {
    await requireEditor();
    await prisma.forum.delete({ where: { id } });
    revalidatePath('/');
    return null;
  });
}

/** Смена цвета карточки форума (из меню карточки). */
/** Предельно допустимые расходы форума (null — снять лимит). */
export async function setExpenseLimit(id: number, limit: number | null): Promise<ActionResult> {
  return run(async () => {
    await requireEditor();
    const v = z.number().int().min(0).max(2_000_000_000).nullable().parse(limit);
    await prisma.forum.update({ where: { id }, data: { expenseLimit: v || null } });
    revalidatePath(`/forums/${id}`, 'layout');
    return null;
  });
}

export async function setForumColor(id: number, color: string): Promise<ActionResult> {
  return run(async () => {
    await requireEditor();
    const c = forumColorSchema.parse(color);
    // Без пересборки страницы: карточка уже показывает новый цвет, ответ — мгновенный
    await prisma.forum.update({ where: { id }, data: { color: c } });
    return null;
  });
}
