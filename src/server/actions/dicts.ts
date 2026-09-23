'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { colorSchema, employeeSchema, nameSchema, type EmployeeInput } from '@/lib/validation';
import { run, UserError, type ActionResult } from '@/server/action-utils';

export type DictKind = 'stage' | 'block' | 'role' | 'employee' | 'template';

const idSchema = z.number().int().positive();

function refresh() {
  revalidatePath('/database');
  revalidatePath('/', 'layout');
}

async function assertUniqueName(kind: 'stage' | 'block' | 'role', name: string, id?: number) {
  const where = {
    name: { equals: name, mode: 'insensitive' as const },
    NOT: id ? { id } : undefined,
  };
  const exists =
    kind === 'stage'
      ? await prisma.stage.findFirst({ where })
      : kind === 'block'
        ? await prisma.block.findFirst({ where })
        : await prisma.role.findFirst({ where });
  if (exists) throw new UserError(`Значение «${name}» уже есть в справочнике`);
}

const namedSchema = z.object({
  id: idSchema.optional(),
  name: nameSchema,
  order: z.number().int().min(0).max(100000),
  archived: z.boolean(),
});

export async function saveNamed(
  kind: 'block' | 'role',
  input: z.input<typeof namedSchema>,
): Promise<ActionResult<{ id: number }>> {
  return run(async () => {
    await requireEditor();
    const d = namedSchema.parse(input);
    await assertUniqueName(kind, d.name, d.id);
    const data = { name: d.name, order: d.order, archived: d.archived };
    const row =
      kind === 'block'
        ? d.id
          ? await prisma.block.update({ where: { id: d.id }, data })
          : await prisma.block.create({ data })
        : d.id
          ? await prisma.role.update({ where: { id: d.id }, data })
          : await prisma.role.create({ data });
    refresh();
    return { id: row.id };
  });
}

const stageSchema = namedSchema.extend({ color: colorSchema });

export async function saveStage(
  input: z.input<typeof stageSchema>,
): Promise<ActionResult<{ id: number }>> {
  return run(async () => {
    await requireEditor();
    const d = stageSchema.parse(input);
    await assertUniqueName('stage', d.name, d.id);
    const data = { name: d.name, order: d.order, archived: d.archived, color: d.color };
    const row = d.id
      ? await prisma.stage.update({ where: { id: d.id }, data })
      : await prisma.stage.create({ data });
    refresh();
    return { id: row.id };
  });
}

export async function saveEmployee(
  id: number | null,
  input: EmployeeInput,
): Promise<ActionResult<{ id: number }>> {
  return run(async () => {
    await requireEditor();
    const d = employeeSchema.parse(input);
    const data = {
      fullName: d.fullName,
      position: d.position,
      email: d.email,
      phone: d.phone,
      telegram: d.telegram,
      active: d.active,
    };
    const row = id
      ? await prisma.employee.update({
          where: { id },
          data: { ...data, roles: { set: d.roleIds.map((r) => ({ id: r })) } },
        })
      : await prisma.employee.create({
          data: { ...data, roles: { connect: d.roleIds.map((r) => ({ id: r })) } },
        });
    refresh();
    return { id: row.id };
  });
}

const templateSchema = z.object({
  number: z.number().int().min(1).max(100000),
  stageId: idSchema.nullable(),
  blockId: idSchema.nullable(),
  description: z.string().trim().min(1, 'Укажите описание задачи').max(4000),
  termText: z.string().trim().max(500),
  comment: z
    .string()
    .trim()
    .max(4000)
    .nullish()
    .transform((v) => v || null),
  roleIds: z.array(idSchema).max(20),
});

export async function saveTemplate(
  id: number | null,
  input: z.input<typeof templateSchema>,
): Promise<ActionResult<{ id: number }>> {
  return run(async () => {
    await requireEditor();
    const d = templateSchema.parse(input);
    const data = {
      number: d.number,
      stageId: d.stageId,
      blockId: d.blockId,
      description: d.description,
      termText: d.termText,
      comment: d.comment,
    };
    const row = id
      ? await prisma.templateTask.update({
          where: { id },
          data: { ...data, roles: { set: d.roleIds.map((r) => ({ id: r })) } },
        })
      : await prisma.templateTask.create({
          data: {
            ...data,
            order:
              ((await prisma.templateTask.aggregate({ _max: { order: true } }))._max.order ?? 0) +
              1,
            roles: { connect: d.roleIds.map((r) => ({ id: r })) },
          },
        });
    refresh();
    return { id: row.id };
  });
}

/** Сколько записей используют значение справочника. */
async function usage(kind: DictKind, id: number): Promise<number> {
  switch (kind) {
    case 'stage':
      return (
        (await prisma.task.count({ where: { stageId: id } })) +
        (await prisma.templateTask.count({ where: { stageId: id } }))
      );
    case 'block':
      return (
        (await prisma.task.count({ where: { blockId: id } })) +
        (await prisma.templateTask.count({ where: { blockId: id } }))
      );
    case 'role':
      return (
        (await prisma.task.count({ where: { roles: { some: { id } } } })) +
        (await prisma.templateTask.count({ where: { roles: { some: { id } } } })) +
        (await prisma.employee.count({ where: { roles: { some: { id } } } }))
      );
    case 'employee':
      return prisma.task.count({ where: { employees: { some: { id } } } });
    case 'template':
      return 0;
  }
}

/**
 * Удаление значения справочника. Если значение используется — не удаляет
 * и возвращает число использований (интерфейс предложит архивировать).
 */
export async function deleteDictItem(
  kind: DictKind,
  id: number,
): Promise<ActionResult<{ deleted: boolean; usedIn: number }>> {
  return run(async () => {
    await requireEditor();
    idSchema.parse(id);
    const usedIn = await usage(kind, id);
    if (usedIn > 0) return { deleted: false, usedIn };
    if (kind === 'stage') await prisma.stage.delete({ where: { id } });
    if (kind === 'block') await prisma.block.delete({ where: { id } });
    if (kind === 'role') await prisma.role.delete({ where: { id } });
    if (kind === 'employee') await prisma.employee.delete({ where: { id } });
    if (kind === 'template') await prisma.templateTask.delete({ where: { id } });
    refresh();
    return { deleted: true, usedIn: 0 };
  });
}

export async function setDictArchived(
  kind: Exclude<DictKind, 'template'>,
  id: number,
  archived: boolean,
): Promise<ActionResult> {
  return run(async () => {
    await requireEditor();
    if (kind === 'stage') await prisma.stage.update({ where: { id }, data: { archived } });
    if (kind === 'block') await prisma.block.update({ where: { id }, data: { archived } });
    if (kind === 'role') await prisma.role.update({ where: { id }, data: { archived } });
    if (kind === 'employee')
      await prisma.employee.update({ where: { id }, data: { active: !archived } });
    refresh();
    return null;
  });
}
