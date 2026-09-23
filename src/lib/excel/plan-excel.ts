/**
 * Формат Excel-файла плана (импорт и экспорт).
 * Работает и в браузере, и в Node.js (exceljs).
 */
import ExcelJS from 'exceljs';
import { isISODate, parseRuDate, type ISODate } from '../dates';
import { STATUS_LABEL, statusFromLabel, type TaskStatusCode } from '../status';
import { normalizeSpaces } from '../utils';

export const PLAN_SHEET_NAME = 'Мастер-план форума';

/** Обязательные столбцы — как в мастер-плане. */
export const BASE_COLUMNS = [
  { key: 'number', header: '№', width: 6 },
  { key: 'stage', header: 'Этап', width: 26 },
  { key: 'block', header: 'Блок / направление', width: 24 },
  { key: 'description', header: 'Описание задачи', width: 55 },
  { key: 'termText', header: 'Срок готовности (относительно даты форума)', width: 30 },
  { key: 'roles', header: 'Ответственный блок / роль', width: 28 },
  { key: 'status', header: 'Статус', width: 13 },
  { key: 'comment', header: 'Комментарий / примечание', width: 40 },
] as const;

/** Дополнительные столбцы выгрузки (распознаются при импорте). */
export const EXTRA_COLUMNS = [
  { key: 'employees', header: 'Ответственный (ФИО)', width: 30 },
  { key: 'startDate', header: 'Дата начала', width: 13 },
  { key: 'endDate', header: 'Дата окончания', width: 14 },
  { key: 'lag', header: 'Отставание, дн.', width: 12 },
  { key: 'completedAt', header: 'Дата выполнения', width: 14 },
] as const;

type ColumnKey = (typeof BASE_COLUMNS)[number]['key'] | (typeof EXTRA_COLUMNS)[number]['key'];

export interface PlanRow {
  /** Номер строки в файле (для сообщений об ошибках). */
  rowNumber: number;
  number: number | null;
  stage: string;
  block: string;
  description: string;
  termText: string;
  roles: string[];
  status: TaskStatusCode;
  comment: string;
  employees: string[];
  startDate: ISODate | null;
  endDate: ISODate | null;
  completedAt: ISODate | null;
  /** Ошибки строки (строка всё равно может быть импортирована). */
  errors: string[];
}

export interface ParsedPlan {
  rows: PlanRow[];
  /** Ошибки уровня файла: не найден лист, нет обязательных столбцов. */
  fileErrors: string[];
  /** Какие дополнительные столбцы найдены. */
  foundColumns: ColumnKey[];
}

function normHeader(s: string): string {
  return normalizeSpaces(s.toLowerCase().replace(/ё/g, 'е'));
}

