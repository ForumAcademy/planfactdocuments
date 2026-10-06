import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export interface NewTask {
  data: Prisma.TaskCreateManyInput;
  roleIds: number[];
  employeeIds: number[];
  /** Текст записи «Создание» в истории задачи */
  history: string;
}

/**
 * Создаёт много задач за несколько запросов (а не по 5–6 запросов на задачу):
 * задачи, связи с ролями и ответственными, записи истории — пачками.
 * Возвращает id созданных задач в том же порядке.
 */
export async function insertTasks(db: Db, tasks: NewTask[], userName: string): Promise<number[]> {
  if (!tasks.length) return [];
  const created = await db.task.createManyAndReturn({
    data: tasks.map((t) => t.data),
    select: { id: true },
  });
  const ids = created.map((c) => c.id);
  const roleA: number[] = [];
  const roleB: number[] = [];
  const empA: number[] = [];
  const empB: number[] = [];
  tasks.forEach((t, i) => {
    for (const r of new Set(t.roleIds)) {
      roleA.push(r);
      roleB.push(ids[i]);
    }
    for (const e of new Set(t.employeeIds)) {
      empA.push(e);
      empB.push(ids[i]);
    }
  });
  if (roleA.length) {
    await db.$executeRaw`
      INSERT INTO "_RoleToTask" ("A", "B")
      SELECT * FROM unnest(${roleA}::int[], ${roleB}::int[])
      ON CONFLICT DO NOTHING`;
  }
  if (empA.length) {
    await db.$executeRaw`
      INSERT INTO "_EmployeeToTask" ("A", "B")
      SELECT * FROM unnest(${empA}::int[], ${empB}::int[])
      ON CONFLICT DO NOTHING`;
  }
  await db.taskHistory.createMany({
    data: tasks.map((t, i) => ({
      taskId: ids[i],
      field: 'Создание',
      newValue: t.history,
      changedBy: userName,
    })),
  });
  return ids;
}
