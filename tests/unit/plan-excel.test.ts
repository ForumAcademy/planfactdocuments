import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  buildPlanWorkbook,
  matchHeader,
  parsePlanWorkbook,
  splitRoles,
  type ExportTask,
} from '@/lib/excel/plan-excel';

const masterPlan = () => readFile(path.resolve(__dirname, '../../seed/master-plan.xlsx'));

describe('импорт мастер-плана', () => {
  it('читает все 149 задач без ошибок', async () => {
    const p = await parsePlanWorkbook(await masterPlan());
    expect(p.fileErrors).toEqual([]);
    expect(p.rows).toHaveLength(149);
    expect(p.rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(p.rows[0]).toMatchObject({
      number: 1,
      stage: '1. Предстартовая подготовка',
      block: 'Концепция и стратегия',
      termText: 'до старта продаж',
      roles: ['Маркетинг'],
      status: 'NOT_STARTED',
    });
    // лишние пробелы нормализуются
    expect(p.rows.some((r) => r.termText.includes('  '))).toBe(false);
  });

  it('разбивает роли по «/» с обрезкой пробелов', () => {
    expect(splitRoles('Ивент / Маркетинг')).toEqual(['Ивент', 'Маркетинг']);
    expect(splitRoles('Отдел продаж/Маркетинг')).toEqual(['Отдел продаж', 'Маркетинг']);
    expect(splitRoles('Ивент / Маркетинг / Программа')).toEqual([
      'Ивент',
      'Маркетинг',
      'Программа',
    ]);
    expect(splitRoles('')).toEqual([]);
  });

  it('распознаёт заголовки столбцов', () => {
    expect(matchHeader('Ответственный блок /  роль')).toBe('roles');
    expect(matchHeader('Срок готовности (относительно даты форума)')).toBe('termText');
    expect(matchHeader('Ответственный (ФИО)')).toBe('employees');
    expect(matchHeader('Дата окончания')).toBe('endDate');
    expect(matchHeader('Отставание, дн.')).toBe('lag');
  });

  it('сообщает об отсутствии обязательного столбца', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Лист1').addRow(['Что-то', 'Другое']);
    const buf = await wb.xlsx.writeBuffer();
    const p = await parsePlanWorkbook(buf as ArrayBuffer);
    expect(p.rows).toHaveLength(0);
    expect(p.fileErrors[0]).toMatch(/Описание задачи/);
  });

  it('подсвечивает ошибочные строки', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Мастер-план форума');
    ws.addRow([
      '№',
      'Этап',
      'Блок / направление',
      'Описание задачи',
      'Срок',
      'Роль',
      'Статус',
      'Комментарий',
      'Дата начала',
      'Дата окончания',
    ]);
    ws.addRow([
      1,
      '',
      'Блок',
      'Задача',
      'когда-нибудь',
      'Ивент',
      'Непонятно',
      '',
      '31.12.2026',
      '01.12.2026',
    ]);
    const p = await parsePlanWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(p.rows[0].errors).toEqual(
      expect.arrayContaining([
        'Не указан этап',
        'Неизвестный статус «Непонятно» — будет «Не начато»',
        'Дата начала позже даты окончания',
      ]),
    );
  });
});

describe('экспорт и обратный импорт', () => {
  it('выгруженный файл загружается обратно без потерь', async () => {
    const tasks: ExportTask[] = [
      {
        number: 1,
        stage: '1. Предстартовая подготовка',
        block: 'Площадка',
        description: 'Выбрать площадку',
        termText: 'за 4 месяца до форума',
        roles: ['Ивент', 'Финансы'],
        status: 'IN_PROGRESS',
        comment: 'Многострочный\nкомментарий',
        employees: ['Иванова Анна Сергеевна', 'Петров Дмитрий Олегович'],
        startDate: '2026-10-01',
        endDate: '2026-10-08',
        lag: 3,
        completedAt: null,
        overdue: true,
      },
      {
        number: 2,
        stage: '4. Завершение и пост-мероприятие',
        block: 'Финансы и отчетность',
        description: 'Закрыть договоры',
        termText: 'в течение 5 рабочих дней после форума',
        roles: ['Финансы'],
        status: 'DONE',
        comment: '',
        employees: [],
        startDate: '2027-03-12',
        endDate: '2027-03-18',
        lag: 0,
        completedAt: '2027-03-20',
        overdue: false,
      },
    ];
    const buf = await buildPlanWorkbook(tasks, { forumName: 'Тест' });
    const back = await parsePlanWorkbook(buf);
    expect(back.fileErrors).toEqual([]);
    expect(back.rows.map(({ rowNumber: _r, errors: _e, ...rest }) => rest)).toEqual(
      tasks.map(({ lag: _l, overdue: _o, ...rest }) => rest),
    );
  });

  it('оформление: закреплённая шапка и автофильтр', async () => {
    const buf = await buildPlanWorkbook([]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Мастер-план форума')!;
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
  });
});
