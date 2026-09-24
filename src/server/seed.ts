import type { ChartPalette, PrismaClient } from '@prisma/client';
import { parsePlanWorkbook } from '@/lib/excel/plan-excel';
import { addDays, addMonths, isoToDb, todayMsk } from '@/lib/dates';
import { STAGE_COLORS } from '@/lib/plan';
import { stageNumberFromName } from '@/lib/term-parser';
import { key } from './dictionaries';
import { importPlanRows, type PlanRowInput } from './plan-service';

export const DEFAULT_ROLES = [
  'Ивент',
  'Отдел продаж',
  'Маркетинг',
  'Программа',
  'Финансы',
  'Юрист',
  'Дизайн',
  'Веб-разработчик',
  'Команда проекта',
  'Техническое обеспечение',
  'Подрядчик по регистрации',
  'Вся команда',
  'Каждый по своему направлению',
];

export const DEFAULT_STAGES = [
  '1. Предстартовая подготовка',
  '2. Продажи и орг. подготовка',
  '3. Проведение и координация',
  '4. Завершение и пост-мероприятие',
];

export const DEMO_FORUM_NAME = 'СтройТех’26';

const DEMO_EMPLOYEES = [
  {
    fullName: 'Иванова Анна Сергеевна',
    position: 'Руководитель проекта',
    roles: ['Ивент', 'Команда проекта'],
  },
  {
    fullName: 'Петров Дмитрий Олегович',
    position: 'Менеджер по продажам',
    roles: ['Отдел продаж'],
  },
  {
    fullName: 'Смирнова Екатерина Игоревна',
    position: 'Маркетолог',
    roles: ['Маркетинг', 'Дизайн'],
  },
  {
    fullName: 'Кузнецов Алексей Викторович',
    position: 'Программный директор',
    roles: ['Программа'],
  },
  {
    fullName: 'Орлова Мария Андреевна',
    position: 'Финансовый менеджер',
    roles: ['Финансы', 'Юрист'],
  },
];

export const DEFAULT_REPORT: {
  title: string;
  palette: ChartPalette;
  items: [string, number][];
}[] = [
  {
    title: 'Расходы',
    palette: 'RED',
    items: [
      ['Персонал', 3.92],
      ['Площадка', 1.81],
      ['Питание', 1.24],
      ['Маркетинг', 1.07],
      ['Деловая программа', 0.99],
      ['Прочее', 0.49],
      ['Трансфер и логистика', 0.22],
    ],
  },
  {
    title: 'Доходы',
    palette: 'GREEN',
    items: [
      ['Билеты, 62 шт', 6.21],
      ['Партнерства, 7 шт', 8.48],
    ],
  },
  {
    title: 'Кто пригласил',
    palette: 'BLUE',
    items: [
      ['Отдел продаж, 43 билета, 3 партнерства', 6.71],
      ['ГПН, 2 билета, 4 партнера', 6.3],
      ['ГПН-ЦР, 16 билетов', 1.57],
      ['МТО ГПН-С, 1 билет', 0.11],
    ],
  },
];

export interface SeedSummary {
  stages: number;
  blocks: number;
  roles: number;
  templates: number;
  demoForumCreated: boolean;
  demoTasks: number;
}

