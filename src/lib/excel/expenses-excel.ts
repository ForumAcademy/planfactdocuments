/**
 * Excel раздела «Расходы»: шаблон, выгрузка заполненных данных и разбор загруженного файла.
 * Строки задач связываются с форумом по № задачи; меняются только план, факт и направление.
 */
import ExcelJS from 'exceljs';
import { EXPENSE_CATEGORIES, expenseCategoryByLabel, type ExpenseCategoryKey } from '../expenses';
import { STATUS_LABEL, type TaskStatusCode } from '../status';
import { normalizeSpaces, pluralRu } from '../utils';

export const EXPENSES_SHEET_NAME = 'Расходы';
/** Прежнее имя листа — файлы, выгруженные до переименования, тоже читаются */
const LEGACY_SHEET_NAMES = ['Линия расходов'];
const LIST_SHEET_NAME = 'Направления';
const HEADER_ROW = 4;

const COLUMNS = [
  { key: 'category', header: 'Направление', width: 28 },
  { key: 'number', header: '№ задачи', width: 9 },
  { key: 'description', header: 'Статья расходов (задача)', width: 60 },
  { key: 'stage', header: 'Этап', width: 26 },
  { key: 'status', header: 'Статус', width: 13 },
  { key: 'cost', header: 'Стоимость, руб.', width: 16 },
  { key: 'fact', header: 'Факт, руб.', width: 16 },
  { key: 'share', header: 'Доля', width: 9 },
] as const;

export interface ExpenseExportRow {
  number: number;
  description: string;
  stage: string;
  status: TaskStatusCode;
  cost: number;
  costFact: number;
}

export interface ExpenseExportGroup {
  key: ExpenseCategoryKey;
  label: string;
  color: string;
  rows: ExpenseExportRow[];
}

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
/** Светлый оттенок цвета направления для строки-заголовка */
function tint(hex: string, k = 0.85): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (v: number) =>
    Math.round(v + (255 - v) * k)
      .toString(16)
      .padStart(2, '0');
  return `FF${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`.toUpperCase();
}

/**
 * template — пустой столбец стоимости, все задачи форума (заполнить и загрузить обратно);
 * data — текущие суммы, только задачи со стоимостью, доли направлений.
 */
