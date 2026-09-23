import { formatDate, type ISODate } from '../dates';
import type { ForumDTO } from '../types';
import type { PaletteKey } from './palette';

export interface ExportChart {
  id: number;
  title: string;
  palette: PaletteKey;
  unit: string;
  items: { name: string; amount: number }[];
}

export interface ReportExportData {
  forum: ForumDTO;
  reportDate: ISODate;
  charts: ExportChart[];
}

export const BRAND = '1F4E9E';
export const BRAND_DARK = '0F2A5C';
export const INK = '111111';
export const GRAY = '8A94A6';

export function forumDates(f: ForumDTO): string {
  return f.endDate && f.endDate !== f.startDate
    ? `${formatDate(f.startDate)} – ${formatDate(f.endDate)}`
    : formatDate(f.startDate);
}

export function exportFileName(d: ReportExportData, ext: string): string {
  const name = d.forum.name.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  return `${name} — отчёт ${formatDate(d.reportDate)}.${ext}`;
}
