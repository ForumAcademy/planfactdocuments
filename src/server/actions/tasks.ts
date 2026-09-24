'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireEditor, requireAuth } from '@/lib/auth';
import { addDays, dbToISO, formatDate, isoToDb, todayMsk } from '@/lib/dates';
import { computeTaskDates } from '@/lib/plan';
import { STATUS_LABEL } from '@/lib/status';
import type { HistoryDTO, TaskDTO } from '@/lib/types';
import { optionalIsoDate } from '@/lib/validation';
import { run, UserError, type ActionResult } from '@/server/action-utils';
import { taskInclude, toTaskDTO } from '@/server/queries';
import { importPlanRows, planRowSchema, type ImportResult } from '@/server/plan-service';
import { syncAutoAssignments } from '@/server/auto-assign';

const id = z.number().int().positive();

const patchSchema = z
  .object({
    stageId: id.nullable(),
    blockId: id.nullable(),
    description: z.string().trim().min(1, 'Описание задачи не может быть пустым').max(4000),
    termText: z.string().trim().max(500),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE']),
    completedAt: optionalIsoDate,
    comment: z.string().max(4000),
    roleIds: z.array(id).max(30),
    employeeIds: z.array(id).max(30),
    needsClarification: z.boolean(),
    /** Пересчитать даты по тексту срока */
    recalc: z.boolean(),
    /** Вернуть автоназначение ответственных по ролям */
    autoAssign: z.boolean(),
  })
  .partial();
export type TaskPatch = z.input<typeof patchSchema>;

type FullTask = Prisma.TaskGetPayload<{
  include: { roles: true; employees: true; stage: true; block: true; forum: true };
}>;

const fullInclude = {
  roles: true,
  employees: true,
  stage: true,
  block: true,
  forum: true,
} as const;

function names(list: { name?: string; fullName?: string }[]): string {
  return list.map((x) => x.name ?? x.fullName).join(', ');
}

function revalidateForum(forumId: number) {
  revalidatePath(`/forums/${forumId}`, 'layout');
  revalidatePath('/');
}

// Правки задач (статус, сроки, ответственные, порядок…) страница применяет у себя сама по ответу
// сервера. Пересборка всей страницы форума после каждой правки не нужна: она удлиняла ответ
// в несколько раз (все задачи форума заново) — поэтому для частых действий её нет.