/** Сопоставление заголовка столбца с полем. */
export function matchHeader(raw: string): ColumnKey | null {
  const h = normHeader(raw);
  if (!h) return null;
  if (h === '№' || h === 'n' || h === 'no' || h === '№ п/п' || h === 'номер') return 'number';
  if (h.startsWith('отставание')) return 'lag';
  if (h.startsWith('дата начала')) return 'startDate';
  if (h.startsWith('дата окончания') || h === 'срок (дата)') return 'endDate';
  if (h.startsWith('дата выполнения') || h.startsWith('дата факт')) return 'completedAt';
  if (h.includes('фио') || h === 'ответственный' || h === 'ответственные') return 'employees';
  if (h.startsWith('этап')) return 'stage';
  if (h.startsWith('блок') || h.startsWith('направление')) return 'block';
  if (h.startsWith('описание') || h === 'задача') return 'description';
  if (h.startsWith('срок')) return 'termText';
  if (h.includes('роль') || h.startsWith('ответственный блок')) return 'roles';
  if (h.startsWith('статус')) return 'status';
  if (h.startsWith('комментарий') || h.startsWith('примечание')) return 'comment';
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

function cellDate(v: ExcelJS.CellValue): { value: ISODate | null; error: boolean } {
  if (v === null || v === undefined || v === '') return { value: null, error: false };
  if (v instanceof Date) {
    // exceljs отдаёт даты как полночь UTC
    return { value: v.toISOString().slice(0, 10), error: false };
  }
  if (typeof v === 'number') {
    // серийный номер даты Excel
    const ms = Math.round((v - 25569) * 86_400_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime())
      ? { value: null, error: true }
      : { value: d.toISOString().slice(0, 10), error: false };
  }
  const text = cellText(v).trim();
  if (!text) return { value: null, error: false };
  const parsed = parseRuDate(text);
  return parsed && isISODate(parsed)
    ? { value: parsed, error: false }
    : { value: null, error: true };
}

/** Разбивает «Ивент / Маркетинг», «Отдел продаж/Маркетинг» на отдельные роли. */
export function splitRoles(s: string): string[] {
  return uniq(
    s
      .split('/')
      .map((x) => normalizeSpaces(x))
      .filter(Boolean),
  );
}

export function splitEmployees(s: string): string[] {
  return uniq(
    s
      .split(/[;,\n]/)
      .map((x) => normalizeSpaces(x))
      .filter(Boolean),
  );
}

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const k = x.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

function pickSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  const byName = wb.worksheets.find((w) => normHeader(w.name) === normHeader(PLAN_SHEET_NAME));
  if (byName) return byName;
  // Иначе — первый лист, где есть столбец «Описание задачи»
  return (
    wb.worksheets.find((w) => {
      for (let r = 1; r <= Math.min(5, w.rowCount); r++) {
        const row = w.getRow(r);
        for (let c = 1; c <= row.cellCount; c++) {
          if (matchHeader(cellText(row.getCell(c).value)) === 'description') return true;
        }
      }
      return false;
    }) ?? wb.worksheets[0]
  );
}

/** Читает файл плана. */
export async function parsePlanWorkbook(data: ArrayBuffer | Uint8Array): Promise<ParsedPlan> {
  const wb = new ExcelJS.Workbook();
  // exceljs принимает Buffer в Node и ArrayBuffer в браузере
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const ws = pickSheet(wb);
  const fileErrors: string[] = [];
  if (!ws) return { rows: [], fileErrors: ['В файле нет листов'], foundColumns: [] };

  // Строка заголовков — первая из первых 5, где найден столбец описания
  let headerRow = 1;
  const colMap = new Map<ColumnKey, number>();
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const map = new Map<ColumnKey, number>();
    for (let c = 1; c <= row.cellCount; c++) {
      const key = matchHeader(cellText(row.getCell(c).value));
      if (key && !map.has(key)) map.set(key, c);
    }
    if (map.has('description')) {
      headerRow = r;
      map.forEach((v, k) => colMap.set(k, v));
      break;
    }
  }
  if (!colMap.has('description')) {
    return {
      rows: [],
      fileErrors: [
        'Не найден столбец «Описание задачи». Проверьте, что файл в формате мастер-плана.',
      ],
      foundColumns: [],
    };
  }
  for (const req of ['stage', 'block', 'termText', 'roles'] as const) {
    if (!colMap.has(req)) {
      const h = BASE_COLUMNS.find((c) => c.key === req)?.header;
      fileErrors.push(`Не найден столбец «${h}» — значения будут пустыми`);
    }
  }

  const get = (row: ExcelJS.Row, key: ColumnKey): ExcelJS.CellValue => {
    const c = colMap.get(key);
    return c ? row.getCell(c).value : null;
  };

  const rows: PlanRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const description = normalizeSpaces(cellText(get(row, 'description')));
    const stage = normalizeSpaces(cellText(get(row, 'stage')));
    const block = normalizeSpaces(cellText(get(row, 'block')));
    if (!description && !stage && !block) continue; // пустая строка

    const errors: string[] = [];
    if (!description) errors.push('Нет описания задачи');
    if (!stage) errors.push('Не указан этап');

    const numText = cellText(get(row, 'number')).trim();
    const number = numText && /^\d+$/.test(numText) ? Number(numText) : null;

    const statusText = cellText(get(row, 'status'));
    const status = statusFromLabel(statusText);
    if (statusText.trim() && !status)
      errors.push(`Неизвестный статус «${statusText.trim()}» — будет «Не начато»`);

    const start = cellDate(get(row, 'startDate'));
    const end = cellDate(get(row, 'endDate'));
    const done = cellDate(get(row, 'completedAt'));
    if (start.error) errors.push('Не распознана дата начала');
    if (end.error) errors.push('Не распознана дата окончания');
    if (done.error) errors.push('Не распознана дата выполнения');
    if (start.value && end.value && start.value > end.value)
      errors.push('Дата начала позже даты окончания');

    rows.push({
      rowNumber: r,
      number,
      stage,
      block,
      description,
      termText: normalizeSpaces(cellText(get(row, 'termText'))),
      roles: splitRoles(cellText(get(row, 'roles'))),
      status: status ?? 'NOT_STARTED',
      comment: cellText(get(row, 'comment')).trim(),
      employees: splitEmployees(cellText(get(row, 'employees'))),
      startDate: start.value,
      endDate: end.value,
      completedAt: done.value,
      errors,
    });
  }

  const foundColumns = [...colMap.keys()];
  return { rows, fileErrors, foundColumns };
}

