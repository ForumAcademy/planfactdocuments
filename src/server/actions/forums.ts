'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { addDays, dbToISO, diffDays, isoToDb } from '@/lib/dates';
import { computeTaskDates, mergeNoteIntoComment } from '@/lib/plan';
import { forumSchema, type ForumInput } from '@/lib/validation';
import { DEFAULT_REPORT } from '@/server/seed';
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

async function createDefaultReport(forumId: number) {
  for (const [i, c] of DEFAULT_REPORT.entries()) {
    await prisma.reportChart.create({
      data: { forumId, title: c.title, palette: c.palette, order: i + 1 },
    });
  }
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

    const forum = await prisma.forum.create({
      data: {
        name: f.name,
        startDate: isoToDb(f.startDate),
        endDate: isoToDb(f.endDate),
        salesStartDate: isoToDb(f.salesStartDate),
        location: f.location,
      },
    });
    await createDefaultReport(forum.id);
    let tasks = 0;

    if (src.kind === 'template') {
      const templates = await prisma.templateTask.findMany({
        include: { roles: true, stage: true },
        orderBy: [{ order: 'asc' }, { number: 'asc' }],
      });
      for (const [i, t] of templates.entries()) {
        const d = computeTaskDates(t.termText, t.stage, refs);
        await prisma.task.create({
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
            roles: { connect: t.roles.map((r) => ({ id: r.id })) },
            history: {
              create: {
                field: 'Создание',
                newValue: 'Из типового мастер-плана',
                changedBy: userName,
              },
            },
          },
        });
      }
      tasks = templates.length;
      await syncAutoAssignments(prisma, { forumId: forum.id });
    } else if (src.kind === 'forum') {
      tasks = await copyTasks(src.forumId, forum.id, refs, userName, true);
    } else if (src.kind === 'excel') {
      const res = await prisma.$transaction(
        (tx) => importPlanRows(tx, { id: forum.id, ...refs }, src.rows, 'replace', userName),
        { timeout: 60_000, maxWait: 10_000 },
      );
      tasks = res.added;
    }
    revalidatePath('/');
    return { id: forum.id, tasks };
  });
}

/** Копирует задачи: даты вычисляются заново, ручные даты сдвигаются на разницу дат форумов. */
async function copyTasks(
  fromForumId: number,
  toForumId: number,
  refs: { startDate: string; endDate: string | null; salesStartDate: string },
  userName: string,
  resetStatus: boolean,
): Promise<number> {
  const from = await prisma.forum.findUnique({ where: { id: fromForumId } });
  if (!from) throw new UserError('Форум-источник не найден');
  const delta = diffDays(dbToISO(from.startDate)!, refs.startDate);
  const src = await prisma.task.findMany({
    where: { forumId: fromForumId },
    include: { roles: true, employees: true, stage: true },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  for (const t of src) {
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
    await prisma.task.create({
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
        roles: { connect: t.roles.map((r) => ({ id: r.id })) },
        employees: { connect: t.employees.map((e) => ({ id: e.id })) },
        history: {
          create: {
            field: 'Создание',
            newValue: `Копия из форума «${from.name}»`,
            changedBy: userName,
          },
        },
      },
    });
  }
  await syncAutoAssignments(prisma, { forumId: toForumId });
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