/** Применяет изменения к задаче и пишет историю. */
async function applyPatch(
  tx: Prisma.TransactionClient,
  task: FullTask,
  p: z.output<typeof patchSchema>,
  userName: string,
): Promise<void> {
  const data: Prisma.TaskUpdateInput = {};
  const hist: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  const today = todayMsk();

  if (p.stageId !== undefined && p.stageId !== task.stageId) {
    const s = p.stageId ? await tx.stage.findUnique({ where: { id: p.stageId } }) : null;
    data.stage = p.stageId ? { connect: { id: p.stageId } } : { disconnect: true };
    hist.push({ field: 'Этап', oldValue: task.stage?.name ?? null, newValue: s?.name ?? null });
  }
  if (p.blockId !== undefined && p.blockId !== task.blockId) {
    const b = p.blockId ? await tx.block.findUnique({ where: { id: p.blockId } }) : null;
    data.block = p.blockId ? { connect: { id: p.blockId } } : { disconnect: true };
    hist.push({ field: 'Блок', oldValue: task.block?.name ?? null, newValue: b?.name ?? null });
  }
  if (p.description !== undefined && p.description !== task.description) {
    data.description = p.description;
    hist.push({ field: 'Описание', oldValue: task.description, newValue: p.description });
  }
  if (p.termText !== undefined && p.termText !== task.termText) {
    data.termText = p.termText;
    hist.push({ field: 'Срок (текст)', oldValue: task.termText, newValue: p.termText });
  }
  if (p.comment !== undefined && p.comment.trim() !== (task.comment ?? '')) {
    data.comment = p.comment.trim() || null;
    hist.push({ field: 'Комментарий', oldValue: task.comment, newValue: p.comment.trim() || null });
  }

  // Даты
  let start = dbToISO(task.startDate);
  let end = dbToISO(task.endDate);
  const shouldRecalc =
    // Новый текст срока всегда пересчитывает даты — даже если раньше их меняли вручную
    p.recalc || (p.termText !== undefined && p.termText !== task.termText);
  if (shouldRecalc) {
    const stage =
      p.stageId !== undefined
        ? p.stageId
          ? await tx.stage.findUnique({ where: { id: p.stageId } })
          : null
        : task.stage;
    const c = computeTaskDates(p.termText ?? task.termText, stage, {
      startDate: dbToISO(task.forum.startDate)!,
      endDate: dbToISO(task.forum.endDate),
      salesStartDate: dbToISO(task.forum.salesStartDate)!,
    });
    start = c.startDate;
    end = c.endDate;
    data.needsClarification = c.needsClarification;
    data.datesManual = false;
  } else if (p.startDate !== undefined || p.endDate !== undefined) {
    if (p.startDate !== undefined) start = p.startDate;
    if (p.endDate !== undefined) end = p.endDate;
    if (start && end && start > end)
      throw new UserError('Дата начала не может быть позже даты окончания');
    data.datesManual = true;
    data.needsClarification = false;
  }
  if (start !== dbToISO(task.startDate)) {
    data.startDate = isoToDb(start);
    hist.push({
      field: 'Дата начала',
      oldValue: formatDate(dbToISO(task.startDate)),
      newValue: formatDate(start),
    });
  }
  if (end !== dbToISO(task.endDate)) {
    data.endDate = isoToDb(end);
    hist.push({
      field: 'Дата окончания',
      oldValue: formatDate(dbToISO(task.endDate)),
      newValue: formatDate(end),
    });
  }
  if (p.needsClarification !== undefined && p.needsClarification !== task.needsClarification) {
    data.needsClarification = p.needsClarification;
  }

  // Статус и дата выполнения
  if (p.status !== undefined && p.status !== task.status) {
    data.status = p.status;
    hist.push({
      field: 'Статус',
      oldValue: STATUS_LABEL[task.status],
      newValue: STATUS_LABEL[p.status],
    });
    if (p.status === 'DONE') {
      const done = p.completedAt ?? today;
      data.completedAt = isoToDb(done);
      hist.push({ field: 'Дата выполнения', oldValue: null, newValue: formatDate(done) });
    } else if (task.status === 'DONE') {
      data.completedAt = null;
    }
  } else if (
    p.completedAt !== undefined &&
    p.completedAt !== dbToISO(task.completedAt) &&
    task.status === 'DONE'
  ) {
    data.completedAt = isoToDb(p.completedAt);
    hist.push({
      field: 'Дата выполнения',
      oldValue: formatDate(dbToISO(task.completedAt)),
      newValue: formatDate(p.completedAt),
    });
  }

  // Роли и ответственные
  let rolesChanged = false;
  if (p.roleIds !== undefined) {
    const prev = task.roles.map((r) => r.id).sort();
    const next = [...new Set(p.roleIds)].sort();
    if (prev.join() !== next.join()) {
      rolesChanged = true;
      const newRoles = await tx.role.findMany({ where: { id: { in: next } } });
      data.roles = { set: next.map((x) => ({ id: x })) };
      hist.push({ field: 'Роль', oldValue: names(task.roles), newValue: names(newRoles) });
    }
  }
  if (p.employeeIds !== undefined) {
    const prev = task.employees.map((r) => r.id).sort();
    const next = [...new Set(p.employeeIds)].sort();
    if (prev.join() !== next.join()) {
      const list = await tx.employee.findMany({ where: { id: { in: next } } });
      data.employees = { set: next.map((x) => ({ id: x })) };
      // Ответственные изменены вручную — автоназначение больше не трогает задачу
      data.employeesManual = true;
      hist.push({ field: 'Ответственный', oldValue: names(task.employees), newValue: names(list) });
    }
  }
  if (p.autoAssign && task.employeesManual) {
    data.employeesManual = false;
  }
  const manualAfter = (data.employeesManual as boolean | undefined) ?? task.employeesManual;
  const needSync =
    !manualAfter && (rolesChanged || Boolean(p.autoAssign) || p.status !== undefined);

  if (Object.keys(data).length === 0 && !needSync) return;
  if (Object.keys(data).length) await tx.task.update({ where: { id: task.id }, data });
  if (needSync) {
    await syncAutoAssignments(tx, { taskIds: [task.id] });
    const after = await tx.employee.findMany({
      where: { tasks: { some: { id: task.id } } },
      orderBy: { fullName: 'asc' },
    });
    const before = [...task.employees].sort((a, b) => a.fullName.localeCompare(b.fullName));
    if (names(before) !== names(after)) {
      hist.push({
        field: 'Ответственный (по ролям)',
        oldValue: names(before),
        newValue: names(after),
      });
    }
  }
  if (hist.length) {
    await tx.taskHistory.createMany({
      data: hist.map((h) => ({ ...h, taskId: task.id, changedBy: userName })),
    });
  }
}

