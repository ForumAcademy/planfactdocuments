import { formatDate, type ISODate } from '../dates';
import type { ForumDTO } from '../types';
import type { PaletteKey } from './palette';

export interface ExportChart {
  id: number;
  title: string;
  palette: PaletteKey;
  unit: string;
  items: { name: string; amount: number; note?: string | null }[];
}

export interface ReportExportData {
  forum: ForumDTO;
  reportDate: ISODate;
  charts: ExportChart[];
  /** Название отчёта на титуле и в имени файла; по умолчанию «Отчёт» */
  title?: string;
}

export const BRAND = '0A0A9F';
export const BRAND_DARK = '060670';
export const INK = '111111';
export const GRAY = '8A94A6';

export function forumDates(f: ForumDTO): string {
  return f.endDate && f.endDate !== f.startDate
    ? `${formatDate(f.startDate)} – ${formatDate(f.endDate)}`
    : formatDate(f.startDate);
}

export function exportFileName(d: ReportExportData, ext: string): string {
  const name = d.forum.name.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  return `${name} — ${(d.title ?? 'Отчёт').toLowerCase()} ${formatDate(d.reportDate)}.${ext}`;
}
