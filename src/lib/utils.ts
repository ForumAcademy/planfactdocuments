import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const numberFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1234.5 → «1 234,50» */
export function formatAmount(value: number): string {
  return numberFormatter.format(value).replace(/ | /g, ' ');
}

/** «200 000 ₽» */
export function formatRub(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU').replace(/ | /g, ' ')} ₽`;
}

/** «7,7 млн ₽», «850 тыс. ₽», «0 ₽» — коротко для сумм по этапам */
export function formatRubShort(value: number): string {
  if (value >= 1_000_000)
    return `${(Math.round(value / 100_000) / 10).toLocaleString('ru-RU')} млн ₽`;
  if (value >= 1_000) return `${Math.round(value / 1_000).toLocaleString('ru-RU')} тыс. ₽`;
  return `${Math.round(value)} ₽`;
}

/** Разбирает число, введённое с запятой или точкой: «1 234,56» → 1234.56 */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[\s  ]/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

export function normalizeSpaces(s: string): string {
  return s.replace(/[\s ]+/g, ' ').trim();
}

/**
 * Подписи двух отметок на шкале: по центру отметки, а если отметки ближе 15% шкалы — в две
 * строки (вторая ниже), каждая прижата к своей отметке со стороны, где есть место.
 * Возвращает классы подписей и признак двух строк.
 */
export function markerLabels(a: number, b: number, max: number): [string, string, boolean] {
  const center = '-translate-x-1/2';
  if (!max || Math.abs(a - b) / max >= 0.15) return [center, center, false];
  const side = (v: number) => (v / max > 0.5 ? '-translate-x-full' : '');
  return [`top-0 ${side(a)}`, `top-4 ${side(b)}`, true];
}
