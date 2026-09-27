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

/** Структура по умолчанию, если в отчёте ещё нет диаграмм. */
const TEMPLATE_DEFAULT: ReportSheetChart[] = [
  {
    title: 'Расходы',
    palette: 'RED',
    unit: 'млн руб.',
    items: [
      'Персонал',
      'Площадка',
      'Питание',
      'Маркетинг',
      'Деловая программа',
      'Трансфер и логистика',
      'Прочее',
    ].map((name) => ({ name, amount: 0, note: null })),
  },
  {
    title: 'Доходы',
    palette: 'GREEN',
    unit: 'млн руб.',
    items: ['Билеты', 'Партнерства'].map((name) => ({ name, amount: 0, note: null })),
  },
  {
    title: 'Кто пригласил',
    palette: 'BLUE',
    unit: 'млн руб.',
    items: ['Отдел продаж'].map((name) => ({ name, amount: 0, note: null })),
  },
];

/**
 * Шаблон для заполнения: та же таблица, что при выгрузке, но с пустыми суммами,
 * выпадающим списком цветовой гаммы и листом с инструкцией. Заполненный файл
 * загружается обратно кнопкой «Загрузить из Excel».
 */
export async function buildReportTemplate(
  charts: ReportSheetChart[],
  forumName?: string,
): Promise<ArrayBuffer> {
  const source = charts.length ? charts : TEMPLATE_DEFAULT;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Статус форумов';
  if (forumName) wb.title = `Шаблон отчёта — ${forumName}`;
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
  });
  for (const ch of source) {
    const names = ch.items.length ? ch.items : [{ name: '', amount: 0, note: null }];
    for (const it of names) {
      const r = ws.addRow([
        ch.title,
        PALETTES[ch.palette].label,
        ch.unit,
        it.name,
        null,
        it.note ?? '',
      ]);
      const amount = r.getCell(5);
      amount.numFmt = '0.00';
      amount.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7D6' } };
    }
  }
  const last = Math.max(ws.rowCount + 200, 300);
  for (let r = 2; r <= last; r++) {
    ws.getCell(r, 2).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Красная,Зелёная,Синяя"'],
    };
    ws.getCell(r, 5).dataValidation = {
      type: 'decimal',
      operator: 'greaterThanOrEqual',
      allowBlank: true,
      formulae: [0],
      showErrorMessage: true,
      errorTitle: 'Сумма',
      error: 'Введите число, например 1,25',
    };
  }

  const help = wb.addWorksheet('Инструкция');
  help.getColumn(1).width = 110;
  [
    'Как заполнить шаблон отчёта',
    '',
    '1. Лист «Отчёт»: одна строка — одна статья диаграммы.',
    '2. «Диаграмма» — название диаграммы (Расходы, Доходы, Кто пригласил…). Строки с одинаковым названием попадут в одну диаграмму.',
    '3. «Цветовая гамма» — Красная, Зелёная или Синяя (выпадающий список).',
    '4. «Единица» — единица измерения сумм, например «млн руб.».',
    '5. «Статья» и «Сумма» — название статьи и число (жёлтые ячейки). Строки без суммы не загружаются.',
    '6. «Доп. единица» — необязательно, например «6 шт.»; на диаграмме будет в скобках после суммы.',
    '7. Можно добавлять строки, новые статьи и новые диаграммы, удалять лишние.',
    '8. На сайте: «Отчёт» → «Загрузить из Excel» → выберите файл. Перед заменой будет показан предпросмотр.',
  ].forEach((t, i) => {
    const c = help.getCell(i + 1, 1);
    c.value = t;
    c.alignment = { wrapText: true, vertical: 'top' };
    if (i === 0) c.font = { bold: true, size: 14 };
  });
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
    // Незаполненная сумма (строка шаблона) — пропускаем без ошибки
    if (rawAmount === null || rawAmount === undefined || text(rawAmount).trim() === '') continue;
    const amount = typeof rawAmount === 'number' ? rawAmount : parseAmount(text(rawAmount) || '0');
    if (amount === null || amount < 0) {
      errors.push(`Строка ${r}: сумма «${text(rawAmount)}» не распознана — строка пропущена`);
      continue;
    }
    chart.items.push({ name, amount: Math.round(amount * 100) / 100, note: get(c.note) || null });
  }
  return { charts, errors };
}
