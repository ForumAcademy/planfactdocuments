import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildReportWorkbook, parseReportWorkbook } from '@/lib/excel/report-excel';
import { itemLabel } from '@/lib/report/donut-layout';

describe('отчёт в Excel', () => {
  it('выгрузка загружается обратно без потерь', async () => {
    const charts = [
      {
        title: 'Доходы',
        palette: 'GREEN' as const,
        unit: 'млн руб.',
        items: [
          { name: 'Билеты', amount: 6.21, note: '62 шт.' },
          { name: 'Партнерства', amount: 8.48, note: '7 шт.' },
        ],
      },
      {
        title: 'Расходы',
        palette: 'RED' as const,
        unit: 'млн руб.',
        items: [{ name: 'Площадка', amount: 1.81, note: null }],
      },
      { title: 'Пустая', palette: 'BLUE' as const, unit: 'шт.', items: [] },
    ];
    const back = await parseReportWorkbook(await buildReportWorkbook(charts));
    expect(back.errors).toEqual([]);
    expect(back.charts).toEqual(charts);
  });

  it('суммы с запятой, гамма по названию, ошибки', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Лист1');
    ws.addRow(['Диаграмма', 'Статья', 'Сумма']);
    ws.addRow(['Расходы', 'Персонал', '3,92']);
    ws.addRow(['Расходы', 'Прочее', 'много']);
    ws.addRow(['', 'Без диаграммы', 1]);
    const r = await parseReportWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(r.charts).toEqual([
      {
        title: 'Расходы',
        palette: 'RED',
        unit: 'млн руб.',
        items: [{ name: 'Персонал', amount: 3.92, note: null }],
      },
    ]);
    expect(r.errors).toHaveLength(2);
  });

  it('подпись статьи с доп. единицей', () => {
    expect(itemLabel('Партнерства', '8,48', '7 шт.')).toBe('Партнерства; 8,48\u00a0(7\u00a0шт.)');
    expect(itemLabel('Билеты', '6,21')).toBe('Билеты; 6,21');
  });
});

describe('шаблон отчёта', () => {
  it('пустые суммы не загружаются, заполненные — загружаются', async () => {
    const { buildReportTemplate, parseReportWorkbook } = await import('@/lib/excel/report-excel');
    const ExcelJS = (await import('exceljs')).default;
    const buf = await buildReportTemplate([], 'Тест');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Отчёт')!;
    expect(wb.getWorksheet('Инструкция')).toBeTruthy();
    // Заполняем две статьи: «Персонал» (Расходы) и «Билеты» (Доходы)
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const name = String(row.getCell(4).value ?? '');
      if (name === 'Персонал') row.getCell(5).value = 3.5;
      if (name === 'Билеты') row.getCell(5).value = '6,21';
    });
    const filled = await wb.xlsx.writeBuffer();
    const res = await parseReportWorkbook(filled as ArrayBuffer);
    expect(res.errors).toEqual([]);
    const byTitle = Object.fromEntries(res.charts.map((c) => [c.title, c]));
    expect(byTitle['Расходы'].items).toEqual([{ name: 'Персонал', amount: 3.5, note: null }]);
    expect(byTitle['Доходы'].items).toEqual([{ name: 'Билеты', amount: 6.21, note: null }]);
    expect(byTitle['Расходы'].palette).toBe('RED');
  });
});