/** Заполняет справочники, типовой мастер-план и демо-форум. Можно запускать повторно. */
export async function runSeed(prisma: PrismaClient, masterPlan: Uint8Array): Promise<SeedSummary> {
  const parsed = await parsePlanWorkbook(masterPlan);
  if (parsed.rows.length === 0)
    throw new Error(`Мастер-план пуст: ${parsed.fileErrors.join('; ')}`);

  // Этапы
  const stageNames = [...new Set([...DEFAULT_STAGES, ...parsed.rows.map((r) => r.stage)])].filter(
    Boolean,
  );
  for (const [i, name] of stageNames.entries()) {
    const n = stageNumberFromName(name) ?? i + 1;
    await prisma.stage.upsert({
      where: { name },
      update: {},
      create: { name, order: n, color: STAGE_COLORS[(n - 1) % STAGE_COLORS.length] },
    });
  }
  // Блоки — в порядке появления в мастер-плане
  const blockNames = [...new Set(parsed.rows.map((r) => r.block))].filter(Boolean);
  for (const [i, name] of blockNames.entries()) {
    await prisma.block.upsert({ where: { name }, update: {}, create: { name, order: i + 1 } });
  }
  // Роли
  const roleNames = [...new Set([...DEFAULT_ROLES, ...parsed.rows.flatMap((r) => r.roles)])];
  for (const [i, name] of roleNames.entries()) {
    const existing = await prisma.role.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (!existing) await prisma.role.create({ data: { name, order: i + 1 } });
  }

  // Формулировки срока — в справочник
  const termTexts = [...new Set(parsed.rows.map((r) => r.termText.replace(/\s+/g, ' ').trim()))];
  for (const [i, text] of termTexts.filter(Boolean).entries()) {
    await prisma.termPhrase.upsert({ where: { text }, update: {}, create: { text, order: i + 1 } });
  }

  const [stages, blocks, roles] = await Promise.all([
    prisma.stage.findMany(),
    prisma.block.findMany(),
    prisma.role.findMany(),
  ]);
  const stageId = new Map(stages.map((s) => [key(s.name), s.id]));
  const blockId = new Map(blocks.map((b) => [key(b.name), b.id]));
  const roleId = new Map(roles.map((r) => [key(r.name), r.id]));

  // Типовой мастер-план (перезаписывается целиком)
  await prisma.templateTask.deleteMany();
  for (const [i, r] of parsed.rows.entries()) {
    await prisma.templateTask.create({
      data: {
        number: r.number ?? i + 1,
        stageId: stageId.get(key(r.stage)) ?? null,
        blockId: blockId.get(key(r.block)) ?? null,
        description: r.description,
        termText: r.termText,
        comment: r.comment || null,
        order: i + 1,
        roles: {
          connect: r.roles
            .map((x) => roleId.get(key(x)))
            .filter((x): x is number => !!x)
            .map((id) => ({ id })),
        },
      },
    });
  }

  // Сотрудники (тестовые)
  for (const e of DEMO_EMPLOYEES) {
    const found = await prisma.employee.findFirst({ where: { fullName: e.fullName } });
    if (found) continue;
    await prisma.employee.create({
      data: {
        fullName: e.fullName,
        position: e.position,
        roles: { connect: e.roles.map((r) => ({ id: roleId.get(key(r))! })).filter((x) => x.id) },
      },
    });
  }

  await prisma.reminderSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  // Демо-форум
  let demoForumCreated = false;
  let demoTasks = 0;
  const existingDemo = await prisma.forum.findFirst({ where: { name: DEMO_FORUM_NAME } });
  if (!existingDemo) {
    const today = todayMsk();
    const start = addMonths(today, 5);
    const end = addDays(start, 1);
    const sales = addMonths(start, -4);
    const forum = await prisma.forum.create({
      data: {
        name: DEMO_FORUM_NAME,
        startDate: isoToDb(start),
        endDate: isoToDb(end),
        salesStartDate: isoToDb(sales),
        location: 'Москва',
        reportDate: isoToDb(today),
      },
    });
    const rows: PlanRowInput[] = parsed.rows.map((r) => ({
      number: r.number,
      stage: r.stage,
      block: r.block,
      description: r.description,
      termText: r.termText,
      roles: r.roles,
      status: 'NOT_STARTED',
      comment: r.comment,
      // Ответственные назначаются автоматически по ролям
      employees: [],
      startDate: null,
      endDate: null,
      completedAt: null,
    }));
    const res = await importPlanRows(
      prisma,
      { id: forum.id, startDate: start, endDate: end, salesStartDate: sales },
      rows,
      'replace',
      'Начальные данные',
    );
    demoTasks = res.added;

    // Немного живых статусов для демонстрации
    const tasks = await prisma.task.findMany({
      where: { forumId: forum.id },
      orderBy: { order: 'asc' },
    });
    for (const [i, t] of tasks.slice(0, 30).entries()) {
      const status = i % 3 === 0 ? 'DONE' : i % 3 === 1 ? 'IN_PROGRESS' : 'NOT_STARTED';
      await prisma.task.update({
        where: { id: t.id },
        data: { status, completedAt: status === 'DONE' ? isoToDb(today) : null },
      });
    }

    // Несколько просроченных задач — чтобы сразу была видна подсветка отставания
    for (const [i, t] of tasks.slice(30, 34).entries()) {
      await prisma.task.update({
        where: { id: t.id },
        data: {
          status: i % 2 ? 'NOT_STARTED' : 'IN_PROGRESS',
          startDate: isoToDb(addDays(today, -20 - i * 3)),
          endDate: isoToDb(addDays(today, -3 - i * 4)),
          datesManual: true,
          needsClarification: false,
        },
      });
    }

    for (const [i, chart] of DEFAULT_REPORT.entries()) {
      await prisma.reportChart.create({
        data: {
          forumId: forum.id,
          title: chart.title,
          palette: chart.palette,
          order: i + 1,
          items: {
            create: chart.items.map(([name, amount], j) => ({ name, amount, order: j + 1 })),
          },
        },
      });
    }
    demoForumCreated = true;
  }

  return {
    stages: stages.length,
    blocks: blocks.length,
    roles: roles.length,
    templates: parsed.rows.length,
    demoForumCreated,
    demoTasks,
  };
}