export async function updateTask(taskId: number, patch: TaskPatch): Promise<ActionResult<TaskDTO>> {
  return run(async () => {
    const { userName } = await requireEditor();
    const p = patchSchema.parse(patch);
    const updated = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUniqueOrThrow({ where: { id: taskId }, include: fullInclude });
      await applyPatch(tx, task, p, userName);
      return tx.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    });
    return toTaskDTO(updated);
  });
}

const bulkSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE']).optional(),
  employeeIds: z.array(id).max(30).optional(),
  employeeMode: z.enum(['set', 'add']).optional(),
  /** Назначить ответственных автоматически по ролям */
  autoAssign: z.boolean().optional(),
  shiftDays: z.number().int().min(-3650).max(3650).optional(),
});

/** Массовые действия над выбранными задачами. */
export async function bulkUpdateTasks(
  taskIds: number[],
  input: z.input<typeof bulkSchema>,
): Promise<ActionResult<TaskDTO[]>> {
  return run(async () => {
    const { userName } = await requireEditor();
    const ids = z.array(id).min(1, 'Не выбраны задачи').max(2000).parse(taskIds);
    const b = bulkSchema.parse(input);
    const result = await prisma.$transaction(
      async (tx) => {
        const tasks = await tx.task.findMany({ where: { id: { in: ids } }, include: fullInclude });
        for (const t of tasks) {
          const p: z.output<typeof patchSchema> = {};
          if (b.status) p.status = b.status;
          if (b.employeeIds) {
            p.employeeIds =
              b.employeeMode === 'add'
                ? [...t.employees.map((e) => e.id), ...b.employeeIds]
                : b.employeeIds;
          }
          if (b.autoAssign) p.autoAssign = true;
          if (b.shiftDays) {
            const s = dbToISO(t.startDate);
            const e = dbToISO(t.endDate);
            p.startDate = s ? addDays(s, b.shiftDays) : null;
            p.endDate = e ? addDays(e, b.shiftDays) : null;
          }
          await applyPatch(tx, t, p, userName);
        }
        return tx.task.findMany({ where: { id: { in: ids } }, include: taskInclude });
      },
      { timeout: 60_000 },
    );
    return result.map(toTaskDTO);
  });
}

const createSchema = z.object({
  stageId: id.nullable().optional(),
  blockId: id.nullable().optional(),
  description: z.string().trim().min(1, 'Укажите описание задачи').max(4000),
  termText: z.string().trim().max(500).optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE']).optional(),
  afterTaskId: id.optional(),
});

export async function createTask(
  forumId: number,
  input: z.input<typeof createSchema>,
): Promise<ActionResult<TaskDTO>> {
  return run(async () => {
    const { userName } = await requireEditor();
    const d = createSchema.parse(input);
    const forum = await prisma.forum.findUniqueOrThrow({ where: { id: forumId } });
    const stage = d.stageId ? await prisma.stage.findUnique({ where: { id: d.stageId } }) : null;
    const c = computeTaskDates(d.termText ?? '', stage, {
      startDate: dbToISO(forum.startDate)!,
      endDate: dbToISO(forum.endDate),
      salesStartDate: dbToISO(forum.salesStartDate)!,
    });
    const agg = await prisma.task.aggregate({
      where: { forumId },
      _max: { number: true, order: true },
    });
    let order = (agg._max.order ?? 0) + 1;
    if (d.afterTaskId) {
      const after = await prisma.task.findUnique({ where: { id: d.afterTaskId } });
      if (after && after.forumId === forumId) {
        await prisma.task.updateMany({
          where: { forumId, order: { gt: after.order } },
          data: { order: { increment: 1 } },
        });
        order = after.order + 1;
      }
    }
    const t = await prisma.task.create({
      data: {
        forumId,
        number: (agg._max.number ?? 0) + 1,
        order,
        stageId: d.stageId ?? null,
        blockId: d.blockId ?? null,
        description: d.description,
        termText: d.termText ?? '',
        startDate: isoToDb(c.startDate),
        endDate: isoToDb(c.endDate),
        needsClarification: c.needsClarification,
        status: d.status ?? 'NOT_STARTED',
        completedAt: d.status === 'DONE' ? isoToDb(todayMsk()) : null,
        history: {
          create: { field: 'Создание', newValue: 'Задача добавлена', changedBy: userName },
        },
      },
      include: taskInclude,
    });
    return toTaskDTO(t);
  });
}

