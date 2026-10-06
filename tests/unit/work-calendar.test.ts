import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeCalendar, type CalendarDayDTO } from '@/lib/work-calendar';

// Данные календаря — из миграции, которой они заносятся в базу
const sql = readFileSync('prisma/migrations/20261008120000_work_calendar/migration.sql', 'utf8');
const days: CalendarDayDTO[] = [
  ...sql.matchAll(/\('(\d{4}-\d{2}-\d{2})', '(\w+)', (?:'([^']*)'|NULL)\)/g),
].map((m) => ({ date: m[1], kind: m[2] as CalendarDayDTO['kind'], note: m[3] ?? null }));
const cal = makeCalendar(days);

function workdays(year: number) {
  let n = 0;
  for (
    let d = new Date(Date.UTC(year, 0, 1));
    d.getUTCFullYear() === year;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    if (!cal.isOff(d.toISOString().slice(0, 10))) n++;
  }
  return n;
}

describe('производственный календарь', () => {
  it('число рабочих дней совпадает с официальным', () => {
    expect(workdays(2026)).toBe(247);
    expect(workdays(2027)).toBe(247);
  });
  it('выходные, праздники и переносы', () => {
    expect(cal.offReason('2026-06-12')).toBe('праздник «День России»');
    expect(cal.offReason('2026-10-10')).toBe('выходной, суббота');
    expect(cal.offReason('2026-10-12')).toBeNull();
    expect(cal.isOff('2027-02-20')).toBe(false); // рабочая суббота
    expect(cal.isOff('2027-02-22')).toBe(true); // перенос
    expect(cal.isOff('2026-04-30')).toBe(false); // сокращённый — рабочий
  });
});
