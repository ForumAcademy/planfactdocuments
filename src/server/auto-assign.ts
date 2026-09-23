import 'server-only';
import { Prisma, type PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/** Роль, которая означает всех активных сотрудников. */
export const WHOLE_TEAM_ROLE = 'Вся команда';

/**
 * Автоназначение ответственных по ролям: ответственные задачи — активные сотрудники,
 * у которых есть хотя бы одна из ролей задачи (роль «Вся команда» — все активные сотрудники). Не трогаем задачи с ответственными,
 * изменёнными вручную, выполненные задачи и форумы в архиве.
 */
export async function syncAutoAssignments(
  db: Db,
  scope: { forumId?: number; taskIds?: number[] } = {},
): Promise<void> {
  if (scope.taskIds && scope.taskIds.length === 0) return;
  const conds = [
    Prisma.sql`t."employeesManual" = false`,
    Prisma.sql`t.status <> 'DONE'`,
    Prisma.sql`f.archived = false`,
  ];
  if (scope.forumId) conds.push(Prisma.sql`t."forumId" = ${scope.forumId}`);
  if (scope.taskIds) conds.push(Prisma.sql`t.id = ANY(${scope.taskIds})`);
  const where = Prisma.join(conds, ' AND ');

  // Удаляем назначения, которые больше не соответствуют ролям
  await db.$executeRaw`
    DELETE FROM "_EmployeeToTask" et
    USING "Task" t, "Forum" f
    WHERE et."B" = t.id AND f.id = t."forumId" AND ${where}
      AND NOT EXISTS (
        SELECT 1 FROM "_RoleToTask" rt
        JOIN "_EmployeeToRole" er ON er."B" = rt."A"
        JOIN "Employee" e ON e.id = er."A" AND e.active
        WHERE rt."B" = t.id AND er."A" = et."A"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "_RoleToTask" rt
        JOIN "Role" r ON r.id = rt."A" AND r.name = ${WHOLE_TEAM_ROLE}
        JOIN "Employee" e ON e.id = et."A" AND e.active
        WHERE rt."B" = t.id
      )`;
  // Добавляем недостающих
  await db.$executeRaw`
    INSERT INTO "_EmployeeToTask" ("A", "B")
    SELECT DISTINCT er."A", t.id
    FROM "Task" t
    JOIN "Forum" f ON f.id = t."forumId"
    JOIN "_RoleToTask" rt ON rt."B" = t.id
    JOIN "_EmployeeToRole" er ON er."B" = rt."A"
    JOIN "Employee" e ON e.id = er."A" AND e.active
    WHERE ${where}
    UNION
    SELECT e.id, t.id
    FROM "Task" t
    JOIN "Forum" f ON f.id = t."forumId"
    JOIN "_RoleToTask" rt ON rt."B" = t.id
    JOIN "Role" r ON r.id = rt."A" AND r.name = ${WHOLE_TEAM_ROLE}
    CROSS JOIN "Employee" e
    WHERE e.active AND ${where}
    ON CONFLICT DO NOTHING`;
}
