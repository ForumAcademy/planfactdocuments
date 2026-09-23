/**
 * Отчёт в Excel: один лист, строка = статья диаграммы.
 * Столбцы: Диаграмма | Цветовая гамма | Единица | Статья | Сумма | Доп. единица.
 */
import ExcelJS from 'exceljs';
import { PALETTES, type PaletteKey } from '../report/palette';
import { normalizeSpaces, parseAmount } from '../utils';

export const REPORT_SHEET = 'Отчёт';

export interface ReportSheetChart {
  title: string;
  palette: PaletteKey;
  unit: string;
  items: { name: string; amount: number; note: string | null }[];
}

const HEADERS = ['Диаграмма', 'Цветовая гамма', 'Единица', 'Статья', 'Сумма', 'Доп. единица'];

export async function buildReportWorkbook(
  charts: ReportSheetChart[],
  forumName?: string,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Статус форумов';
  if (forumName) wb.title = `Отчёт — ${forumName}`;
  const ws = wb.addWorksheet(REPORT_SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: HEADERS[0], width: 22 },
    { header: HEADERS[1], width: 16 },
    { header: HEADERS[2], width: 12 },
    { header: HEADERS[3], width: 42 },
    { header: HEADERS[4], width: 12 },
    { header: HEADERS[5], width: 16 },
  ];
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A0A9F' } };
    c.alignment = { vertical: 'middle' };
  });
  for (const ch of charts) {
    const rows = ch.items.length ? ch.items : [{ name: '', amount: 0, note: null }];
    for (const it of rows) {
      const r = ws.addRow([
        ch.title,
        PALETTES[ch.palette].label,
        ch.unit,
        it.name,
        it.name ? it.amount : null,
        it.note ?? '',
      ]);
      r.getCell(5).numFmt = '0.00';
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return text(v.result as ExcelJS.CellValue);
    if ('text' in v && typeof v.text === 'string') return v.text;
  }
  return String(v);
}

export function paletteFromText(s: string, title: string): PaletteKey {
  const v = s.toLowerCase();
  if (v.startsWith('крас') || v === 'red') return 'RED';
  if (v.startsWith('зел') || v === 'green') return 'GREEN';
  if (v.startsWith('син') || v === 'blue') return 'BLUE';
  const t = title.toLowerCase();
  if (t.includes('расход')) return 'RED';
  if (t.includes('доход')) return 'GREEN';
  return 'BLUE';
}

export interface ParsedReport {
  charts: ReportSheetChart[];
  errors: string[];
}

export async function parseReportWorkbook(data: ArrayBuffer | Uint8Array): Promise<ParsedReport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(REPORT_SHEET) ?? wb.worksheets[0];
  if (!ws) return { charts: [], errors: ['В файле нет листов'] };
  const headRow = ws.getRow(1);
  const head: string[] = [];
  for (let i = 1; i <= headRow.cellCount; i++) {
    head[i] = normalizeSpaces(text(headRow.getCell(i).value)).toLowerCase();
  }
  const col = (prefix: string) => head.findIndex((h) => (h ?? '').startsWith(prefix));
  const c = {
    title: col('диаграмма'),
    palette: col('цвет'),
    unit: col('единица'),
    name: col('статья'),
    amount: col('сумма'),
    note: col('доп'),
  };
  if (c.title < 0 || c.name < 0 || c.amount < 0) {
    return {
      charts: [],
      errors: [
        'Нужны столбцы «Диаграмма», «Статья» и «Сумма» — выгрузите отчёт кнопкой «Выгрузить в Excel», чтобы получить образец',
      ],
    };
  }
  const charts: ReportSheetChart[] = [];
  const errors: string[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (i: number) => (i > 0 ? normalizeSpaces(text(row.getCell(i).value)) : '');
    const title = get(c.title);
    const name = get(c.name);
    if (!title && !name) continue;
    if (!title) {
      errors.push(`Строка ${r}: не указана диаграмма`);
      continue;
    }
    let chart = charts.find((x) => x.title.toLowerCase() === title.toLowerCase());
    if (!chart) {
      chart = {
        title,
        palette: paletteFromText(get(c.palette), title),
        unit: get(c.unit) || 'млн руб.',
        items: [],
      };
      charts.push(chart);
    }
    if (!name) continue;
    const rawAmount = c.amount > 0 ? row.getCell(c.amount).value : null;
    const amount = typeof rawAmount === 'number' ? rawAmount : parseAmount(text(rawAmount) || '0');
    if (amount === null || amount < 0) {
      errors.push(`Строка ${r}: сумма «${text(rawAmount)}» не распознана — строка пропущена`);
      continue;
    }
    chart.items.push({ name, amount: Math.round(amount * 100) / 100, note: get(c.note) || null });
  }
  return { charts, errors };
}
