/**
 * Excel воронки продаж: выгрузка сделок и разбор загруженного файла (свод по воронке —
 * лист с заголовками «Компания», «Откуда пришел», «Статус текущий» и т. д.).
 */
import ExcelJS from 'exceljs';
import { formatDate, isISODate, parseRuDate } from '../dates';
import {
  DEAL_STAGES,
  statusLabel,
  type DealStageKey,
  type DealStatus,
  type DealValue,
} from '../funnel';
import { normalizeSpaces } from '../utils';

export const FUNNEL_SHEET_NAME = 'Воронка';

const COLUMNS = [
  { key: 'company', header: 'Компания', width: 40 },
  { key: 'source', header: 'Откуда пришел', width: 18 },
  { key: 'enteredAt', header: 'Дата входа в воронку', width: 14 },
  { key: 'direction', header: 'Направление', width: 20 },
  { key: 'qty', header: 'Кол-во билетов', width: 10 },
  { key: 'amount', header: 'Сумма', width: 14 },
  { key: 'status', header: 'Статус текущий', width: 18 },
  { key: 'lostStage', header: 'Этап отказа', width: 16 },
  { key: 'decisionDate', header: 'Дата решения', width: 14 },
  { key: 'paidDate', header: 'Дата оплаты', width: 14 },
  { key: 'manager', header: 'Кто ведет', width: 16 },
  { key: 'comment', header: 'Комментарий', width: 40 },
] as const;
type ColumnKey = (typeof COLUMNS)[number]['key'];

function matchHeader(raw: string): ColumnKey | null {
  const h = normalizeSpaces(raw).toLowerCase().replace(/ё/g, 'е');
  if (!h) return null;
  if (h.startsWith('компан')) return 'company';
  if (h.includes('откуда') || h.includes('источник')) return 'source';
  if (h.includes('дата входа')) return 'enteredAt';
  if (h.startsWith('направлен')) return 'direction';
  if (h.includes('кол-во') || h.includes('количество') || h.includes('билет')) return 'qty';
  if (h.startsWith('сумма')) return 'amount';
  if (h.includes('этап отказа')) return 'lostStage';
  if (h.startsWith('статус') || h === 'этап') return 'status';
  if (h.includes('дата решения')) return 'decisionDate';
  if (h.includes('дата оплаты')) return 'paidDate';
  if (h.includes('кто ведет') || h.includes('ответствен') || h.includes('менеджер'))
    return 'manager';
  if (h.startsWith('коммент') || h.startsWith('примечан')) return 'comment';
  return null;
}

/** «0. Отказ», «4. Выставлен счет», «Оплачено» → ключ статуса */
export function parseStatus(raw: string): DealStatus | null {
  const s = raw.toLowerCase().replace(/ё/g, 'е');
  if (s.includes('отказ') || s.includes('не реализ')) return 'refused';
  if (s.includes('оплач')) return 'paid';
  if (s.includes('счет')) return 'invoice';
  if (s.includes('соглас')) return 'agreement';
  if (s.includes('перегов') || s.includes('кп')) return 'negotiation';
  if (s.includes('квалиф') || s.includes('нов') || s.includes('лид')) return 'qualification';
  return null;
}

function parseStage(raw: string): DealStageKey | null {
  const s = parseStatus(raw);
  return s && s !== 'refused' ? s : null;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    return '';
  }
  return normalizeSpaces(String(v));
}

function cellDate(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Серийный номер даты Excel
    return new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10);
  }
  const t = cellText(v);
  const iso = parseRuDate(t);
  return iso && isISODate(iso) ? iso : null;
}

