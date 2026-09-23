import type { Prisma, PrismaClient } from '@prisma/client';
import { STAGE_COLORS } from '@/lib/plan';
import { stageNumberFromName } from '@/lib/term-parser';

type Db = PrismaClient | Prisma.TransactionClient;

export interface DictMaps {
  stages: Map<string, { id: number; name: string; order: number }>;
  blocks: Map<string, number>;
  roles: Map<string, number>;
  employees: Map<string, number>;
}

export const key = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

export async function loadDictMaps(db: Db): Promise<DictMaps> {
  const [stages, blocks, roles, employees] = await Promise.all([
    db.stage.findMany(),
    db.block.findMany(),
    db.role.findMany(),
    db.employee.findMany(),
  ]);
  return {
    stages: new Map(stages.map((s) => [key(s.name), { id: s.id, name: s.name, order: s.order }])),
    blocks: new Map(blocks.map((b) => [key(b.name), b.id])),
    roles: new Map(roles.map((r) => [key(r.name), r.id])),
    employees: new Map(employees.map((e) => [key(e.fullName), e.id])),
  };
}

/** Добавляет в справочники недостающие этапы, блоки, роли и сотрудников. */
export async function ensureDictionaries(
  db: Db,
  input: { stages: string[]; blocks: string[]; roles: string[]; employees?: string[] },
): Promise<DictMaps> {
  const maps = await loadDictMaps(db);
  const maxOrder = async (model: 'stage' | 'block' | 'role') => {
    const agg =
      model === 'stage'
        ? await db.stage.aggregate({ _max: { order: true } })
        : model === 'block'
          ? await db.block.aggregate({ _max: { order: true } })
          : await db.role.aggregate({ _max: { order: true } });
    return agg._max.order ?? 0;
  };

  let order = await maxOrder('stage');
  for (const name of input.stages) {
    if (!name || maps.stages.has(key(name))) continue;
    const num = stageNumberFromName(name);
    order++;
    const s = await db.stage.create({
      data: {
        name,
        order: num ?? order,
        color: STAGE_COLORS[((num ?? order) - 1) % STAGE_COLORS.length],
      },
    });
    maps.stages.set(key(name), { id: s.id, name: s.name, order: s.order });
  }
  order = await maxOrder('block');
  for (const name of input.blocks) {
    if (!name || maps.blocks.has(key(name))) continue;
    const b = await db.block.create({ data: { name, order: ++order } });
    maps.blocks.set(key(name), b.id);
  }
  order = await maxOrder('role');
  for (const name of input.roles) {
    if (!name || maps.roles.has(key(name))) continue;
    const r = await db.role.create({ data: { name, order: ++order } });
    maps.roles.set(key(name), r.id);
  }
  for (const name of input.employees ?? []) {
    if (!name || maps.employees.has(key(name))) continue;
    const e = await db.employee.create({ data: { fullName: name } });
    maps.employees.set(key(name), e.id);
  }
  return maps;
}