export async function buildExpensesWorkbook(
  groups: ExpenseExportGroup[],
  meta: { forumName: string; mode: 'template' | 'data'; date: string },
): Promise<ArrayBuffer> {
  const isTemplate = meta.mode === 'template';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Статус форумы';
  wb.created = new Date();
  wb.title = `${meta.forumName} — расходы`;

  const ws = wb.addWorksheet(EXPENSES_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW }],
  });
  const cols = isTemplate ? COLUMNS.filter((c) => c.key !== 'share') : COLUMNS;
  ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));
  const lastCol = cols.length;

  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = `Расходы — ${meta.forumName}`;
  title.font = { bold: true, size: 14, color: { argb: 'FF0A0A9F' } };
  ws.mergeCells(2, 1, 2, lastCol);
  const note = ws.getCell(2, 1);
  note.value = isTemplate
    ? 'Заполните «Стоимость, руб.» (план) и «Факт, руб.» по задачам; направление можно сменить из списка. Не меняйте «№ задачи». Пустая ячейка — без изменений.'
    : `Данные на ${meta.date}. Файл можно поправить и загрузить обратно в раздел «Расходы».`;
  note.font = { italic: true, color: { argb: 'FF5B6475' } };
  note.alignment = { wrapText: true };
  ws.getRow(2).height = 30;

  const header = ws.getRow(HEADER_ROW);
  cols.forEach((c, i) => (header.getCell(i + 1).value = c.header));
  header.height = 30;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A0A9F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  const costCol = cols.findIndex((c) => c.key === 'cost') + 1;
  const costLetter = ws.getColumn(costCol).letter;
  const factLetter = ws.getColumn(cols.findIndex((c) => c.key === 'fact') + 1).letter;
  const grandTotal = groups.reduce((s, g) => s + g.rows.reduce((a, r) => a + r.cost, 0), 0);
  const grandFact = groups.reduce((s, g) => s + g.rows.reduce((a, r) => a + r.costFact, 0), 0);
  const groupRows: number[] = [];

  for (const g of groups) {
    const rows = isTemplate ? g.rows : g.rows.filter((r) => r.cost > 0 || r.costFact > 0);
    const total = g.rows.reduce((s, r) => s + r.cost, 0);
    const fact = g.rows.reduce((s, r) => s + r.costFact, 0);
    const gr = ws.addRow({});
    groupRows.push(gr.number);
    gr.getCell('category').value = g.label;
    gr.getCell('description').value =
      `${rows.length} ${pluralRu(rows.length, 'статья', 'статьи', 'статей')}`;
    const first = gr.number + 1;
    const last = gr.number + rows.length;
    gr.getCell('cost').value = rows.length
      ? {
          formula: `SUM(${costLetter}${first}:${costLetter}${last})`,
          result: isTemplate ? 0 : total,
        }
      : 0;
    gr.getCell('fact').value = rows.length
      ? {
          formula: `SUM(${factLetter}${first}:${factLetter}${last})`,
          result: isTemplate ? 0 : fact,
        }
      : 0;
    if (!isTemplate) gr.getCell('share').value = grandTotal ? total / grandTotal : 0;
    gr.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > lastCol) return;
      cell.font = { bold: true, color: { argb: col === 1 ? argb(g.color) : 'FF111111' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint(g.color) } };
      cell.border = { top: { style: 'thin', color: { argb: argb(g.color) } } };
    });
    gr.getCell('description').font = { italic: true, color: { argb: 'FF5B6475' } };

    for (const r of rows) {
      const row = ws.addRow({
        category: g.label,
        number: r.number,
        description: r.description,
        stage: r.stage,
        status: STATUS_LABEL[r.status],
        cost: isTemplate ? null : r.cost,
        fact: isTemplate ? null : r.costFact,
      });
      row.alignment = { vertical: 'top', wrapText: true };
      row.getCell('category').font = { color: { argb: 'FF8A94A6' } };
      row.getCell('category').dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`'${LIST_SHEET_NAME}'!$A$2:$A$${EXPENSE_CATEGORIES.length + 1}`],
        showErrorMessage: true,
        errorTitle: 'Направление',
        error: 'Выберите направление из списка',
      };
      for (const key of ['cost', 'fact']) {
        const cell = row.getCell(key);
        cell.numFmt = '#,##0 ₽';
        if (isTemplate) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };
        }
      }
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > lastCol) return;
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE3E7EF' } } };
      });
    }
  }

  const tr = ws.addRow({ category: 'Итого', description: '' });
  tr.getCell('cost').value = groupRows.length
    ? {
        formula: groupRows.map((n) => `${costLetter}${n}`).join('+'),
        result: isTemplate ? 0 : grandTotal,
      }
    : 0;
  tr.getCell('fact').value = groupRows.length
    ? {
        formula: groupRows.map((n) => `${factLetter}${n}`).join('+'),
        result: isTemplate ? 0 : grandFact,
      }
    : 0;
  if (!isTemplate) tr.getCell('share').value = grandTotal ? 1 : 0;
  tr.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > lastCol) return;
    cell.font = { bold: true, size: 12 };
    cell.border = { top: { style: 'medium', color: { argb: 'FF0A0A9F' } } };
  });
  for (const n of [...groupRows, tr.number]) {
    ws.getRow(n).getCell('cost').numFmt = '#,##0 ₽';
    ws.getRow(n).getCell('fact').numFmt = '#,##0 ₽';
    if (!isTemplate) ws.getRow(n).getCell('share').numFmt = '0.0%';
  }

  // Справочник направлений — источник выпадающего списка
  const ls = wb.addWorksheet(LIST_SHEET_NAME);
  ls.columns = [
    { header: 'Направление', key: 'label', width: 30 },
    { header: 'Что входит', key: 'hint', width: 80 },
  ];
  ls.getRow(1).font = { bold: true };
  for (const c of EXPENSE_CATEGORIES) ls.addRow({ label: c.label, hint: c.hint });

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export interface ParsedExpenseRow {
  rowNumber: number;
  number: number;
  /** Направление из файла; null — не указано или не распознано */
  category: ExpenseCategoryKey | null;
  /** Стоимость; null — ячейка пустая (без изменений) */
  cost: number | null;
  /** Факт; null — ячейка пустая или столбца нет (без изменений) */
  costFact: number | null;
  errors: string[];
}

export interface ParsedExpenses {
  rows: ParsedExpenseRow[];
  /** Строки со статьёй, но без № задачи — пропускаются */
  skipped: { rowNumber: number; text: string }[];
  fileErrors: string[];
}

type ColKey = 'category' | 'number' | 'description' | 'cost' | 'fact';

function matchHeader(raw: string): ColKey | null {
  const h = normalizeSpaces(raw.toLowerCase().replace(/ё/g, 'е'));
  if (!h) return null;
  if (h.startsWith('№') || h.startsWith('номер')) return 'number';
  if (h.startsWith('направление')) return 'category';
  if (h.startsWith('факт')) return 'fact';
  if (h.startsWith('стоимость') || h.startsWith('сумма') || h.startsWith('бюджет')) return 'cost';
  if (h.startsWith('статья') || h.startsWith('задача') || h.startsWith('описание'))
    return 'description';
  return null;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('error' in v) return '';
  }
  return String(v);
}

