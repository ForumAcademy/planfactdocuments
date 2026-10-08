import type { ISODate } from './dates';

/** Курс доллара на дату, руб. за 1 $; forumId — форум, к которому привязан курс (null — для всех форумов) */
export interface UsdRateDTO {
  id: number;
  date: ISODate;
  rate: number;
  forumId: number | null;
}

/**
 * Курс на дату: последний внесённый не позже неё; если все курсы внесены на более поздние даты —
 * самый ранний из них. null — курсов нет.
 */
export function usdRateOn<T extends { date: ISODate }>(rates: T[], date: ISODate): T | null {
  let found: T | null = null;
  let first: T | null = null;
  for (const r of rates) {
    if (!first || r.date < first.date) first = r;
    if (r.date <= date && (!found || r.date > found.date)) found = r;
  }
  return found ?? first;
}

/**
 * Курс форума: если у форума есть свои курсы — берутся только они, иначе курсы «для всех форумов».
 * Дата — сегодня, а у прошедшего форума — дата его окончания, чтобы новые курсы не меняли его суммы.
 */
export function forumUsdRate(
  rates: UsdRateDTO[],
  forum: { id: number; startDate: ISODate; endDate: ISODate | null },
  today: ISODate,
): UsdRateDTO | null {
  const own = rates.filter((r) => r.forumId === forum.id);
  const pool = own.length ? own : rates.filter((r) => r.forumId === null);
  const end = forum.endDate ?? forum.startDate;
  return usdRateOn(pool, end < today ? end : today);
}