export interface ExportTask {
  number: number;
  stage: string;
  block: string;
  description: string;
  termText: string;
  roles: string[];
  status: TaskStatusCode;
  comment: string;
  employees: string[];
  startDate: ISODate | null;
  endDate: ISODate | null;
  lag: number;
  completedAt: ISODate | null;
  overdue: boolean;
}

const STATUS_FILL: Record<TaskStatusCode, string> = {
  NOT_STARTED: 'FFF4F6FA',
  IN_PROGRESS: 'FFE0E9F7', // синий
  DONE: 'FFE3F4EA', // зелёный
};

function isoToExcelDate(d: ISODate | null): Date | null {
  return d ? new Date(`${d}T00:00:00Z`) : null;
}

/** Формирует .xlsx плана в формате импорта. */
export async function buildPlanWorkbook(
  tasks: ExportTask[],
  meta?: { forumName?: string },
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Статус форумы';
  wb.created = new Date();
  if (meta?.forumName) wb.title = meta.forumName;
  const ws = wb.addWorksheet(PLAN_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }],
  });
  const columns = [...BASE_COLUMNS, ...EXTRA_COLUMNS];
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const header = ws.getRow(1);
  header.height = 36;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A0A9F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF060670' } } };
  });

  for (const t of tasks) {
    const row = ws.addRow({
      number: t.number,
      stage: t.stage,
      block: t.block,
      description: t.description,
      termText: t.termText,
      roles: t.roles.join(' / '),
      status: STATUS_LABEL[t.status],
      comment: t.comment,
      employees: t.employees.join(', '),
      startDate: isoToExcelDate(t.startDate),
      endDate: isoToExcelDate(t.endDate),
      lag: t.lag > 0 ? t.lag : null,
      completedAt: isoToExcelDate(t.completedAt),
    });
    row.alignment = { vertical: 'top', wrapText: true };
    const fill = t.overdue ? 'FFFBE3E3' : STATUS_FILL[t.status];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > columns.length) return;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE3E7EF' } } };
    });
    for (const key of ['startDate', 'endDate', 'completedAt'] as const) {
      row.getCell(key).numFmt = 'dd.mm.yyyy';
    }
    if (t.lag > 0) row.getCell('lag').font = { color: { argb: 'FFD93838' }, bold: true };
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, tasks.length + 1), column: columns.length },
  };
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
