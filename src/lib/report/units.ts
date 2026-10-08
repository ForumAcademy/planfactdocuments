/**
 * Единицы измерения диаграмм отчёта и формат чисел для каждой: деньги в млн — с двумя знаками,
 * штуки и люди — целыми (дробная часть показывается, только если она есть).
 */
export const UNIT_PRESETS = [
  { unit: 'млн руб.', min: 2, max: 2 },
  { unit: 'тыс. руб.', min: 0, max: 1 },
  { unit: 'руб.', min: 0, max: 0 },
  { unit: 'шт.', min: 0, max: 2 },
  { unit: 'чел.', min: 0, max: 2 },
  { unit: 'компаний', min: 0, max: 2 },
  { unit: '%', min: 0, max: 1 },
] as const;

/** Знаки после запятой: min — всегда, max — не больше */
export function unitDigits(unit: string): { min: number; max: number } {
  const u = unit.trim().toLowerCase();
  const preset = UNIT_PRESETS.find((p) => p.unit === u);
  if (preset) return preset;
  if (u.includes('млрд') || u.includes('млн')) return { min: 2, max: 2 };
  if (u.includes('тыс')) return { min: 0, max: 1 };
  if (u.includes('руб') || u.includes('₽')) return { min: 0, max: 0 };
  return { min: 0, max: 2 };
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Число в формате единицы диаграммы: «6,21» (млн руб.), «37» (шт.), «1 250» (тыс. руб.) */
export function formatUnitValue(value: number, unit: string): string {
  const { min, max } = unitDigits(unit);
  const key = `${min}:${max}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: min, maximumFractionDigits: max });
    formatters.set(key, f);
  }
  return f.format(value).replace(/[\u00a0\u202f]/g, ' ');
}

/** Формат ячейки Excel для единицы */
export function unitNumFmt(unit: string): string {
  const { min, max } = unitDigits(unit);
  if (max === 0) return '#,##0';
  if (min === 2) return '#,##0.00';
  return 'General';
}