export async function duplicateTask(taskId: number): Promise<ActionResult<TaskDTO>> {
  return run(async () => {
    const { userName } = await requireEditor();
    const t = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { roles: true, employees: true },
    });
    const agg = await prisma.task.aggregate({
      where: { forumId: t.forumId },
      _max: { number: true },
    });
    await prisma.task.updateMany({
      where: { forumId: t.forumId, order: { gt: t.order } },
      data: { order: { increment: 1 } },
    });
    const copy = await prisma.task.create({
      data: {
        forumId: t.forumId,
        number: (agg._max.number ?? 0) + 1,
        order: t.order + 1,
        stageId: t.stageId,
        blockId: t.blockId,
        description: `${t.description} (копия)`,
        termText: t.termText,
        startDate: t.startDate,
        endDate: t.endDate,
        needsClarification: t.needsClarification,
        datesManual: t.datesManual,
        employeesManual: t.employeesManual,
        comment: t.comment,
        roles: { connect: t.roles.map((r) => ({ id: r.id })) },
        employees: { connect: t.employees.map((e) => ({ id: e.id })) },
        history: {
          create: { field: 'Создание', newValue: `Копия задачи №${t.number}`, changedBy: userName },
        },
      },
      include: taskInclude,
    });
    return toTaskDTO(copy);
  });
}

export async function deleteTasks(taskIds: number[]): Promise<ActionResult<number>> {
  return run(async () => {
    await requireEditor();
    const ids = z.array(id).min(1).max(2000).parse(taskIds);
    const res = await prisma.task.deleteMany({ where: { id: { in: ids } } });
    return res.count;
  });
}

/** Новый порядок задач форума (после перетаскивания). */
export async function reorderTasks(forumId: number, orderedIds: number[]): Promise<ActionResult> {
  return run(async () => {
    await requireEditor();
    const ids = z.array(id).max(5000).parse(orderedIds);
    const count = await prisma.task.count({ where: { forumId, id: { in: ids } } });
    if (count !== ids.length) throw new UserError('Список задач устарел — обновите страницу');
    await prisma.$transaction(
      ids.map((taskId, i) => prisma.task.update({ where: { id: taskId }, data: { order: i + 1 } })),
    );
    return null;
  });
}

export async function getTaskHistory(taskId: number): Promise<ActionResult<HistoryDTO[]>> {
  return run(async () => {
    await requireAuth();
    const rows = await prisma.taskHistory.findMany({
      where: { taskId },
      orderBy: { changedAt: 'desc' },
      take: 200,
    });
    return rows.map((h) => ({
      id: h.id,
      field: h.field,
      oldValue: h.oldValue,
      newValue: h.newValue,
      changedBy: h.changedBy,
      changedAt: h.changedAt.toISOString(),
    }));
  });
}

/** Загрузка плана из Excel в существующий форум (строки разобраны в браузере). */
export async function importPlan(
  forumId: number,
  rows: z.input<typeof planRowSchema>[],
  mode: 'replace' | 'append',
): Promise<ActionResult<ImportResult>> {
  return run(async () => {
    const { userName } = await requireEditor();
    const parsed = z.array(planRowSchema).max(3000).parse(rows);
    const m = z.enum(['replace', 'append']).parse(mode);
    const forum = await prisma.forum.findUniqueOrThrow({ where: { id: forumId } });
    const res = await prisma.$transaction(
      (tx) =>
        importPlanRows(
          tx,
          {
            id: forum.id,
            startDate: dbToISO(forum.startDate)!,
            endDate: dbToISO(forum.endDate),
            salesStartDate: dbToISO(forum.salesStartDate)!,
          },
          parsed,
          m,
          userName,
        ),
      { timeout: 120_000, maxWait: 10_000 },
    );
    revalidateForum(forumId);
    revalidatePath('/database');
    return res;
  });
}
