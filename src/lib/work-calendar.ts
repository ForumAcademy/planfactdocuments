import { formatDate, isWeekend, type ISODate } from './dates';

export type CalendarKind = 'holiday' | 'workday' | 'short';

export interface CalendarDayDTO {
  date: ISODate;
  kind: CalendarKind;
  note: string | null;
}

export const CALENDAR_KIND_LABEL: Record<CalendarKind, string> = {
  holiday: 'Праздник / нерабочий день',
  workday: 'Рабочий день (перенос)',
  short: 'Сокращённый рабочий день',
};

const WEEKDAY = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export interface WorkCalendar {
  /** Нерабочий день: праздник или выходной (если не перенесён на рабочий) */
  isOff: (d: ISODate) => boolean;
  /** Особая отметка дня из производственного календаря */
  day: (d: ISODate) => CalendarDayDTO | undefined;
  /** Почему день нерабочий: «праздник «День России»» / «выходной, суббота»; null — рабочий */
  offReason: (d: ISODate | null | undefined) => string | null;
}

export function makeCalendar(days: CalendarDayDTO[]): WorkCalendar {
  const map = new Map(days.map((d) => [d.date, d]));
  const isOff = (d: ISODate) => {
    const k = map.get(d)?.kind;
    if (k === 'holiday') return true;
    if (k === 'workday' || k === 'short') return false;
    return isWeekend(d);
  };
  return {
    isOff,
    day: (d) => map.get(d),
    offReason: (d) => {
      if (!d || !isOff(d)) return null;
      const info = map.get(d);
      if (info?.kind === 'holiday') return info.note ? `праздник «${info.note}»` : 'праздник';
      return `выходной, ${WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}`;
    },
  };
}

/** «Дата 12.06.2027 — праздничный день: День России» или null. */
export function offWarning(cal: WorkCalendar, d: ISODate | null | undefined, what: string) {
  const r = cal.offReason(d);
  return r ? `${what} ${formatDate(d)} — ${r}` : null;
}
