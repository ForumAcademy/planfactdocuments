import 'server-only';
import type { Employee, Forum, Role, Task } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dbToISO, isoToDb, todayMsk } from '@/lib/dates';
import type { StatusCounts } from '@/lib/status';
import type { DictsDTO, ForumDTO, TaskDTO } from '@/lib/types';

export function toForumDTO(f: Forum): ForumDTO {
  return {
    id: f.id,
    name: f.name,
    startDate: dbToISO(f.startDate)!,
    endDate: dbToISO(f.endDate),
    salesStartDate: dbToISO(f.salesStartDate)!,
    location: f.location,
    archived: f.archived,
    reportDate: dbToISO(f.reportDate),
  };
}

export function toTaskDTO(
  t: Task & { roles: { id: number }[]; employees: { id: number }[] },
): TaskDTO {
  return {
    id: t.id,
    number: t.number,
    stageId: t.stageId,
    blockId: t.blockId,
    description: t.description,
    termText: t.termText,
    startDate: dbToISO(t.startDate),
    endDate: dbToISO(t.endDate),
    needsClarification: t.needsClarification,
    datesManual: t.datesManual,
    status: t.status,
    completedAt: dbToISO(t.completedAt),
    comment: t.comment,
    order: t.order,
    roleIds: t.roles.map((r) => r.id),
    employeeIds: t.employees.map((e) => e.id),
  };
}

export const taskInclude = {
  roles: { select: { id: true } },
  employees: { select: { id: true } },
} as const;

export async function getForum(id: number): Promise<ForumDTO | null> {
  if (!Number.isInteger(id)) return null;
  const f = await prisma.forum.findUnique({ where: { id } });
  return f ? toForumDTO(f) : null;
}

export async function getTasks(forumId: number): Promise<TaskDTO[]> {
  const tasks = await prisma.task.findMany({
    where: { forumId },
    include: taskInclude,
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  return tasks.map(toTaskDTO);
}

function toEmployeeDTO(e: Employee & { roles: Role[] }) {
  return {
    id: e.id,
    fullName: e.fullName,
    position: e.position,
    telegram: e.telegram,
    telegramLinked: Boolean(e.telegramChatId),
    active: e.active,
    roleIds: e.roles.map((r) => r.id),
  };
}

export async function getDicts(): Promise<DictsDTO> {
  const [stages, blocks, roles, employees] = await Promise.all([
    prisma.stage.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
    prisma.block.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
    prisma.role.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
    prisma.employee.findMany({ include: { roles: true }, orderBy: { fullName: 'asc' } }),
  ]);
  return {
    stages: stages.map(({ id, name, order, color, archived }) => ({
      id,
      name,
      order,
      color,
      archived,
    })),
    blocks: blocks.map(({ id, name, order, archived }) => ({ id, name, order, archived })),
    roles: roles.map(({ id, name, order, archived }) => ({ id, name, order, archived })),
    employees: employees.map(toEmployeeDTO),
  };
}

export interface ForumCardData extends ForumDTO {
  counts: StatusCounts;
}

/** Плашки форумов: счётчики статусов считает база одним запросом, без загрузки задач. */
export async function getForumsForHome(archived: boolean): Promise<ForumCardData[]> {
  const today = isoToDb(todayMsk());
  const [forums, rows] = await Promise.all([
    prisma.forum.findMany({ where: { archived } }),
    prisma.$queryRaw<
      { forumId: number; total: bigint; ns: bigint; ip: bigint; done: bigint; overdue: bigint }[]
    >`SELECT t."forumId",
        count(*) AS total,
        count(*) FILTER (WHERE t.status = 'NOT_STARTED') AS ns,
        count(*) FILTER (WHERE t.status = 'IN_PROGRESS') AS ip,
        count(*) FILTER (WHERE t.status = 'DONE') AS done,
        count(*) FILTER (WHERE t.status <> 'DONE' AND t."endDate" < ${today}) AS overdue
      FROM "Task" t JOIN "Forum" f ON f.id = t."forumId"
      WHERE f.archived = ${archived}
      GROUP BY t."forumId"`,
  ]);
  const byForum = new Map(rows.map((r) => [r.forumId, r]));
  return forums.map((f) => {
    const r = byForum.get(f.id);
    return {
      ...toForumDTO(f),
      counts: {
        total: Number(r?.total ?? 0),
        notStarted: Number(r?.ns ?? 0),
        inProgress: Number(r?.ip ?? 0),
        done: Number(r?.done ?? 0),
        overdue: Number(r?.overdue ?? 0),
      },
    };
  });
}

export async function getForumOptions(): Promise<
  { id: number; name: string; archived: boolean }[]
> {
  return prisma.forum.findMany({
    select: { id: true, name: true, archived: true },
    orderBy: { startDate: 'desc' },
  });
}

export interface TemplateDTO {
  id: number;
  number: number;
  stageId: number | null;
  blockId: number | null;
  description: string;
  termText: string;
  comment: string | null;
  order: number;
  roleIds: number[];
}

export interface DatabaseData {
  dicts: DictsDTO;
  usage: {
    stage: Record<number, number>;
    block: Record<number, number>;
    role: Record<number, number>;
    employee: Record<number, number>;
  };
  templates: TemplateDTO[];
  forums: (ForumDTO & { taskCount: number })[];
}

export async function getDatabaseData(): Promise<DatabaseData> {
  const [dicts, stages, blocks, roles, employees, templates, forums] = await Promise.all([
    getDicts(),
    prisma.stage.findMany({
      select: { id: true, _count: { select: { tasks: true, templates: true } } },
    }),
    prisma.block.findMany({
      select: { id: true, _count: { select: { tasks: true, templates: true } } },
    }),
    prisma.role.findMany({
      select: { id: true, _count: { select: { tasks: true, templates: true, employees: true } } },
    }),
    prisma.employee.findMany({ select: { id: true, _count: { select: { tasks: true } } } }),
    prisma.templateTask.findMany({
      include: { roles: { select: { id: true } } },
      orderBy: [{ order: 'asc' }, { number: 'asc' }],
    }),
    prisma.forum.findMany({
      include: { _count: { select: { tasks: true } } },
      orderBy: { startDate: 'asc' },
    }),
  ]);
  return {
    dicts,
    usage: {
      stage: Object.fromEntries(stages.map((s) => [s.id, s._count.tasks + s._count.templates])),
      block: Object.fromEntries(blocks.map((s) => [s.id, s._count.tasks + s._count.templates])),
      role: Object.fromEntries(
        roles.map((s) => [s.id, s._count.tasks + s._count.templates + s._count.employees]),
      ),
      employee: Object.fromEntries(employees.map((s) => [s.id, s._count.tasks])),
    },
    templates: templates.map((t) => ({
      id: t.id,
      number: t.number,
      stageId: t.stageId,
      blockId: t.blockId,
      description: t.description,
      termText: t.termText,
      comment: t.comment,
      order: t.order,
      roleIds: t.roles.map((r) => r.id),
    })),
    forums: forums.map((f) => ({ ...toForumDTO(f), taskCount: f._count.tasks })),
  };
}
