import 'server-only';
import type { Employee, Forum, Role, Task } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dbToISO } from '@/lib/dates';
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
    email: e.email,
    phone: e.phone,
    telegram: e.telegram,
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
  tasks: {
    status: TaskDTO['status'];
    startDate: string | null;
    endDate: string | null;
    completedAt: string | null;
  }[];
}

export async function getForumsForHome(archived: boolean): Promise<ForumCardData[]> {
  const forums = await prisma.forum.findMany({
    where: { archived },
    include: {
      tasks: { select: { status: true, startDate: true, endDate: true, completedAt: true } },
    },
  });
  return forums.map((f) => ({
    ...toForumDTO(f),
    tasks: f.tasks.map((t) => ({
      status: t.status,
      startDate: dbToISO(t.startDate),
      endDate: dbToISO(t.endDate),
      completedAt: dbToISO(t.completedAt),
    })),
  }));
}

export async function getForumOptions(): Promise<
  { id: number; name: string; archived: boolean }[]
> {
  return prisma.forum.findMany({
    select: { id: true, name: true, archived: true },
    orderBy: { startDate: 'desc' },
  });
}
