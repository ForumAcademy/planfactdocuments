import type { ISODate } from './dates';

/** Курс доллара на дату, руб. за 1 $ */
export interface UsdRateDTO {
  date: ISODate;
  rate: number;
}

/**
 * Курс на дату: последний внесённый не позже неё; если все курсы внесены на более поздние даты —
 * самый ранний из них. null — курсов нет.
 */
export function usdRateOn(rates: UsdRateDTO[], date: ISODate): UsdRateDTO | null {
  let found: UsdRateDTO | null = null;
  let first: UsdRateDTO | null = null;
  for (const r of rates) {
    if (!first || r.date < first.date) first = r;
    if (r.date <= date && (!found || r.date > found.date)) found = r;
  }
  return found ?? first;
}
