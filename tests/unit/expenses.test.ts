import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  autoExpenseCategory,
  expenseCategoryByLabel,
  groupExpenses,
  taskExpenseCategory,
} from '@/lib/expenses';
import {
  buildExpensesWorkbook,
  parseExpensesWorkbook,
  type ExpenseExportGroup,
} from '@/lib/excel/expenses-excel';
import { parsePlanWorkbook } from '@/lib/excel/plan-excel';

describe('направления расходов', () => {
  it('раскладывает типовые задачи по направлениям', () => {
    const cases: [string, string, string][] = [
      ['Провести инспекционный визит на выбранную(ые) площадку(и)', 'Площадка', 'travel'],
      ['Выбрать площадку и подрядчика, согласовать условия сотрудничества', 'Площадка', 'org'],
      ['Подготовить прототип сайта форума', 'Маркетинг', 'marketing'],
      ['Сформировать отдел продаж: подбор и найм персонала', 'Продажи', 'staff'],
      ['Настроить телефонию - номера, запись звонков, интеграция с CRM', 'Продажи', 'sales'],
      ['Заключить контракт с подрядчиком по регистрации', 'Регистрация', 'org'],
      ['Отправить на печать баннерные и рекламные конструкции', 'Производство материалов', 'print'],
      ['Изготовить мерч, сувениры и подарки', 'Производство материалов', 'print'],
      ['Выбрать и согласовать фотографа', 'Контент и визуал', 'marketing'],
      ['Провести тестинг меню (в рамках инспекционного визита)', 'Питание', 'org'],
      ['Забронировать и арендовать транспорт (трансфер)', 'Логистика', 'org'],
      ['Подготовить финансовый и общий отчет', 'Финансы и отчетность', 'admin'],
      ['Утвердить концепцию', 'Концепция и стратегия', 'other'],
      [
        'Подготовить презентацию коммерческого предложения (КП) для партнеров',
        'Партнерства',
        'sales',
      ],
      [
        'Настроить мониторинг публикаций участников и партнеров в соцсетях',
        'Маркетинг и коммуникации',
        'marketing',
      ],
    ];
    for (const [d, b, key] of cases) expect(autoExpenseCategory(d, b), d).toBe(key);
  });

  it('ручной выбор направления важнее автоматического', () => {
    const t = { description: 'Подготовить прототип сайта форума', expenseCategory: 'print' };
    expect(taskExpenseCategory(t, 'Маркетинг')).toBe('print');
    expect(taskExpenseCategory({ ...t, expenseCategory: 'нет такого' }, 'Маркетинг')).toBe(
      'marketing',
    );
  });

  it('направление по названию из файла', () => {
    expect(expenseCategoryByLabel(' типография ')).toBe('print');
    expect(expenseCategoryByLabel('Наёмный персонал')).toBe('staff');
    expect(expenseCategoryByLabel('Что-то ещё')).toBeNull();
  });

  it('все задачи мастер-плана попадают в направления, суммы сходятся', async () => {
    const plan = await parsePlanWorkbook(
      await readFile(path.resolve(__dirname, '../../seed/master-plan.xlsx')),
    );
    const tasks = plan.rows.map((r, i) => ({
      description: r.description,
      block: r.block,
      cost: (i % 5) * 1000,
      expenseCategory: null,
    }));
    const { groups, total } = groupExpenses(tasks, (t) => t.block);
    expect(groups.reduce((s, g) => s + g.tasks.length, 0)).toBe(tasks.length);
    expect(total).toBe(tasks.reduce((s, t) => s + t.cost, 0));
    expect(groups.map((g) => g.category.key)).toEqual([
      'marketing',
      'travel',
      'org',
      'print',
      'staff',
      'sales',
      'admin',
      'other',
    ]);
  });
});

const groups: ExpenseExportGroup[] = [
  {
    key: 'marketing',
    label: 'Маркетинг',
    color: '#2563EB',
    rows: [
      { number: 39, description: 'Сайт', stage: '1. Этап', status: 'NOT_STARTED', cost: 150000 },
      { number: 41, description: 'Реклама', stage: '1. Этап', status: 'DONE', cost: 0 },
    ],
  },
  {
    key: 'print',
    label: 'Типография',
    color: '#D97706',
    rows: [
      { number: 97, description: 'Мерч', stage: '2. Этап', status: 'NOT_STARTED', cost: 300000 },
    ],
  },
];

describe('Excel раздела «Расходы»', () => {
  it('шаблон: все задачи с пустой стоимостью, читается обратно', async () => {
    const buf = await buildExpensesWorkbook(groups, {
      forumName: 'Форум',
      mode: 'template',
      date: '2026-10-06',
    });
    const p = await parseExpensesWorkbook(buf);
    expect(p.fileErrors).toEqual([]);
    expect(p.skipped).toEqual([]);
    expect(p.rows.map((r) => [r.number, r.category, r.cost])).toEqual([
      [39, 'marketing', null],
      [41, 'marketing', null],
      [97, 'print', null],
    ]);
  });

  it('заполненные данные: только задачи со стоимостью, суммы и доли', async () => {
    const buf = await buildExpensesWorkbook(groups, {
      forumName: 'Форум',
      mode: 'data',
      date: '2026-10-06',
    });
    const p = await parseExpensesWorkbook(buf);
    expect(p.rows.map((r) => [r.number, r.category, r.cost])).toEqual([
      [39, 'marketing', 150000],
      [97, 'print', 300000],
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Расходы')!;
    const total = ws.getRow(ws.rowCount);
    expect(total.getCell(1).value).toBe('Итого');
    expect((total.getCell(6).value as { result: number }).result).toBe(450000);
  });

  it('заполненный шаблон: стоимость, смена направления и ошибки', async () => {
    const buf = await buildExpensesWorkbook(groups, {
      forumName: 'Форум',
      mode: 'template',
      date: '2026-10-06',
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Расходы')!;
    const rowOf = (n: number) => {
      for (let r = 1; r <= ws.rowCount; r++) if (ws.getRow(r).getCell(2).value === n) return r;
      throw new Error(String(n));
    };
    ws.getRow(rowOf(39)).getCell(6).value = '200 000 ₽';
    ws.getRow(rowOf(41)).getCell(1).value = 'Типография';
    ws.getRow(rowOf(41)).getCell(6).value = 5000;
    ws.getRow(rowOf(97)).getCell(1).value = 'Космос';
    ws.getRow(rowOf(97)).getCell(6).value = 'много';
    ws.addRow(['Маркетинг', null, 'Новая статья без номера', '', '', 1000]);
    const p = await parseExpensesWorkbook(await wb.xlsx.writeBuffer());
    expect(p.rows.map((r) => [r.number, r.category, r.cost])).toEqual([
      [39, 'marketing', 200000],
      [41, 'print', 5000],
      [97, null, null],
    ]);
    expect(p.rows[2].errors).toHaveLength(2);
    expect(p.skipped.map((s) => s.text)).toEqual(['Новая статья без номера']);
  });

  it('файл без нужных столбцов', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Лист1').addRow(['что-то', 'другое']);
    const p = await parseExpensesWorkbook(await wb.xlsx.writeBuffer());
    expect(p.rows).toEqual([]);
    expect(p.fileErrors[0]).toMatch(/№ задачи/);
  });
});