function cellNumber(v: ExcelJS.CellValue): number {
  if (typeof v === 'number') return v;
  const t = cellText(v)
    .replace(/[\s  ₽]/g, '')
    .replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export interface ParsedDeal {
  rowNumber: number;
  company: string;
  source: string;
  manager: string;
  enteredAt: string | null;
  /** Название направления из файла — сопоставляется с позициями доходов */
  direction: string;
  qty: number;
  amount: number;
  status: DealStatus;
  lostStage: DealStageKey | null;
  decisionDate: string | null;
  paidDate: string | null;
  comment: string;
}

export interface ParsedFunnel {
  sheetName: string;
  deals: ParsedDeal[];
  /** Строки, которые не удалось разобрать */
  skipped: { rowNumber: number; text: string }[];
}

/**
 * Ищет лист со сделками: строку заголовков с «Компания» и «Статус». Отказ без «Этапа отказа»
 * относится к «Переговорам», если у сделки была сумма (клиенту называли цену), иначе —
 * к «Квалификации».
 */
export async function parseFunnelWorkbook(data: ArrayBuffer | Uint8Array): Promise<ParsedFunnel> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  // Сначала лист с «воронкой» в названии, затем остальные по порядку
  const sheets = [
    ...wb.worksheets.filter((w) => /воронк/i.test(w.name)),
    ...wb.worksheets.filter((w) => !/воронк/i.test(w.name)),
  ];
  for (const ws of sheets) {
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const cols = new Map<ColumnKey, number>();
      ws.getRow(r).eachCell((cell, c) => {
        const k = matchHeader(cellText(cell.value));
        if (k && !cols.has(k)) cols.set(k, c);
      });
      if (!cols.has('company') || !cols.has('status')) continue;
      const deals: ParsedDeal[] = [];
      const skipped: ParsedFunnel['skipped'] = [];
      const get = (row: ExcelJS.Row, k: ColumnKey) =>
        cols.has(k) ? row.getCell(cols.get(k)!).value : null;
      for (let i = r + 1; i <= ws.rowCount; i++) {
        const row = ws.getRow(i);
        const company = cellText(get(row, 'company'));
        const statusText = cellText(get(row, 'status'));
        if (!company && !statusText) continue;
        const status = parseStatus(statusText);
        if (!company || !status) {
          skipped.push({
            rowNumber: i,
            text: company ? `«${company}»: непонятный статус «${statusText}»` : 'нет компании',
          });
          continue;
        }
        const amount = Math.max(0, Math.round(cellNumber(get(row, 'amount'))));
        const lostText = cellText(get(row, 'lostStage'));
        deals.push({
          rowNumber: i,
          company: company.slice(0, 200),
          source: cellText(get(row, 'source')).slice(0, 120),
          manager: cellText(get(row, 'manager')).slice(0, 120),
          enteredAt: cellDate(get(row, 'enteredAt')),
          direction: cellText(get(row, 'direction')),
          qty: Math.max(0, Math.round(cellNumber(get(row, 'qty')))),
          amount,
          status,
          lostStage:
            status === 'refused'
              ? (parseStage(lostText) ?? (amount > 0 ? 'negotiation' : 'qualification'))
              : null,
          decisionDate: cellDate(get(row, 'decisionDate')),
          paidDate: cellDate(get(row, 'paidDate')),
          comment: cellText(get(row, 'comment')).slice(0, 1000),
        });
      }
      return { sheetName: ws.name, deals, skipped };
    }
  }
  return { sheetName: '', deals: [], skipped: [] };
}

/** Выгрузка сделок в Excel в том же формате, в котором файл загружается обратно */
export async function buildFunnelWorkbook(
  deals: DealValue[],
  directionLabel: (key: string | null) => string,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(FUNNEL_SHEET_NAME);
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8F8' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const d of deals) {
    ws.addRow({
      company: d.company,
      source: d.source,
      enteredAt: formatDate(d.enteredAt),
      direction: directionLabel(d.incomeKey),
      qty: d.qty || null,
      amount: d.amount || null,
      status: `${d.status === 'refused' ? 0 : DEAL_STAGES.findIndex((s) => s.key === d.status) + 1}. ${statusLabel(d.status)}`,
      lostStage: d.lostStage ? statusLabel(d.lostStage) : '',
      decisionDate: formatDate(d.decisionDate),
      paidDate: formatDate(d.paidDate),
      manager: d.manager,
      comment: d.comment,
    });
  }
  ws.getColumn('amount').numFmt = '#,##0';
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Шаблон для загрузки сделок: пустой лист с теми же столбцами, что и выгрузка, и списками
 * для статуса, этапа отказа и направления.
 */
export async function buildFunnelTemplate(directions: string[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(FUNNEL_SHEET_NAME);
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8F8' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const statuses = [
    `0. ${statusLabel('refused')}`,
    ...DEAL_STAGES.map((s, i) => `${i + 1}. ${statusLabel(s.key)}`),
  ];
  const stages = DEAL_STAGES.filter((s) => s.key !== 'paid').map((s) => statusLabel(s.key));
  // Список в проверке данных Excel — не длиннее 255 символов
  const list = (values: string[]) => {
    const f = `"${values.map((v) => v.replace(/[",]/g, ' ')).join(',')}"`;
    return f.length <= 255 ? [f] : null;
  };
  const validate = (key: ColumnKey, values: string[]) => {
    const formulae = list(values);
    if (!formulae) return;
    const col = COLUMNS.findIndex((c) => c.key === key) + 1;
    for (let r = 2; r <= 500; r++) {
      ws.getCell(r, col).dataValidation = {
        type: 'list',
        allowBlank: true,
        showErrorMessage: false,
        formulae,
      };
    }
  };
  validate('status', statuses);
  validate('lostStage', stages);
  if (directions.length) validate('direction', directions);
  ws.getColumn('amount').numFmt = '#,##0';
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
