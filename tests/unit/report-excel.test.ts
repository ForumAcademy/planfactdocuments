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