function cellNumber(v: ExcelJS.CellValue): { value: number | null; error: boolean } {
  if (v && typeof v === 'object' && 'result' in v) return cellNumber(v.result as ExcelJS.CellValue);
  if (typeof v === 'number') return { value: v, error: !Number.isFinite(v) };
  const raw = cellText(v);
  const txt = raw.replace(/[\s  ₽]|руб\.?|р\./gi, '').replace(',', '.');
  if (!txt) return { value: null, error: false };
  const n = Number(txt);
  return Number.isFinite(n) ? { value: n, error: false } : { value: null, error: true };
}

const isExpensesSheet = (name: string) =>
  name === EXPENSES_SHEET_NAME || LEGACY_SHEET_NAMES.includes(name);

/** Читает заполненный шаблон раздела «Расходы». */
export async function parseExpensesWorkbook(
  data: ArrayBuffer | Uint8Array,
): Promise<ParsedExpenses> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const empty = (msg: string): ParsedExpenses => ({ rows: [], skipped: [], fileErrors: [msg] });

  const sheets = [
    ...wb.worksheets.filter((w) => isExpensesSheet(w.name)),
    ...wb.worksheets.filter((w) => !isExpensesSheet(w.name)),
  ];
  let ws: ExcelJS.Worksheet | undefined;
  let headerRow = 0;
  const colMap = new Map<ColKey, number>();
  outer: for (const w of sheets) {
    for (let r = 1; r <= Math.min(10, w.rowCount); r++) {
      const row = w.getRow(r);
      const map = new Map<ColKey, number>();
      for (let c = 1; c <= row.cellCount; c++) {
        const key = matchHeader(cellText(row.getCell(c).value));
        if (key && !map.has(key)) map.set(key, c);
      }
      if (map.has('number') && map.has('cost')) {
        ws = w;
        headerRow = r;
        map.forEach((v, k) => colMap.set(k, v));
        break outer;
      }
    }
  }
  if (!ws) {
    return empty(
      'Не найдены столбцы «№ задачи» и «Стоимость, руб.». Скачайте шаблон раздела и заполните его.',
    );
  }
  const fileErrors: string[] = [];
  if (!colMap.has('category'))
    fileErrors.push('Нет столбца «Направление» — направления задач не изменятся');

  const get = (row: ExcelJS.Row, key: ColKey): ExcelJS.CellValue => {
    const c = colMap.get(key);
    return c ? row.getCell(c).value : null;
  };

  const rows: ParsedExpenseRow[] = [];
  const skipped: ParsedExpenses['skipped'] = [];
  const seen = new Map<number, number>();
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const numText = cellText(get(row, 'number')).trim();
    const description = normalizeSpaces(cellText(get(row, 'description')));
    if (!numText) {
      // Строки направлений и «Итого» без номера — служебные; со статьёй и суммой — сообщаем
      const cost = cellNumber(get(row, 'cost'));
      const isFormula = (() => {
        const v = get(row, 'cost');
        return Boolean(v && typeof v === 'object' && 'formula' in v);
      })();
      if (description && cost.value && !isFormula && !/^\d+ стат/.test(description))
        skipped.push({ rowNumber: r, text: description });
      continue;
    }
    const errors: string[] = [];
    if (!/^\d+$/.test(numText)) {
      skipped.push({ rowNumber: r, text: `№ «${numText}» не распознан` });
      continue;
    }
    const number = Number(numText);
    const dup = seen.get(number);
    if (dup) errors.push(`№ ${number} уже встречался в строке ${dup}`);
    seen.set(number, r);

    const catText = normalizeSpaces(cellText(get(row, 'category')));
    const category = catText ? expenseCategoryByLabel(catText) : null;
    if (catText && !category) errors.push(`Неизвестное направление «${catText}»`);

    const c = cellNumber(get(row, 'cost'));
    let cost: number | null = null;
    if (c.error) errors.push(`Не распознана стоимость «${cellText(get(row, 'cost')).trim()}»`);
    else if (c.value !== null) {
      if (c.value < 0) errors.push('Стоимость не может быть отрицательной');
      else cost = Math.round(c.value);
    }
    const f = cellNumber(get(row, 'fact'));
    let costFact: number | null = null;
    if (f.error) errors.push(`Не распознан факт «${cellText(get(row, 'fact')).trim()}»`);
    else if (f.value !== null) {
      if (f.value < 0) errors.push('Факт не может быть отрицательным');
      else costFact = Math.round(f.value);
    }
    rows.push({ rowNumber: r, number, category, cost, costFact, errors });
  }
  return { rows, skipped, fileErrors };
}
